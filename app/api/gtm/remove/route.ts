import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { getAccessToken, getConnection, gtmRequest } from '../../../../lib/gtm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const installationId = Number(body?.installationId);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      return NextResponse.json({ error: 'Valid installationId required' }, { status: 400 });
    }

    const result = await query(
      `SELECT i.id, i.site_id, i.account_id, i.container_id, i.tag_id, i.trigger_id, i.status, s.domain
         FROM gtm_installations i
         JOIN sites s ON s.id = i.site_id
        WHERE i.id = $1 AND i.user_id = $2 AND s.user_id = $2
        LIMIT 1`,
      [installationId, session.uid],
    );
    const installation = result.rows[0];
    if (!installation) return NextResponse.json({ error: 'GTM installation not found' }, { status: 404 });
    if (installation.status !== 'published') {
      return NextResponse.json({ error: 'Only a published GAfix installation can be removed from the live container' }, { status: 409 });
    }

    const connection = await getConnection(session.uid);
    if (!connection) return NextResponse.json({ error: 'GTM connection is missing; connect Google again' }, { status: 409 });
    const token = await getAccessToken(connection);
    const base = `accounts/${encodeURIComponent(installation.account_id)}/containers/${encodeURIComponent(installation.container_id)}`;

    // Always create a fresh workspace from the current container. This makes removal safe
    // even when the original installation workspace was closed after publishing.
    const workspace = await gtmRequest<{ workspaceId?: string; name?: string; tagManagerUrl?: string }>(
      `${base}/workspaces`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `GAfix removal – ${installation.domain} – ${new Date().toISOString().slice(0, 10)}`,
          description: 'Created by GAfix to remove its managed monitor tag and publish the removal.',
        }),
      },
    );
    const workspaceId = String(workspace.workspaceId || '').trim();
    if (!validId(workspaceId)) throw new Error('GTM did not return a valid removal workspace ID');
    const parent = `${base}/workspaces/${encodeURIComponent(workspaceId)}`;

    try {
      const tagsResponse = await gtmRequest<{ tag?: Array<{ tagId?: string; name?: string }> }>(`${parent}/tags`, token);
      const triggersResponse = await gtmRequest<{ trigger?: Array<{ triggerId?: string; name?: string }> }>(`${parent}/triggers`, token);
      const tags = Array.isArray(tagsResponse.tag) ? tagsResponse.tag : [];
      const triggers = Array.isArray(triggersResponse.trigger) ? triggersResponse.trigger : [];
      const monitorTags = tags.filter((tag) => tag.name === 'GA4Fix – Real User Monitor' || tag.tagId === installation.tag_id);
      const monitorTriggers = triggers.filter((trigger) => trigger.name === 'GA4Fix – All Pages' || trigger.triggerId === installation.trigger_id);

      if (!monitorTags.length) {
        throw new Error('The published GAfix monitor tag could not be found in the current container. Nothing was removed. Refresh GTM and try again.');
      }

      for (const tag of monitorTags) {
        if (!validId(tag.tagId)) continue;
        await gtmRequest(`${parent}/tags/${encodeURIComponent(tag.tagId!)}`, token, { method: 'DELETE' });
      }
      // Delete our trigger only after its tag references have been removed.
      for (const trigger of monitorTriggers) {
        if (!validId(trigger.triggerId)) continue;
        await gtmRequest(`${parent}/triggers/${encodeURIComponent(trigger.triggerId!)}`, token, { method: 'DELETE' });
      }

      const versionResponse = await gtmRequest<{ containerVersion?: { versionId?: string; name?: string; fingerprint?: string }; compilerError?: boolean }>(
        `${parent}:create_version`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            name: `GAfix removal – ${installation.domain} – ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
            notes: 'Created and published by GAfix after the user confirmed removal of the monitor.',
          }),
        },
      );
      if (versionResponse.compilerError) throw new Error('GTM reported a compiler error. The live container was not changed.');
      const versionId = String(versionResponse.containerVersion?.versionId || '').trim();
      if (!validId(versionId)) throw new Error('GTM did not return a valid removal version ID');
      const versionPath = `${base}/versions/${encodeURIComponent(versionId)}`;
      const published = await gtmRequest<{ containerVersion?: { versionId?: string; name?: string }; compilerError?: boolean }>(
        `${versionPath}:publish${versionResponse.containerVersion?.fingerprint ? `?fingerprint=${encodeURIComponent(versionResponse.containerVersion.fingerprint)}` : ''}`,
        token,
        { method: 'POST', body: '' },
      );
      if (published.compilerError) throw new Error('GTM reported a compiler error while publishing the removal.');

      await query(
        `UPDATE gtm_installations
            SET status = 'removed', details = details || $1::jsonb
          WHERE id = $2 AND user_id = $3`,
        [JSON.stringify({ removedAt: new Date().toISOString(), removalWorkspaceId: workspaceId, removalVersionId: versionId }), installationId, session.uid],
      );

      return NextResponse.json({
        ok: true,
        status: 'removed',
        installationId,
        workspace: { workspaceId, name: workspace.name || null, url: workspace.tagManagerUrl || null },
        version: published.containerVersion || versionResponse.containerVersion || null,
      });
    } catch (error) {
      // Keep the removal workspace available for the user to inspect/fix in GTM.
      console.error('GTM removal failed after workspace creation:', error);
      throw error;
    }
  } catch (error) {
    console.error('GTM remove error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to remove the GAfix monitor from GTM' }, { status: 502 });
  }
}
