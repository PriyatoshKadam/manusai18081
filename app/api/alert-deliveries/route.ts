import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId')); if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2', [siteId, session.uid]); if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const result = await query(`SELECT d.id, d.channel, d.status, d.attempt_count, d.last_error, d.delivered_at, d.created_at, a.severity, a.code, a.event_name FROM alert_deliveries d JOIN alerts a ON a.id=d.alert_id WHERE d.site_id=$1 ORDER BY d.created_at DESC LIMIT 50`, [siteId]);
  return NextResponse.json({ deliveries: result.rows });
}
