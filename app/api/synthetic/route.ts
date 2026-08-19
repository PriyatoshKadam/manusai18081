import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { runSyntheticJourney } from '../../../lib/synthetic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function owned(siteId: number, uid: string | number) {
  const result = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, uid]);
  return Boolean(result.rows[0]);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owned(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const journeys = await query(`SELECT id, name, start_url, steps, enabled, interval_minutes, last_run_at, created_at, updated_at FROM synthetic_journeys WHERE site_id = $1 ORDER BY created_at DESC`, [siteId]);
  const runs = await query(`SELECT r.id, r.journey_id, r.status, r.evidence, r.duration_ms, r.error, r.started_at, r.finished_at FROM synthetic_runs r JOIN synthetic_journeys j ON j.id = r.journey_id WHERE r.site_id = $1 ORDER BY r.started_at DESC LIMIT 50`, [siteId]);
  return NextResponse.json({ journeys: journeys.rows, runs: runs.rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const siteId = Number(body?.siteId);
    if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owned(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (body?.runNow && Number.isSafeInteger(Number(body?.journeyId))) return NextResponse.json({ run: await runSyntheticJourney(Number(body.journeyId)) });
    const name = String(body?.name || '').trim().slice(0, 120);
    const startUrl = String(body?.startUrl || '').trim().slice(0, 2048);
    const steps = Array.isArray(body?.steps) ? body.steps.slice(0, 30) : [];
    if (!name || !/^https?:\/\//i.test(startUrl)) return NextResponse.json({ error: 'name and absolute startUrl are required' }, { status: 400 });

    const inserted = await query(`INSERT INTO synthetic_journeys (site_id, name, start_url, steps, enabled, interval_minutes) VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING id, name, start_url, steps, enabled, interval_minutes`, [siteId, name, startUrl, JSON.stringify(steps), body?.enabled !== false, Math.min(1440, Math.max(5, Number(body?.intervalMinutes) || 60))]);
    return NextResponse.json({ journey: inserted.rows[0] }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create journey' }, { status: 400 }); }
}
