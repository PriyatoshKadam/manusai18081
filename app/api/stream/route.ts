import { NextRequest } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return new Response('Unauthorized', { status: 401 });

  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return new Response('siteId required', { status: 400 });

  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, s.uid]);
  if (!owner.rows[0]) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();
  let lastEventId = 0;
  let lastAlertId = 0;

  const stream = new ReadableStream({
    async start(controller) {
      // Prime with the current latest IDs so we only stream new
      const priming = await query(
        `SELECT COALESCE((SELECT MAX(id) FROM events WHERE site_id = $1), 0) as last_evt,
                COALESCE((SELECT MAX(id) FROM alerts WHERE site_id = $1), 0) as last_alert`,
        [siteId]
      );
      lastEventId = Number(priming.rows[0].last_evt);
      lastAlertId = Number(priming.rows[0].last_alert);

      controller.enqueue(encoder.encode(`: connected\n\n`));

      const interval = setInterval(async () => {
        try {
          const events = await query(
            `SELECT id, vendor, event_name, page_url, received_at
             FROM events WHERE site_id = $1 AND id > $2 ORDER BY id ASC LIMIT 25`,
            [siteId, lastEventId]
          );
          for (const r of events.rows) {
            lastEventId = Math.max(lastEventId, Number(r.id));
            controller.enqueue(encoder.encode(`event: event\ndata: ${JSON.stringify(r)}\n\n`));
          }
          const alerts = await query(
            `SELECT id, severity, code, vendor, event_name, message, created_at
             FROM alerts WHERE site_id = $1 AND id > $2 ORDER BY id ASC LIMIT 10`,
            [siteId, lastAlertId]
          );
          for (const r of alerts.rows) {
            lastAlertId = Math.max(lastAlertId, Number(r.id));
            controller.enqueue(encoder.encode(`event: alert\ndata: ${JSON.stringify(r)}\n\n`));
          }
        } catch (e) {
          // Ignore transient errors, keep the stream alive
        }
      }, 2000);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
