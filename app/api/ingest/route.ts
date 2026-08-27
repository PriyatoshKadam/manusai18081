import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { classifyEvent, ParsedEvent, processPersistedEvent } from '../../../lib/detection';
import { assertBodySize, parseIngestBody } from '../../../lib/ingest-validation';
import { rateLimit, requestKey } from '../../../lib/rate-limit';
import { recordComplianceEvidence } from '../../../lib/compliance';
import { classifyDeliveryMode } from '../../../lib/delivery';
import { correlateEventWithGtm } from '../../../lib/gtm-inventory';
import type { GtmInventory } from '../../../lib/gtm-inventory';

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const requestLimit = rateLimit(requestKey(req, 'ingest'), 120, 60_000);
  if (!requestLimit.allowed) return json({ ok: false, error: 'Rate limit exceeded' }, 429, { 'Retry-After': String(requestLimit.retryAfterSeconds) });
  try {
    assertBodySize(req.headers.get('content-length'));
    const body = parseIngestBody(await req.text());
    const siteResult = await query('SELECT id, domain, first_party_domain FROM sites WHERE api_key = $1 OR (previous_api_key = $1 AND previous_api_key_expires_at > NOW()) ORDER BY CASE WHEN api_key = $1 THEN 0 ELSE 1 END LIMIT 1', [body.apiKey]);
    const site = siteResult.rows[0];
    if (!site) return json({ ok: false, error: 'Invalid telemetry credentials' }, 401);

    let processedCount = 0;
    const inventoryCache = new Map<string, GtmInventory | null>();
    for (const event of body.events) {
      try {
        const deliveryMode = classifyDeliveryMode(event.rawUrl, event.pageUrl, { ...site, appOrigin: process.env.NEXT_PUBLIC_APP_URL || null });
        let inventory: GtmInventory | null = null;
        const publicContainerId = event.gtmContainerId?.trim() || '';
        if (publicContainerId) {
          if (inventoryCache.has(publicContainerId)) inventory = inventoryCache.get(publicContainerId) || null;
          else {
            const snapshot = await query(
              `SELECT account_id, container_id, container_public_id, workspace_id, tags, triggers, variables, fetched_at, environment, snapshot_version_id, snapshot_version_name, live_version_id, live_version_name, live_version_updated_at, snapshot_stale
                 FROM gtm_config_snapshots
                WHERE site_id = $1 AND (container_public_id = $2 OR container_id = $2)
                ORDER BY fetched_at DESC LIMIT 1`,
              [site.id, publicContainerId],
            );
            const row = snapshot.rows[0];
            inventory = row ? { accountId: row.account_id, containerId: row.container_id, workspaceId: row.workspace_id, fetchedAt: row.fetched_at, tags: row.tags || [], triggers: row.triggers || [], variables: row.variables || [], environment: row.environment, snapshotVersionId: row.snapshot_version_id, snapshotVersionName: row.snapshot_version_name, liveVersionId: row.live_version_id, liveVersionName: row.live_version_name, liveVersionUpdatedAt: row.live_version_updated_at, snapshotStale: row.snapshot_stale === true } : null;
            inventoryCache.set(publicContainerId, inventory);
          }
        }
        const enrichment = correlateEventWithGtm({ vendor: event.vendor, eventName: event.eventName, params: event.params, rawUrl: event.rawUrl, measurementId: event.params.tid }, inventory);
        const inserted = await query(
          `INSERT INTO events
             (site_id, vendor, event_name, event_type, page_url, client_id, params, raw_url, dl_push_index, source,
              observation_kind, session_id, occurrence_id, network_occurrence_id, request_signature, transport,
              gtm_container_id, navigation_id, delivery_status, status_code, latency_ms, failure_reason, consent_state, web_vitals, revenue_value, revenue_currency, transaction_id, resource_domain, resource_type, delivery_mode, is_synthetic, gtm_tag_id, gtm_tag_name, gtm_trigger_name, gtm_workspace_id, gtm_correlation_confidence, missing_parameters, observed_parameters, parameter_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'observed',$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::jsonb,$37::jsonb,$38)
           RETURNING id, received_at`,
          [
            site.id, event.vendor, event.eventName, classifyEvent(event.eventName, event.vendor), event.pageUrl, event.clientId,
            JSON.stringify(event.params), event.rawUrl, event.dlPushIndex, event.source, event.observationKind,
            event.sessionId, event.occurrenceId, event.networkOccurrenceId, event.requestSignature, event.transport,
            event.gtmContainerId, event.navigationId, event.statusCode, event.latencyMs, event.failureReason,
            JSON.stringify(event.consentState), JSON.stringify(event.webVitals), event.revenueValue, event.revenueCurrency, event.transactionId, event.resourceDomain, event.resourceType, deliveryMode, event.isSynthetic,
            enrichment.tagId, enrichment.tagName, enrichment.triggerName, enrichment.workspaceId, enrichment.confidence, JSON.stringify(enrichment.missingParameters), JSON.stringify(enrichment.observedParameters), enrichment.parameterStatus,
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
          gtmTagId: enrichment.tagId, gtmTagName: enrichment.tagName, gtmTriggerName: enrichment.triggerName, gtmWorkspaceId: enrichment.workspaceId, gtmCorrelationConfidence: enrichment.confidence, missingParameters: enrichment.missingParameters, observedParameters: enrichment.observedParameters, parameterStatus: enrichment.parameterStatus,
        };
        void recordComplianceEvidence(parsed, { domain: site.domain, firstPartyDomain: site.first_party_domain });
        await processPersistedEvent(parsed);
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
