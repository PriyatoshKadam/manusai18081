import { query } from './db';

export type DuplicateProof =
  | 'same_transaction_id'
  | 'same_event_id'
  | 'same_occurrence_multiple_deliveries'
  | 'same_request_distinct_deliveries'
  | 'different_transaction_ids'
  | 'different_event_ids'
  | 'insufficient_evidence';

const DUPLICATE_CODES = new Set([
  'duplicate_purchase',
  'duplicate_event',
  'duplicate_page_view',
  'gtm_multiple_tags_or_triggers',
  'gtm_and_direct_implementation',
]);

const HIGH_VALUE_EVENTS = new Set([
  'purchase',
  'refund',
  'login',
  'sign_up',
  'generate_lead',
  'subscribe',
  'lead',
  'conversion',
]);

function nonEmpty(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function transactionId(params: Record<string, any> = {}, explicit?: unknown): string | null {
  return nonEmpty(explicit)
    || nonEmpty(params.transaction_id)
    || nonEmpty(params.transactionId)
    || nonEmpty(params['ep.transaction_id'])
    || nonEmpty(params['epn.transaction_id'])
    || nonEmpty(params.ecommerce?.transaction_id)
    || nonEmpty(params.ecommerce?.transactionId);
}

function eventId(params: Record<string, any> = {}): string | null {
  return nonEmpty(params.event_id)
    || nonEmpty(params.eventId)
    || nonEmpty(params.eventID)
    || nonEmpty(params['ep.event_id'])
    || nonEmpty(params['epn.event_id']);
}

export function classifyDuplicateProof(input: {
  eventName?: string | null;
  currentParams?: Record<string, any>;
  previousParams?: Record<string, any>;
  currentTransactionId?: string | null;
  previousTransactionId?: string | null;
  currentEventId?: string | null;
  previousEventId?: string | null;
  sameOccurrence?: boolean;
  deliveredNetworkCount?: number;
  sameRequestSignature?: boolean;
}): DuplicateProof {
  const currentTx = transactionId(input.currentParams, input.currentTransactionId);
  const previousTx = transactionId(input.previousParams, input.previousTransactionId);
  if (currentTx && previousTx && currentTx === previousTx) return 'same_transaction_id';
  if (currentTx && previousTx && currentTx !== previousTx) return 'different_transaction_ids';

  const currentEvent = eventId(input.currentParams) || nonEmpty(input.currentEventId);
  const previousEvent = eventId(input.previousParams) || nonEmpty(input.previousEventId);
  if (currentEvent && previousEvent && currentEvent === previousEvent) return 'same_event_id';
  if (currentEvent && previousEvent && currentEvent !== previousEvent) return 'different_event_ids';

  if (input.sameOccurrence && Number(input.deliveredNetworkCount || 0) >= 2) return 'same_occurrence_multiple_deliveries';
  if (input.sameRequestSignature && Number(input.deliveredNetworkCount || 0) >= 2) return 'same_request_distinct_deliveries';
  return 'insufficient_evidence';
}

function highValue(name: string | null): boolean {
  return HIGH_VALUE_EVENTS.has(String(name || '').trim().toLowerCase());
}

/**
 * A legacy duplicate alert is allowed to remain only when the evidence can
 * support the claim. This is deliberately stricter than the real-time scorer:
 * the gate is the last line before an alert becomes user-facing truth.
 */
export function shouldKeepDuplicateAlert(input: {
  code: string;
  eventName?: string | null;
  currentParams?: Record<string, any>;
  previousParams?: Record<string, any>;
  sameOccurrence?: boolean;
  deliveredNetworkCount?: number;
  sameRequestSignature?: boolean;
}): boolean {
  if (!DUPLICATE_CODES.has(input.code)) return true;
  const proof = classifyDuplicateProof(input);
  if (proof === 'different_transaction_ids' || proof === 'different_event_ids') return false;

  // High-value conversion events require explicit identity or one logical
  // occurrence producing multiple successful network deliveries. A matching
  // payload alone is not enough to call two user actions duplicates.
  if (highValue(input.eventName)) {
    return proof === 'same_transaction_id'
      || proof === 'same_event_id'
      || proof === 'same_occurrence_multiple_deliveries';
  }

  return proof !== 'insufficient_evidence';
}

async function deliveredNetworkCount(siteId: number, eventId: number, occurrenceId: string | null, requestSignature: string | null): Promise<number> {
  if (occurrenceId) {
    const result = await query(
      `SELECT COUNT(*)::int AS count
         FROM events
        WHERE site_id = $1
          AND id <> $2
          AND observation_kind = 'network'
          AND delivery_outcome = 'delivered'
          AND occurrence_id = $3
          AND received_at >= NOW() - INTERVAL '10 seconds'`,
      [siteId, eventId, occurrenceId],
    );
    return Number(result.rows[0]?.count || 0) + 1;
  }
  if (requestSignature) {
    const result = await query(
      `SELECT COUNT(*)::int AS count
         FROM events
        WHERE site_id = $1
          AND id <> $2
          AND observation_kind = 'network'
          AND delivery_outcome = 'delivered'
          AND request_signature = $3
          AND received_at >= NOW() - INTERVAL '10 seconds'`,
      [siteId, eventId, requestSignature],
    );
    return Number(result.rows[0]?.count || 0) + 1;
  }
  return 0;
}

async function fetchCurrentEvent(eventIdValue: number) {
  const result = await query(
    `SELECT id,site_id,event_name,params,transaction_id,session_id,occurrence_id,request_signature,delivery_outcome
       FROM events WHERE id = $1 LIMIT 1`,
    [eventIdValue],
  );
  return result.rows[0] || null;
}

async function fetchDuplicateAlert(eventIdValue: number) {
  const result = await query(
    `SELECT id,code,event_name,raw,resolved
       FROM alerts
      WHERE resolved = false
        AND code = ANY($2::text[])
        AND raw->>'eventId' = $1
      ORDER BY created_at DESC LIMIT 1`,
    [String(eventIdValue), Array.from(DUPLICATE_CODES)],
  );
  return result.rows[0] || null;
}

/**
 * Runs after the existing detector. It never converts weak evidence into a
 * failure; it only removes claims that are contradicted by stronger evidence
 * and adds a confirmed fan-out finding when the database proves it.
 */
export async function applyDetectionAccuracyGate(eventIdValue: number): Promise<void> {
  const current = await fetchCurrentEvent(eventIdValue);
  if (!current) return;

  const alert = await fetchDuplicateAlert(eventIdValue);
  if (alert) {
    const raw = alert.raw || {};
    const previousId = Number(raw.duplicateOf || 0);
    let previous: any = null;
    if (previousId) {
      const previousResult = await query(
        `SELECT params,transaction_id,session_id,occurrence_id,request_signature
           FROM events WHERE id = $1 LIMIT 1`,
        [previousId],
      );
      previous = previousResult.rows[0] || null;
    }

    const count = await deliveredNetworkCount(
      Number(current.site_id),
      Number(current.id),
      current.occurrence_id || null,
      current.request_signature || null,
    );
    const keep = shouldKeepDuplicateAlert({
      code: alert.code,
      eventName: alert.event_name || current.event_name,
      currentParams: current.params || {},
      previousParams: previous?.params || {},
      sameOccurrence: Boolean(current.occurrence_id && previous?.occurrence_id && current.occurrence_id === previous.occurrence_id),
      deliveredNetworkCount: count,
      sameRequestSignature: Boolean(current.request_signature && previous?.request_signature && current.request_signature === previous.request_signature),
    });

    if (!keep) {
      await query(
        `UPDATE alerts
            SET resolved = true,
                last_seen = NOW(),
                root_cause = COALESCE(root_cause,'') || ' Accuracy gate: stronger event identity disproved a duplicate claim.' ,
                raw = raw || $2::jsonb
          WHERE id = $1`,
        [Number(alert.id), JSON.stringify({ accuracyGate: 'resolved', proof: classifyDuplicateProof({ currentParams: current.params || {}, previousParams: previous?.params || {}, sameOccurrence: Boolean(current.occurrence_id && previous?.occurrence_id && current.occurrence_id === previous.occurrence_id), deliveredNetworkCount: count, sameRequestSignature: Boolean(current.request_signature && previous?.request_signature && current.request_signature === previous.request_signature) }) })],
      );
    }
  }

  // Strong runtime fan-out: one logical occurrence generated >=2 successful
  // network deliveries. This is the most defensible duplicate signal and is
  // independent of heuristic request matching.
  if (current.observation_kind === 'network' && current.delivery_outcome === 'delivered' && current.occurrence_id) {
    const fanout = await query(
      `SELECT COUNT(*)::int AS count,
              MIN(id)::bigint AS first_id,
              ARRAY_AGG(id ORDER BY received_at) AS ids
         FROM events
        WHERE site_id = $1
          AND vendor = $2
          AND LOWER(COALESCE(event_name,'')) = LOWER(COALESCE($3,''))
          AND session_id = $4
          AND occurrence_id = $5
          AND observation_kind = 'network'
          AND delivery_outcome = 'delivered'
          AND received_at >= NOW() - INTERVAL '10 seconds'`,
      [Number(current.site_id), current.vendor, current.event_name, current.session_id, current.occurrence_id],
    );
    const count = Number(fanout.rows[0]?.count || 0);
    if (count >= 2 && !['scroll','click','user_engagement','video_progress'].includes(String(current.event_name || '').toLowerCase())) {
      const exists = await query(
        `SELECT id FROM alerts
          WHERE site_id = $1 AND code = 'gtm_multiple_tags_or_triggers'
            AND resolved = false
            AND raw->>'occurrenceId' = $2
            AND created_at >= NOW() - INTERVAL '30 minutes'
          LIMIT 1`,
        [Number(current.site_id), current.occurrence_id],
      );
      if (!exists.rowCount) {
        const severity = highValue(current.event_name) || String(current.event_name || '').toLowerCase() === 'purchase' ? 'critical' : 'warning';
        await query(
          `INSERT INTO alerts(site_id,severity,code,category,vendor,event_name,message,root_cause,fix_steps,page_url,raw,occurrence_count,distinct_pushes,confidence,dedupe_key,notification_status,last_seen,distinct_sessions,distinct_pages,impact_updated_at)
           VALUES($1,$2,'gtm_multiple_tags_or_triggers','duplicate',$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,'confirmed',$12,'pending',NOW(),1,1,NOW())`,
          [
            Number(current.site_id), severity, current.vendor, current.event_name,
            `One logical ${current.event_name || 'event'} occurrence produced ${count} successful analytics requests.`,
            'The browser monitor observed multiple successful network deliveries tied to the same logical occurrence. This is strong fan-out evidence; inspect GTM tags/triggers and direct implementations.',
            JSON.stringify(['Check GTM Preview for multiple tags firing from the same event.', 'Check direct gtag() or vendor SDK calls for a second implementation.', 'If the duplicate is intentional, document the routing so it is not treated as a tracking defect.']),
            current.page_url || null,
            JSON.stringify({ accuracyGate: 'confirmed_fanout', occurrenceId: current.occurrence_id, eventId: current.id, networkEventIds: fanout.rows[0]?.ids || [], count }),
            count,
            current.dl_push_index === null ? null : count,
            `fanout:${current.site_id}:${current.vendor}:${current.event_name}:${current.occurrence_id}`,
          ],
        );
      }
    }
  }
}
