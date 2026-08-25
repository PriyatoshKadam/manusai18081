import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const displayName = `(CASE
  WHEN vendor = 'gads' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'conversion_label', ''), NULLIF(params->>'google_conversion_label', ''), NULLIF(params->>'send_to', ''), NULLIF(params->>'conversion_id', ''), NULLIF(params->>'google_conversion_id', ''), 'conversion')
  WHEN vendor = 'meta' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'ev', ''), NULLIF(params->>'event', ''), 'PageView')
  WHEN vendor = 'linkedin' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'event', ''), NULLIF(params->>'event_name', ''), NULLIF(params->>'action', ''), 'page_view')
  WHEN vendor = 'bing' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'evt', ''), NULLIF(params->>'event', ''), 'pageLoad')
  WHEN vendor = 'snapchat' THEN COALESCE(NULLIF(event_name, ''), NULLIF(params->>'ev', ''), NULLIF(params->>'event', ''), 'PAGE_VIEW')
  ELSE event_name END)`;
const platformId = `CASE
  WHEN vendor = 'meta' THEN COALESCE(NULLIF(params->>'id', ''), NULLIF(params->>'pixel_id', ''), NULLIF(params->>'pixelId', ''))
  WHEN vendor = 'linkedin' THEN COALESCE(NULLIF(params->>'pid', ''), NULLIF(params->>'partner_id', ''), NULLIF(params->>'partnerId', ''))
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
       (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence IN ('confirmed', 'likely') AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours') AS adblock_24h,
       (SELECT COUNT(DISTINCT ${occurrenceKey}) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') AS events_24h`,
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
              MAX(NULLIF(params->>'conversion_label','')) AS conversion_label,
              MAX(COALESCE(NULLIF(params->>'conversion_id',''), NULLIF(params->>'google_conversion_id',''))) AS conversion_id,
              MAX(${platformId}) AS platform_id,${correlationSelect}
              COUNT(DISTINCT ${occurrenceKey})::int AS cnt,
              COUNT(DISTINCT session_id)::int AS sessions,
              COALESCE(ROUND(AVG(latency_ms))::int, 0) AS avg_latency_ms,
              SUM(CASE WHEN (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL THEN 1 ELSE 0 END)::int AS failed,
              SUM(CASE WHEN event_name IN (SELECT event_name FROM alerts WHERE alerts.site_id = $1 AND alerts.resolved = false) THEN 1 ELSE 0 END)::int AS err
       FROM events WHERE site_id = $1 AND vendor = $2 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY ${displayName}, event_type, vendor ORDER BY cnt DESC LIMIT 100`
    : `SELECT ${displayName} AS event_name, event_type, vendor,
              MAX(NULLIF(params->>'conversion_label','')) AS conversion_label,
              MAX(COALESCE(NULLIF(params->>'conversion_id',''), NULLIF(params->>'google_conversion_id',''))) AS conversion_id,
              MAX(${platformId}) AS platform_id,${correlationSelect}
              COUNT(DISTINCT ${occurrenceKey})::int AS cnt,
              COUNT(DISTINCT session_id)::int AS sessions,
              COALESCE(ROUND(AVG(latency_ms))::int, 0) AS avg_latency_ms,
              SUM(CASE WHEN (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL THEN 1 ELSE 0 END)::int AS failed,
              0 AS err
       FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY ${displayName}, event_type, vendor ORDER BY cnt DESC LIMIT 100`;
  const eventsRes = vendor ? await query(eventsQ, [siteId, vendor]) : await query(eventsQ, [siteId]);
  const flow = await query(
    `SELECT COALESCE(NULLIF(delivery_mode, ''), 'unknown') AS delivery_mode,
            COUNT(DISTINCT ${occurrenceKey})::int AS events,
            COUNT(DISTINCT session_id)::int AS sessions,
            COUNT(*) FILTER (WHERE (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL)::int AS failures,
            COUNT(DISTINCT resource_domain)::int AS destinations,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT resource_domain), NULL) AS domains
       FROM events
      WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
      GROUP BY COALESCE(NULLIF(delivery_mode, ''), 'unknown')
      ORDER BY events DESC`,
    [siteId],
  );
  const blockedFlow = await query(
    `SELECT COALESCE(NULLIF(delivery_mode, ''), 'unknown') AS delivery_mode, COUNT(*)::int AS blocked
       FROM adblock_events
      WHERE site_id = $1 AND confidence IN ('confirmed', 'likely') AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours'
      GROUP BY COALESCE(NULLIF(delivery_mode, ''), 'unknown')`,
    [siteId],
  );
  const [alerts, sources] = await Promise.all([
    query(`SELECT id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, page_url, raw, created_at, last_seen, occurrence_count, distinct_pushes, confidence, dedupe_key FROM alerts WHERE site_id = $1 AND resolved = false ORDER BY created_at DESC LIMIT 50`, [siteId]),
    query(`SELECT event_name, source, observation_kind, COUNT(*)::int AS count
           FROM events WHERE site_id = $1 AND vendor = $2 AND received_at > NOW() - INTERVAL '24 hours'
           GROUP BY event_name, source, observation_kind ORDER BY count DESC LIMIT 100`, [siteId, vendor || 'ga4']),
  ]);
  return NextResponse.json({ stats: stats.rows[0], events: eventsRes.rows, alerts: alerts.rows, flow: flow.rows, blockedFlow: blockedFlow.rows, sources: sources.rows });
}
