import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [alerts, dataLayer, custom, sources] = await Promise.all([
    query(`SELECT id, severity, code, event_name, message, root_cause, fix_steps, page_url, raw, occurrence_count, distinct_pushes, created_at
           FROM alerts WHERE site_id = $1 AND category = 'gtm' AND resolved = false ORDER BY created_at DESC LIMIT 50`, [siteId]),
    query(`SELECT event_name, COUNT(*)::int AS pushes, COUNT(DISTINCT session_id)::int AS sessions, COUNT(DISTINCT navigation_id)::int AS navigations,
                  COUNT(DISTINCT dl_push_index)::int AS distinct_pushes
           FROM events WHERE site_id = $1 AND observation_kind IN ('datalayer','gtm') AND received_at > NOW() - INTERVAL '24 hours'
           GROUP BY event_name ORDER BY pushes DESC LIMIT 100`, [siteId]),
    query(`SELECT event_name, COUNT(*)::int AS total, COUNT(DISTINCT session_id)::int AS sessions
           FROM events WHERE site_id = $1 AND vendor = 'ga4' AND event_type = 'custom' AND received_at > NOW() - INTERVAL '24 hours'
           GROUP BY event_name ORDER BY total DESC LIMIT 100`, [siteId]),
    query(`SELECT event_name, source, observation_kind, COUNT(*)::int AS count
           FROM events WHERE site_id = $1 AND vendor = 'ga4' AND received_at > NOW() - INTERVAL '24 hours'
           GROUP BY event_name, source, observation_kind ORDER BY count DESC LIMIT 200`, [siteId]),
  ]);
  return NextResponse.json({ alerts: alerts.rows, dataLayer: dataLayer.rows, customEvents: custom.rows, sources: sources.rows });
}
