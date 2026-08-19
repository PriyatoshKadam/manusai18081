import crypto from 'node:crypto';
import { query } from './db';

type AlertNotification = {
  alertId?: number;
  siteId: number;
  severity: string;
  category: string;
  vendor: string | null;
  eventName: string | null;
  message: string;
  rootCause: string;
  pageUrl?: string | null;
  fixSteps?: string[];
};

function safeText(value: string | null | undefined, max = 300) {
  return String(value || '').slice(0, max);
}
function controllerWithTimeout(ms = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}
function payload(alert: AlertNotification) {
  return {
    text: `[GA4Fix ${safeText(alert.severity, 30).toUpperCase()}] ${safeText(alert.message, 240)}`,
    alertId: alert.alertId,
    siteId: alert.siteId,
    severity: safeText(alert.severity, 30),
    category: safeText(alert.category, 40),
    vendor: safeText(alert.vendor, 40),
    eventName: safeText(alert.eventName, 120),
    message: safeText(alert.message, 700),
    rootCause: safeText(alert.rootCause, 900),
    pageUrl: safeText(alert.pageUrl, 1200),
    fixSteps: (alert.fixSteps || []).slice(0, 10).map((step) => safeText(step, 300)),
  };
}

export async function notifySlack(webhookUrl: string | null | undefined, alert: AlertNotification) {
  if (!webhookUrl || !/^https:\/\/hooks\.slack\.com\/services\//i.test(webhookUrl)) return false;
  const { controller, timer } = controllerWithTimeout();
  try {
    const body = payload(alert);
    const response = await fetch(webhookUrl, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: body.text,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: `GA4Fix incident: ${safeText(alert.eventName || alert.vendor || 'tag', 100)}` } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*Severity*\n${body.severity}` },
            { type: 'mrkdwn', text: `*Category*\n${body.category}` },
            { type: 'mrkdwn', text: `*Vendor*\n${body.vendor}` },
            { type: 'mrkdwn', text: `*Site ID*\n${alert.siteId}` },
          ] },
          { type: 'section', text: { type: 'mrkdwn', text: `*What happened*\n${body.message}\n\n*Probable cause*\n${body.rootCause}${body.pageUrl ? `\n\n*Page*\n${body.pageUrl}` : ''}` } },
        ],
      }),
    });
    return response.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

export async function notifyEmail(to: string | null | undefined, alert: AlertNotification) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ALERT_FROM_EMAIL?.trim();
  if (!apiKey || !from || !to || !/^\S+@\S+\.\S+$/.test(to)) return false;
  const body = payload(alert);
  const { controller, timer } = controllerWithTimeout(5000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `[GA4Fix ${body.severity.toUpperCase()}] ${body.eventName || body.vendor || 'Tag incident'}`, text: `${body.message}\n\nProbable cause: ${body.rootCause}\n\n${body.fixSteps.join('\n')}` }),
    });
    return response.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

export async function notifyWebhook(url: string, secret: string | null | undefined, alert: AlertNotification) {
  if (!/^https?:\/\//i.test(url)) return false;
  const body = JSON.stringify({ type: 'tag_incident', createdAt: new Date().toISOString(), alert: payload(alert) });
  const signature = secret ? crypto.createHmac('sha256', secret).update(body).digest('hex') : '';
  const { controller, timer } = controllerWithTimeout(5000);
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-GA4Fix-Signature': signature } : {}) }, body });
    return response.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

export async function enqueueAlertDeliveries(alert: AlertNotification) {
  if (!alert.alertId) return;
  try {
    const destination = await query(
      `SELECT s.slack_webhook_url, u.email,
              COALESCE(ap.slack_enabled, TRUE) AS slack_enabled,
              COALESCE(ap.email_enabled, FALSE) AS email_enabled
         FROM sites s JOIN users u ON u.id = s.user_id
         LEFT JOIN alert_policies ap ON ap.site_id = s.id
        WHERE s.id = $1 LIMIT 1`, [alert.siteId],
    );
    const row = destination.rows[0];
    if (row?.slack_enabled && row.slack_webhook_url) await query(`INSERT INTO alert_deliveries (alert_id, site_id, channel, destination) VALUES ($1,$2,'slack',$3) ON CONFLICT DO NOTHING`, [alert.alertId, alert.siteId, row.slack_webhook_url]);
    if (row?.email_enabled && row.email && process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL) await query(`INSERT INTO alert_deliveries (alert_id, site_id, channel, destination) VALUES ($1,$2,'email',$3) ON CONFLICT DO NOTHING`, [alert.alertId, alert.siteId, row.email]);
    const hooks = await query(`SELECT url FROM site_webhooks WHERE site_id = $1 AND enabled = true`, [alert.siteId]);
    for (const hook of hooks.rows) await query(`INSERT INTO alert_deliveries (alert_id, site_id, channel, destination) VALUES ($1,$2,'webhook',$3) ON CONFLICT DO NOTHING`, [alert.alertId, alert.siteId, hook.url]);
    await processPendingDeliveries(10);
  } catch (error) { console.error('Alert delivery enqueue error:', error); }
}

export async function processPendingDeliveries(limit = 20) {
  const due = await query(
    `SELECT d.id, d.channel, d.destination, d.attempt_count, a.id AS alert_id, a.site_id, a.severity, a.category, a.vendor, a.event_name, a.message, a.root_cause, a.page_url, a.fix_steps, w.secret_encrypted
       FROM alert_deliveries d JOIN alerts a ON a.id = d.alert_id
       LEFT JOIN site_webhooks w ON w.site_id = d.site_id AND w.url = d.destination
      WHERE d.status IN ('pending','retry') AND d.next_attempt_at <= NOW() AND d.attempt_count < 5
      ORDER BY d.next_attempt_at ASC LIMIT $1`, [limit],
  );
  for (const row of due.rows) {
    const alert: AlertNotification = { alertId: Number(row.alert_id), siteId: Number(row.site_id), severity: row.severity, category: row.category, vendor: row.vendor, eventName: row.event_name, message: row.message, rootCause: row.root_cause, pageUrl: row.page_url, fixSteps: Array.isArray(row.fix_steps) ? row.fix_steps : [] };
    const ok = row.channel === 'slack' ? await notifySlack(row.destination, alert) : row.channel === 'email' ? await notifyEmail(row.destination, alert) : await notifyWebhook(row.destination, row.secret_encrypted || null, alert);
    if (ok) await query(`UPDATE alert_deliveries SET status = 'delivered', delivered_at = NOW(), attempt_count = attempt_count + 1 WHERE id = $1`, [row.id]);
    else await query(`UPDATE alert_deliveries SET status = CASE WHEN attempt_count + 1 >= 5 THEN 'failed' ELSE 'retry' END, attempt_count = attempt_count + 1, next_attempt_at = NOW() + (POWER(2, attempt_count + 1) * INTERVAL '1 minute'), last_error = 'Delivery failed or timed out' WHERE id = $1`, [row.id]);
  }
}
