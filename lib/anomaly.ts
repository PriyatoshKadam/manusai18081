import { query } from './db';
import { enqueueAlertDeliveries } from './notifications';

function severityFor(score: number) { return score >= 3 ? 'critical' : score >= 2 ? 'warning' : 'info'; }
function pct(value: number) { return `${(value * 100).toFixed(1)}%`; }

export async function runAnomalySweep(siteId: number) {
  const rows = await query(
    `WITH recent AS (
       SELECT vendor, event_name, COUNT(*)::int AS fires,
              SUM(CASE WHEN (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL THEN 1 ELSE 0 END)::int AS failures,
              COALESCE(AVG(latency_ms), 0)::numeric AS avg_latency,
              SUM(CASE WHEN LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied' THEN 1 ELSE 0 END)::int AS denied
         FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '15 minutes'
        GROUP BY vendor, event_name
     ), baseline AS (
       SELECT vendor, event_name, COUNT(*)::int AS fires,
              SUM(CASE WHEN (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL THEN 1 ELSE 0 END)::int AS failures,
              COALESCE(AVG(latency_ms), 0)::numeric AS avg_latency,
              SUM(CASE WHEN LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied' THEN 1 ELSE 0 END)::int AS denied
         FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '7 days' AND received_at < NOW() - INTERVAL '15 minutes'
        GROUP BY vendor, event_name
     )
     SELECT r.vendor, r.event_name, r.fires, r.failures, r.avg_latency, r.denied,
            b.fires AS baseline_fires, b.failures AS baseline_failures, b.avg_latency AS baseline_latency, b.denied AS baseline_denied
       FROM recent r LEFT JOIN baseline b ON b.vendor = r.vendor AND COALESCE(b.event_name,'') = COALESCE(r.event_name,'')
      WHERE r.fires > 0`, [siteId],
  );
  const findings: any[] = [];
  for (const row of rows.rows) {
    const fires = Number(row.fires) || 0;
    const failures = Number(row.failures) || 0;
    const baselineFires = Number(row.baseline_fires) || 0;
    const baselineFailures = Number(row.baseline_failures) || 0;
    const recentFailureRate = failures / fires;
    const baselineFailureRate = baselineFires ? baselineFailures / baselineFires : 0;
    const recentLatency = Number(row.avg_latency) || 0;
    const baselineLatency = Number(row.baseline_latency) || 0;
    const failureDrift = recentFailureRate - baselineFailureRate;
    const latencyDrift = baselineLatency > 0 ? recentLatency / baselineLatency : 1;
    let score = 0;
    if (failures >= 2 && failureDrift >= 0.10) score += failureDrift >= 0.30 ? 3 : 2;
    if (baselineLatency > 0 && latencyDrift >= 2) score += latencyDrift >= 4 ? 3 : 2;
    if (Number(row.denied) >= 3 && Number(row.denied) / fires > 0.5) score += 2;
    if (!score) continue;
    const eventName = row.event_name || null;
    const reason = score >= 3 ? 'Recent real-user evidence is materially worse than the rolling baseline.' : 'Recent real-user evidence drifted beyond the configured warning threshold.';
    const message = `${row.vendor} ${eventName || 'tag'} health drift: ${failures}/${fires} failed (${pct(recentFailureRate)}), avg latency ${Math.round(recentLatency)}ms${baselineFailureRate ? ` vs ${pct(baselineFailureRate)} baseline` : ''}.`;
    const key = `anomaly:${row.vendor}:${eventName || ''}`;
    const inserted = await query(
      `INSERT INTO alerts (site_id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, raw, confidence, dedupe_key, notification_status)
       SELECT $1,$2,'tag_health_drift','anomaly',$3,$4,$5,$6,$7::jsonb,$8::jsonb,'confirmed',$9,'pending'
        WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE site_id=$1 AND code='tag_health_drift' AND dedupe_key=$9 AND resolved=false AND created_at > NOW()-INTERVAL '30 minutes')
       RETURNING id`,
      [siteId, severityFor(score), row.vendor, eventName, message, reason, JSON.stringify(['Open the event health view and inspect recent failed requests.', 'Check GTM triggers, consent state, vendor endpoint responses, and recent site changes.', 'Compare the recent latency and failure evidence with the baseline window.']), JSON.stringify({ recent: row, failureRate: recentFailureRate, baselineFailureRate, latencyDrift, score }), key],
    );
    if (inserted.rowCount) void enqueueAlertDeliveries({ alertId: Number(inserted.rows[0].id), siteId, severity: severityFor(score), category: 'anomaly', vendor: row.vendor, eventName, message, rootCause: reason, fixSteps: ['Open the event health view and inspect recent failed requests.', 'Check GTM triggers, consent state, vendor endpoint responses, and recent site changes.'] });
    findings.push({ vendor: row.vendor, eventName, score, recentFailureRate, baselineFailureRate, latencyDrift, fires, failures });
  }
  await query(`INSERT INTO anomaly_runs (site_id, window_start, window_end, findings) VALUES ($1,NOW()-INTERVAL '15 minutes',NOW(),$2::jsonb)`, [siteId, JSON.stringify(findings)]);
  return findings;
}

export async function refreshBaselines(siteId: number) {
  await query(
    `INSERT INTO tag_baselines (site_id, vendor, event_name, window_start, window_end, sample_count, fire_count, success_count, failure_count, avg_latency_ms, p75_latency_ms, consent_denied_count)
     SELECT $1, vendor, event_name, NOW()-INTERVAL '7 days', NOW(), COUNT(*)::int, COUNT(*)::int,
            SUM(CASE WHEN (status_code IS NULL OR status_code < 400) AND failure_reason IS NULL THEN 1 ELSE 0 END)::int,
            SUM(CASE WHEN (status_code >= 400) OR failure_reason IS NOT NULL THEN 1 ELSE 0 END)::int,
            AVG(latency_ms), PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency_ms),
            SUM(CASE WHEN LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied' THEN 1 ELSE 0 END)::int
       FROM events WHERE site_id = $1 AND received_at >= NOW()-INTERVAL '7 days'
      GROUP BY vendor, event_name
     ON CONFLICT (site_id, vendor, event_name, window_start, window_end) DO UPDATE SET sample_count=EXCLUDED.sample_count, fire_count=EXCLUDED.fire_count, success_count=EXCLUDED.success_count, failure_count=EXCLUDED.failure_count, avg_latency_ms=EXCLUDED.avg_latency_ms, p75_latency_ms=EXCLUDED.p75_latency_ms, consent_denied_count=EXCLUDED.consent_denied_count, created_at=NOW()`, [siteId],
  );
}
