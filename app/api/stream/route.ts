import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_STREAMS_PER_SITE = 3;
const MAX_STREAM_MS = 10 * 60_000;
const streams = new Map<string, number>();

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const key = `${session.uid}:${siteId}`;
  const active = streams.get(key) || 0;
  if (active >= MAX_STREAMS_PER_SITE) return NextResponse.json({ error: 'Too many live dashboard connections' }, { status: 429, headers: { 'Retry-After': '30' } });
  streams.set(key, active + 1);

  const encoder = new TextEncoder();
  let closed = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    if (closed) return;
    closed = true;
    if (interval) clearInterval(interval);
    if (lifetime) clearTimeout(lifetime);
    const current = streams.get(key) || 1;
    if (current <= 1) streams.delete(key); else streams.set(key, current - 1);
  };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastEventId = 0;
      let lastAlertId = 0;
      try {
        const priming = await query(`SELECT COALESCE((SELECT MAX(id) FROM events WHERE site_id = $1), 0) AS last_evt, COALESCE((SELECT MAX(id) FROM alerts WHERE site_id = $1), 0) AS last_alert`, [siteId]);
        lastEventId = Number(priming.rows[0]?.last_evt || 0);
        lastAlertId = Number(priming.rows[0]?.last_alert || 0);
        controller.enqueue(encoder.encode(`event: ready\\ndata: ${JSON.stringify({ maxLifetimeSeconds: MAX_STREAM_MS / 1000 })}\\n\\n`));
      } catch { release(); controller.close(); return; }
      const poll = async () => {
        if (closed) return;
        try {
          const [events, alerts] = await Promise.all([
            query('SELECT id, vendor, event_name, page_url, received_at FROM events WHERE site_id = $1 AND id > $2 ORDER BY id ASC LIMIT 25', [siteId, lastEventId]),
            query('SELECT id, severity, code, vendor, event_name, message, created_at FROM alerts WHERE site_id = $1 AND id > $2 AND resolved = false ORDER BY id ASC LIMIT 25', [siteId, lastAlertId]),
          ]);
          if (events.rows.length) lastEventId = Number(events.rows[events.rows.length - 1].id);
          if (alerts.rows.length) lastAlertId = Number(alerts.rows[alerts.rows.length - 1].id);
          if (events.rows.length || alerts.rows.length) controller.enqueue(encoder.encode(`event: update\\ndata: ${JSON.stringify({ events: events.rows, alerts: alerts.rows })}\\n\\n`));
          else controller.enqueue(encoder.encode(': heartbeat\\n\\n'));
        } catch { release(); try { controller.close(); } catch {} }
      };
      interval = setInterval(poll, 5000);
      lifetime = setTimeout(() => { release(); try { controller.enqueue(encoder.encode('event: reconnect\\ndata: {}\\n\\n')); controller.close(); } catch {} }, MAX_STREAM_MS);
      req.signal.addEventListener('abort', release, { once: true });
    },
    cancel() { release(); },
  });
  return new NextResponse(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
