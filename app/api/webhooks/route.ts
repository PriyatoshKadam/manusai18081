import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { encryptSecret } from '../../../lib/gtm';
import { isSafeOutboundUrl } from '../../../lib/outbound';

export const dynamic = 'force-dynamic';
async function owns(siteId: number, uid: string | number) { const result = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2', [siteId, uid]); return Boolean(result.rows[0]); }
export async function GET(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const siteId = Number(new URL(req.url).searchParams.get('siteId')); if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owns(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const rows = await query(`SELECT id, url, event_types, enabled, created_at FROM site_webhooks WHERE site_id=$1 ORDER BY created_at DESC`, [siteId]); return NextResponse.json({ webhooks: rows.rows });
}
export async function POST(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { const body = await req.json(); const siteId = Number(body?.siteId); const url = String(body?.url || '').trim().slice(0, 2048); if (!Number.isSafeInteger(siteId) || siteId <= 0 || !(await owns(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 }); if (!(await isSafeOutboundUrl(url))) return NextResponse.json({ error: 'Webhook URL must be a resolvable public HTTPS endpoint' }, { status: 400 }); const secret = String(body?.secret || '').trim().slice(0, 512); const result = await query(`INSERT INTO site_webhooks (site_id, url, secret_encrypted, event_types) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (site_id,url) DO UPDATE SET secret_encrypted=COALESCE(EXCLUDED.secret_encrypted,site_webhooks.secret_encrypted), event_types=EXCLUDED.event_types, enabled=true RETURNING id,url,event_types,enabled,created_at`, [siteId, url, secret ? encryptSecret(secret) : null, JSON.stringify(Array.isArray(body?.eventTypes) ? body.eventTypes.slice(0, 20) : ['alert'])]); return NextResponse.json({ webhook: result.rows[0] }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save webhook' }, { status: 400 }); }
}
export async function DELETE(req: NextRequest) { const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const params = new URL(req.url).searchParams; const siteId = Number(params.get('siteId')); const id = Number(params.get('id')); if (!Number.isSafeInteger(siteId) || !Number.isSafeInteger(id) || !(await owns(siteId, session.uid))) return NextResponse.json({ error: 'Not found' }, { status: 404 }); await query('DELETE FROM site_webhooks WHERE id=$1 AND site_id=$2', [id, siteId]); return NextResponse.json({ ok: true }); }
