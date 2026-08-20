import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sessions = await query(
    `SELECT session_id,
            MAX(page_url) AS page_url,
            COUNT(DISTINCT COALESCE(NULLIF(occurrence_id, ''), network_occurrence_id, id::text))::int AS events,
            COUNT(*) FILTER (WHERE (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL)::int AS errors,
            COUNT(DISTINCT event_name)::int AS unique_events,
            MIN(received_at) AS started_at,
            MAX(received_at) AS last_seen,
            EXTRACT(EPOCH FROM (MAX(received_at) - MIN(received_at)))::int AS duration_seconds
       FROM events
      WHERE site_id = $1 AND session_id IS NOT NULL AND received_at > NOW() - INTERVAL '24 hours'
      GROUP BY session_id
      ORDER BY last_seen DESC
      LIMIT 100`,
    [siteId],
  );
  const totals = await query(
    `SELECT COUNT(DISTINCT session_id)::int AS total_sessions,
            COALESCE(ROUND(AVG(event_count)), 0)::int AS avg_events,
            COUNT(DISTINCT session_id) FILTER (WHERE error_count > 0)::int AS error_sessions
       FROM (SELECT session_id, COUNT(DISTINCT COALESCE(NULLIF(occurrence_id, ''), network_occurrence_id, id::text))::int AS event_count,
                    COUNT(*) FILTER (WHERE (status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL)::int AS error_count
               FROM events WHERE site_id = $1 AND session_id IS NOT NULL AND received_at > NOW() - INTERVAL '24 hours'
              GROUP BY session_id) grouped`,
    [siteId],
  );
  return NextResponse.json({ sessions: sessions.rows, totals: totals.rows[0] || {} });
}
