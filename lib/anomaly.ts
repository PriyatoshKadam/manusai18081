import { query } from './db';
import { enqueueAlertDeliveries } from './notifications';
import { MIN_SAMPLE_SIZE } from './metrics';

const logicalOccurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const legacyOutcome = `(delivery_outcome IS NULL OR delivery_outcome = 'unknown')`;
const failedDelivery = `${networkObservation} AND (delivery_outcome IN ('http_error','blocked','beacon_rejected') OR (${legacyOutcome} AND ((status_code IS NOT NULL AND status_code >= 400) OR failure_reason IN ('blocked','beacon_rejected') OR failure_reason LIKE 'http_%'))) `;
const transportAnomaly = `${networkObservation} AND (delivery_outcome IN ('network_error','aborted','timeout') OR (${legacyOutcome} AND failure_reason IN ('network_error','aborted','timeout'))) `;
const successfulDelivery = `${networkObservation} AND (delivery_outcome = 'delivered' OR (${legacyOutcome} AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL))`;
const knownDeliveryOutcome = `(${successfulDelivery} OR ${failedDelivery})`;

function severityFor(score: number) { return score >= 3 ? 'critical' : score >= 2 ? 'warning' : 'info'; }
function pct(value: number) { return `${(value * 100).toFixed(1)}%`; }

export async function runAnomalySweep(siteId: number) {
  const rows = await query(
    `WITH recent AS (
       SELECT vendor, event_name,
              COUNT(DISTINCT ${logicalOccurrenceKey})::int AS fires,
              COUNT(*) FILTER (WHERE ${knownDeliveryOutcome})::int AS delivery_attempts,
              COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failures,
              COALESCE(AVG(latency_ms) FILTER (WHERE ${networkObservation} AND COALESCE(delivery_outcome, 'unknown') NOT IN ('beacon_rejected','blocked','network_error','aborted','timeout')), 0)::numeric AS avg_latency,
              COUNT(*) FILTER (WHERE ${networkObservation} AND LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied')::int AS denied,
              COUNT(*) FILTER (WHERE ${transportAnomaly})::int AS transport_anomalies
         FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '15 minutes'
        GROUP BY vendor, event_name
     ), baseline AS (
       SELECT vendor, event_name,
              COUNT(DISTINCT ${logicalOccurrenceKey})::int AS fires,
              COUNT(*) FILTER (WHERE ${knownDeliveryOutcome})::int AS delivery_attempts,
              COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failures,
              COALESCE(AVG(latency_ms) FILTER (WHERE ${networkObservation} AND COALESCE(delivery_outcome, 'unknown') NOT IN ('beacon_rejected','blocked','network_error','aborted','timeout')), 0)::numeric AS avg_latency,
              COUNT(*) FILTER (WHERE ${networkObservation} AND LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied')::int AS denied,
              COUNT(*) FILTER (WHERE ${transportAnomaly})::int AS transport_anomalies
         FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '7 days' AND received_at < NOW() - INTERVAL '15 minutes'
           AND EXTRACT(DOW FROM received_at) = EXTRACT(DOW FROM NOW())
           AND EXTRACT(HOUR FROM received_at) = EXTRACT(HOUR FROM NOW())
           AND FLOOR(EXTRACT(MINUTE FROM received_at) / 15) = FLOOR(EXTRACT(MINUTE FROM NOW()) / 15)
        GROUP BY vendor, event_name
     )
     SELECT r.vendor, r.event_name, r.fires, r.delivery_attempts, r.failures, r.avg_latency, r.denied, r.transport_anomalies,
            b.fires AS baseline_fires, b.delivery_attempts AS baseline_delivery_attempts, b.failures AS baseline_failures, b.avg_latency AS baseline_latency, b.denied AS baseline_denied, b.transport_anomalies AS baseline_transport_anomalies
       FROM recent r LEFT JOIN baseline b ON b.vendor = r.vendor AND COALESCE(b.event_name,'') = COALESCE(r.event_name,'')
      WHERE r.delivery_attempts >= $2 AND COALESCE(b.delivery_attempts, 0) >= $2`, [siteId, MIN_SAMPLE_SIZE],
  );
  const findings: any[] = [];
  for (const row of rows.rows) {
    const fires = Number(row.fires) || 0;
    const deliveryAttempts = Number(row.delivery_attempts) || 0;
    const failures = Number(row.failures) || 0;
    const baselineFires = Number(row.baseline_fires) || 0;
    const baselineDeliveryAttempts = Number(row.baseline_delivery_attempts) || 0;
    const baselineFailures = Number(row.baseline_failures) || 0;
    const recentFailureRate = deliveryAttempts ? failures / deliveryAttempts : 0;
    const baselineFailureRate = baselineDeliveryAttempts ? baselineFailures / baselineDeliveryAttempts : 0;
    const recentLatency = Number(row.avg_latency) || 0;
    const baselineLatency = Number(row.baseline_latency) || 0;
    const failureDrift = recentFailureRate - baselineFailureRate;
    const latencyDrift = baselineLatency > 0 ? recentLatency / baselineLatency : 1;
    let score = 0;
    if (failures >= 2 && failureDrift >= 0.10) score += failureDrift >= 0.30 ? 3 : 2;
    if (baselineLatency > 0 && latencyDrift >= 2) score += latencyDrift >= 4 ? 3 : 2;
    if (Number(row.denied) >= 3 && deliveryAttempts > 0 && Number(row.denied) / deliveryAttempts > 0.5) score += 2;
    if (!score) continue;
    const eventName = row.event_name || null;
    const reason = score >= 3 ? 'Recent real-user evidence is materially worse than the rolling baseline.' : 'Recent real-user evidence drifted beyond the configured warning threshold.';
    const message = `${row.vendor} ${eventName || 'tag'} health drift: ${failures}/${deliveryAttempts} delivery attempts failed (${pct(recentFailureRate)}), avg latency ${Math.round(recentLatency)}ms${baselineFailureRate ? ` vs ${pct(baselineFailureRate)} baseline` : ''}.`;
    const key = `anomaly:${row.vendor}:${eventName || ''}`;
    const inserted = await query(
      `INSERT INTO alerts (site_id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, raw, confidence, dedupe_key, notification_status)
       SELECT $1,$2,'tag_health_drift','anomaly',$3,$4,$5,$6,$7::jsonb,$8::jsonb,'confirmed',$9,'pending'
        WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE site_id=$1 AND code='tag_health_drift' AND dedupe_key=$9 AND resolved=false AND created_at > NOW()-INTERVAL '30 minutes')
       RETURNING id`,
      [siteId, severityFor(score), row.vendor, eventName, message, reason, JSON.stringify(['Open the event health view and inspect recent failed requests.', 'Check GTM triggers, consent state, vendor endpoint responses, and recent site changes.', 'Compare the recent latency and failure evidence with the baseline window.']), JSON.stringify({ recent: row, failureRate: recentFailureRate, baselineFailureRate, latencyDrift, score }), key],
    );
    if (inserted.rowCount) void enqueueAlertDeliveries({ alertId: Number(inserted.rows[0].id), siteId, severity: severityFor(score), category: 'anomaly', vendor: row.vendor, eventName, message, rootCause: reason, fixSteps: ['Open the event health view and inspect recent failed requests.', 'Check GTM triggers, consent state, vendor endpoint responses, and recent site changes.'] });
    findings.push({ vendor: row.vendor, eventName, score, recentFailureRate, baselineFailureRate, latencyDrift, fires, deliveryAttempts, failures });
  }
  await query(`INSERT INTO anomaly_runs (site_id, window_start, window_end, findings) VALUES ($1,NOW()-INTERVAL '15 minutes',NOW(),$2::jsonb)`, [siteId, JSON.stringify(findings)]);
  return findings;
}

export async function refreshBaselines(siteId: number) {
  await query(
    `INSERT INTO tag_baselines (site_id, vendor, event_name, window_start, window_end, sample_count, fire_count, success_count, failure_count, avg_latency_ms, p75_latency_ms, consent_denied_count)
     SELECT $1, vendor, event_name, NOW()-INTERVAL '7 days', NOW(),
            COUNT(*) FILTER (WHERE ${knownDeliveryOutcome})::int,
            COUNT(DISTINCT ${logicalOccurrenceKey})::int,
            COUNT(*) FILTER (WHERE ${successfulDelivery})::int,
            COUNT(*) FILTER (WHERE ${failedDelivery})::int,
            AVG(latency_ms) FILTER (WHERE ${networkObservation} AND COALESCE(delivery_outcome, 'unknown') NOT IN ('beacon_rejected','blocked')),
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ${networkObservation} AND COALESCE(delivery_outcome, 'unknown') NOT IN ('beacon_rejected','blocked')),
            COUNT(*) FILTER (WHERE ${networkObservation} AND LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied')::int
       FROM events WHERE site_id = $1 AND received_at >= NOW()-INTERVAL '7 days'
      GROUP BY vendor, event_name
     ON CONFLICT (site_id, vendor, event_name, window_start, window_end) DO UPDATE SET sample_count=EXCLUDED.sample_count, fire_count=EXCLUDED.fire_count, success_count=EXCLUDED.success_count, failure_count=EXCLUDED.failure_count, avg_latency_ms=EXCLUDED.avg_latency_ms, p75_latency_ms=EXCLUDED.p75_latency_ms, consent_denied_count=EXCLUDED.consent_denied_count, created_at=NOW()`, [siteId],
  );
}
