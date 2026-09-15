import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { ACTIONABLE_BLOCKER_CONFIDENCES, INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';
import { MIN_SAMPLE_SIZE } from '../../../lib/metrics';

export const dynamic = 'force-dynamic';

const ACTIONABLE = `confidence IN (${ACTIONABLE_BLOCKER_CONFIDENCES})`;
const PAGE_EXPR = `regexp_replace(split_part(split_part(coalesce(page_url,''),'?',1),'#',1),'^https?://[^/]+','')`;
const SESSION_EXPR = `COALESCE(NULLIF(session_id,''), NULLIF(ip_hash,''))`;
const EVENT_SESSION_EXPR = `COALESCE(NULLIF(session_id,''), NULLIF(client_id,''))`;

function int(value: unknown) { return Number(value || 0); }
function pct(n: unknown, d: unknown) { const numerator = int(n); const denominator = int(d); return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null; }

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id, domain, first_party_domain FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const noise = `NOT ${INTERNAL_CORRELATION_NOISE_SQL}`;
  const [totals, vendors, pages, events, methods, trends, candidates, browsers, recent] = await Promise.all([
    query(`WITH sessions AS (
      SELECT COUNT(DISTINCT ${EVENT_SESSION_EXPR})::int AS total FROM events WHERE site_id=$1 AND received_at>NOW()-INTERVAL '24 hours'
    ), blocked AS (
      SELECT COUNT(DISTINCT ${SESSION_EXPR})::int AS sessions,
             COUNT(*)::int AS signals,
             COUNT(*) FILTER (WHERE confidence='confirmed')::int AS confirmed_signals,
             COUNT(*) FILTER (WHERE confidence='likely')::int AS likely_signals,
             COUNT(*) FILTER (WHERE confidence='correlation_gap')::int AS correlation_gaps,
             COUNT(*) FILTER (WHERE confidence='telemetry_gap')::int AS telemetry_gaps
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '24 hours' AND ${noise}
    ), monitor AS (
      SELECT COUNT(DISTINCT ${EVENT_SESSION_EXPR})::int AS sessions FROM events WHERE site_id=$1 AND received_at>NOW()-INTERVAL '24 hours'
        AND event_name='monitor_ready'
    )
    SELECT sessions.total AS total_sessions_24h, blocked.*, monitor.sessions AS monitor_ready_sessions_24h,
      CASE WHEN sessions.total < $2 THEN NULL ELSE ROUND(100.0*blocked.sessions/NULLIF(sessions.total,0),1) END AS actionable_rate_pct,
      CASE WHEN sessions.total < $2 THEN NULL ELSE ROUND(100.0*monitor.sessions/NULLIF(sessions.total,0),1) END AS monitor_coverage_pct
    FROM sessions, blocked, monitor`, [siteId, MIN_SAMPLE_SIZE]),
    query(`SELECT vendor,
      COUNT(*)::int AS signals,
      COUNT(DISTINCT ${SESSION_EXPR})::int AS blocked_sessions,
      COUNT(*) FILTER (WHERE confidence='confirmed')::int AS confirmed_signals,
      COUNT(*) FILTER (WHERE confidence='likely')::int AS likely_signals,
      COUNT(DISTINCT event_name) FILTER (WHERE event_name IS NOT NULL)::int AS affected_events,
      COUNT(DISTINCT ${PAGE_EXPR})::int AS affected_pages
      FROM adblock_events a CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.blocked_vendors,'[]'::jsonb)) vendor
      WHERE a.site_id=$1 AND a.detected_at>NOW()-INTERVAL '30 days' AND ${noise} AND ${ACTIONABLE}
      GROUP BY vendor ORDER BY blocked_sessions DESC, signals DESC LIMIT 50`, [siteId]),
    query(`WITH totals AS (
      SELECT ${PAGE_EXPR} AS page, COUNT(DISTINCT ${EVENT_SESSION_EXPR})::int AS sessions, COUNT(*)::int AS events
      FROM events WHERE site_id=$1 AND received_at>NOW()-INTERVAL '30 days' GROUP BY 1
    ), blocked AS (
      SELECT ${PAGE_EXPR} AS page, COUNT(*)::int AS signals, COUNT(DISTINCT ${SESSION_EXPR})::int AS blocked_sessions
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '30 days' AND ${noise} AND ${ACTIONABLE} GROUP BY 1
    ) SELECT b.page, b.signals, b.blocked_sessions, COALESCE(t.sessions,0)::int AS sessions, COALESCE(t.events,0)::int AS events,
      ROUND(100.0*b.blocked_sessions/NULLIF(t.sessions,0),1) AS blocked_rate_pct
      FROM blocked b LEFT JOIN totals t ON t.page=b.page WHERE b.page<>'' ORDER BY b.blocked_sessions DESC,b.signals DESC LIMIT 50`, [siteId]),
    query(`WITH blocked AS (
      SELECT LOWER(COALESCE(event_name,'')) AS event_name, COUNT(*)::int AS signals, COUNT(DISTINCT ${SESSION_EXPR})::int AS blocked_sessions,
             COUNT(*) FILTER (WHERE confidence='confirmed')::int AS confirmed_signals, COUNT(*) FILTER (WHERE confidence='likely')::int AS likely_signals,
             MAX(detected_at) AS last_seen
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '30 days' AND ${noise} AND ${ACTIONABLE}
      GROUP BY 1
    ), totals AS (
      SELECT LOWER(COALESCE(event_name,'')) AS event_name, COUNT(*)::int AS events, COUNT(DISTINCT ${EVENT_SESSION_EXPR})::int AS sessions
      FROM events WHERE site_id=$1 AND received_at>NOW()-INTERVAL '30 days' AND event_name IS NOT NULL GROUP BY 1
    ) SELECT b.*, COALESCE(t.events,0)::int AS events, COALESCE(t.sessions,0)::int AS sessions,
      ROUND(100.0*b.blocked_sessions/NULLIF(t.sessions,0),1) AS blocked_rate_pct
      FROM blocked b LEFT JOIN totals t USING(event_name) WHERE b.event_name<>'' ORDER BY b.blocked_sessions DESC,b.signals DESC LIMIT 75`, [siteId]),
    query(`SELECT detection_method, signal, confidence, COUNT(*)::int AS signals, COUNT(DISTINCT ${SESSION_EXPR})::int AS sessions,
      COUNT(DISTINCT blocked_url) FILTER (WHERE blocked_url IS NOT NULL)::int AS urls
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '30 days' AND ${noise}
      GROUP BY detection_method,signal,confidence ORDER BY signals DESC LIMIT 75`, [siteId]),
    query(`WITH days AS (
      SELECT generate_series(current_date-INTERVAL '13 days', current_date, INTERVAL '1 day')::date AS day
    ), agg AS (
      SELECT detected_at::date AS day,
        COUNT(*) FILTER (WHERE ${ACTIONABLE})::int AS actionable_signals,
        COUNT(*) FILTER (WHERE confidence='confirmed')::int AS confirmed_signals,
        COUNT(*) FILTER (WHERE confidence='likely')::int AS likely_signals,
        COUNT(*) FILTER (WHERE confidence='correlation_gap')::int AS correlation_gaps,
        COUNT(*) FILTER (WHERE confidence='telemetry_gap')::int AS telemetry_gaps,
        COUNT(DISTINCT ${SESSION_EXPR}) FILTER (WHERE ${ACTIONABLE})::int AS blocked_sessions
      FROM adblock_events WHERE site_id=$1 AND detected_at>=current_date-INTERVAL '13 days' AND ${noise} GROUP BY 1
    ), sessions AS (
      SELECT received_at::date AS day, COUNT(DISTINCT ${EVENT_SESSION_EXPR})::int AS sessions
      FROM events WHERE site_id=$1 AND received_at>=current_date-INTERVAL '13 days' GROUP BY 1
    ) SELECT d.day, COALESCE(a.actionable_signals,0)::int AS actionable_signals, COALESCE(a.confirmed_signals,0)::int AS confirmed_signals,
      COALESCE(a.likely_signals,0)::int AS likely_signals, COALESCE(a.correlation_gaps,0)::int AS correlation_gaps,
      COALESCE(a.telemetry_gaps,0)::int AS telemetry_gaps, COALESCE(a.blocked_sessions,0)::int AS blocked_sessions,
      COALESCE(s.sessions,0)::int AS total_sessions, ROUND(100.0*COALESCE(a.blocked_sessions,0)/NULLIF(s.sessions,0),1) AS blocked_rate_pct
      FROM days d LEFT JOIN agg a USING(day) LEFT JOIN sessions s USING(day) ORDER BY d.day`, [siteId]),
    query(`SELECT detection_method,vendor,signal,sample_count,first_seen,last_seen,last_page_url,last_blocked_url,raw_error,status
      FROM blocker_pattern_candidates WHERE site_id=$1 ORDER BY CASE status WHEN 'candidate' THEN 0 ELSE 1 END,sample_count DESC,last_seen DESC LIMIT 75`, [siteId]),
    query(`SELECT LEFT(COALESCE(user_agent,''),180) AS user_agent, COUNT(*)::int AS signals, COUNT(DISTINCT ${SESSION_EXPR})::int AS sessions
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '30 days' AND ${noise} AND ${ACTIONABLE}
      GROUP BY 1 ORDER BY sessions DESC LIMIT 30`, [siteId]),
    query(`SELECT detection_method,signal,confidence,event_name,blocked_url,page_url,session_id,detected_at,
      CASE WHEN blocked_url IS NULL THEN NULL ELSE split_part(regexp_replace(blocked_url,'^https?://',''),'/',1) END AS blocked_host
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '24 hours' AND ${noise}
      ORDER BY detected_at DESC LIMIT 150`, [siteId]),
  ]);

  const t = totals.rows[0] || {};
  return NextResponse.json({
    site: { id: siteId, domain: owner.rows[0].domain, first_party_domain: owner.rows[0].first_party_domain },
    totals: {
      total_sessions_24h: int(t.total_sessions_24h), blocked_sessions_24h: int(t.sessions), blocked_signals_24h: int(t.signals),
      confirmed_signals_24h: int(t.confirmed_signals), likely_signals_24h: int(t.likely_signals), correlation_gaps_24h: int(t.correlation_gaps), telemetry_gaps_24h: int(t.telemetry_gaps),
      monitor_ready_sessions_24h: int(t.monitor_ready_sessions_24h), actionable_rate_pct: t.actionable_rate_pct == null ? null : Number(t.actionable_rate_pct),
      monitor_coverage_pct: t.monitor_coverage_pct == null ? null : Number(t.monitor_coverage_pct), min_sample_size: MIN_SAMPLE_SIZE,
      data_sufficiency: int(t.total_sessions_24h) < MIN_SAMPLE_SIZE ? 'insufficient' : 'sufficient',
    },
    vendors: vendors.rows.map((r: any) => ({ ...r, signals: int(r.signals), blocked_sessions: int(r.blocked_sessions), confirmed_signals: int(r.confirmed_signals), likely_signals: int(r.likely_signals), affected_events: int(r.affected_events), affected_pages: int(r.affected_pages) })),
    pages: pages.rows.map((r: any) => ({ ...r, signals: int(r.signals), blocked_sessions: int(r.blocked_sessions), sessions: int(r.sessions), events: int(r.events), blocked_rate_pct: r.blocked_rate_pct == null ? null : Number(r.blocked_rate_pct) })),
    events: events.rows.map((r: any) => ({ ...r, signals: int(r.signals), blocked_sessions: int(r.blocked_sessions), confirmed_signals: int(r.confirmed_signals), likely_signals: int(r.likely_signals), events: int(r.events), sessions: int(r.sessions), blocked_rate_pct: r.blocked_rate_pct == null ? null : Number(r.blocked_rate_pct) })),
    methods: methods.rows,
    trends: trends.rows,
    candidates: candidates.rows,
    browsers: browsers.rows,
    recent: recent.rows,
    definitions: {
      confirmed: 'Explicit browser/client blocking evidence such as ERR_BLOCKED_BY_CLIENT or an equivalent blocking signal.',
      likely: 'A blocker-shaped failure signal without a browser-specific proof string.',
      correlation_gap: 'An expected vendor event could not be matched to a network request; this is not proof of ad blocking.',
      telemetry_gap: 'GAfix or vendor telemetry could not establish what happened; this is not proof of ad blocking.',
    },
  });
}
