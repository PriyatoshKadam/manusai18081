export type FlatParameter = { name: string; value: unknown };

const EMPTY_STRINGS = new Set(['', 'undefined', 'null', 'nan', '(not set)', '[object object]']);

export function isEmptyParameterValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return EMPTY_STRINGS.has(normalized) || /^\{\{.*\}\}$/.test(normalized);
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function observedValueType(value: unknown): 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

/**
 * Flatten nested vendor payload objects into exact dotted paths while leaving
 * arrays intact (items/contents must remain arrays for type validation).
 * Flat network keys such as "cd[value]" and "epn.value" stay unchanged.
 */
export function flattenParameterValues(input: unknown): FlatParameter[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  const out: FlatParameter[] = [];
  const visit = (value: unknown, path: string) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length && path) out.push({ name: path, value });
      for (const [key, child] of entries) visit(child, path ? path + '.' + key : key);
      return;
    }
    if (path) out.push({ name: path, value });
  };
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) visit(value, key);
  return out;
}

export function logicalOccurrenceKey(row: Record<string, any>): string {
  const session = String(row.session_id || row.client_id || '').trim();
  const occurrence = String(row.occurrence_id || '').trim();
  if (session && occurrence) return session + ':' + occurrence;
  const networkOccurrence = String(row.network_occurrence_id || '').trim();
  if (networkOccurrence) return 'network:' + networkOccurrence;
  const signature = String(row.request_signature || '').trim();
  if (signature && row.page_url && row.received_at) {
    const ts = new Date(String(row.received_at)).getTime();
    if (Number.isFinite(ts)) return 'sig:' + signature + ':' + String(row.page_url) + ':' + Math.floor(ts / 5000);
  }
  return 'row:' + String(row.id ?? row.received_at ?? 'unknown');
}

/** A single row is an observed network delivery; don't collapse two real request rows merely because their payloads match. */
export function logicalDeliveryKey(row: Record<string, any>): string {
  const networkOccurrence = String(row.network_occurrence_id || '').trim();
  return networkOccurrence ? 'network:' + networkOccurrence : 'row:' + String(row.id ?? row.received_at ?? 'unknown');
}

export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}
