type AlertNotification = {
  siteId: number;
  severity: string;
  category: string;
  vendor: string | null;
  eventName: string | null;
  message: string;
  rootCause: string;
};

function safeText(value: string | null | undefined, max = 300) {
  return String(value || '').slice(0, max);
}

export async function notifySlack(webhookUrl: string | null | undefined, alert: AlertNotification) {
  if (!webhookUrl || !/^https:\/\/hooks\.slack\.com\/services\//i.test(webhookUrl)) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[GA4Fix ${safeText(alert.severity, 30).toUpperCase()}] ${safeText(alert.message, 240)}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: `GA4Fix incident: ${safeText(alert.eventName || alert.vendor || 'tag', 100)}` } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*Severity*\n${safeText(alert.severity, 30)}` },
            { type: 'mrkdwn', text: `*Category*\n${safeText(alert.category, 40)}` },
            { type: 'mrkdwn', text: `*Vendor*\n${safeText(alert.vendor, 40)}` },
            { type: 'mrkdwn', text: `*Site ID*\n${alert.siteId}` },
          ] },
          { type: 'section', text: { type: 'mrkdwn', text: `*What happened*\n${safeText(alert.message, 500)}\n\n*Probable cause*\n${safeText(alert.rootCause, 700)}` } },
        ],
      }),
    });
  } catch {
    // Notifications are best-effort and must never break telemetry processing.
  } finally {
    clearTimeout(timer);
  }
}
