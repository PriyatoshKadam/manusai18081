import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const legacyOutcome = `(delivery_outcome IS NULL OR delivery_outcome = 'unknown')`;
const failedDelivery = `${networkObservation} AND (delivery_outcome IN ('http_error','blocked','beacon_rejected') OR (${legacyOutcome} AND ((status_code IS NOT NULL AND status_code >= 400) OR failure_reason IN ('blocked','beacon_rejected') OR failure_reason LIKE 'http_%'))) `;
const transportAnomaly = `${networkObservation} AND (delivery_outcome IN ('network_error','aborted','timeout') OR (${legacyOutcome} AND failure_reason IN ('network_error','aborted','timeout'))) `;
const conversionId = `COALESCE(NULLIF(params->>'conversion_id', ''), NULLIF(params->>'google_conversion_id', ''), NULLIF((regexp_match(COALESCE(raw_url, ''), '/pagead/(conversion|viewthroughconversion)/([^/?]+)'))[2], ''))`;
const conversionLabel = `COALESCE(NULLIF(params->>'conversion_label', ''), NULLIF(params->>'google_conversion_label', ''), NULLIF(params->>'label', ''), NULLIF((regexp_match(COALESCE(raw_url, ''), '[?&](?:conversion_label|google_conversion_label|label|send_to)=([^&]+)'))[1], ''))`;
const displayName = `(CASE
  WHEN vendor = 'gads' THEN COALESCE(NULLIF(event_name, ''), ${conversionLabel}, ${conversionId}, 'conversion')
  WHEN vendor = 'meta' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'ev', ''), NULLIF(params->>'event', ''), 'PageView')
  WHEN vendor = 'linkedin' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'event', ''), NULLIF(params->>'event_name', ''), NULLIF(params->>'action', ''), 'page_view')
  WHEN vendor = 'bing' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'evt', ''), NULLIF(params->>'event', ''), 'pageLoad')
  WHEN vendor = 'snapchat' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'ev', ''), NULLIF(params->>'event', ''), 'PAGE_VIEW')
  ELSE event_name END)`;
const platformId = `CASE
  WHEN vendor = 'meta' THEN COALESCE(NULLIF(params->>'id', ''), NULLIF(params->>'pixel_id', ''), NULLIF(params->>'pixelId', ''), NULLIF((regexp_match(COALESCE(raw_url, ''), '[?&](?:id|pixel_id|pixelId)=([^&]+)'))[1], ''))
  WHEN vendor = 'linkedin' THEN COALESCE(NULLIF(params->>'pid', ''), NULLIF(params->>'partner_id', ''), NULLIF(params->>'partnerId', ''), NULLIF((regexp_match(COALESCE(raw_url, ''), '[?&](?:pid|partner_id|partnerId)=([^&]+)'))[1], ''))
  WHEN vendor = 'bing' THEN COALESCE(NULLIF(params->>'ti', ''), NULLIF(params->>'uet_tag_id', ''), NULLIF(params->>'uetTagId', ''), NULLIF(params->>'tag_id', ''))
  WHEN vendor = 'snapchat' THEN COALESCE(NULLIF(params->>'pid', ''), NULLIF(params->>'pids', ''), NULLIF(params->>'pixel_id', ''), NULLIF(params->>'pixelId', ''))
  ELSE NULL END`;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = url.searchParams.get('vendor');
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const noiseFilter = `NOT ${INTERNAL_CORRELATION_NOISE_SQL}`;
  const stats = await query(
    `SELECT
       (SELECT COUNT(DISTINCT ${occurrenceKey}) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '1 hour') AS events_hour,
       (SELECT COUNT(*) FROM alerts WHERE site_id = $1 AND resolved = false) AS active_alerts,
       (SELECT COUNT(*) FROM alerts WHERE site_id = $1 AND resolved = false AND severity = 'critical') AS critical_alerts,
       (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'confirmed' AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours') AS confirmed_blockers_24h,
       (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'confirmed' AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours') AS adblock_24h,
       (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'likely' AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours') AS likely_blocker_signals_24h,
       (SELECT COUNT(DISTINCT ${occurrenceKey}) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') AS events_24h,
       (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), NULLIF(client_id, ''))) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') AS sessions_24h,
       (SELECT COUNT(*) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') AS persisted_events_24h,
       (SELECT COUNT(*) FROM events WHERE site_id = $1 AND detection_status = 'scored' AND received_at > NOW() - INTERVAL '24 hours') AS scored_events_24h,
       (SELECT COUNT(*) FROM events WHERE site_id = $1 AND detection_status = 'failed' AND received_at > NOW() - INTERVAL '24 hours') AS detection_failures_24h,
       (SELECT CASE WHEN COUNT(*) < 30 THEN NULL ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE detection_status = 'scored') / COUNT(*), 1) END FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') AS detection_coverage_pct`,
    [siteId],
  );
  const correlationSelect = `
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_tag_name, '')), NULL) AS gtm_tag_names,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_trigger_name, '')), NULL) AS gtm_trigger_names,
              CASE WHEN COUNT(DISTINCT NULLIF(gtm_tag_name, '')) > 1 THEN 'ambiguous' ELSE MAX(NULLIF(gtm_correlation_confidence, '')) END AS gtm_correlation_confidence,
              ARRAY_AGG(DISTINCT parameter_status) AS parameter_statuses,
              ARRAY_AGG(DISTINCT missing_parameters) AS missing_parameters,`;
  const eventsQ = vendor
    ? `SELECT ${displayName} AS event_name, event_type, vendor,
              MAX(${conversionLabel}) AS conversion_label,
              MAX(${conversionId}) AS conversion_id,
              MAX(${platformId}) AS platform_id,${correlationSelect}
              COUNT(DISTINCT ${occurrenceKey})::int AS cnt,
              COUNT(DISTINCT session_id)::int AS sessions,
              COALESCE(ROUND(AVG(latency_ms) FILTER (WHERE ${networkObservation}))::int, 0) AS avg_latency_ms,
              COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failed,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'delivered')::int AS delivered,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'http_error')::int AS http_errors,
              COUNT(*) FILTER (WHERE ${transportAnomaly})::int AS transport_anomalies,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'beacon_rejected')::int AS beacon_rejections,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'blocked')::int AS blocked,
              COUNT(*) FILTER (WHERE ${networkObservation} AND event_name IN (SELECT event_name FROM alerts WHERE alerts.site_id = $1 AND alerts.resolved = false))::int AS err
       FROM events WHERE site_id = $1 AND vendor = $2 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY ${displayName}, event_type, vendor ORDER BY cnt DESC LIMIT 100`
    : `SELECT ${displayName} AS event_name, event_type, vendor,
              MAX(${conversionLabel}) AS conversion_label,
              MAX(${conversionId}) AS conversion_id,
              MAX(${platformId}) AS platform_id,${correlationSelect}
              COUNT(DISTINCT ${occurrenceKey})::int AS cnt,
              COUNT(DISTINCT session_id)::int AS sessions,
              COALESCE(ROUND(AVG(latency_ms) FILTER (WHERE ${networkObservation}))::int, 0) AS avg_latency_ms,
              COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failed,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'delivered')::int AS delivered,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'http_error')::int AS http_errors,
              COUNT(*) FILTER (WHERE ${transportAnomaly})::int AS transport_anomalies,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'beacon_rejected')::int AS beacon_rejections,
              COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome = 'blocked')::int AS blocked,
              0 AS err
       FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY ${displayName}, event_type, vendor ORDER BY cnt DESC LIMIT 100`;
  const eventsRes = vendor ? await query(eventsQ, [siteId, vendor]) : await query(eventsQ, [siteId]);
  const flow = await query(
    `SELECT CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END AS delivery_mode,
            COUNT(DISTINCT ${occurrenceKey})::int AS events,
            COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(client_id,'')))::int AS sessions,
            COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failures,
            COUNT(DISTINCT resource_domain)::int AS destinations,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT resource_domain), NULL) AS domains
       FROM events
      WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
      GROUP BY CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END
      ORDER BY events DESC`,
    [siteId],
  );
  const blockedFlow = await query(
    `SELECT CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END AS delivery_mode, COUNT(*)::int AS blocked
       FROM adblock_events
      WHERE site_id = $1 AND confidence IN ('confirmed', 'likely') AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours'
      GROUP BY CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END`,
    [siteId],
  );
  const [alerts, sources] = await Promise.all([
    query(`SELECT id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, page_url, raw, created_at, last_seen, occurrence_count, distinct_pushes, confidence, dedupe_key, distinct_sessions, distinct_pages, impact_updated_at FROM alerts WHERE site_id = $1 AND resolved = false ORDER BY created_at DESC LIMIT 50`, [siteId]),
    query(`SELECT event_name, source, origin_source, observation_kind, COUNT(*)::int AS count
           FROM events WHERE site_id = $1 AND vendor = $2 AND received_at > NOW() - INTERVAL '24 hours'
           GROUP BY event_name, source, origin_source, observation_kind ORDER BY count DESC LIMIT 100`, [siteId, vendor || 'ga4']),
  ]);
  return NextResponse.json({ stats: stats.rows[0], events: eventsRes.rows, alerts: alerts.rows, flow: flow.rows, blockedFlow: blockedFlow.rows, sources: sources.rows });
}
