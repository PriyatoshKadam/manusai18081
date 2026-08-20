import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { getAccessToken, getConnection, gtmRequest } from '../../../../lib/gtm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function versionName(domain: string) {
  return `GAfix monitor – ${domain} – ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const installationId = Number(body?.installationId);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) return NextResponse.json({ error: 'Valid installationId required' }, { status: 400 });
    const installationResult = await query(
      `SELECT i.id, i.site_id, i.account_id, i.container_id, i.workspace_id, i.tag_id, i.trigger_id, i.version_id, i.status,
              s.domain
       FROM gtm_installations i JOIN sites s ON s.id = i.site_id
       WHERE i.id = $1 AND i.user_id = $2 AND s.user_id = $2 LIMIT 1`,
      [installationId, session.uid],
    );
    const installation = installationResult.rows[0];
    if (!installation) return NextResponse.json({ error: 'GTM installation not found' }, { status: 404 });
    if (!['tag_added', 'version_created'].includes(String(installation.status))) return NextResponse.json({ error: 'This installation is not ready to publish' }, { status: 409 });
    const connection = await getConnection(session.uid);
    if (!connection) return NextResponse.json({ error: 'GTM connection is missing; connect Google again' }, { status: 409 });
    const token = await getAccessToken(connection);
    const workspacePath = `accounts/${encodeURIComponent(installation.account_id)}/containers/${encodeURIComponent(installation.container_id)}/workspaces/${encodeURIComponent(installation.workspace_id)}`;
    let versionResponse: { containerVersion?: { versionId?: string; path?: string; name?: string; fingerprint?: string }; syncStatus?: { mergeConflict?: unknown[] }; compilerError?: boolean; newWorkspacePath?: string } = {};
    if (String(installation.status) !== 'version_created' || !installation.version_id) {
      versionResponse = await gtmRequest<typeof versionResponse>(
        `${workspacePath}:create_version`,
        token,
        { method: 'POST', body: JSON.stringify({ name: versionName(installation.domain), notes: 'Created and published by GAfix after the user confirmed the monitor installation.' }) },
      );
    }
    const containerVersion = versionResponse.containerVersion;
    const versionId = String(containerVersion?.versionId || installation.version_id || '').trim();
    if (versionResponse.compilerError) {
      await query(`UPDATE gtm_installations SET status = 'compiler_error', version_id = $1, details = details || $2::jsonb WHERE id = $3 AND user_id = $4`, [versionId || null, JSON.stringify({ compilerError: true }), installationId, session.uid]);
      return NextResponse.json({ error: 'GTM reported a compiler error. The container was not published.', compilerError: true, version: containerVersion || null }, { status: 422 });
    }
    if (!versionId) throw new Error('GTM did not return a container version ID');
    await query(`UPDATE gtm_installations SET status = 'version_created', version_id = $1, details = details || $2::jsonb WHERE id = $3 AND user_id = $4`, [versionId, JSON.stringify({ versionName: containerVersion?.name || null, versionPath: containerVersion?.path || null }), installationId, session.uid]);
    const versionPath = `accounts/${encodeURIComponent(installation.account_id)}/containers/${encodeURIComponent(installation.container_id)}/versions/${encodeURIComponent(versionId)}`;
    const published = await gtmRequest<{ containerVersion?: { versionId?: string; name?: string; fingerprint?: string }; compilerError?: boolean }>(`${versionPath}:publish${containerVersion?.fingerprint ? `?fingerprint=${encodeURIComponent(containerVersion.fingerprint)}` : ''}`, token, { method: 'POST', body: '' });
    if (published.compilerError) {
      return NextResponse.json({ error: 'GTM reported a compiler error while publishing. Check the container in GTM.', compilerError: true, version: published.containerVersion || containerVersion }, { status: 422 });
    }
    await query(`UPDATE gtm_installations SET status = 'published', details = details || $1::jsonb WHERE id = $2 AND user_id = $3`, [JSON.stringify({ publishedAt: new Date().toISOString() }), installationId, session.uid]);
    return NextResponse.json({ ok: true, status: 'published', installationId, version: published.containerVersion || containerVersion, workspaceClosed: true });
  } catch (error) {
    console.error('GTM publish error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to publish the GAfix monitor container version' }, { status: 502 });
  }
}
