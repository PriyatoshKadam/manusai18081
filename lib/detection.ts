import { query } from './db';

export interface ParsedEvent {
  siteId: number;
  eventId: number;
  receivedAt: Date | string;
  vendor: string;
  eventName: string | null;
  pageUrl: string;
  clientId: string | null;
  params: Record<string, any>;
  rawUrl: string;
  dlPushIndex: number | null;
  source: string | null;
}

type DuplicateMatch = {
  id: number;
  dlPushIndex: number | null;
  source: string | null;
  rawUrl: string | null;
};

const AUTOMATIC_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'user_engagement', 'session_start', 'first_visit',
  'file_download', 'view_search_results', 'video_start', 'video_progress', 'video_complete',
]);
const INTERNAL_EVENTS = new Set(['exception', 'debug', 'monitor_event']);

export function classifyEvent(eventName: string | null): string {
  if (!eventName) return 'unknown';
  if (AUTOMATIC_EVENTS.has(eventName)) return 'standard';
  if (INTERNAL_EVENTS.has(eventName)) return 'internal';
  return 'custom';
}

export function normalizePageUrl(url: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url.split('#')[0];
  }
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

export function getEventIdentity(event: ParsedEvent): string | null {
  const params = event.params || {};
  const strongIdentity = firstValue(params.transaction_id, params.transactionId, params.event_id, params.eventId);
  if (strongIdentity) return `strong:${String(strongIdentity)}`;
  if (!event.clientId) return null;
  return `visitor:${event.clientId}|page:${normalizePageUrl(event.pageUrl)}|event:${event.eventName || ''}`;
}

export function classifyDuplicateRootCause(current: ParsedEvent, previous: DuplicateMatch): string {
  if (current.dlPushIndex !== null && previous.dlPushIndex !== null && current.dlPushIndex !== previous.dlPushIndex) {
    return 'The same event was pushed to dataLayer more than once before the vendor request was sent.';
  }
  if (current.source && previous.source && current.source !== previous.source) {
    return `The event was sent through more than one transport (${previous.source} and ${current.source}), which often means GTM and direct code are both configured.`;
  }
  if (current.dlPushIndex !== null && previous.dlPushIndex === current.dlPushIndex) {
    return 'One dataLayer push produced multiple vendor requests, suggesting duplicate tags or triggers.';
  }
  return 'The same visitor generated the same event more than once in a three-second window.';
}

export async function checkDuplicateEvent(event: ParsedEvent): Promise<DuplicateMatch | null> {
  if (!event.eventName) return null;
  const identity = getEventIdentity(event);
  if (!identity) return null;
  const pageUrl = normalizePageUrl(event.pageUrl);

  const result = await query(
    `SELECT id, dl_push_index, source, raw_url, page_url, client_id, params
       FROM events
      WHERE site_id = $1
        AND vendor = $2
        AND event_name = $3
        AND id <> $4
        AND received_at >= NOW() - INTERVAL '3 seconds'
        AND COALESCE(client_id, '') = COALESCE($5, '')
        AND COALESCE(page_url, '') = $6
      ORDER BY received_at DESC
      LIMIT 20`,
    [event.siteId, event.vendor, event.eventName, event.eventId, event.clientId, pageUrl]
  );

  for (const row of result.rows) {
    const previous: ParsedEvent = {
      siteId: event.siteId,
      eventId: Number(row.id),
      receivedAt: row.received_at,
      vendor: event.vendor,
      eventName: event.eventName,
      pageUrl: row.page_url || '',
      clientId: row.client_id || null,
      params: row.params || {},
      rawUrl: row.raw_url || '',
      dlPushIndex: row.dl_push_index === null ? null : Number(row.dl_push_index),
      source: row.source || null,
    };
    if (getEventIdentity(previous) === identity) {
      return {
        id: Number(row.id),
        dlPushIndex: previous.dlPushIndex,
        source: previous.source,
        rawUrl: previous.rawUrl,
      };
    }
  }
  return null;
}

async function createAlert(input: {
  siteId: number;
  severity: string;
  code: string;
  vendor: string | null;
  eventName: string | null;
  message: string;
  rootCause: string;
  fixSteps: string[];
  pageUrl: string;
  raw: Record<string, unknown>;
  dedupeMinutes?: number;
}) {
  const dedupeMinutes = input.dedupeMinutes ?? 10;
  await query(
    `INSERT INTO alerts
       (site_id, severity, code, vendor, event_name, message, root_cause, fix_steps, page_url, raw)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM alerts
         WHERE site_id = $1 AND code = $3 AND COALESCE(vendor, '') = COALESCE($4, '')
           AND COALESCE(event_name, '') = COALESCE($5, '') AND COALESCE(page_url, '') = COALESCE($9, '')
           AND resolved = false AND created_at >= NOW() - ($11 * INTERVAL '1 minute')
      )`,
    [
      input.siteId,
      input.severity,
      input.code,
      input.vendor,
      input.eventName,
      input.message,
      input.rootCause,
      JSON.stringify(input.fixSteps),
      input.pageUrl || null,
      JSON.stringify(input.raw),
      dedupeMinutes,
    ]
  );
}

function getNestedCurrency(params: Record<string, any>) {
  const candidates = [
    params.currency,
    params.ep?.currency,
    params.ecommerce?.currency,
    params.items?.[0]?.currency,
  ];
  return firstValue(...candidates);
}

async function checkPurchaseCurrency(event: ParsedEvent) {
  if (event.vendor !== 'ga4' || event.eventName !== 'purchase' || getNestedCurrency(event.params)) return;
  await createAlert({
    siteId: event.siteId,
    severity: 'critical',
    code: 'missing_purchase_currency',
    vendor: event.vendor,
    eventName: event.eventName,
    message: 'Purchase event is missing a currency parameter.',
    rootCause: 'GA4 received a purchase without currency at params.currency, ep.currency, ecommerce.currency, or items[0].currency.',
    fixSteps: ['Add currency to the purchase event in GTM or gtag.', 'Use a three-letter ISO 4217 code such as USD or EUR.', 'Verify the same currency is sent on every purchase path.'],
    pageUrl: event.pageUrl,
    raw: { eventId: event.eventId, params: event.params },
    dedupeMinutes: 10,
  });
}

async function trackFirstSeenCustomEvent(event: ParsedEvent) {
  if (classifyEvent(event.eventName) !== 'custom' || !event.eventName) return;
  const result = await query(
    `INSERT INTO custom_events_seen (site_id, event_name)
     VALUES ($1, $2)
     ON CONFLICT (site_id, event_name) DO NOTHING
     RETURNING event_name`,
    [event.siteId, event.eventName]
  );
  if (!result.rows[0]) return;
  await createAlert({
    siteId: event.siteId,
    severity: 'info',
    code: 'custom_event_first_seen',
    vendor: event.vendor,
    eventName: event.eventName,
    message: `New custom event detected: ${event.eventName}.`,
    rootCause: 'This event name is not in the standard GA4 event list and may need explicit registration or validation.',
    fixSteps: ['Confirm the event is intentional.', 'Register it in your analytics documentation and downstream destinations.', 'Add required parameters and validation rules if it represents a conversion.'],
    pageUrl: event.pageUrl,
    raw: { eventId: event.eventId, params: event.params },
    dedupeMinutes: 60 * 24 * 365,
  });
}

export async function runDetection(event: ParsedEvent) {
  try {
    const duplicate = await checkDuplicateEvent(event);
    if (duplicate) {
      await createAlert({
        siteId: event.siteId,
        severity: 'warning',
        code: 'duplicate_event',
        vendor: event.vendor,
        eventName: event.eventName,
        message: `${event.eventName} fired more than once within three seconds.`,
        rootCause: classifyDuplicateRootCause(event, duplicate),
        fixSteps: ['Check whether the event is configured in both GTM and direct code.', 'Check whether multiple GTM tags fire from the same trigger.', 'Check whether a vendor SDK and GTM are both sending the event.'],
        pageUrl: event.pageUrl,
        raw: { eventId: event.eventId, duplicateOf: duplicate.id, source: event.source, dlPushIndex: event.dlPushIndex, params: event.params },
        dedupeMinutes: 10,
      });
    }
    await checkPurchaseCurrency(event);
    await trackFirstSeenCustomEvent(event);
  } catch (error) {
    console.error('Detection error:', error);
  }
}
