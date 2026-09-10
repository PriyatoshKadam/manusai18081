import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const network = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;

const STANDARD_REQUIRED: Record<string, string[]> = {
  purchase: ['transaction_id', 'value', 'currency', 'items'],
  refund: ['transaction_id'],
  add_to_cart: ['items'],
  view_item: ['items'],
  view_item_list: ['items'],
  begin_checkout: ['items'],
  remove_from_cart: ['items'],
  select_item: ['items'],
};

function normaliseParams(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function hasParam(params: Record<string, unknown>, name: string) {
  const wanted = name.toLowerCase();
  return Object.keys(params).some((key) => key.toLowerCase() === wanted && params[key] !== null && params[key] !== '');
}
function jsonType(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}
function pct(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = url.searchParams.get('vendor')?.trim().toLowerCase() || null;
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const args = vendor ? [siteId, vendor] : [siteId];
  const vendorClause = vendor ? ' AND vendor = $2' : '';

  const [events, params, blocked, alerts, pixels] = await Promise.all([
    query(
      `SELECT ${occurrenceKey} AS occurrence_key, LOWER(COALESCE(event_name,'')) AS event_name, event_type, vendor,
              params, observed_parameters, missing_parameters, received_at,
              COUNT(*) OVER (PARTITION BY LOWER(COALESCE(event_name,'')), vendor) AS lifetime_hits,
              COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours') OVER (PARTITION BY LOWER(COALESCE(event_name,'')), vendor) AS hits_24h,
              COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '48 hours' AND received_at < NOW() - INTERVAL '24 hours') OVER (PARTITION BY LOWER(COALESCE(event_name,'')), vendor) AS prior_hits_24h,
              COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours' AND ${network} AND delivery_outcome <> 'delivered') OVER (PARTITION BY LOWER(COALESCE(event_name,'')), vendor) AS failed_24h,
              COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours' AND ${network} AND delivery_outcome = 'blocked') OVER (PARTITION BY LOWER(COALESCE(event_name,'')), vendor) AS blocked_24h,
              MAX(received_at) OVER (PARTITION BY LOWER(COALESCE(event_name,'')), vendor) AS last_seen
         FROM events
        WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 days'${vendorClause}
        ORDER BY received_at DESC LIMIT 12000`,
      args,
    ),
    query(
      `SELECT LOWER(COALESCE(event_name,'')) AS event_name, vendor, LOWER(key) AS parameter_name,
              COUNT(DISTINCT ${occurrenceKey})::int AS hits,
              ARRAY_AGG(DISTINCT CASE jsonb_typeof(value) WHEN 'boolean' THEN 'boolean' WHEN 'number' THEN 'number' WHEN 'string' THEN 'string' WHEN 'array' THEN 'array' WHEN 'object' THEN 'object' WHEN 'null' THEN 'null' ELSE 'unknown' END) AS types
         FROM events e CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(e.params)='object' THEN e.params ELSE '{}'::jsonb END)
        WHERE e.site_id = $1 AND e.received_at >= NOW() - INTERVAL '30 days'${vendorClause}
        GROUP BY LOWER(COALESCE(event_name,'')), vendor, LOWER(key)
        ORDER BY hits DESC LIMIT 10000`,
      args,
    ),
    query(
      `SELECT LOWER(COALESCE(event_name,'')) AS event_name, COUNT(*)::int AS blocked
         FROM adblock_events
        WHERE site_id = $1 AND confidence IN ('confirmed','likely') AND detected_at >= NOW() - INTERVAL '24 hours'
        GROUP BY LOWER(COALESCE(event_name,''))`,
      [siteId],
    ),
    query(
      `SELECT id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, created_at, last_seen
         FROM alerts WHERE site_id = $1 AND resolved = false
           AND ($2::text IS NULL OR vendor = $2)
         ORDER BY created_at DESC LIMIT 500`,
      [siteId, vendor],
    ),
    query(
      `SELECT CASE vendor WHEN 'ga4' THEN 'ga4_measurement_id' WHEN 'gads' THEN 'gads_conversion_id' WHEN 'meta' THEN 'meta_pixel_id' WHEN 'tiktok' THEN 'tiktok_pixel_id' WHEN 'linkedin' THEN 'linkedin_partner_id' WHEN 'bing' THEN 'bing_uet_tag_id' WHEN 'snapchat' THEN 'snapchat_pixel_id' END AS vendor,
              COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours')::int AS hits_24h
         FROM events WHERE site_id = $1${vendorClause}
         GROUP BY vendor`,
      args,
    ),
  ]);

  const rows = new Map<string, any>();
  for (const row of events.rows) {
    const key = `${row.vendor}:${row.event_name}`;
    if (!rows.has(key)) rows.set(key, { event_name: row.event_name || 'unnamed event', vendor: row.vendor, event_type: row.event_type, hits_24h: Number(row.hits_24h || 0), prior_hits_24h: Number(row.prior_hits_24h || 0), lifetime_hits: Number(row.lifetime_hits || 0), failed_24h: Number(row.failed_24h || 0), blocked_24h: Number(row.blocked_24h || 0), last_seen: row.last_seen, issues: [], properties: [] });
  }

  const propertyRows = params.rows as any[];
  const byEvent = new Map<string, any[]>();
  for (const p of propertyRows) {
    const key = `${p.vendor}:${p.event_name}`;
    const list = byEvent.get(key) || [];
    list.push(p);
    byEvent.set(key, list);
  }

  for (const row of rows.values()) {
    const key = `${row.vendor}:${row.event_name}`;
    const props = byEvent.get(key) || [];
    const issues: any[] = [];
    const add = (code: string, severity: 'critical'|'warning'|'info', message: string, detail?: string) => issues.push({ code, severity, message, detail });
    const eventName = row.event_name.toLowerCase();

    if (row.lifetime_hits > 0 && row.hits_24h === 0) add('offline_event', 'warning', 'Event is offline', `Observed in the last 30 days but no hits in the last 24 hours. Last seen ${new Date(row.last_seen).toLocaleString()}.`);
    if (row.lifetime_hits > 0 && row.hits_24h > 0 && row.prior_hits_24h >= 20) {
      const change = pct(row.hits_24h, row.prior_hits_24h);
      if (change <= -30) add('traffic_drop', 'warning', `Traffic dropped ${Math.abs(change)}%`, 'Compared with the previous 24-hour period.');
      if (change >= 100) add('traffic_peak', 'warning', `Traffic increased ${change}%`, 'Compared with the previous 24-hour period. Check campaigns, duplicate firing and traffic quality.');
    }
    if (row.failed_24h > 0) add('delivery_failure', row.failed_24h > 10 ? 'critical' : 'warning', `${row.failed_24h.toLocaleString()} failed deliveries`, 'Network errors, HTTP errors, rejected beacons or blocked requests were observed.');
    if (row.blocked_24h > 0) add('blocked_by_browser', 'warning', `${row.blocked_24h.toLocaleString()} deliveries blocked`, 'The event was observed but its vendor request was blocked. See Ad blockers for affected sessions and destinations.');
    const required = STANDARD_REQUIRED[eventName] || [];
    for (const requiredName of required) {
      const prop = props.find((p) => String(p.parameter_name).toLowerCase() === requiredName.toLowerCase());
      const hitCount = Number(prop?.hits || 0);
      const eventHits = Math.max(row.lifetime_hits, 1);
      if (!prop || hitCount / eventHits < 0.8) add('missing_property', 'warning', `Missing property: ${requiredName}`, `${requiredName} is present on ${Math.round((hitCount / eventHits) * 100)}% of observed ${row.event_name} events; expected coverage is at least 80%.`);
    }
    for (const p of props) {
      const types = Array.isArray(p.types) ? p.types.map(String) : [];
      if (types.length > 1) add('type_collision', 'warning', `Type collision: ${p.parameter_name}`, `Observed types: ${types.join(', ')}.`);
      if (Number(p.hits) < Math.max(2, Math.round(row.lifetime_hits * 0.05)) && row.lifetime_hits >= 20) add('unexpected_property', 'info', `Unexpected property: ${p.parameter_name}`, 'This property appears on a small minority of events. Review whether it is intentional or should be part of the event specification.');
    }
    const related = (alerts.rows as any[]).filter((a) => String(a.event_name || '').toLowerCase() === eventName);
    for (const a of related) add(`alert:${a.code}`, a.severity === 'critical' ? 'critical' : 'warning', a.message || a.code, a.root_cause || undefined);
    row.issues = Array.from(new Map(issues.map((i) => [`${i.code}:${i.message}`, i])).values());
    row.status = row.issues.some((i: any) => i.severity === 'critical') ? 'Warn' : row.issues.length ? 'Warn' : (row.hits_24h > 0 ? 'OK' : 'Off');
    row.properties = props.map((p) => ({ parameter_name: p.parameter_name, hits: Number(p.hits || 0), types: p.types || [] }));
  }

  const expectedByVendor: Record<string, string[]> = {
    ga4: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    meta: ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'],
    tiktok: ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'CompletePayment'],
  };
  const expected = vendor ? expectedByVendor[vendor] || [] : [];
  const observedNames = new Set(Array.from(rows.values()).map((r) => r.event_name.toLowerCase()));
  for (const expectedName of expected) {
    if (!observedNames.has(expectedName.toLowerCase())) rows.set(`${vendor}:${expectedName.toLowerCase()}`, { event_name: expectedName, vendor, event_type: 'standard', hits_24h: 0, prior_hits_24h: 0, lifetime_hits: 0, failed_24h: 0, blocked_24h: 0, last_seen: null, status: 'Warn', issues: [{ code: 'missing_event', severity: 'warning', message: `Missing event: ${expectedName}`, detail: 'This standard event is recommended for the selected platform but was not observed in the last 30 days.' }], properties: [] });
  }

  const summary = Array.from(rows.values());
  return NextResponse.json({ events: summary, summary: { total: summary.length, ok: summary.filter((r) => r.status === 'OK').length, warn: summary.filter((r) => r.status === 'Warn').length, off: summary.filter((r) => r.status === 'Off').length, missing: summary.filter((r) => r.issues.some((i: any) => i.code === 'missing_event')).length } });
}
