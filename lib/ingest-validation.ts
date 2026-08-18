const MAX_BODY_BYTES = 512 * 1024;
export const MAX_EVENTS_PER_REQUEST = 100;
const MAX_STRING = 2048;
const MAX_EVENT_NAME = 120;
const MAX_PARAM_KEYS = 80;
const MAX_PARAM_DEPTH = 3;

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

function cleanValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_PARAM_DEPTH || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? value.slice(0, MAX_STRING) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => cleanValue(item, depth + 1));
  if (typeof value !== 'object') return null;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_PARAM_KEYS)) {
    result[key.slice(0, 100)] = cleanValue(item, depth + 1);
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
  observationKind: string;
  sessionId: string | null;
  occurrenceId: string | null;
  networkOccurrenceId: string | null;
  requestSignature: string | null;
  transport: string | null;
  gtmContainerId: string | null;
  navigationId: string | null;
};

export function normalizeTelemetryEvent(value: unknown): NormalizedTelemetryEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each event must be an object');
  const event = value as Record<string, unknown>;
  const rawParams = cleanValue(event.params || {});
  const params = rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
    ? rawParams as Record<string, unknown>
    : {};
  const rawName = boundedString(event.eventName ?? event.event_name, MAX_EVENT_NAME);
  const eventName = rawName?.trim() || null;
  if (eventName && !/^[\w.:-]+$/u.test(eventName)) throw new Error('Event name has an invalid format');
  const rawIndex = event.dlPushIndex;
  const dlPushIndex = Number.isSafeInteger(rawIndex) && Number(rawIndex) >= 0 ? Number(rawIndex) : null;
  const rawObservationKind = boundedString(event.observationKind ?? event.kind, 32)?.trim() || 'network';
  const observationKind = safeToken(rawObservationKind, 32) || '';
  const allowedKinds = new Set(['network', 'datalayer', 'gtm', 'monitor_ready', 'diagnostic']);
  if (!allowedKinds.has(observationKind)) throw new Error('Invalid observation kind');
  return {
    vendor: (boundedString(event.vendor, 40)?.trim().toLowerCase() || 'unknown').replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'unknown',
    eventName,
    pageUrl: boundedString(event.pageUrl),
    clientId: boundedString(event.clientId, 240),
    params,
    rawUrl: boundedString(event.rawUrl),
    dlPushIndex,
    source: safeToken(event.source, 40),
    observationKind,
    sessionId: safeToken(event.sessionId, 128),
    occurrenceId: safeToken(event.occurrenceId, 160),
    networkOccurrenceId: safeToken(event.networkOccurrenceId, 160),
    requestSignature: boundedString(event.requestSignature, 512),
    transport: safeToken(event.transport, 40),
    gtmContainerId: safeToken(event.gtmContainerId, 40),
    navigationId: safeToken(event.navigationId, 160),
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
  return { apiKey, events: value.events.map(normalizeTelemetryEvent) };
}
