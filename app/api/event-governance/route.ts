import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const network = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const nonBlockedFailure = `(${network} AND delivery_outcome IN ('http_error','beacon_rejected')) OR (${network} AND (delivery_outcome IS NULL OR delivery_outcome = 'unknown') AND ((status_code IS NOT NULL AND status_code >= 400) OR failure_reason IN ('beacon_rejected') OR failure_reason LIKE 'http_%'))`;

const STANDARD_REQUIRED: Record<string, string[]> = {
  purchase: ['transaction_id', 'value', 'currency'],
  refund: ['transaction_id'],
  add_to_cart: ['items'],
  view_item: ['items'],
  view_item_list: ['items'],
  begin_checkout: ['items'],
  remove_from_cart: ['items'],
  select_item: ['items'],
};
const VENDOR_ALIASES: Record<string, string> = { microsoftads: 'bing', microsoft_ads: 'bing', google_ads: 'gads', googleads: 'gads' };
function normaliseVendor(value: unknown) { const v = String(value || '').trim().toLowerCase(); return VENDOR_ALIASES[v] || v; }
function normaliseName(value: unknown) { return String(value || '').trim().toLowerCase(); }
function parseJson(value: unknown): any[] { if (Array.isArray(value)) return value; if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } } return []; }
function percentChange(current: number, baseline: number) { return baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : 0; }
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
function gtmConfiguredEvents(snapshot: any, vendor: string) {
  const tags = parseJson(snapshot?.tags); const triggers = parseJson(snapshot?.triggers); const triggerById = new Map(triggers.map((t: any) => [String(t.triggerId || ''), t]));
  const configured = new Map<string, any>();
  for (const tag of tags) {
    if (vendorFromTag(tag) !== vendor) continue;
    const tagName = String(tag.name || '').trim(); if (!tagName || /gafix|monitor/i.test(tagName)) continue;
    const triggerNames = (Array.isArray(tag.firingTriggerIds) ? tag.firingTriggerIds : []).map((id: any) => triggerById.get(String(id))).filter(Boolean).map((t: any) => String(t.name || t.triggerId || ''));
    const triggerEvents = (Array.isArray(tag.firingTriggerIds) ? tag.firingTriggerIds : []).map((id: any) => triggerById.get(String(id))).filter(Boolean).map((t: any) => String(t.customEventName || '').trim()).filter(Boolean);
    const directEvent = String(tag.eventName || '').trim();
    for (const eventName of [directEvent, ...triggerEvents].map(normaliseName).filter(Boolean)) {
      const key = `${vendor}:${eventName}`; const current = configured.get(key) || { vendor, event_name: eventName, tag_names: [], trigger_names: [], parameter_keys: [] };
      if (!current.tag_names.includes(tagName)) current.tag_names.push(tagName);
      for (const triggerName of triggerNames) if (triggerName && !current.trigger_names.includes(triggerName)) current.trigger_names.push(triggerName);
      for (const parameterKey of Array.isArray(tag.parameterKeys) ? tag.parameterKeys : []) if (!current.parameter_keys.includes(String(parameterKey))) current.parameter_keys.push(String(parameterKey));
      configured.set(key, current);
    }
  }
  return configured;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url); const siteId = Number(url.searchParams.get('siteId')); const vendor = normaliseVendor(url.searchParams.get('vendor'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  if (!vendor) return NextResponse.json({ error: 'vendor required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2 LIMIT 1', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [events, params, alerts, snapshotResult] = await Promise.all([
    query(`SELECT LOWER(COALESCE(event_name,'')) AS event_name, event_type, vendor,
      COUNT(DISTINCT ${occurrenceKey})::int AS lifetime_hits,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours')::int AS hits_24h,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '48 hours' AND received_at < NOW() - INTERVAL '24 hours')::int AS prior_hits_24h,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '8 days' AND received_at < NOW() - INTERVAL '1 day')::int AS prior_7d_hits,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours' AND ${nonBlockedFailure})::int AS failed_24h,
      MIN(received_at) AS first_seen, MAX(received_at) AS last_seen,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_tag_name,'')),NULL) AS observed_gtm_tags,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_trigger_name,'')),NULL) AS observed_gtm_triggers,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_correlation_confidence,'')),NULL) AS correlation_confidences,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT parameter_status),NULL) AS parameter_statuses,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT missing_parameters),NULL) AS missing_parameters
      FROM events WHERE site_id = $1 AND vendor = $2 AND received_at >= NOW() - INTERVAL '30 days'
      GROUP BY LOWER(COALESCE(event_name,'')), event_type, vendor ORDER BY lifetime_hits DESC LIMIT 1000`, [siteId, vendor]),
    query(`SELECT LOWER(COALESCE(event_name,'')) AS event_name, vendor, LOWER(key) AS parameter_name, COUNT(DISTINCT ${occurrenceKey})::int AS hits, ARRAY_AGG(DISTINCT jsonb_typeof(value)) AS types
      FROM events e CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(e.params)='object' THEN e.params ELSE '{}'::jsonb END)
      WHERE e.site_id = $1 AND e.vendor = $2 AND e.received_at >= NOW() - INTERVAL '30 days'
      GROUP BY LOWER(COALESCE(event_name,'')), vendor, LOWER(key) ORDER BY hits DESC LIMIT 10000`, [siteId, vendor]),
    query(`SELECT id, severity, code, category, vendor, event_name, message, root_cause, fix_steps FROM alerts WHERE site_id = $1 AND resolved = false AND ($2::text IS NULL OR vendor = $2) ORDER BY created_at DESC LIMIT 500`, [siteId, vendor]),
    query(`SELECT tags, triggers, variables, fetched_at, environment, snapshot_version_id, live_version_id, live_version_name, snapshot_stale FROM gtm_config_snapshots WHERE site_id = $1 AND user_id = $2 ORDER BY fetched_at DESC LIMIT 1`, [siteId, session.uid]),
  ]);

  const snapshot = snapshotResult.rows[0] || null;
  const snapshotUsableForMissing = Boolean(snapshot && !snapshot.snapshot_stale && snapshot.environment !== 'workspace');
  const configured = gtmConfiguredEvents(snapshot, vendor);
  const byName = new Map<string, any>();

  for (const row of events.rows as any[]) {
    const eventName = normaliseName(row.event_name); const key = `${vendor}:${eventName}`;
    const props = (params.rows as any[]).filter((p) => normaliseName(p.event_name) === eventName);
    const config = configured.get(key) || null; const issues: any[] = [];
    const add = (code: string, severity: 'critical'|'warning'|'info', message: string, detail: string, evidence?: any) => { const fingerprint = `${code}:${message}`; if (!issues.some((i) => i.fingerprint === fingerprint)) issues.push({ code, severity, message, detail, evidence, fingerprint }); };
    const firstSeen = row.first_seen ? new Date(row.first_seen) : null;
    if (firstSeen && firstSeen.getTime() >= Date.now() - 86400000) add('new_event','info','New event detected',`First observed ${firstSeen.toLocaleString()}. Review it against the GTM configuration and tracking plan.`);
    if (row.hits_24h === 0 && row.lifetime_hits > 0) add('offline_event','warning','Event is offline',`Observed during the 30-day window but received no traffic in the last 24 hours. Last seen ${new Date(row.last_seen).toLocaleString()}.`);
    const baselineDaily = Number(row.prior_7d_hits || 0) / 7;
    if (baselineDaily >= 20) { const change = percentChange(Number(row.hits_24h), baselineDaily); if (change <= -30) add('traffic_drop','warning',`Traffic dropped ${Math.abs(change)}%`,`Current 24-hour volume is ${Number(row.hits_24h).toLocaleString()} versus a 7-day daily baseline of ${Math.round(baselineDaily).toLocaleString()}.`); if (change >= 100) add('traffic_peak','warning',`Traffic increased ${change}%`,`Current 24-hour volume is ${Number(row.hits_24h).toLocaleString()} versus a 7-day daily baseline of ${Math.round(baselineDaily).toLocaleString()}.`); }
    if (row.failed_24h > 0) add(row.failed_24h >= 10 ? 'delivery_failure' : 'delivery_warning', row.failed_24h >= 10 ? 'critical' : 'warning', `${Number(row.failed_24h).toLocaleString()} delivery failures`, 'Network/HTTP delivery failures were observed. Browser/ad-blocker blocking is intentionally excluded from Events and belongs in Ad blockers.');
    const required = STANDARD_REQUIRED[eventName];
    if (required) for (const name of required) { const prop = props.find((p: any) => normaliseName(p.parameter_name) === name); const coverage = Number(prop?.hits || 0) / Math.max(Number(row.lifetime_hits || 0), 1); if (!prop || coverage < 0.8) add('missing_property','warning',`Missing property: ${name}`,`${name} is present on ${Math.round(coverage * 100)}% of observed ${row.event_name} events.`,{ coverage: Math.round(coverage * 1000) / 10, expected: 'required' }); }
    const reportedMissing = new Set<string>(); for (const raw of Array.isArray(row.missing_parameters) ? row.missing_parameters.flat(Infinity) : []) { const name = String(raw || '').trim().toLowerCase(); if (name) reportedMissing.add(name); }
    for (const name of reportedMissing) add('missing_property','warning',`Missing property: ${name}`,'The event telemetry marked this property as missing on observed traffic.');
    for (const p of props) { const types = Array.isArray(p.types) ? p.types.map(String).filter(Boolean) : []; if (types.length > 1) add('type_collision','warning',`Type collision: ${p.parameter_name}`,`Observed types: ${types.join(', ')}. A property should keep a stable type for reliable reporting.`); }
    for (const alert of (alerts.rows as any[]).filter((a) => normaliseName(a.event_name) === eventName)) { const code = String(alert.code || 'tracking_alert'); if (/ad.?block|blocked|pixel/i.test(code) || /ad.?block|blocked/i.test(String(alert.message || ''))) continue; add(`alert:${code}`, alert.severity === 'critical' ? 'critical' : 'warning', alert.message || code, alert.root_cause || alert.fix_steps || 'Open the alert for the captured evidence.'); }
    const status = issues.some((i) => i.severity === 'critical' || i.severity === 'warning') ? 'Warn' : issues.some((i) => i.code === 'new_event') ? 'New' : row.hits_24h > 0 ? 'OK' : 'Off';
    byName.set(key, { event_name: row.event_name || 'unnamed event', vendor, event_type: row.event_type || 'standard', status, hits_24h: Number(row.hits_24h || 0), prior_hits_24h: Number(row.prior_hits_24h || 0), lifetime_hits: Number(row.lifetime_hits || 0), first_seen: row.first_seen, last_seen: row.last_seen, gtm: { configured: Boolean(config), tag_names: config?.tag_names || row.observed_gtm_tags || [], trigger_names: config?.trigger_names || row.observed_gtm_triggers || [], correlation_confidences: row.correlation_confidences || [], snapshot_fetched_at: snapshot?.fetched_at || null, snapshot_environment: snapshot?.environment || null, snapshot_stale: Boolean(snapshot?.snapshot_stale) }, issues: issues.map(({ fingerprint, ...issue }) => issue), properties: props.map((p: any) => ({ parameter_name: p.parameter_name, hits: Number(p.hits || 0), types: p.types || [] })) });
  }

  if (snapshotUsableForMissing) for (const [key, config] of configured.entries()) if (!byName.has(key)) byName.set(key, { event_name: config.event_name, vendor, event_type: 'standard', status: 'Warn', hits_24h: 0, prior_hits_24h: 0, lifetime_hits: 0, first_seen: null, last_seen: null, gtm: { configured: true, tag_names: config.tag_names, trigger_names: config.trigger_names, correlation_confidences: [], snapshot_fetched_at: snapshot?.fetched_at || null, snapshot_environment: snapshot?.environment || null, snapshot_stale: false }, issues: [{ code: 'missing_event', severity: 'warning', message: `Missing event: ${config.event_name}`, detail: `GTM has ${config.tag_names.join(', ') || 'a tag'} configured for this event, but no matching event was observed for ${vendor} in the last 30 days.`, evidence: { gtmTags: config.tag_names, gtmTriggers: config.trigger_names } }], properties: [] });

  const summary = Array.from(byName.values());
  return NextResponse.json({ events: summary, gtm: { connected: Boolean(snapshot), fetched_at: snapshot?.fetched_at || null, environment: snapshot?.environment || null, snapshot_version_id: snapshot?.snapshot_version_id || null, live_version_id: snapshot?.live_version_id || null, live_version_name: snapshot?.live_version_name || null, snapshot_stale: Boolean(snapshot?.snapshot_stale) }, summary: { total: summary.length, ok: summary.filter((r) => r.status === 'OK').length, new: summary.filter((r) => r.status === 'New').length, warn: summary.filter((r) => r.status === 'Warn').length, off: summary.filter((r) => r.status === 'Off').length, missing: summary.filter((r) => r.issues.some((i: any) => i.code === 'missing_event')).length } });
}
