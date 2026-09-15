import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { ACTIONABLE_BLOCKER_CONFIDENCES, INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';

export const dynamic = 'force-dynamic';
const ACTIONABLE = `confidence IN (${ACTIONABLE_BLOCKER_CONFIDENCES})`;
const NOISE = `NOT (${INTERNAL_CORRELATION_NOISE_SQL})`;
const SESSION = `COALESCE(NULLIF(session_id,''), NULLIF(client_id,''))`;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = String(url.searchParams.get('vendor') || '').trim().toLowerCase();
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const args: Array<string|number> = vendor ? [siteId,vendor] : [siteId];
  const vc = vendor ? ' AND vendor=$2' : '';
  const result = await query(`WITH observed AS (
      SELECT COUNT(*)::int AS events,
             COUNT(*) FILTER (WHERE delivery_outcome='delivered')::int AS successful,
             COUNT(*) FILTER (WHERE delivery_outcome IS NOT NULL AND delivery_outcome<>'delivered')::int AS failed,
             COUNT(DISTINCT ${SESSION})::int AS sessions
      FROM events WHERE site_id=$1 AND received_at>NOW()-INTERVAL '24 hours'${vc}
    ), blocker AS (
      SELECT COUNT(*) FILTER (WHERE ${ACTIONABLE})::int AS actionable_signals,
             COUNT(*) FILTER (WHERE confidence='confirmed')::int AS confirmed,
             COUNT(*) FILTER (WHERE confidence='likely')::int AS likely,
             COUNT(DISTINCT ${SESSION}) FILTER (WHERE ${ACTIONABLE})::int AS actionable_sessions,
             COUNT(DISTINCT event_name) FILTER (WHERE ${ACTIONABLE} AND event_name IS NOT NULL)::int AS affected_events
      FROM adblock_events WHERE site_id=$1 AND detected_at>NOW()-INTERVAL '24 hours' AND ${NOISE}${vendor ? ' AND vendor=$2' : ''}
    )
    SELECT observed.*, blocker.* FROM observed CROSS JOIN blocker`, args);
  const trend = await query(`WITH days AS (SELECT generate_series(current_date-INTERVAL '13 days',current_date,INTERVAL '1 day')::date AS day),
    e AS (SELECT received_at::date AS day,COUNT(*)::int AS events,COUNT(*) FILTER(WHERE delivery_outcome='delivered')::int AS successful
      FROM events WHERE site_id=$1 AND received_at>=current_date-INTERVAL '13 days'${vc} GROUP BY 1),
    b AS (SELECT detected_at::date AS day,COUNT(*) FILTER(WHERE ${ACTIONABLE})::int AS actionable,COUNT(*) FILTER(WHERE confidence='confirmed')::int AS confirmed,
      COUNT(*) FILTER(WHERE confidence='likely')::int AS likely FROM adblock_events WHERE site_id=$1 AND detected_at>=current_date-INTERVAL '13 days' AND ${NOISE}${vendor ? ' AND vendor=$2' : ''} GROUP BY 1)
    SELECT d.day,COALESCE(e.events,0)::int AS events,COALESCE(e.successful,0)::int AS successful,COALESCE(b.actionable,0)::int AS actionable,
      COALESCE(b.confirmed,0)::int AS confirmed,COALESCE(b.likely,0)::int AS likely FROM days d LEFT JOIN e USING(day) LEFT JOIN b USING(day) ORDER BY d.day`,args);
  return NextResponse.json({
    totals: result.rows[0] || {events:0,successful:0,failed:0,sessions:0,actionable_signals:0,confirmed:0,likely:0,actionable_sessions:0,affected_events:0},
    trend: trend.rows,
    semantics: {
      observed_events: 'Events captured by GA4Fix in the selected platform window.',
      successful_events: 'Captured events whose observed delivery outcome is delivered.',
      blocked_signals: 'Actionable blocker evidence; not a count of proven lost events.',
      confirmed: 'Explicit browser/client blocker evidence.',
      likely: 'Blocker-shaped evidence without explicit browser proof.',
      gaps: 'Correlation or telemetry gaps are not classified as blocked.'
    }
  });
}
