import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { getAccessToken, getConnection, gtmRequest } from '../../../../lib/gtm';
import { normalizeGtmInventory } from '../../../../lib/gtm-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validGtmId(value: unknown) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value); }
function safeSiteId(value: unknown) { const siteId = Number(value); return Number.isSafeInteger(siteId) && siteId > 0 ? siteId : 0; }

async function readInventory(accountId: string, containerId: string, workspaceId: string, token: string) {
  const parent = `accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/workspaces/${encodeURIComponent(workspaceId)}`;
  const [tags, triggers, variables] = await Promise.all([
    gtmRequest<{ tag?: unknown[] }>(`${parent}/tags`, token),
    gtmRequest<{ trigger?: unknown[] }>(`${parent}/triggers`, token),
    gtmRequest<{ variable?: unknown[] }>(`${parent}/variables`, token),
  ]);
  return normalizeGtmInventory({ accountId, containerId, workspaceId, tags: tags.tag, triggers: triggers.trigger, variables: variables.variable });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = safeSiteId(new URL(req.url).searchParams.get('siteId'));
  if (!siteId) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2 LIMIT 1', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const latest = await query(
    `SELECT id, account_id, container_id, workspace_id, tags, triggers, variables, fetched_at, created_at, environment, snapshot_version_id, snapshot_version_name, live_version_id, live_version_name, live_version_updated_at, snapshot_stale
       FROM gtm_config_snapshots WHERE site_id = $1 AND user_id = $2
      ORDER BY fetched_at DESC LIMIT 1`,
    [siteId, session.uid],
  );
  return NextResponse.json({ snapshot: latest.rows[0] || null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const siteId = safeSiteId(body?.siteId);
    const accountId = String(body?.accountId || '').trim();
    const containerId = String(body?.containerId || '').trim();
    const containerPublicId = String(body?.containerPublicId || '').trim();
    const workspaceId = String(body?.workspaceId || '').trim();
    if (!siteId || !validGtmId(accountId) || !validGtmId(containerId) || !validGtmId(workspaceId) || (containerPublicId && !validGtmId(containerPublicId))) return NextResponse.json({ error: 'Valid siteId, accountId, containerId, and workspaceId required' }, { status: 400 });
    const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2 LIMIT 1', [siteId, session.uid]);
    if (!owner.rows[0]) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    const connection = await getConnection(session.uid);
    if (!connection) return NextResponse.json({ error: 'Connect a Google account before refreshing GTM inventory' }, { status: 409 });
    const token = await getAccessToken(connection);
    const inventory = await readInventory(accountId, containerId, workspaceId, token);
    let liveVersion: { versionId?: string; name?: string; updateTime?: string } = {};
    try {
      const live = await gtmRequest<{ containerVersion?: { versionId?: string; name?: string; updateTime?: string } }>(`accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/versions/live`, token);
      liveVersion = live.containerVersion || {};
    } catch { /* Live metadata is advisory; workspace inventory remains usable with a stale banner. */ }
    const inserted = await query(
      `INSERT INTO gtm_config_snapshots (user_id, site_id, account_id, container_id, container_public_id, workspace_id, tags, triggers, variables, fetched_at, environment, snapshot_version_id, snapshot_version_name, live_version_id, live_version_name, live_version_updated_at, snapshot_stale)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,NOW(),'workspace',$10,$11,$12,$13,$14::timestamptz,TRUE)
       RETURNING id, account_id, container_id, container_public_id, workspace_id, tags, triggers, variables, fetched_at, created_at, environment, snapshot_version_id, snapshot_version_name, live_version_id, live_version_name, live_version_updated_at, snapshot_stale`,
      [session.uid, siteId, inventory.accountId, inventory.containerId, containerPublicId || null, inventory.workspaceId, JSON.stringify(inventory.tags), JSON.stringify(inventory.triggers), JSON.stringify(inventory.variables), null, null, liveVersion.versionId || null, liveVersion.name || null, liveVersion.updateTime || null],
    );
    return NextResponse.json({ snapshot: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('GTM inventory refresh error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to refresh GTM inventory' }, { status: 502 });
  }
}
