const INTERNAL_EVENT_PATTERN = /^(?:gtm(?:\.|$)|termly\.|userprefupdate$)/i;

/**
 * These are lifecycle/configuration events, not customer analytics events.
 * A missing matching GA4 request for them is expected and must never be
 * presented as evidence of ad blocking or collector failure.
 */
export function isInternalCorrelationNoise(
  method: string | null | undefined,
  eventName: string | null | undefined,
  _confidence?: string | null | undefined,
) {
  if (method !== 'ga4_event_unmatched') return false;
  return INTERNAL_EVENT_PATTERN.test(String(eventName || '').trim());
}

/** SQL predicate used by server-side reporting queries. */
export const INTERNAL_CORRELATION_NOISE_SQL = `(
  detection_method = 'ga4_event_unmatched'
  AND (
    event_name ILIKE 'gtm.%'
    OR event_name ILIKE 'termly.%'
    OR lower(trim(coalesce(event_name, ''))) = 'userprefupdate'
  )
)`;

export const ACTIONABLE_BLOCKER_CONFIDENCES = "'confirmed', 'likely'";
