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
  measurementId?: string | null;
  transactionId?: string | null;
  dataLayerMatched?: boolean;
}

type DuplicateMatch = {
  id: number;
  dlPushIndex: number | null;
  source: string | null;
  rawUrl: string | null;
  pageUrl: string | null;
  clientId: string | null;
  params: Record<string, any>;
  receivedAt: Date | string;
};

const AUTOMATIC_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'user_engagement',
  'session_start', 'first_visit', 'file_download',
  'view_search_results', 'video_start', 'video_progress',
  'video_complete',
]);

const INTERNAL_EVENTS = new Set(['exception', 'debug', 'monitor_event']);

/* These are naturally repeatable. Repetition alone is never a defect. */
const NEVER_DUPLICATE_WARN_EVENTS = new Set([
  'scroll',
  'user_engagement',
]);

export function classifyEvent(eventName: string | null): string {
  if (!eventName) return 'unknown';
  const normalized = eventName.trim().toLowerCase();
  if (AUTOMATIC_EVENTS.has(normalized)) return 'standard';
  if (INTERNAL_EVENTS.has(normalized)) return 'internal';
  return 'custom';
}

export function normalizePageUrl(url: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [
      '_gl', '_ga', '_gac', 'gclid', 'fbclid', 'msclkid',
      'ttclid', 'twclid', 'li_fat_id',
    ]) {
      parsed.searchParams.delete(key);
    }
    return parsed.href;
  } catch {
    return url.split('#')[0];
  }
}

function firstValue(...values: unknown[]) {
  return values.find(
    value => value !== undefined && value !== null && String(value).trim() !== ''
  );
}

function getParam(params: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

export function getStrongIdentity(event: ParsedEvent): string | null {
  const params = event.params || {};
  const transactionId = firstValue(
    event.transactionId,
    params.transaction_id,
    params.transactionId,
    params['ep.transaction_id'],
    params['epn.transaction_id'],
    params.ecommerce?.transaction_id,
    params.ecommerce?.transactionId,
  );
  if (transactionId) return `transaction:${String(transactionId)}`;

  const eventId = firstValue(
    params.event_id,
    params.eventId,
    params.eventID,
    params['ep.event_id'],
    params['epn.event_id'],
  );
  if (eventId) return `event_id:${String(eventId)}`;

  return null;
}

/*
 * Build a deterministic GA4 request signature.
 * We remove request/session values that change on every send,
 * but retain event name, measurement ID and event parameters.
 */
function normalizeRawUrl(rawUrl: string | null): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    for (const key of [
      '_p', '_s', 'tfd', '_et', '_tu', '_eu', 'rcb',
      'gcs', 'gcd', 'gcu', 'gcut', 'tag_exp', 'richsstsse',
      'attribution-reporting-eligible',
      'sst.rnd', 'sst.tft', 'sst.lpc', 'sst.navt', 'sst.ude',
      'sst.syn', 'sst.sw_exp',
    ]) {
      parsed.searchParams.delete(key);
    }
    const entries = Array.from(parsed.searchParams.entries()).sort(
      ([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv)
    );
    parsed.search = '';
    for (const [key, value] of entries) parsed.searchParams.append(key, value);
    return parsed.href;
  } catch {
    return rawUrl;
  }
}

function sameNormalizedRequest(a: string | null, b: string | null): boolean {
  const left = normalizeRawUrl(a);
  const right = normalizeRawUrl(b);
  return !!left && !!right && left === right;
}

function sameDataLayerPush(current: ParsedEvent, previous: DuplicateMatch): boolean {
  return (
    current.dlPushIndex !== null &&
    previous.dlPushIndex !== null &&
    current.dlPushIndex === previous.dlPushIndex
  );
}

function sameStrongIdentity(current: ParsedEvent, previous: ParsedEvent): boolean {
  const currentIdentity = getStrongIdentity(current);
  return !!currentIdentity && currentIdentity === getStrongIdentity(previous);
}

export function classifyDuplicateRootCause(
  current: ParsedEvent,
  previous: DuplicateMatch
): string {
  if (sameDataLayerPush(current, previous)) {
    return 'One dataLayer push produced multiple analytics requests. Check duplicate GTM tags/triggers or GTM plus direct analytics code.';
  }

  if (current.source && previous.source && current.source !== previous.source) {
    return `The same event was observed through multiple transports (${previous.source} and ${current.source}). Check for multiple analytics implementations.`;
  }

  if (sameNormalizedRequest(current.rawUrl, previous.rawUrl)) {
    return 'The same analytics network request signature was sent more than once.';
  }

  if (current.clientId && previous.clientId && current.clientId !== previous.clientId) {
    return 'The same deterministic event was sent with different analytics client identifiers.';
  }

  return 'The same deterministic analytics event identity was observed more than once.';
}

async function findRecentCandidates(event: ParsedEvent, windowSeconds: number) {
  const pageUrl = normalizePageUrl(event.pageUrl || '');
  const result = await query(
    `SELECT id, dl_push_index, source, raw_url, page_url, client_id, params, received_at
       FROM events
      WHERE site_id = $1
        AND vendor = $2
        AND LOWER(event_name) = $3
        AND id <> $4
        AND received_at >= NOW() - ($5 * INTERVAL '1 second')
        AND COALESCE(page_url, '') = $6
      ORDER BY received_at DESC
      LIMIT 100`,
    [event.siteId, event.vendor, event.eventName!.trim().toLowerCase(), event.eventId, windowSeconds, pageUrl]
  );
  return result.rows;
}

export async function checkDuplicateEvent(event: ParsedEvent): Promise<DuplicateMatch | null> {
  if (!event.eventName) return null;

  const eventName = event.eventName.trim().toLowerCase();

  /*
   * CRITICAL: these events are expected to repeat.
   * Never produce a duplicate warning just because their names repeat.
   */
  if (NEVER_DUPLICATE_WARN_EVENTS.has(eventName)) return null;

  /*
   * We only warn when we can prove identity using:
   * 1. transaction_id/event_id
   * 2. identical normalized GA4 network request
   * 3. identical dataLayer push index
   *
   * We deliberately do NOT use eventName + page + time as a
   * fallback. That was the source of the false page_view/run_audit
   * style warnings.
   */
  const strongIdentity = getStrongIdentity(event);
  const windowSeconds = strongIdentity || eventName === 'purchase' || eventName === 'refund' ? 30 : 5;
  const rows = await findRecentCandidates(event, windowSeconds);

  for (const row of rows) {
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

    if (strongIdentity && sameStrongIdentity(event, previous)) {
      return {
        id: Number(row.id),
        dlPushIndex: previous.dlPushIndex,
        source: previous.source,
        rawUrl: previous.rawUrl,
        pageUrl: previous.pageUrl,
        clientId: previous.clientId,
        params: previous.params,
        receivedAt: previous.receivedAt,
      };
    }

    if (sameNormalizedRequest(event.rawUrl, previous.rawUrl)) {
      return {
        id: Number(row.id),
        dlPushIndex: previous.dlPushIndex,
        source: previous.source,
        rawUrl: previous.rawUrl,
        pageUrl: previous.pageUrl,
        clientId: previous.clientId,
        params: previous.params,
        receivedAt: previous.receivedAt,
      };
    }

    if (sameDataLayerPush(event, {
      id: Number(row.id),
      dlPushIndex: previous.dlPushIndex,
      source: previous.source,
      rawUrl: previous.rawUrl,
      pageUrl: previous.pageUrl,
      clientId: previous.clientId,
      params: previous.params,
      receivedAt: previous.receivedAt,
    })) {
      return {
        id: Number(row.id),
        dlPushIndex: previous.dlPushIndex,
        source: previous.source,
        rawUrl: previous.rawUrl,
        pageUrl: previous.pageUrl,
        clientId: previous.clientId,
        params: previous.params,
        receivedAt: previous.receivedAt,
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
         WHERE site_id = $1
           AND code = $3
           AND COALESCE(vendor,'') = COALESCE($4,'')
           AND COALESCE(event_name,'') = COALESCE($5,'')
           AND COALESCE(page_url,'') = COALESCE($9,'')
           AND resolved = false
           AND created_at >= NOW() - ($11 * INTERVAL '1 minute')
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

function getPurchaseCurrency(params: Record<string, any>) {
  return firstValue(
    params.currency,
    params['ep.currency'],
    params['epn.currency'],
    params.cu,
    params.ecommerce?.currency,
    params.items?.[0]?.currency,
  );
}

function getPurchaseValue(params: Record<string, any>) {
  return firstValue(
    params.value,
    params['ep.value'],
    params['epn.value'],
    params.ecommerce?.value,
  );
}

function getTransactionId(params: Record<string, any>) {
  return firstValue(
    params.transaction_id,
    params.transactionId,
    params['ep.transaction_id'],
    params['epn.transaction_id'],
    params.ecommerce?.transaction_id,
    params.ecommerce?.transactionId,
  );
}

async function checkPurchase(event: ParsedEvent) {
  if (event.vendor !== 'ga4' || event.eventName?.trim().toLowerCase() !== 'purchase') return;

  const currency = getPurchaseCurrency(event.params);
  const value = getPurchaseValue(event.params);
  const transactionId = getTransactionId(event.params);

  /* Currency is accepted from cu, ep.currency, epn.currency, or ecommerce.currency. */
  if (!currency) {
    await createAlert({
      siteId: event.siteId,
      severity: 'critical',
      code: 'missing_purchase_currency',
      vendor: event.vendor,
      eventName: event.eventName,
      message: 'Purchase event is missing a currency parameter.',
      rootCause: 'GA4 received purchase without currency.',
      fixSteps: [
        'Send currency with the purchase event.',
        'Use a three-letter ISO 4217 code such as USD, EUR, or INR.',
        'Verify currency is present on every purchase implementation.',
      ],
      pageUrl: event.pageUrl,
      raw: { eventId: event.eventId, transactionId: transactionId || null, value: value || null, params: event.params },
    });
  }

  if (!transactionId) {
    await createAlert({
      siteId: event.siteId,
      severity: 'warning',
      code: 'missing_purchase_transaction_id',
      vendor: event.vendor,
      eventName: event.eventName,
      message: 'Purchase event is missing transaction_id.',
      rootCause: 'Without transaction_id, duplicate purchase detection cannot reliably identify the same transaction.',
      fixSteps: [
        'Send a unique transaction_id with every purchase.',
        'Use the same transaction ID across all purchase implementations.',
        'Do not generate a new transaction_id each time the tag fires.',
      ],
      pageUrl: event.pageUrl,
      raw: { eventId: event.eventId, value: value || null, currency: currency || null, params: event.params },
    });
  }
}

export async function runDetection(event: ParsedEvent) {
  try {
    const duplicate = await checkDuplicateEvent(event);

    if (duplicate) {
      await createAlert({
        siteId: event.siteId,
        severity: event.eventName?.trim().toLowerCase() === 'purchase' ? 'critical' : 'warning',
        code: 'duplicate_event',
        vendor: event.vendor,
        eventName: event.eventName,
        message: `${event.eventName} fired more than once with the same deterministic identity.`,
        rootCause: classifyDuplicateRootCause(event, duplicate),
        fixSteps: [
          'Check whether the event is implemented in both GTM and direct code.',
          'Check whether multiple GTM tags fire from the same trigger.',
          'Check whether a vendor SDK and GTM are both sending the event.',
          'For purchase, verify transaction_id is unique.',
          'For page_view, verify only one implementation sends the same page-view request.',
        ],
        pageUrl: event.pageUrl,
        raw: {
          eventId: event.eventId,
          duplicateOf: duplicate.id,
          vendor: event.vendor,
          eventName: event.eventName,
          source: event.source,
          duplicateSource: duplicate.source,
          dlPushIndex: event.dlPushIndex,
          duplicateDlPushIndex: duplicate.dlPushIndex,
          rawUrl: event.rawUrl,
          duplicateRawUrl: duplicate.rawUrl,
          transactionId: getTransactionId(event.params) || null,
          params: event.params,
        },
      });
    }

    await checkPurchase(event);
  } catch (error) {
    console.error('Detection error:', error);
  }
}
