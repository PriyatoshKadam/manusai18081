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
  observationKind?: string | null;
  sessionId?: string | null;
  occurrenceId?: string | null;
  networkOccurrenceId?: string | null;
  requestSignature?: string | null;
  transport?: string | null;
  gtmContainerId?: string | null;
  navigationId?: string | null;
}

type DuplicateMatch = ParsedEvent & { id: number };

const AUTOMATIC_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'user_engagement', 'session_start', 'first_visit',
  'file_download', 'view_search_results', 'video_start', 'video_progress', 'video_complete',
]);
const INTERNAL_EVENTS = new Set(['exception', 'debug', 'monitor_event', 'monitor_ready']);
const EXPECTED_REPEAT_EVENTS = new Set(['scroll', 'user_engagement', 'click', 'video_progress']);
const REPEAT_SENSITIVE_EVENTS = new Set(['login', 'sign_up', 'purchase', 'begin_checkout', 'generate_lead', 'subscribe']);

export function classifyEvent(eventName: string | null, vendor?: string | null): string {
  if (vendor && vendor.toLowerCase() === 'gtm') return 'internal';
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
    for (const key of ['_gl', '_ga', '_gac', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id']) parsed.searchParams.delete(key);
    return parsed.href;
  } catch {
    return url.split('#')[0];
  }
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
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
    event.transactionId, params.transaction_id, params.transactionId, params['ep.transaction_id'],
    params['epn.transaction_id'], params.ecommerce?.transaction_id, params.ecommerce?.transactionId,
  );
  if (transactionId) return `transaction:${String(transactionId)}`;
  const eventId = firstValue(params.event_id, params.eventId, params.eventID, params['ep.event_id'], params['epn.event_id']);
  return eventId ? `event_id:${String(eventId)}` : null;
}

export function getEventIdentity(event: ParsedEvent): string | null {
  const strong = getStrongIdentity(event);
  if (strong) return `strong:${strong.replace(/^[^:]+:/, '')}`;
  if (event.sessionId && event.occurrenceId) return `occurrence:${event.sessionId}:${event.occurrenceId}`;
  if (event.requestSignature) return `request:${event.requestSignature}`;
  return null;
}

function stableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableValue).sort().join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value as object).sort().map((key) => `${key}:${stableValue((value as Record<string, unknown>)[key])}`).join('|')}}`;
  return String(value);
}

function paramsSignature(params: Record<string, any> = {}) {
  const ignored = new Set(['_p', '_s', 'sid', 'sct', 'seg', 'dt', 'dr', 'dl', 'ep.debug_mode']);
  return Object.keys(params).filter((key) => !ignored.has(key)).sort().map((key) => `${key}=${stableValue(params[key])}`).join('&').slice(0, 1200);
}

function normalizeRawUrl(rawUrl: string | null): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    for (const key of ['_p', '_s', 'tfd', '_et', '_tu', '_eu', 'rcb', 'gcs', 'gcd', 'gcu', 'gcut', 'tag_exp', 'richsstsse', 'attribution-reporting-eligible', 'sst.rnd', 'sst.tft', 'sst.lpc', 'sst.navt', 'sst.ude', 'sst.syn', 'sst.sw_exp', 'ecid', 'cid', 'sid', 'sct', 'seg', '_fplc', 'uaa', 'uab', 'uafvl', 'ul', 'sr']) parsed.searchParams.delete(key);
    const entries = Array.from(parsed.searchParams.entries()).sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
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

function sameStrongIdentity(current: ParsedEvent, previous: ParsedEvent): boolean {
  const currentIdentity = getStrongIdentity(current);
  return !!currentIdentity && currentIdentity === getStrongIdentity(previous);
}

function sameOccurrence(current: ParsedEvent, previous: ParsedEvent) {
  return !!current.sessionId && !!current.occurrenceId && current.sessionId === previous.sessionId && current.occurrenceId === previous.occurrenceId;
}

function sameSession(current: ParsedEvent, previous: ParsedEvent) {
  return !!current.sessionId && current.sessionId === previous.sessionId;
}

export function classifyDuplicateRootCause(current: ParsedEvent, previous: Pick<DuplicateMatch, 'id' | 'dlPushIndex' | 'source' | 'rawUrl'>): string {
  if (current.dlPushIndex !== null && previous.dlPushIndex !== null && current.dlPushIndex !== previous.dlPushIndex) {
    return 'Multiple dataLayer pushes contain the same event. Check whether GTM is pushing the event twice or two triggers respond to the same site action.';
  }
  if (current.source && previous.source && current.source !== previous.source) {
    return `The same event was observed through multiple transports (${previous.source} and ${current.source}). Check GTM against direct gtag/code implementations.`;
  }
  if (sameNormalizedRequest(current.rawUrl, previous.rawUrl)) return 'The same analytics network request signature was observed more than once; check duplicated tags or a retry loop.';
  if (current.dlPushIndex !== null && current.dlPushIndex === previous.dlPushIndex) return 'One dataLayer push produced multiple analytics requests. Check duplicate GTM tags or triggers.';
  return 'The same deterministic analytics event identity was observed more than once in one browser session.';
}

async function findRecentCandidates(event: ParsedEvent, windowSeconds: number) {
  const pageUrl = normalizePageUrl(event.pageUrl || '');
  const crossNavigation = REPEAT_SENSITIVE_EVENTS.has((event.eventName || '').trim().toLowerCase());
  const result = await query(
    `SELECT id, dl_push_index, source, raw_url, page_url, client_id, params, received_at,
            observation_kind, session_id, occurrence_id, network_occurrence_id,
            request_signature, transport, gtm_container_id, navigation_id
       FROM events
      WHERE site_id = $1
        AND vendor = $2
        AND LOWER(COALESCE(event_name, '')) = $3
        AND id <> $4
        AND received_at >= NOW() - ($5 * INTERVAL '1 second')
        AND ($6::boolean OR COALESCE(page_url, '') = $7)
        AND ($8::text IS NULL OR session_id = $8)
      ORDER BY received_at DESC
      LIMIT 100`,
    [event.siteId, event.vendor, (event.eventName || '').trim().toLowerCase(), event.eventId, windowSeconds, crossNavigation, pageUrl, event.sessionId || null],
  );
  return result.rows as DuplicateMatch[];
}

function asEvent(row: DuplicateMatch, current: ParsedEvent): DuplicateMatch {
  return {
    ...row,
    id: Number(row.id),
    siteId: current.siteId,
    eventId: Number(row.id),
    receivedAt: row.receivedAt,
    vendor: current.vendor,
    eventName: row.eventName || current.eventName,
    pageUrl: row.pageUrl || '',
    clientId: row.clientId || null,
    params: row.params || {},
    rawUrl: row.rawUrl || '',
    dlPushIndex: row.dlPushIndex === null ? null : Number(row.dlPushIndex),
    source: row.source || null,
    observationKind: row.observationKind || 'network',
    sessionId: row.sessionId || null,
    occurrenceId: row.occurrenceId || null,
    networkOccurrenceId: row.networkOccurrenceId || null,
    requestSignature: row.requestSignature || null,
    transport: row.transport || null,
    gtmContainerId: row.gtmContainerId || null,
    navigationId: row.navigationId || null,
  };
}

export async function checkDuplicateEvent(event: ParsedEvent): Promise<DuplicateMatch | null> {
  if (!event.eventName) return null;
  const eventName = (event.eventName || '').trim().toLowerCase();
  const windowSeconds = REPEAT_SENSITIVE_EVENTS.has(eventName) ? 120 : getStrongIdentity(event) || event.requestSignature ? 30 : 8;
  const rows = await findRecentCandidates(event, windowSeconds);

  for (const raw of rows) {
    const previous = asEvent(raw, event);
    if (sameOccurrence(event, previous)) {
      if (event.observationKind !== previous.observationKind) return null;
      if (event.observationKind === 'network' && event.networkOccurrenceId && event.networkOccurrenceId === previous.networkOccurrenceId) return null;
    }
    if (event.observationKind === 'datalayer' && previous.observationKind === 'datalayer' && sameSession(event, previous)) {
      if (!REPEAT_SENSITIVE_EVENTS.has(eventName) && event.navigationId && previous.navigationId && event.navigationId !== previous.navigationId) continue;
      if (EXPECTED_REPEAT_EVENTS.has(eventName)) continue;
      if (paramsSignature(event.params) === paramsSignature(previous.params)) return previous;
    }
    if (event.requestSignature && previous.requestSignature && event.requestSignature === previous.requestSignature) return previous;
    if (sameNormalizedRequest(event.rawUrl, previous.rawUrl)) return previous;
    if (sameStrongIdentity(event, previous) && sameSession(event, previous)) return previous;
    if (eventName === 'purchase' && sameStrongIdentity(event, previous)) return previous;
  }
  return null;
}

async function createAlert(input: {
  siteId: number;
  severity: string;
  code: string;
  category?: string;
  vendor: string | null;
  eventName: string | null;
  message: string;
  rootCause: string;
  fixSteps: string[];
  pageUrl: string;
  raw: Record<string, unknown>;
  occurrenceCount?: number;
  distinctPushes?: number;
  dedupeMinutes?: number;
}) {
  const dedupeMinutes = input.dedupeMinutes ?? 10;
  await query(
    `INSERT INTO alerts
       (site_id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, page_url, raw, occurrence_count, distinct_pushes)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13
      WHERE NOT EXISTS (
        SELECT 1 FROM alerts
         WHERE site_id = $1 AND code = $3 AND COALESCE(vendor,'') = COALESCE($5,'')
           AND COALESCE(event_name,'') = COALESCE($6,'') AND resolved = false
           AND created_at >= NOW() - ($14 * INTERVAL '1 minute')
      )`,
    [input.siteId, input.severity, input.code, input.category || 'analytics', input.vendor, input.eventName, input.message, input.rootCause, JSON.stringify(input.fixSteps), input.pageUrl || null, JSON.stringify(input.raw), input.occurrenceCount || null, input.distinctPushes || null, dedupeMinutes],
  );
}

function getPurchaseCurrency(params: Record<string, any>) {
  return firstValue(params.currency, params['ep.currency'], params['epn.currency'], params.cu, params.ecommerce?.currency, params.items?.[0]?.currency);
}
function getPurchaseValue(params: Record<string, any>) {
  return firstValue(params.value, params['ep.value'], params['epn.value'], params.ecommerce?.value);
}
function getTransactionId(params: Record<string, any>) {
  return firstValue(params.transaction_id, params.transactionId, params['ep.transaction_id'], params['epn.transaction_id'], params.ecommerce?.transaction_id, params.ecommerce?.transactionId);
}

async function checkPurchase(event: ParsedEvent) {
  if (event.vendor !== 'ga4' || event.eventName?.trim().toLowerCase() !== 'purchase') return;
  const currency = getPurchaseCurrency(event.params);
  const value = getPurchaseValue(event.params);
  const transactionId = getTransactionId(event.params);
  if (!currency) await createAlert({ siteId: event.siteId, severity: 'critical', code: 'missing_purchase_currency', vendor: event.vendor, eventName: event.eventName, message: 'Purchase event is missing a currency parameter.', rootCause: 'GA4 received purchase without currency.', fixSteps: ['Send currency with every purchase event.', 'Use a three-letter ISO 4217 code such as USD, EUR, or INR.', 'Verify currency is present in GTM and direct-code purchase implementations.'], pageUrl: event.pageUrl, raw: { eventId: event.eventId, transactionId: transactionId || null, value: value || null, params: event.params }});
  if (!transactionId) await createAlert({ siteId: event.siteId, severity: 'warning', code: 'missing_purchase_transaction_id', vendor: event.vendor, eventName: event.eventName, message: 'Purchase event is missing transaction_id.', rootCause: 'Without transaction_id, duplicate purchase detection cannot reliably identify the same transaction.', fixSteps: ['Send a unique transaction_id with every purchase.', 'Use the same transaction ID across all purchase implementations.', 'Do not generate a new transaction_id each time the tag fires.'], pageUrl: event.pageUrl, raw: { eventId: event.eventId, value: value || null, currency: currency || null, params: event.params }});
}

async function checkFirstSeenCustomEvent(event: ParsedEvent) {
  if (event.vendor !== 'ga4' || !event.eventName || classifyEvent(event.eventName) !== 'custom') return;
  const result = await query(
    `INSERT INTO custom_events_seen (site_id, event_name, first_seen, last_seen, count)
     VALUES ($1,$2,NOW(),NOW(),1)
     ON CONFLICT (site_id,event_name) DO UPDATE SET last_seen = NOW(), count = custom_events_seen.count + 1
     RETURNING (xmax = 0) AS first_seen`,
    [event.siteId, event.eventName.trim().toLowerCase()],
  );
  if (result.rows[0]?.first_seen) {
    await createAlert({ siteId: event.siteId, severity: 'info', code: 'custom_event_detected', category: 'analytics', vendor: event.vendor, eventName: event.eventName, message: `Custom GA4 event detected: ${event.eventName}.`, rootCause: 'This event is not in GA4\'s recommended standard event list, so validate the GTM event name and parameters.', fixSteps: ['Check the GTM trigger that creates this event.', 'Confirm the event name is intentional and consistent across SPA routes.', 'Open DebugView or Tag Assistant to validate parameters.'], pageUrl: event.pageUrl, raw: { source: event.source, observationKind: event.observationKind, params: event.params }, dedupeMinutes: 60 });
  }
}

async function createGtmAlert(event: ParsedEvent, duplicate: DuplicateMatch) {
  const samePush = event.dlPushIndex !== null && duplicate.dlPushIndex !== null && event.dlPushIndex === duplicate.dlPushIndex;
  const differentSource = !!event.source && !!duplicate.source && event.source !== duplicate.source;
  const code = samePush ? 'gtm_multiple_tags_or_triggers' : differentSource ? 'gtm_gtm_and_direct_implementation' : 'gtm_datalayer_duplicate_push';
  const message = samePush
    ? `${event.eventName} produced multiple analytics observations from one dataLayer push.`
    : differentSource
      ? `${event.eventName} is being sent by more than one implementation path.`
      : `${event.eventName} was pushed repeatedly with the same event payload in one browser session.`;
  await createAlert({
    siteId: event.siteId, severity: 'warning', code, category: 'gtm', vendor: event.vendor, eventName: event.eventName,
    message, rootCause: classifyDuplicateRootCause(event, duplicate), pageUrl: event.pageUrl,
    occurrenceCount: 2, distinctPushes: event.dlPushIndex !== duplicate.dlPushIndex ? 2 : 1,
    fixSteps: [
      'In GTM, open Triggers and confirm only one trigger matches this event name and condition.',
      'Open Tags and check whether multiple GA4 Event tags fire from the same trigger.',
      'Compare the dataLayer push count with the network request count in Tag Assistant.',
      'Check for a direct gtag() or analytics SDK implementation running alongside GTM.',
      'For SPAs, fire page_view and route-specific events only when the route or business action actually changes.',
    ],
    raw: { currentEventId: event.eventId, duplicateEventId: duplicate.id, sessionId: event.sessionId, currentSource: event.source, duplicateSource: duplicate.source, currentDlPushIndex: event.dlPushIndex, duplicateDlPushIndex: duplicate.dlPushIndex, currentOccurrenceId: event.occurrenceId, duplicateOccurrenceId: duplicate.occurrenceId, requestSignature: event.requestSignature },
  });
}

export async function runDetection(event: ParsedEvent) {
  try {
    await checkFirstSeenCustomEvent(event);
    const duplicate = await checkDuplicateEvent(event);
    if (duplicate) {
      if (event.vendor === 'gtm' || duplicate.vendor === 'gtm') {
        await createGtmAlert(event, duplicate);
      } else {
        await createAlert({ siteId: event.siteId, severity: event.eventName?.trim().toLowerCase() === 'purchase' ? 'critical' : 'warning', code: event.observationKind === 'network' ? 'duplicate_network_request' : 'duplicate_event', category: 'analytics', vendor: event.vendor, eventName: event.eventName, message: `${event.eventName} fired more than once with the same deterministic identity.`, rootCause: classifyDuplicateRootCause(event, duplicate), fixSteps: ['Check whether more than one GTM tag or trigger sends this event.', 'Check direct gtag() or vendor SDK implementations.', 'For purchase, verify transaction_id is unique.', 'For SPA page views, compare navigation IDs before treating a repeat as a defect.'], pageUrl: event.pageUrl, raw: { eventId: event.eventId, duplicateOf: duplicate.id, sessionId: event.sessionId, requestSignature: event.requestSignature, transport: event.transport, params: event.params } });
      }
    }
    await checkPurchase(event);
  } catch (error) {
    console.error('Detection error:', error);
  }
}
