import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

async function owner(siteId: number, uid: string | number) { const result = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2', [siteId, uid]); return Boolean(result.rows[0]); }

export async function GET(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId')); if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owner(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [findings, allowlist] = await Promise.all([
    query(`SELECT id, category, severity, page_url, resource_url, evidence, status, first_seen, last_seen FROM compliance_findings WHERE site_id=$1 ORDER BY last_seen DESC LIMIT 100`, [siteId]),
    query(`SELECT id, hostname, path_prefix, sha256, page_scope, enabled, created_at FROM script_allowlist WHERE site_id=$1 ORDER BY hostname`, [siteId]),
  ]);
  return NextResponse.json({ findings: findings.rows, allowlist: allowlist.rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json(); const siteId = Number(body?.siteId); if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owner(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const hostname = String(body?.hostname || '').trim().toLowerCase(); const pathPrefix = String(body?.pathPrefix || '').trim().slice(0, 500) || null; const sha256 = String(body?.sha256 || '').trim().toLowerCase().slice(0, 128) || null;
    if (!hostname || !/^[a-z0-9.-]+$/.test(hostname)) return NextResponse.json({ error: 'Valid hostname required' }, { status: 400 });
    const result = await query(`INSERT INTO script_allowlist (site_id, hostname, path_prefix, sha256) VALUES ($1,$2,$3,$4) ON CONFLICT (site_id, hostname, path_prefix) DO UPDATE SET sha256=EXCLUDED.sha256, enabled=true RETURNING id, hostname, path_prefix, sha256, enabled`, [siteId, hostname, pathPrefix, sha256]);
    return NextResponse.json({ allowlist: result.rows[0] }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update allowlist' }, { status: 400 }); }
}
