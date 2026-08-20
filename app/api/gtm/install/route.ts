import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import {
  getAccessToken,
  getConnection,
  gtmRequest,
  monitorTagPayload,
  monitorTriggerPayload,
} from '../../../../lib/gtm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validGtmId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const siteId = Number(body?.siteId);
    const accountId = String(body?.accountId || '').trim();
    const containerId = String(body?.containerId || '').trim();
    const gtmPublicId = String(body?.gtmPublicId || '').trim();
    if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
    if (!validGtmId(accountId) || !validGtmId(containerId)) return NextResponse.json({ error: 'Valid GTM accountId and containerId required' }, { status: 400 });

    const siteResult = await query('SELECT id, domain, api_key, gtm_container_id FROM sites WHERE id = $1 AND user_id = $2 LIMIT 1', [siteId, session.uid]);
    const site = siteResult.rows[0];
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    const connection = await getConnection(session.uid);
    if (!connection) return NextResponse.json({ error: 'Connect a Google account before installing the monitor' }, { status: 409 });
    const token = await getAccessToken(connection);

    const workspace = await gtmRequest<{ workspaceId?: string; path?: string; name?: string; tagManagerUrl?: string }>(
      `accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/workspaces`,
      token,
      { method: 'POST', body: JSON.stringify({ name: `GAfix – ${site.domain} – ${new Date().toISOString().slice(0, 10)}`, description: 'Workspace created by GAfix. Review the monitor tag before publishing.' }) },
    );
    const workspaceId = String(workspace.workspaceId || '').trim();
    if (!workspaceId) throw new Error('GTM did not return a workspace ID');
    const parent = `accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/workspaces/${encodeURIComponent(workspaceId)}`;

    const trigger = await gtmRequest<{ triggerId?: string; name?: string; path?: string }>(`${parent}/triggers`, token, { method: 'POST', body: JSON.stringify(monitorTriggerPayload()) });
    const triggerId = String(trigger.triggerId || '').trim();
    if (!triggerId) throw new Error('GTM did not return a trigger ID');
    const tag = await gtmRequest<{ tagId?: string; name?: string; path?: string; tagManagerUrl?: string }>(`${parent}/tags`, token, { method: 'POST', body: JSON.stringify(monitorTagPayload(site, triggerId, gtmPublicId || site.gtm_container_id || undefined)) });
    const tagId = String(tag.tagId || '').trim();
    if (!tagId) throw new Error('GTM did not return a tag ID');

    const inserted = await query(
      `INSERT INTO gtm_installations (user_id, site_id, account_id, container_id, workspace_id, tag_id, trigger_id, status, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'tag_added',$8::jsonb)
       RETURNING id, created_at`,
      [session.uid, siteId, accountId, containerId, workspaceId, tagId, triggerId, JSON.stringify({ workspaceName: workspace.name, workspaceUrl: workspace.tagManagerUrl, tagName: tag.name, triggerName: trigger.name })],
    );
    return NextResponse.json({ ok: true, installationId: inserted.rows[0].id, status: 'tag_added', workspace: { accountId, containerId, workspaceId, name: workspace.name || null, url: workspace.tagManagerUrl || null }, tag: { tagId, name: tag.name || null }, trigger: { triggerId, name: trigger.name || null }, publishRequired: true }, { status: 201 });
  } catch (error) {
    console.error('GTM install error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add the GAfix monitor to GTM' }, { status: 502 });
  }
}
