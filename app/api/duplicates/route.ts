import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, s.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = await query(
    `SELECT event_name, vendor, message, root_cause, fix_steps, raw, COUNT(*)::int as cnt, MAX(created_at) as last_seen
     FROM alerts WHERE site_id = $1 AND code = 'duplicate_event' AND resolved = false
       AND created_at > NOW() - INTERVAL '24 hours'
     GROUP BY event_name, vendor, message, root_cause, fix_steps, raw
     ORDER BY last_seen DESC LIMIT 50`,
    [siteId]
  );
  return NextResponse.json({ duplicates: rows.rows });
}
