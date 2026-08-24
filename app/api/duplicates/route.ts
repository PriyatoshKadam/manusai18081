import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

const REPEAT_SENSITIVE_EVENTS = ['login', 'run_audit', 'sign_up', 'purchase', 'begin_checkout', 'generate_lead', 'subscribe'];
const NATURALLY_REPEATABLE_EVENTS = ['scroll', 'click', 'user_engagement', 'video_progress'];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [alertRows, networkRows, repeatRows, fanoutRows] = await Promise.all([
    query(
      `SELECT id, event_name, vendor, category, code, message, root_cause, fix_steps, raw, occurrence_count, distinct_pushes, page_url, created_at
         FROM alerts WHERE site_id = $1 AND category IN ('analytics','gtm') AND resolved = false
           AND code IN ('duplicate_event','duplicate_network_request','gtm_multiple_tags_or_triggers','gtm_gtm_and_direct_implementation','gtm_datalayer_duplicate_push')
           AND LOWER(COALESCE(event_name, '')) <> ALL($2::text[])
           AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 100`,
      [siteId, NATURALLY_REPEATABLE_EVENTS],
    ),
    query(
      `SELECT event_name, vendor, page_url, session_id, request_signature,
              COUNT(*)::int AS occurrence_count,
              COUNT(DISTINCT dl_push_index)::int AS distinct_pushes,
              MIN(received_at) AS first_seen,
              MAX(received_at) AS last_seen,
              ARRAY_AGG(id ORDER BY received_at DESC) AS event_ids
         FROM events
        WHERE site_id = $1
          AND vendor = 'ga4'
          AND observation_kind = 'network'
          AND LOWER(COALESCE(event_name, '')) <> ALL($2::text[])
          AND request_signature IS NOT NULL
          AND session_id IS NOT NULL
          AND received_at > NOW() - INTERVAL '24 hours'
        GROUP BY event_name, vendor, page_url, session_id, request_signature
       HAVING COUNT(*) > 1
        ORDER BY last_seen DESC
        LIMIT 100`,
      [siteId, NATURALLY_REPEATABLE_EVENTS],
    ),
    query(
      `SELECT event_name, vendor, page_url, session_id, occurrence_id,
              COUNT(*)::int AS network_count,
              COUNT(DISTINCT request_signature)::int AS signature_count,
              MIN(received_at) AS first_seen,
              MAX(received_at) AS last_seen,
              ARRAY_AGG(id ORDER BY received_at DESC) AS event_ids
         FROM events
        WHERE site_id = $1 AND vendor = 'ga4' AND observation_kind = 'network'
          AND session_id IS NOT NULL AND occurrence_id IS NOT NULL
          AND received_at > NOW() - INTERVAL '24 hours'
        GROUP BY event_name, vendor, page_url, session_id, occurrence_id
       HAVING COUNT(*) > 1
        ORDER BY last_seen DESC
        LIMIT 100`,
      [siteId],
    ),
    query(
      `WITH raw AS (
         SELECT id, event_name, vendor, page_url, session_id, request_signature, received_at,
                occurrence_id, network_occurrence_id, observation_kind
           FROM events
          WHERE site_id = $1
            AND vendor = 'ga4'
            AND session_id IS NOT NULL
            AND LOWER(COALESCE(event_name, '')) = ANY($2::text[])
            AND received_at > NOW() - INTERVAL '24 hours'
       ), occurrences AS (
         SELECT event_name, vendor, page_url, session_id, occurrence_id,
                COUNT(*)::int AS occurrence_count,
                COUNT(DISTINCT request_signature)::int AS signature_count,
                MIN(received_at) AS first_seen,
                MAX(received_at) AS last_seen,
                ARRAY_AGG(id ORDER BY received_at DESC) AS event_ids,
                ARRAY_AGG(DISTINCT observation_kind) AS observation_kinds
           FROM raw
          WHERE occurrence_id IS NOT NULL
          GROUP BY event_name, vendor, page_url, session_id, occurrence_id
       ), repeated AS (
         SELECT *, LAG(last_seen) OVER (PARTITION BY vendor, event_name, session_id ORDER BY last_seen) AS previous_seen
           FROM occurrences
       )
       SELECT event_name, vendor, page_url, session_id, occurrence_id,
              occurrence_count, signature_count, first_seen, last_seen, event_ids, observation_kinds
         FROM repeated
        WHERE occurrence_count > 1
           OR (previous_seen IS NOT NULL AND first_seen - previous_seen <= INTERVAL '120 seconds')
        ORDER BY last_seen DESC
        LIMIT 100`,
      [siteId, REPEAT_SENSITIVE_EVENTS],
    ),
  ]);

  const alerts = alertRows.rows.filter((row: any) => {
    if (row.code !== 'gtm_multiple_tags_or_triggers') return true;
    const raw = typeof row.raw === 'string' ? (() => { try { return JSON.parse(row.raw); } catch { return {}; } })() : row.raw || {};
    const observed = Number(raw.networkCount || raw.occurrenceCount || row.occurrence_count || 0);
    const evidenceCount = Array.isArray(raw.eventIds) ? raw.eventIds.length : [raw.eventId, raw.duplicateOf].filter(Boolean).length;
    return observed >= 2 && evidenceCount >= 2;
  }).map((row: any) => ({
    ...row,
    first_seen: row.created_at,
    last_seen: row.last_seen || row.created_at,
    sourceType: 'alert',
    duplicateKey: `${row.code}:${row.vendor || ''}:${row.event_name || ''}:${row.message || ''}`,
  }));
  const derivedNetwork = networkRows.rows.map((row: any) => ({
    id: `network-${row.event_ids?.[0] || row.last_seen}`,
    event_name: row.event_name,
    vendor: row.vendor,
    category: 'analytics',
    code: 'duplicate_network_request',
    message: `${row.event_name || 'GA4 event'} produced ${row.occurrence_count} matching network requests in one browser session.`,
    root_cause: 'The same normalized GA4 network request signature was observed more than once in one browser session. This usually indicates duplicate tags, duplicate triggers, or a retry path.',
    fix_steps: ['Open GTM Preview or Tag Assistant and inspect every tag firing for this event.', 'Check whether two GA4 Event tags use the same trigger.', 'Check for a direct gtag() or analytics SDK implementation alongside GTM.', 'Check whether a retry or SPA lifecycle handler sends the same request twice.'],
    raw: { sessionId: row.session_id, requestSignature: row.request_signature, eventIds: row.event_ids, firstSeen: row.first_seen, lastSeen: row.last_seen },
    occurrence_count: row.occurrence_count,
    distinct_pushes: row.distinct_pushes,
    page_url: row.page_url,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    created_at: row.last_seen,
    sourceType: 'derived_network_evidence',
    duplicateKey: `network:${row.session_id}:${row.event_name}:${row.request_signature}`,
  }));
  const fanoutEvidenceKeys = new Set(fanoutRows.rows.map((row: any) => `${row.session_id}:${row.event_name}:${row.occurrence_id}`));
  const derivedRepeats = repeatRows.rows.filter((row: any) => !fanoutEvidenceKeys.has(`${row.session_id}:${row.event_name}:${row.occurrence_id}`)).map((row: any) => ({
    id: `repeat-${row.event_ids?.[0] || row.last_seen}`,
    event_name: row.event_name,
    vendor: row.vendor,
    category: 'analytics',
    code: 'duplicate_event',
    message: `${row.event_name || 'GA4 event'} occurred ${Math.max(2, Number(row.occurrence_count) || 0)} times within 120 seconds in one browser session.`,
    root_cause: Number(row.signature_count) === 1
      ? 'The same event and normalized request evidence repeated in one browser session.'
      : 'The same event repeated in one browser session, but request parameters differed. Verify whether two GTM tags, triggers, or implementation paths fired.',
    fix_steps: ['Open GTM Preview or Tag Assistant and inspect every firing for this event.', 'Compare dataLayer pushes, tag names, trigger conditions, and request parameters.', 'Check for a direct gtag() or analytics SDK implementation alongside GTM.', 'For purchase, verify transaction_id is unique; for login, verify the success callback runs only once.'],
    raw: { sessionId: row.session_id, occurrenceId: row.occurrence_id, eventIds: row.event_ids, occurrenceCount: row.occurrence_count, signatureCount: row.signature_count, observationKinds: row.observation_kinds, firstSeen: row.first_seen, lastSeen: row.last_seen },
    occurrence_count: row.occurrence_count,
    distinct_pushes: row.occurrence_id ? 1 : null,
    page_url: row.page_url,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    created_at: row.last_seen,
    sourceType: 'derived_repeat_evidence',
    duplicateKey: `repeat:${row.session_id}:${row.event_name}:${row.occurrence_id || row.page_url || ''}`,
  }));

  const derivedFanout = fanoutRows.rows.filter((row: any) => Number(row.network_count) >= 2 && Array.isArray(row.event_ids) && row.event_ids.length >= 2).map((row: any) => ({
    id: `fanout-${row.event_ids?.[0] || row.last_seen}`,
    event_name: row.event_name,
    vendor: row.vendor,
    category: 'gtm',
    code: 'gtm_multiple_tags_or_triggers',
    message: `${row.event_name || 'GA4 event'} produced ${row.occurrence_count} network calls from one dataLayer occurrence.`,
    root_cause: 'Multiple GTM tags or triggers appear to have responded to the same dataLayer event. This is the strongest browser-side evidence of tag fan-out.',
    fix_steps: ['Open GTM Preview and inspect the exact dataLayer event.', 'Check whether two GA4 Event tags fire from that one trigger.', 'Disable duplicate tags or narrow their trigger conditions.', 'Verify the network request count falls to one after publishing.'],
    raw: { sessionId: row.session_id, occurrenceId: row.occurrence_id, eventIds: row.event_ids, networkCount: row.occurrence_count, signatureCount: row.signature_count, observationKinds: row.observation_kinds, firstSeen: row.first_seen, lastSeen: row.last_seen },
    occurrence_count: row.occurrence_count,
    distinct_pushes: 1,
    page_url: row.page_url,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    created_at: row.last_seen,
    sourceType: 'derived_gtm_fanout',
    duplicateKey: `fanout:${row.session_id}:${row.event_name}:${row.occurrence_id}`,
  }));

  const merged = [...alerts, ...derivedFanout, ...derivedNetwork, ...derivedRepeats];
  const seen = new Set<string>();
  const duplicates = merged.filter((item) => {
    const raw = typeof item.raw === 'string' ? (() => { try { return JSON.parse(item.raw); } catch { return {}; } })() : item.raw || {};
    const evidenceKey = item.code === 'duplicate_network_request' && raw.sessionId && (raw.requestSignature || raw.request_signature)
      ? `network:${raw.sessionId}:${raw.requestSignature || raw.request_signature}`
      : item.code === 'duplicate_event' && raw.sessionId && raw.eventIds?.length
        ? `repeat:${raw.sessionId}:${item.event_name}:${item.page_url || ''}`
        : item.duplicateKey;
    if (seen.has(evidenceKey)) return false;
    seen.add(evidenceKey);
    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 100);

  return NextResponse.json({ duplicates });
}
