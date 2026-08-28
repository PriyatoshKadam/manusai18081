import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { MIN_SAMPLE_SIZE } from '../../../lib/metrics';

export const dynamic = 'force-dynamic';

const logicalOccurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const legacyOutcome = `(delivery_outcome IS NULL OR delivery_outcome = 'unknown')`;
const successfulDelivery = `${networkObservation} AND (delivery_outcome = 'delivered' OR (${legacyOutcome} AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL))`;
const failedDelivery = `${networkObservation} AND (delivery_outcome IN ('http_error','network_error','aborted','timeout','blocked','beacon_rejected') OR (${legacyOutcome} AND (status_code IS NOT NULL AND status_code >= 400 OR failure_reason IN ('network_error','aborted','timeout','blocked','beacon_rejected'))))`;
const knownDeliveryOutcome = `(${successfulDelivery} OR ${failedDelivery})`;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id, vendor_routing_policy FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [health, anomalies, revenue, compliance, performance] = await Promise.all([
    query(`SELECT vendor, event_name,
                  COUNT(DISTINCT ${logicalOccurrenceKey})::int AS fires,
                  COUNT(*)::int AS observations,
                  COUNT(*) FILTER (WHERE ${networkObservation})::int AS delivery_attempts,
                  COUNT(*) FILTER (WHERE ${knownDeliveryOutcome})::int AS known_delivery_outcomes,
                  COUNT(*) FILTER (WHERE ${successfulDelivery})::int AS successes,
                  COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failures,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'http_error')::int AS http_errors,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome IN ('network_error','aborted','timeout'))::int AS transport_anomalies,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'beacon_rejected')::int AS beacon_rejections,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'blocked')::int AS blocked,
                  COUNT(*) FILTER (WHERE observation_kind IN ('datalayer','function') AND NOT EXISTS (
                    SELECT 1 FROM events network_match
                     WHERE network_match.site_id = events.site_id
                       AND network_match.observation_kind = 'network'
                       AND network_match.event_name = events.event_name
                       AND events.session_id IS NOT NULL AND events.occurrence_id IS NOT NULL
                       AND network_match.session_id = events.session_id
                       AND network_match.occurrence_id = events.occurrence_id
                       AND network_match.received_at BETWEEN events.received_at - INTERVAL '6 seconds' AND events.received_at + INTERVAL '6 seconds'
                  ))::int AS unmatched_observations,
                  COALESCE(ROUND(AVG(latency_ms) FILTER (WHERE ${networkObservation}))::int,0) AS avg_latency_ms,
                  COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ${networkObservation}))::int,0) AS p75_latency_ms,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied')::int AS consent_denied,
                  MAX(received_at) AS last_seen
             FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
            GROUP BY vendor, event_name ORDER BY failures DESC, fires DESC LIMIT 200`, [siteId]),
    query(`SELECT id, severity, code, vendor, event_name, message, root_cause, raw, created_at FROM alerts WHERE site_id = $1 AND category = 'anomaly' AND resolved = false ORDER BY created_at DESC LIMIT 50`, [siteId]),
    query(`SELECT transaction_id, currency, vendor_values, vendor_presence, missing_vendors, vendor_currencies, delta_value, status, last_seen FROM revenue_reconciliations WHERE site_id = $1 ORDER BY last_seen DESC LIMIT 50`, [siteId]),
    query(`SELECT category, severity, page_url, resource_url, evidence, status, last_seen FROM compliance_findings WHERE site_id = $1 AND status = 'open' ORDER BY last_seen DESC LIMIT 50`, [siteId]),
    query(`SELECT page_url, COUNT(*)::int AS samples, ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'lcp','')::numeric))::int AS p75_lcp, ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'fcp','')::numeric))::int AS p75_fcp, ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'inp','')::numeric))::int AS p75_inp, ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'ttfb','')::numeric))::int AS p75_ttfb, ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'cls','')::numeric)::numeric,3) AS p75_cls FROM events WHERE site_id=$1 AND event_name = 'web_vitals' AND observation_kind = 'diagnostic' AND web_vitals <> '{}'::jsonb AND received_at > NOW()-INTERVAL '7 days' GROUP BY page_url ORDER BY samples DESC LIMIT 50`, [siteId]),
  ]);
  const rows = health.rows.map((row: any) => {
    const fires = Number(row.fires) || 0;
    const deliveryAttempts = Number(row.delivery_attempts) || 0;
    const knownOutcomes = Number(row.known_delivery_outcomes) || 0;
    const successRate = knownOutcomes >= MIN_SAMPLE_SIZE ? (Number(row.successes) / knownOutcomes) : null;
    const healthScore = knownOutcomes >= MIN_SAMPLE_SIZE ? Math.max(0, Math.round((Number(row.successes) / Math.max(1, knownOutcomes)) * 100)) : null;
    return { ...row, success_rate: successRate, health_score: healthScore, sample_size: knownOutcomes, min_sample_size: MIN_SAMPLE_SIZE, sample_basis: 'network_delivery_outcomes', unconfirmed_attempts: Math.max(0, deliveryAttempts - knownOutcomes) };
  });
  return NextResponse.json({ health: rows, anomalies: anomalies.rows, revenue: revenue.rows, compliance: compliance.rows, performance: performance.rows, routing_policy: owner.rows[0].vendor_routing_policy || {}, min_sample_size: MIN_SAMPLE_SIZE });
}
