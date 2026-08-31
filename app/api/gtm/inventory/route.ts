import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { getAccessToken, getConnection, gtmRequest, GTM_MONITOR_TAG_NAME } from '../../../../lib/gtm';
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
    let liveVersion: { versionId?: string; name?: string; updateTime?: string; tag?: unknown[]; trigger?: unknown[]; variable?: unknown[] } = {};
    try {
      const live = await gtmRequest<{ containerVersion?: { versionId?: string; name?: string; updateTime?: string; tag?: unknown[]; trigger?: unknown[]; variable?: unknown[] } }>(`accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/versions/live`, token);
      liveVersion = live.containerVersion || {};
    } catch { /* Live metadata is advisory; workspace inventory remains usable with a stale banner. */ }
    const inserted = await query(
      `INSERT INTO gtm_config_snapshots (user_id, site_id, account_id, container_id, container_public_id, workspace_id, tags, triggers, variables, fetched_at, environment, snapshot_version_id, snapshot_version_name, live_version_id, live_version_name, live_version_updated_at, snapshot_stale)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,NOW(),'workspace',$10,$11,$12,$13,$14::timestamptz,TRUE)
       RETURNING id, account_id, container_id, container_public_id, workspace_id, tags, triggers, variables, fetched_at, created_at, environment, snapshot_version_id, snapshot_version_name, live_version_id, live_version_name, live_version_updated_at, snapshot_stale`,
      [session.uid, siteId, inventory.accountId, inventory.containerId, containerPublicId || null, inventory.workspaceId, JSON.stringify(inventory.tags), JSON.stringify(inventory.triggers), JSON.stringify(inventory.variables), null, null, liveVersion.versionId || null, liveVersion.name || null, liveVersion.updateTime || null],
    );
    const liveTagResources = Array.isArray(liveVersion.tag) ? liveVersion.tag.filter((tag): tag is Record<string, unknown> => Boolean(tag && typeof tag === 'object' && !Array.isArray(tag))) : [];
    const liveMonitorTagIds = liveTagResources.filter((tag) => {
      const name = String(tag.name || '').toLowerCase();
      const parameters = Array.isArray(tag.parameter) ? tag.parameter : [];
      const html = parameters.filter((parameter): parameter is Record<string, unknown> => Boolean(parameter && typeof parameter === 'object' && !Array.isArray(parameter))).map((parameter) => String(parameter.value || '')).join(' ').toLowerCase();
      return name === GTM_MONITOR_TAG_NAME.toLowerCase() || (html.includes('monitor.js') && html.includes('apikey'));
    }).map((tag) => String(tag.tagId || '').trim()).filter(Boolean);
    const liveInventory = normalizeGtmInventory({ accountId, containerId, workspaceId: 'live', tags: liveVersion.tag, triggers: liveVersion.trigger, variables: liveVersion.variable });
    const installationResult = await query(
      `SELECT i.id,i.account_id,i.container_id,i.workspace_id,i.tag_id,i.trigger_id,i.status,i.details
         FROM gtm_installations i
        WHERE i.site_id=$1 AND i.user_id=$2 AND i.account_id=$3 AND i.container_id=$4 AND i.status <> 'removed'
        ORDER BY i.created_at DESC LIMIT 1`,
      [siteId, session.uid, accountId, containerId],
    );
    const row = installationResult.rows[0];
    const detectedTag = liveInventory.tags.find((tag) => liveMonitorTagIds.includes(tag.tagId) || tag.name === GTM_MONITOR_TAG_NAME || (row?.tag_id && tag.tagId === row.tag_id)) || inventory.tags.find((tag) => tag.name === GTM_MONITOR_TAG_NAME || (row?.tag_id && tag.tagId === row.tag_id));
    let detectedInstallation = null;
    if (detectedTag) {
      const details = row?.details && typeof row.details === 'object' ? row.details : {};
      let installationId = row?.id;
      if (row && row.status !== 'published') {
        await query(`UPDATE gtm_installations SET status='published',details=details||$1::jsonb WHERE id=$2 AND user_id=$3`, [JSON.stringify({ detectedInLiveContainer: true, detectedAt: new Date().toISOString() }), row.id, session.uid]);
      }
      if (!row) {
        const created = await query(
          `INSERT INTO gtm_installations (user_id,site_id,account_id,container_id,workspace_id,tag_id,trigger_id,status,details)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'published',$8::jsonb) RETURNING id`,
          [session.uid, siteId, accountId, containerId, workspaceId, detectedTag.tagId, detectedTag.firingTriggerIds[0] || null, JSON.stringify({ detectedInLiveContainer: true, detectedAt: new Date().toISOString(), tagName: detectedTag.name, triggerName: null })],
        );
        installationId = created.rows[0]?.id;
      }
      const installationRecord = row || { account_id: accountId, container_id: containerId, workspace_id: workspaceId, tag_id: detectedTag.tagId, trigger_id: detectedTag.firingTriggerIds[0] || null };
      detectedInstallation = {
        installationId,
        status: 'published',
        workspace: { accountId: installationRecord.account_id, containerId: installationRecord.container_id, workspaceId: installationRecord.workspace_id, name: details.workspaceName || null, url: details.workspaceUrl || null },
        tag: { tagId: installationRecord.tag_id || detectedTag.tagId, name: detectedTag.name },
        trigger: { triggerId: installationRecord.trigger_id, name: details.triggerName || null },
        publishRequired: false,
      };
    }
    return NextResponse.json({ snapshot: inserted.rows[0], detectedInstallation, detectedEnvironment: detectedTag && liveInventory.tags.some((tag) => tag.tagId === detectedTag.tagId) ? 'live' : detectedTag ? 'workspace' : null }, { status: 201 });
  } catch (error) {
    console.error('GTM inventory refresh error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to refresh GTM inventory' }, { status: 502 });
  }
}
