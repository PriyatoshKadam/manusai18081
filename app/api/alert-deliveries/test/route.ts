import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { notifySlack } from '../../../../lib/notifications';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})); const siteId = Number(body?.siteId); if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const result = await query(`SELECT s.id, COALESCE(NULLIF(s.slack_webhook_url,''), $3) AS slack_webhook_url FROM sites s WHERE s.id=$1 AND s.user_id=$2`, [siteId, session.uid, process.env.SLACK_WEBHOOK_URL?.trim() || null]);
  const webhook = result.rows[0]?.slack_webhook_url; if (!webhook) return NextResponse.json({ error: 'No Slack webhook is configured. Add SLACK_WEBHOOK_URL in Render and restart the service.' }, { status: 400 });
  const delivered = await notifySlack(webhook, { siteId, severity: 'critical', category: 'configuration_test', vendor: 'ga4fix', eventName: 'slack_test', message: 'GA4Fix Slack integration is connected and ready for high-priority incidents.', rootCause: 'This is a customer-requested delivery test, not a production incident.', fixSteps: ['No action required.'] });
  if (!delivered) return NextResponse.json({ error: 'Slack rejected the test message or the request timed out. Verify the webhook URL and Render outbound network access.' }, { status: 502 });
  return NextResponse.json({ ok: true, message: 'Test message sent to Slack.' });
}
