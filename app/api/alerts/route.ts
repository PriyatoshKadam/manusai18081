import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

async function owns(siteId: number, uid: number) {
  const result = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2 LIMIT 1', [siteId, uid]);
  return Boolean(result.rows[0]);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const siteId = Number(params.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owns(siteId, session.uid))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const status = params.get('status') || 'all';
  const severity = params.get('severity') || 'all';
  const category = params.get('category') || 'all';

  const where: string[] = ['site_id=$1'];
  const values: unknown[] = [siteId];
  if (status === 'ongoing') where.push('resolved=FALSE AND muted=FALSE');
  if (status === 'resolved') where.push('resolved=TRUE');
  if (status === 'muted') where.push('muted=TRUE AND resolved=FALSE');
  if (severity !== 'all') { values.push(severity); where.push(`severity=$${values.length}`); }
  if (category !== 'all') { values.push(category); where.push(`COALESCE(category,'analytics')=$${values.length}`); }

  const result = await query(
    `SELECT id, severity, code, vendor, event_name, message, root_cause, fix_steps, page_url,
            resolved, muted, category, occurrence_count, distinct_sessions, distinct_pages,
            confidence, dedupe_key, last_notified_at, notification_status, created_at, last_seen,
            impact_updated_at
       FROM alerts
      WHERE ${where.join(' AND ')}
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
               COALESCE(last_seen, created_at) DESC
      LIMIT 200`,
    values,
  );

  return NextResponse.json({ alerts: result.rows });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Alert id required' }, { status: 400 });

    const owner = await query(
      `SELECT a.id, a.site_id
         FROM alerts a
         JOIN sites s ON s.id=a.site_id
        WHERE a.id=$1 AND s.user_id=$2
        LIMIT 1`,
      [id, session.uid],
    );
    if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const action = String(body?.action || '');
    if (!['acknowledge', 'resolve', 'reopen', 'mute', 'unmute'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported alert action' }, { status: 400 });
    }

    const values = {
      resolved: action === 'resolve' ? true : action === 'reopen' ? false : undefined,
      muted: action === 'mute' ? true : action === 'unmute' ? false : undefined,
    };

    const set: string[] = [];
    const params: unknown[] = [];
    if (values.resolved !== undefined) { params.push(values.resolved); set.push(`resolved=$${params.length}`); }
    if (values.muted !== undefined) { params.push(values.muted); set.push(`muted=$${params.length}`); }
    if (action === 'acknowledge') { params.push(false); set.push(`muted=$${params.length}`); }

    if (!set.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id);
    const result = await query(
      `UPDATE alerts SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params,
    );

    return NextResponse.json({ alert: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update alert' }, { status: 400 });
  }
}
