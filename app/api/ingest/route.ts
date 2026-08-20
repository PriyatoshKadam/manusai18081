import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { classifyEvent, ParsedEvent, runDetection } from '../../../lib/detection';
import { assertBodySize, parseIngestBody } from '../../../lib/ingest-validation';
import { rateLimit, requestKey } from '../../../lib/rate-limit';
import { recordComplianceEvidence } from '../../../lib/compliance';
import { classifyDeliveryMode } from '../../../lib/delivery';
import { hostnameMatches } from '../../../lib/origin';

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

function configuredServiceOrigin(host: string | null) {
  if (!host) return false;
  return [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_MONITOR_ORIGIN].some((value) => {
    try { return hostnameMatches(host, new URL(String(value)).hostname); } catch { return false; }
  });
}

function allowedSiteOrigin(req: NextRequest, site: { domain: string; first_party_domain: string | null }, events: Array<{ pageUrl?: string | null }>) {
  const host = originHost(req);
  if (!host) return true; // sendBeacon and privacy browsers may omit both headers.
  if (hostnameMatches(host, site.domain) || hostnameMatches(host, site.first_party_domain)) return true;
  if (!configuredServiceOrigin(host)) return false;
  return events.some((event) => hostnameMatches(originHostFromPageUrl(event.pageUrl), site.domain) || hostnameMatches(originHostFromPageUrl(event.pageUrl), site.first_party_domain));
}

function originHostFromPageUrl(value: string | null | undefined) {
  try { return value ? new URL(value).hostname.toLowerCase() : null; } catch { return null; }
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
    if (!allowedSiteOrigin(req, site, body.events)) return json({ ok: false, error: 'Telemetry origin is not registered for this site' }, 403);

    let processedCount = 0;
    for (const event of body.events) {
      try {
        const deliveryMode = classifyDeliveryMode(event.rawUrl, event.pageUrl, { ...site, appOrigin: process.env.NEXT_PUBLIC_APP_URL || null });
        const inserted = await query(
          `INSERT INTO events
             (site_id, vendor, event_name, event_type, page_url, client_id, params, raw_url, dl_push_index, source,
              observation_kind, session_id, occurrence_id, network_occurrence_id, request_signature, transport,
              gtm_container_id, navigation_id, delivery_status, status_code, latency_ms, failure_reason, consent_state, web_vitals, revenue_value, revenue_currency, transaction_id, resource_domain, resource_type, delivery_mode, is_synthetic)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'observed',$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
           RETURNING id, received_at`,
          [
            site.id, event.vendor, event.eventName, classifyEvent(event.eventName, event.vendor), event.pageUrl, event.clientId,
            JSON.stringify(event.params), event.rawUrl, event.dlPushIndex, event.source, event.observationKind,
            event.sessionId, event.occurrenceId, event.networkOccurrenceId, event.requestSignature, event.transport,
            event.gtmContainerId, event.navigationId, event.statusCode, event.latencyMs, event.failureReason,
            JSON.stringify(event.consentState), JSON.stringify(event.webVitals), event.revenueValue, event.revenueCurrency, event.transactionId, event.resourceDomain, event.resourceType, deliveryMode, event.isSynthetic,
          ],
        );
        const dbEvent = inserted.rows[0];
        const parsed: ParsedEvent = {
          siteId: Number(site.id), eventId: Number(dbEvent.id), receivedAt: dbEvent.received_at, vendor: event.vendor,
          eventName: event.eventName, pageUrl: event.pageUrl || '', clientId: event.clientId, params: event.params,
          rawUrl: event.rawUrl || '', dlPushIndex: event.dlPushIndex, source: event.source,
          observationKind: event.observationKind, sessionId: event.sessionId, occurrenceId: event.occurrenceId,
          networkOccurrenceId: event.networkOccurrenceId, requestSignature: event.requestSignature, transport: event.transport,
          gtmContainerId: event.gtmContainerId, navigationId: event.navigationId, statusCode: event.statusCode, latencyMs: event.latencyMs, failureReason: event.failureReason, consentState: event.consentState, webVitals: event.webVitals, revenueValue: event.revenueValue, revenueCurrency: event.revenueCurrency, transactionId: event.transactionId, resourceDomain: event.resourceDomain, resourceType: event.resourceType, deliveryMode,
        };
        void recordComplianceEvidence(parsed, { domain: site.domain, firstPartyDomain: site.first_party_domain });
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
