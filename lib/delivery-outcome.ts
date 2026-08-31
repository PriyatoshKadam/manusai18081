export type DeliveryOutcome =
  | 'delivered'
  | 'http_error'
  | 'network_error'
  | 'aborted'
  | 'timeout'
  | 'blocked'
  | 'beacon_rejected'
  | 'unknown';

export type DeliveryEvidence = {
  observationKind?: string | null;
  transport?: string | null;
  statusCode?: number | null;
  failureReason?: string | null;
  beaconAccepted?: boolean | null;
  explicitBlockSignal?: boolean | null;
};

export function isDeliveryObservation(event: DeliveryEvidence) {
  return event.observationKind === 'network' && event.transport !== 'performance';
}

export function classifyDeliveryOutcome(event: DeliveryEvidence): DeliveryOutcome {
  if (event.explicitBlockSignal) return 'blocked';
  if (event.beaconAccepted === false || event.failureReason === 'beacon_rejected') return 'beacon_rejected';
  const reason = String(event.failureReason || '').trim().toLowerCase();
  if (/blocked|err_blocked_by_client|tracker_block/.test(reason)) return 'blocked';
  if (event.statusCode !== null && event.statusCode !== undefined && Number(event.statusCode) >= 200 && Number(event.statusCode) < 400 && !reason) return 'delivered';
  if (event.statusCode !== null && event.statusCode !== undefined && Number(event.statusCode) >= 400) return 'http_error';
  if (reason === 'network_error' || reason === 'cors_error' || reason === 'failed_to_fetch') return 'network_error';
  if (reason === 'aborted' || reason === 'aborterror') return 'aborted';
  if (reason === 'timeout' || reason === 'timed_out') return 'timeout';
  return 'unknown';
}

export function isConfirmedDeliveryFailure(outcome: DeliveryOutcome) {
  return outcome === 'http_error' || outcome === 'blocked' || outcome === 'beacon_rejected';
}

export function isTransportAnomaly(outcome: DeliveryOutcome) {
  return outcome === 'network_error' || outcome === 'aborted' || outcome === 'timeout' || outcome === 'unknown';
}

export function isSuccessfulDelivery(outcome: DeliveryOutcome) {
  return outcome === 'delivered';
}

export function deliveryOutcomeLabel(outcome: DeliveryOutcome) {
  switch (outcome) {
    case 'delivered': return 'Delivery observed';
    case 'http_error': return 'HTTP error response';
    case 'network_error': return 'Browser network error';
    case 'aborted': return 'Request was aborted';
    case 'timeout': return 'Request timed out';
    case 'blocked': return 'Browser reported blocked';
    case 'beacon_rejected': return 'Beacon was not accepted';
    default: return 'Delivery not confirmed';
  }
}
