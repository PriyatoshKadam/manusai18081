import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getAccessToken, getConnection, gtmRequest } from '../../../../lib/gtm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GtmAccount = { accountId?: string; name?: string; path?: string };
type GtmContainer = { accountId?: string; containerId?: string; name?: string; publicId?: string; path?: string; usageContext?: string[]; domainName?: string[] };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const connection = await getConnection(session.uid);
    if (!connection) return NextResponse.json({ connected: false, accounts: [] });
    const token = await getAccessToken(connection);
    const accountsPayload = await gtmRequest<{ account?: GtmAccount[] }>('accounts', token);
    const accounts = await Promise.all((accountsPayload.account || []).map(async (account) => {
      const accountId = String(account.accountId || '').trim();
      if (!accountId) return { accountId: '', name: account.name || 'Unnamed account', containers: [] };
      const containersPayload = await gtmRequest<{ container?: GtmContainer[] }>(`accounts/${encodeURIComponent(accountId)}/containers`, token);
      return {
        accountId,
        name: account.name || `Account ${accountId}`,
        containers: (containersPayload.container || []).map((container) => ({
          accountId,
          containerId: String(container.containerId || ''),
          name: container.name || `Container ${container.containerId || ''}`,
          publicId: container.publicId || null,
          usageContext: container.usageContext || [],
          domainName: container.domainName || [],
        })).filter((container) => container.containerId),
      };
    }));
    return NextResponse.json({ connected: true, googleEmail: connection.google_email || null, accounts });
  } catch (error) {
    console.error('GTM container discovery error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load GTM containers' }, { status: 502 });
  }
}
