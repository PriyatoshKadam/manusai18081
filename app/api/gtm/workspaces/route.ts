import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getAccessToken, getConnection, gtmRequest } from '../../../../lib/gtm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validGtmId(value: unknown) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value); }

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const accountId = String(url.searchParams.get('accountId') || '').trim();
  const containerId = String(url.searchParams.get('containerId') || '').trim();
  if (!validGtmId(accountId) || !validGtmId(containerId)) return NextResponse.json({ error: 'Valid GTM accountId and containerId required' }, { status: 400 });
  try {
    const connection = await getConnection(session.uid);
    if (!connection) return NextResponse.json({ connected: false, workspaces: [] });
    const token = await getAccessToken(connection);
    const payload = await gtmRequest<{ workspace?: Array<{ workspaceId?: string; name?: string; description?: string; path?: string; createTime?: string; updateTime?: string }> }>(
      `accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/workspaces`,
      token,
    );
    const workspaces = (payload.workspace || []).map((workspace) => ({
      workspaceId: String(workspace.workspaceId || ''),
      name: workspace.name || `Workspace ${workspace.workspaceId || ''}`,
      description: workspace.description || null,
      path: workspace.path || null,
      createTime: workspace.createTime || null,
      updateTime: workspace.updateTime || null,
    })).filter((workspace) => validGtmId(workspace.workspaceId));
    return NextResponse.json({ connected: true, workspaces });
  } catch (error) {
    console.error('GTM workspace discovery error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load GTM workspaces' }, { status: 502 });
  }
}
