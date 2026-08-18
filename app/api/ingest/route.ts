import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { classifyEvent, ParsedEvent, runDetection } from '../../../lib/detection';
import { assertBodySize, parseIngestBody } from '../../../lib/ingest-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  try {
    assertBodySize(req.headers.get('content-length'));
    const body = parseIngestBody(await req.text());
    const siteResult = await query('SELECT id FROM sites WHERE api_key = $1 LIMIT 1', [body.apiKey]);
    const site = siteResult.rows[0];
    if (!site) return json({ ok: false, error: 'Unknown API key' }, 401);

    let processedCount = 0;
    for (const event of body.events) {
      try {
        const inserted = await query(
          `INSERT INTO events
             (site_id, vendor, event_name, event_type, page_url, client_id, params, raw_url, dl_push_index, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, received_at`,
          [
            site.id,
            event.vendor,
            event.eventName,
            classifyEvent(event.eventName),
            event.pageUrl,
            event.clientId,
            JSON.stringify(event.params),
            event.rawUrl,
            event.dlPushIndex,
            event.source,
          ]
        );

        const dbEvent = inserted.rows[0];
        const parsed: ParsedEvent = {
          siteId: Number(site.id),
          eventId: Number(dbEvent.id),
          receivedAt: dbEvent.received_at,
          vendor: event.vendor,
          eventName: event.eventName,
          pageUrl: event.pageUrl || '',
          clientId: event.clientId,
          params: event.params,
          rawUrl: event.rawUrl || '',
          dlPushIndex: event.dlPushIndex,
          source: event.source,
        };
        await runDetection(parsed);
        processedCount += 1;
      } catch (error) {
        console.error('ingest event processing error:', error);
      }
    }

    return json({ ok: true, count: processedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    const status = /api key/i.test(message) ? 401 : /too large/i.test(message) ? 413 : 400;
    console.error('ingest request rejected:', message);
    return json({ ok: false, error: message }, status);
  }
}
