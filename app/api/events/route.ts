import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const legacyOutcome = `(delivery_outcome IS NULL OR delivery_outcome = 'unknown')`;
const failedDelivery = `${networkObservation} AND (delivery_outcome IN ('http_error','beacon_rejected') OR (${legacyOutcome} AND ((status_code IS NOT NULL AND status_code >= 400) OR failure_reason IN ('beacon_rejected') OR failure_reason LIKE 'http_%'))) `;
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
// fix_steps is JSONB in current schema. Cast it to text before applying text functions;
// COALESCE(fix_steps, '') would make PostgreSQL attempt to parse '' as JSON.
const consentAlertFilter = `(LOWER(COALESCE(code,'')) LIKE '%consent%' OR LOWER(COALESCE(category,'')) LIKE '%consent%' OR LOWER(COALESCE(message,'')) LIKE '%consent%' OR LOWER(COALESCE(message,'')) LIKE '%analytics_storage%' OR LOWER(COALESCE(message,'')) LIKE '%ad_storage%' OR LOWER(COALESCE(message,'')) LIKE '%ad_user_data%' OR LOWER(COALESCE(message,'')) LIKE '%ad_personalization%' OR LOWER(COALESCE(message,'')) LIKE '%g100%' OR LOWER(COALESCE(root_cause,'')) LIKE '%consent%' OR LOWER(COALESCE(root_cause,'')) LIKE '%analytics_storage%' OR LOWER(COALESCE(fix_steps::text,'')) LIKE '%consent%')`;

function normaliseName(value: unknown) { return String(value || '').trim().toLowerCase(); }
function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}
function vendorFromTag(tag: any): string {
  const type = normaliseName(tag?.type); const name = normaliseName(tag?.name);
  if (type.includes('googleanalytics') || ['gaawe','gaawc'].includes(type)) return 'ga4';
  if (type.includes('googleads') || type === 'awct' || type === 'sp' || name.includes('google ads')) return 'gads';
  if (type.includes('facebook') || type.includes('meta') || name.includes('facebook') || name.includes('meta pixel')) return 'meta';
  if (type.includes('tiktok') || type.includes('tik_tok') || name.includes('tiktok') || name.includes('tik tok')) return 'tiktok';
  if (type.includes('linkedin') || name.includes('linkedin') || name.includes('insight tag')) return 'linkedin';
  if (type.includes('microsoft') || type.includes('bing') || name.includes('bing') || name.includes('uet')) return 'bing';
  if (type.includes('snapchat') || type.includes('snap') || name.includes('snapchat') || name.includes('snap pixel')) return 'snapchat';
  return 'other';
}
function triggerEventNames(trigger: any): string[] {
  const names: string[] = [];
  const direct = String(trigger?.customEventName || '').trim(); if (direct) names.push(direct);
  const filters = Array.isArray(trigger?.customEventFilter) ? trigger.customEventFilter : [];
  for (const filter of filters) {
    const parameters = Array.isArray(filter?.parameter) ? filter.parameter : [];
    const arg1 = parameters.find((p: any) => String(p?.key || '').toLowerCase() === 'arg1');
    const value = String(arg1?.value || '').trim();
    if (value && !value.includes('{{')) names.push(value);
  }
  return Array.from(new Set(names.map(normaliseName).filter(Boolean)));
}
function gtmEventMap(snapshot: any, vendor: string) {
  const tags = parseJsonArray(snapshot?.tags); const triggers = parseJsonArray(snapshot?.triggers);
  const triggerById = new Map(triggers.map((t: any) => [String(t.triggerId || t.id || ''), t]));
  const map = new Map<string, { tag_names: string[]; trigger_names: string[] }>();
  for (const tag of tags) {
    if (vendorFromTag(tag) !== vendor) continue;
    const tagName = String(tag?.name || '').trim(); if (!tagName || /gafix|monitor/i.test(tagName)) continue;
    const ids = Array.isArray(tag?.firingTriggerIds) ? tag.firingTriggerIds : (Array.isArray(tag?.firingTriggerId) ? tag.firingTriggerId : []);
    const linkedTriggers = ids.map((id: any) => triggerById.get(String(id))).filter(Boolean);
    const triggerNames = linkedTriggers.map((t: any) => String(t?.name || t?.triggerId || '').trim()).filter(Boolean);
    const eventNames = [String(tag?.eventName || '').trim(), ...linkedTriggers.flatMap(triggerEventNames)].map(normaliseName).filter(Boolean);
    for (const eventName of Array.from(new Set(eventNames))) {
      const key = `${vendor}:${eventName}`; const current = map.get(key) || { tag_names: [], trigger_names: [] };
      if (!current.tag_names.includes(tagName)) current.tag_names.push(tagName);
      for (const triggerName of triggerNames) if (!current.trigger_names.includes(triggerName)) current.trigger_names.push(triggerName);
      map.set(key, current);
    }
  }
  return map;
}

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
              COUNT(*) FILTER (WHERE ${networkObservation} AND event_name IN (SELECT event_name FROM alerts WHERE alerts.site_id = $1 AND alerts.resolved = false AND NOT ${consentAlertFilter}))::int AS err
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
              0 AS err
       FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY ${displayName}, event_type, vendor ORDER BY cnt DESC LIMIT 100`;
  const eventsRes = vendor ? await query(eventsQ, [siteId, vendor]) : await query(eventsQ, [siteId]);
  const snapshotRes = await query(`SELECT tags, triggers, fetched_at, environment, snapshot_stale FROM gtm_config_snapshots WHERE site_id = $1 AND user_id = $2 ORDER BY fetched_at DESC LIMIT 1`, [siteId, session.uid]);
  const gtmMap = gtmEventMap(snapshotRes.rows[0] || null, String(vendor || '').toLowerCase());
  for (const row of eventsRes.rows as any[]) {
    const key = `${String(row.vendor || vendor || '').toLowerCase()}:${normaliseName(row.event_name)}`;
    const configured = gtmMap.get(key);
    const observedTags = Array.isArray(row.gtm_tag_names) ? row.gtm_tag_names : [];
    const observedTriggers = Array.isArray(row.gtm_trigger_names) ? row.gtm_trigger_names : [];
    if (configured) {
      row.gtm_tag_names = Array.from(new Set([...observedTags, ...configured.tag_names]));
      row.gtm_trigger_names = Array.from(new Set([...observedTriggers, ...configured.trigger_names]));
      row.gtm_correlation_confidence = row.gtm_tag_names.length ? (row.gtm_correlation_confidence || 'configured') : row.gtm_correlation_confidence;
    }
  }
  const flow = await query(
    `SELECT CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END AS delivery_mode,
            COUNT(DISTINCT ${occurrenceKey})::int AS events,
            COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(client_id,'')))::int AS sessions,
            COUNT(*) FILTER (WHERE ${failedDelivery})::int AS failures,
            COUNT(DISTINCT resource_domain)::int AS destinations,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT resource_domain), NULL) AS domains
       FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
      GROUP BY CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END
      ORDER BY events DESC`, [siteId]);
  const blockedFlow = await query(
    `SELECT CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END AS delivery_mode, COUNT(*)::int AS blocked
       FROM adblock_events WHERE site_id = $1 AND confidence IN ('confirmed', 'likely') AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours'
      GROUP BY CASE WHEN delivery_mode IN ('server_side','first_party') THEN 'first_party' WHEN delivery_mode IN ('client_side','third_party') THEN 'third_party' ELSE 'unknown' END`, [siteId]);
  const [alerts, sources] = await Promise.all([
    query(`SELECT id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, page_url, raw, created_at, last_seen, occurrence_count, distinct_pushes, confidence, dedupe_key, distinct_sessions, distinct_pages, impact_updated_at FROM alerts WHERE site_id = $1 AND resolved = false AND NOT ${consentAlertFilter} ORDER BY created_at DESC LIMIT 50`, [siteId]),
    query(`SELECT event_name, source, origin_source, observation_kind, COUNT(*)::int AS count FROM events WHERE site_id = $1 AND vendor = $2 AND received_at > NOW() - INTERVAL '24 hours' GROUP BY event_name, source, origin_source, observation_kind ORDER BY count DESC LIMIT 100`, [siteId, vendor || 'ga4']),
  ]);
  return NextResponse.json({ stats: stats.rows[0], events: eventsRes.rows, alerts: alerts.rows, flow: flow.rows, blockedFlow: blockedFlow.rows, sources: sources.rows });
}
