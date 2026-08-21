export function isInternalCorrelationNoise(method: string | null | undefined, eventName: string | null | undefined, confidence: string | null | undefined) {
  if (confidence !== 'correlation_gap' || method !== 'ga4_event_unmatched') return false;
  return /^(?:gtm(?:\.|$)|termly\.|userPrefUpdate$)/i.test(String(eventName || '').trim());
}
