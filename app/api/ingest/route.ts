import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { classifyEvent, ParsedEvent, runDetection } from '../../../lib/detection';
import { assertBodySize, parseIngestBody } from '../../../lib/ingest-validation';
import { rateLimit, requestKey } from '../../../lib/rate-limit';

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

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...corsHeaders(), ...extra } });
}

function originHost(req: NextRequest) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  try { return origin ? new URL(origin).hostname.toLowerCase() : referer ? new URL(referer).hostname.toLowerCase() : null; } catch { return null; }
}

function hostnameMatches(host: string | null, candidate: string | null) {
  if (!host || !candidate) return false;
  const normalized = candidate.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
  return host === normalized || host.endsWith(`.${normalized}`);
}

function allowedSiteOrigin(req: NextRequest, site: { domain: string; first_party_domain: string | null }) {
  const host = originHost(req);
  if (!host) return true; // sendBeacon and privacy browsers may omit both headers.
  return hostnameMatches(host, site.domain) || hostnameMatches(host, site.first_party_domain);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const requestLimit = rateLimit(requestKey(req, 'ingest'), 120, 60_000);
  if (!requestLimit.allowed) return json({ ok: false, error: 'Rate limit exceeded' }, 429, { 'Retry-After': String(requestLimit.retryAfterSeconds) });
  try {
    assertBodySize(req.headers.get('content-length'));
    const body = parseIngestBody(await req.text());
    const siteResult = await query('SELECT id, domain, first_party_domain FROM sites WHERE api_key = $1 LIMIT 1', [body.apiKey]);
    const site = siteResult.rows[0];
    if (!site) return json({ ok: false, error: 'Invalid telemetry credentials' }, 401);
    if (!allowedSiteOrigin(req, site)) return json({ ok: false, error: 'Telemetry origin is not registered for this site' }, 403);

    let processedCount = 0;
    for (const event of body.events) {
      try {
        const inserted = await query(
          `INSERT INTO events
             (site_id, vendor, event_name, event_type, page_url, client_id, params, raw_url, dl_push_index, source,
              observation_kind, session_id, occurrence_id, network_occurrence_id, request_signature, transport,
              gtm_container_id, navigation_id, delivery_status, status_code, latency_ms, failure_reason, consent_state, web_vitals)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'observed',$19,$20,$21,$22,$23)
           RETURNING id, received_at`,
          [
            site.id, event.vendor, event.eventName, classifyEvent(event.eventName, event.vendor), event.pageUrl, event.clientId,
            JSON.stringify(event.params), event.rawUrl, event.dlPushIndex, event.source, event.observationKind,
            event.sessionId, event.occurrenceId, event.networkOccurrenceId, event.requestSignature, event.transport,
            event.gtmContainerId, event.navigationId, event.statusCode, event.latencyMs, event.failureReason,
            JSON.stringify(event.consentState), JSON.stringify(event.webVitals),
          ],
        );
        const dbEvent = inserted.rows[0];
        const parsed: ParsedEvent = {
          siteId: Number(site.id), eventId: Number(dbEvent.id), receivedAt: dbEvent.received_at, vendor: event.vendor,
          eventName: event.eventName, pageUrl: event.pageUrl || '', clientId: event.clientId, params: event.params,
          rawUrl: event.rawUrl || '', dlPushIndex: event.dlPushIndex, source: event.source,
          observationKind: event.observationKind, sessionId: event.sessionId, occurrenceId: event.occurrenceId,
          networkOccurrenceId: event.networkOccurrenceId, requestSignature: event.requestSignature, transport: event.transport,
          gtmContainerId: event.gtmContainerId, navigationId: event.navigationId, statusCode: event.statusCode, latencyMs: event.latencyMs, failureReason: event.failureReason, consentState: event.consentState, webVitals: event.webVitals,
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
    const status = /api key|credentials/i.test(message) ? 401 : /too large/i.test(message) ? 413 : 400;
    console.error('ingest request rejected:', message);
    return json({ ok: false, error: /invalid|too large|maximum|event name/i.test(message) ? message : 'Invalid telemetry request' }, status);
  }
}
