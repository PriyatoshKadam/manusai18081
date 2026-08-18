import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');
  const vendor = url.searchParams.get('vendor');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, s.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Overview stats
  const stats = await query(
    `SELECT
       (SELECT COUNT(*) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '1 hour') as events_hour,
       (SELECT COUNT(*) FROM alerts WHERE site_id = $1 AND resolved = false) as active_alerts,
       (SELECT COUNT(*) FROM alerts WHERE site_id = $1 AND resolved = false AND severity = 'critical') as critical_alerts,
       (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND detected_at > NOW() - INTERVAL '24 hours') as adblock_24h,
       (SELECT COUNT(*) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') as events_24h`,
    [siteId]
  );

  // Event breakdown by name
  const eventsQ = vendor
    ? `SELECT event_name, event_type, vendor, COUNT(*)::int as cnt,
              SUM(CASE WHEN event_name IN (SELECT event_name FROM alerts WHERE alerts.site_id = $1 AND alerts.resolved = false) THEN 1 ELSE 0 END)::int as err
       FROM events WHERE site_id = $1 AND vendor = $2 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY event_name, event_type, vendor ORDER BY cnt DESC LIMIT 50`
    : `SELECT event_name, event_type, vendor, COUNT(*)::int as cnt, 0 as err
       FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
       GROUP BY event_name, event_type, vendor ORDER BY cnt DESC LIMIT 50`;
  const eventsRes = vendor
    ? await query(eventsQ, [siteId, vendor])
    : await query(eventsQ, [siteId]);

  // Recent alerts
  const alerts = await query(
    `SELECT id, severity, code, vendor, event_name, message, root_cause, fix_steps, page_url, created_at
     FROM alerts WHERE site_id = $1 AND resolved = false
     ORDER BY created_at DESC LIMIT 20`,
    [siteId]
  );

  return NextResponse.json({
    stats: stats.rows[0],
    events: eventsRes.rows,
    alerts: alerts.rows,
  });
}
