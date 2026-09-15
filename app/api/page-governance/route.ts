import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const cleanPathSql = `regexp_replace(split_part(split_part(COALESCE(page_url, raw_url, ''),'?',1),'#',1),'^https?://[^/]+','/')`;
const arrayJson = (column: string) => `CASE WHEN jsonb_typeof(${column})='array' THEN ${column} ELSE '[]'::jsonb END`;

function normalisePath(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '/';
  try { return new URL(raw).pathname || '/'; } catch { return raw.startsWith('/') ? raw : `/${raw}`; }
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

  const vendorClause = vendor ? ' AND vendor = $2' : '';
  const args = vendor ? [siteId, vendor] : [siteId];
  const base = `
    SELECT ${cleanPathSql} AS page_path, LOWER(COALESCE(event_name,'')) AS event_name,
      event_type, vendor, ${occurrenceKey} AS occurrence_key, NULLIF(session_id,'') AS session_id,
      received_at, delivery_outcome, missing_parameters, parameter_status,
      NULLIF(gtm_tag_name,'') AS gtm_tag_name, NULLIF(gtm_trigger_name,'') AS gtm_trigger_name
    FROM events
    WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '61 days'${vendorClause}
      AND NULLIF(${cleanPathSql}, '') IS NOT NULL`;

  const [pagesResult, eventsResult] = await Promise.all([
    query(`
      WITH base AS (${base}), page_events AS (
        SELECT * FROM base WHERE page_path <> ''
      )
      SELECT page_path,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '24 hours')::int AS daily_hits,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '48 hours' AND received_at < NOW()-INTERVAL '24 hours')::int AS one_day_ago,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '8 days' AND received_at < NOW()-INTERVAL '7 days')::int AS one_week_ago,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '31 days' AND received_at < NOW()-INTERVAL '30 days')::int AS thirty_days_ago,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '30 days')::int AS hits_30d,
        COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE received_at >= NOW()-INTERVAL '24 hours')::int AS sessions_24h,
        MAX(received_at) AS last_seen,
        COUNT(*) FILTER (WHERE delivery_outcome IN ('http_error','blocked','beacon_rejected','network_error','aborted','timeout'))::int AS delivery_issues,
        COUNT(*) FILTER (WHERE jsonb_typeof(missing_parameters)='array' AND jsonb_array_length(missing_parameters)>0)::int AS missing_parameter_events,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(parameter_status,'')) IN ('warn','warning','error','invalid'))::int AS parameter_issues
      FROM page_events
      GROUP BY page_path
      ORDER BY daily_hits DESC, hits_30d DESC, page_path ASC
      LIMIT 150`, args),
    query(`
      WITH base AS (${base}), page_events AS (
        SELECT * FROM base WHERE page_path <> '' AND event_name <> ''
      )
      SELECT page_path, event_name,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '24 hours')::int AS daily_hits,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '48 hours' AND received_at < NOW()-INTERVAL '24 hours')::int AS one_day_ago,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '8 days' AND received_at < NOW()-INTERVAL '7 days')::int AS one_week_ago,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '31 days' AND received_at < NOW()-INTERVAL '30 days')::int AS thirty_days_ago,
        COUNT(DISTINCT occurrence_key) FILTER (WHERE received_at >= NOW()-INTERVAL '30 days')::int AS hits_30d,
        COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE received_at >= NOW()-INTERVAL '30 days')::int AS sessions_30d,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT gtm_tag_name), NULL) AS gtm_tags,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT gtm_trigger_name), NULL) AS gtm_triggers,
        MAX(received_at) AS last_seen,
        COUNT(*) FILTER (WHERE delivery_outcome IN ('http_error','blocked','beacon_rejected','network_error','aborted','timeout'))::int AS delivery_issues,
        COUNT(*) FILTER (WHERE jsonb_typeof(missing_parameters)='array' AND jsonb_array_length(missing_parameters)>0)::int AS missing_parameter_events,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(parameter_status,'')) IN ('warn','warning','error','invalid'))::int AS parameter_issues
      FROM page_events
      GROUP BY page_path, event_name
      ORDER BY daily_hits DESC, hits_30d DESC, event_name ASC
      LIMIT 1000`, args),
  ]);

  const eventRows = eventsResult.rows.map((row: any) => ({
    ...row,
    daily_hits: Number(row.daily_hits || 0), one_day_ago: Number(row.one_day_ago || 0),
    one_week_ago: Number(row.one_week_ago || 0), thirty_days_ago: Number(row.thirty_days_ago || 0),
    hits_30d: Number(row.hits_30d || 0), sessions_30d: Number(row.sessions_30d || 0),
    delivery_issues: Number(row.delivery_issues || 0), missing_parameter_events: Number(row.missing_parameter_events || 0), parameter_issues: Number(row.parameter_issues || 0),
    gtm_tags: Array.isArray(row.gtm_tags) ? row.gtm_tags.filter(Boolean) : [],
    gtm_triggers: Array.isArray(row.gtm_triggers) ? row.gtm_triggers.filter(Boolean) : [],
  }));
  const byPage = new Map<string, any[]>();
  for (const row of eventRows) {
    const list = byPage.get(normalisePath(row.page_path)) || [];
    list.push(row);
    byPage.set(normalisePath(row.page_path), list);
  }
  const pages = pagesResult.rows.map((row: any) => {
    const pagePath = normalisePath(row.page_path);
    const pageEvents = byPage.get(pagePath) || [];
    const issues: any[] = [];
    const delivery = Number(row.delivery_issues || 0);
    const missing = Number(row.missing_parameter_events || 0);
    const parameter = Number(row.parameter_issues || 0);
    if (delivery) issues.push({ code: 'delivery_failure', severity: 'warning', title: 'Event delivery failures', message: `${delivery.toLocaleString()} event delivery attempt(s) failed on this page.` });
    if (missing) issues.push({ code: 'missing_parameter', severity: 'warning', title: 'Missing parameters', message: `${missing.toLocaleString()} event hit(s) reported missing parameter data on this page.` });
    if (parameter) issues.push({ code: 'parameter_validation', severity: 'warning', title: 'Parameter validation issues', message: `${parameter.toLocaleString()} event hit(s) have parameter validation warnings on this page.` });
    return {
      page_path: pagePath,
      daily_hits: Number(row.daily_hits || 0), one_day_ago: Number(row.one_day_ago || 0), one_week_ago: Number(row.one_week_ago || 0), thirty_days_ago: Number(row.thirty_days_ago || 0),
      hits_30d: Number(row.hits_30d || 0), sessions_24h: Number(row.sessions_24h || 0), last_seen: row.last_seen,
      status: issues.length ? 'Needs attention' : 'Healthy', issues, events: pageEvents,
    };
  });

  return NextResponse.json({ siteId, vendor, pages, summary: { pages: pages.length, healthy: pages.filter((p: any) => p.status === 'Healthy').length, needs_attention: pages.filter((p: any) => p.status !== 'Healthy').length } });
}
