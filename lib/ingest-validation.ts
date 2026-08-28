import crypto from 'node:crypto';

const MAX_BODY_BYTES = 512 * 1024;
export const MAX_EVENTS_PER_REQUEST = 100;
const MAX_STRING = 2048;
const MAX_EVENT_NAME = 120;
const MAX_PARAM_KEYS = 80;
const MAX_PARAM_DEPTH = 3;
const SENSITIVE_PARAM_KEY = /(^|[_-])(email|phone|telephone|address|password|passwd|token|access_token|refresh_token|authorization|auth|secret|api_key|user_id|customer_id|client_id|credit_card|card_number|cvv|ssn)([_-]|$)/i;

export function assertBodySize(contentLength: string | null) {
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new Error('Request body is too large');
  }
}

function boundedString(value: unknown, max = MAX_STRING): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  return String(value).slice(0, max);
}

function safeToken(value: unknown, max = 160): string | null {
  const token = boundedString(value, max)?.trim() || '';
  return token && /^[a-zA-Z0-9._:-]+$/.test(token) ? token : null;
}

export function redactTelemetryUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    for (const key of ['apiKey', 'api_key', 'token', 'access_token', 'refresh_token', 'authorization', 'auth', 'password', 'secret', 'session', 'sid', 'cid', 'client_id', 'user_id', 'email', 'phone', 'gclid', 'fbclid', 'msclkid', 'ttclid']) parsed.searchParams.delete(key);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString().slice(0, MAX_STRING);
  } catch { return value.split(/[?#]/, 1)[0].slice(0, MAX_STRING); }
}

function pseudonymize(value: string | null) {
  const secret = process.env.IP_HASH_SECRET?.trim();
  if (!secret || !value) return null;
  return crypto.createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
}

function cleanValue(value: unknown, depth = 0, key = ''): unknown {
  if (key && SENSITIVE_PARAM_KEY.test(key)) return undefined;
  if (depth > MAX_PARAM_DEPTH || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? value.slice(0, MAX_STRING) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => cleanValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== 'object') return null;
  const result: Record<string, unknown> = {};
  for (const [keyName, item] of Object.entries(value).slice(0, MAX_PARAM_KEYS)) {
    const cleaned = cleanValue(item, depth + 1, keyName);
    if (cleaned !== undefined) result[keyName.slice(0, 100)] = cleaned;
  }
  return result;
}

export type NormalizedTelemetryEvent = {
  vendor: string;
  eventName: string | null;
  pageUrl: string | null;
  clientId: string | null;
  params: Record<string, unknown>;
  rawUrl: string | null;
  dlPushIndex: number | null;
  source: string | null;
  originSource: string | null;
  observationKind: string;
  sessionId: string | null;
  occurrenceId: string | null;
  networkOccurrenceId: string | null;
  requestSignature: string | null;
  transport: string | null;
  gtmContainerId: string | null;
  navigationId: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  failureReason: string | null;
  consentState: Record<string, unknown>;
  webVitals: Record<string, unknown>;
  revenueValue: number | null;
  revenueValueStatus: 'missing' | 'valid' | 'invalid';
  revenueCurrency: string | null;
  transactionId: string | null;
  resourceDomain: string | null;
  resourceType: string | null;
  deliveryMode: 'first_party' | 'third_party' | 'unknown';
  isSynthetic: boolean;
};

export function normalizeTelemetryEvent(value: unknown): NormalizedTelemetryEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each event must be an object');
  const event = value as Record<string, unknown>;
  const rawClientId = boundedString(event.clientId, 240);
  const rawParams = cleanValue(event.params || {});
  const params = rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
    ? rawParams as Record<string, unknown>
    : {};
  const rawName = boundedString(event.eventName ?? event.event_name, MAX_EVENT_NAME);
  const eventName = rawName?.trim() || null;
  const rawUrl = boundedString(event.rawUrl);
  if (eventName && !/^[\w.:-]+$/u.test(eventName)) throw new Error('Event name has an invalid format');
  const rawIndex = event.dlPushIndex;
  const dlPushIndex = Number.isSafeInteger(rawIndex) && Number(rawIndex) >= 0 ? Number(rawIndex) : null;
  const rawObservationKind = boundedString(event.observationKind ?? event.kind, 32)?.trim() || 'network';
  const rawStatusCode = Number(event.statusCode);
  const rawLatencyMs = Number(event.latencyMs);
  const rawConsent = cleanValue(event.consentState || {}, 0);
  const rawVitals = cleanValue(event.webVitals || {}, 0);
  const rawRevenueInput = event.revenueValue ?? event.revenue_value ?? params.value ?? params['ep.value'] ?? params['epn.value'];
  const hasRevenueInput = rawRevenueInput !== undefined && rawRevenueInput !== null && String(rawRevenueInput).trim() !== '';
  const rawRevenue = hasRevenueInput ? Number(rawRevenueInput) : NaN;
  const revenueValueStatus: 'missing' | 'valid' | 'invalid' = !hasRevenueInput
    ? 'missing'
    : Number.isFinite(rawRevenue) && rawRevenue >= -1000000000 && rawRevenue <= 1000000000
      ? 'valid'
      : 'invalid';
  const rawCurrency = boundedString(event.revenueCurrency ?? event.revenue_currency ?? params.currency ?? params['ep.currency'], 12)?.trim().toUpperCase() || null;
  const rawTransaction = boundedString(event.transactionId ?? event.transaction_id ?? params.transaction_id ?? params['ep.transaction_id'], 240)?.trim() || null;
  let resourceDomain: string | null = null;
  try { resourceDomain = rawUrl ? new URL(String(rawUrl)).hostname.toLowerCase().slice(0, 255) : null; } catch {}
  const observationKind = safeToken(rawObservationKind, 32) || '';
  const allowedKinds = new Set(['network', 'datalayer', 'gtm', 'function', 'monitor_ready', 'diagnostic']);
  if (!allowedKinds.has(observationKind)) throw new Error('Invalid observation kind');
  return {
    vendor: (boundedString(event.vendor, 40)?.trim().toLowerCase() || 'unknown').replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'unknown',
    eventName,
    pageUrl: redactTelemetryUrl(boundedString(event.pageUrl)),
    clientId: pseudonymize(rawClientId),
    params,
    rawUrl: redactTelemetryUrl(rawUrl),
    dlPushIndex,
    source: safeToken(event.source, 40),
    originSource: safeToken(event.originSource ?? event.origin_source, 40),
    observationKind,
    sessionId: safeToken(event.sessionId, 128),
    occurrenceId: safeToken(event.occurrenceId, 160),
    networkOccurrenceId: safeToken(event.networkOccurrenceId, 160),
    requestSignature: boundedString(event.requestSignature, 512),
    transport: safeToken(event.transport, 40),
    gtmContainerId: safeToken(event.gtmContainerId, 40),
    navigationId: safeToken(event.navigationId, 160),
    statusCode: Number.isInteger(rawStatusCode) && rawStatusCode >= 0 && rawStatusCode <= 999 ? rawStatusCode : null,
    latencyMs: Number.isFinite(rawLatencyMs) && rawLatencyMs >= 0 && rawLatencyMs <= 120000 ? Math.round(rawLatencyMs) : null,
    failureReason: boundedString(event.failureReason, 240),
    consentState: rawConsent && typeof rawConsent === 'object' && !Array.isArray(rawConsent) ? rawConsent as Record<string, unknown> : {},
    webVitals: rawVitals && typeof rawVitals === 'object' && !Array.isArray(rawVitals) ? rawVitals as Record<string, unknown> : {},
    revenueValue: revenueValueStatus === 'valid' ? rawRevenue : null,
    revenueValueStatus,
    revenueCurrency: rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null,
    transactionId: rawTransaction,
    resourceDomain,
    resourceType: boundedString(event.resourceType ?? event.resource_type, 80)?.trim() || null,
    deliveryMode: event.deliveryMode === 'first_party' || event.deliveryMode === 'third_party' ? event.deliveryMode : 'unknown',
    isSynthetic: event.isSynthetic === true || event.is_synthetic === true,
  };
}

export function parseIngestBody(raw: string) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('Request body is too large');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  const value = body as Record<string, unknown>;
  const apiKey = boundedString(value.apiKey, 128)?.trim() || '';
  if (!/^[a-f0-9]{48,64}$/i.test(apiKey)) throw new Error('Invalid API key');
  if (!Array.isArray(value.events) || value.events.length === 0) throw new Error('Events must be a non-empty array');
  if (value.events.length > MAX_EVENTS_PER_REQUEST) throw new Error(`A maximum of ${MAX_EVENTS_PER_REQUEST} events may be sent at once`);
  const events = value.events.map((item) => {
    try { return normalizeTelemetryEvent(item); } catch { return null; }
  }).filter((event): event is NormalizedTelemetryEvent => Boolean(event));
  if (!events.length) throw new Error('Events must include at least one valid event');
  return { apiKey, events };
}
