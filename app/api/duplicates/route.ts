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
  const rows = await query(
    `SELECT id, event_name, vendor, category, code, message, root_cause, fix_steps, raw, occurrence_count, distinct_pushes, page_url, created_at
       FROM alerts WHERE site_id = $1 AND category IN ('analytics','gtm') AND resolved = false
         AND code IN ('duplicate_event','duplicate_network_request','gtm_multiple_tags_or_triggers','gtm_gtm_and_direct_implementation','gtm_datalayer_duplicate_push')
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 100`,
    [siteId],
  );
  return NextResponse.json({ duplicates: rows.rows });
}
