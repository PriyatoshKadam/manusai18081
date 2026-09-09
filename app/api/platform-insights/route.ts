import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const delivered = `${networkObservation} AND delivery_outcome = 'delivered'`;
const nonEmptyJsonArray = (column: string) => `CASE WHEN jsonb_typeof(${column}) = 'array' THEN ${column} ELSE '[]'::jsonb END`;

function cleanPath(value: unknown) {
  if (!value) return '/';
  try {
    const url = new URL(String(value));
    return url.pathname || '/';
  } catch {
    return String(value).split('?')[0].split('#')[0] || '/';
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = url.searchParams.get('vendor')?.trim().toLowerCase() || null;
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const owner = await query('SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const vendorClause = vendor ? ' AND vendor = $2' : '';
  const args = vendor ? [siteId, vendor] : [siteId];
  const noiseFilter = `NOT ${INTERNAL_CORRELATION_NOISE_SQL}`;

  const [overview, trends, parameters, pages, consent, consentEvents, blockers, blockerTrend, ai, aiEvents] = await Promise.all([
    query(
      `SELECT
        COUNT(DISTINCT ${occurrenceKey})::int AS total_event_hits,
        COUNT(DISTINCT LOWER(COALESCE(event_name, '')))::int AS event_total,
        COUNT(DISTINCT NULLIF(jsonb_array_elements_text(${nonEmptyJsonArray('observed_parameters')}), ''))::int AS parameter_number,
        COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours')::int AS recent_rows,
        COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours' AND detection_status = 'scored')::int AS scored_rows,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(*) FILTER (WHERE ${delivered})::int AS successful_network_events,
        COUNT(*) FILTER (WHERE ${networkObservation} AND delivery_outcome IN ('http_error','blocked','beacon_rejected','network_error','aborted','timeout'))::int AS failed_network_events
       FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '24 hours'${vendorClause}`,
      args,
    ),
    query(
      `SELECT LOWER(COALESCE(event_name, '')) AS event_name, DATE_TRUNC('day', received_at)::date AS day, COUNT(DISTINCT ${occurrenceKey})::int AS count
       FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '14 days'${vendorClause}
       GROUP BY LOWER(COALESCE(event_name, '')), DATE_TRUNC('day', received_at)::date
       ORDER BY day ASC, event_name ASC`,
      args,
    ),
    query(
      `WITH base AS (
         SELECT ${occurrenceKey} AS occurrence_key, event_name, observed_parameters, missing_parameters
         FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '24 hours'${vendorClause}
       ),
       observed AS (
         SELECT occurrence_key, event_name, LOWER(value) AS parameter_name, true AS passed
         FROM base CROSS JOIN LATERAL jsonb_array_elements_text(${nonEmptyJsonArray('observed_parameters')}) AS item(value)
         WHERE NULLIF(TRIM(value), '') IS NOT NULL
       ),
       missing AS (
         SELECT occurrence_key, event_name, LOWER(value) AS parameter_name, false AS passed
         FROM base CROSS JOIN LATERAL jsonb_array_elements_text(${nonEmptyJsonArray('missing_parameters')}) AS item(value)
         WHERE NULLIF(TRIM(value), '') IS NOT NULL
       ),
       all_rows AS (SELECT * FROM observed UNION ALL SELECT * FROM missing)
       SELECT parameter_name,
              COUNT(DISTINCT occurrence_key) FILTER (WHERE passed)::int AS reference_event_count,
              COUNT(DISTINCT occurrence_key)::int AS mandatory_event_count,
              COUNT(DISTINCT occurrence_key) FILTER (WHERE NOT passed)::int AS missing_event_count,
              ROUND(100.0 * COUNT(DISTINCT occurrence_key) FILTER (WHERE passed) / NULLIF(COUNT(DISTINCT occurrence_key), 0), 1) AS coverage,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(event_name, '')) FILTER (WHERE passed), NULL) AS passing_events,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(event_name, '')) FILTER (WHERE NOT passed), NULL) AS failing_events
       FROM all_rows
       GROUP BY parameter_name
       ORDER BY mandatory_event_count DESC, parameter_name ASC
       LIMIT 150`,
      args,
    ),
    query(
      `WITH session_pages AS (
         SELECT COALESCE(NULLIF(page_url, ''), '') AS page_url,
                NULLIF(session_id, '') AS session_id,
                MIN(received_at) AS first_seen,
                MAX(received_at) AS last_seen,
                COUNT(DISTINCT ${occurrenceKey})::int AS events
         FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '24 hours'${vendorClause}
         GROUP BY COALESCE(NULLIF(page_url, ''), ''), NULLIF(session_id, '')
       )
       SELECT page_url, COUNT(*) FILTER (WHERE page_url <> '')::int AS sessions,
              SUM(events)::int AS events,
              ROUND(AVG(EXTRACT(EPOCH FROM (last_seen - first_seen))))::int AS session_duration_seconds
       FROM session_pages
       WHERE page_url <> ''
       GROUP BY page_url
       ORDER BY events DESC
       LIMIT 100`,
      args,
    ),
    query(
      `SELECT COUNT(DISTINCT NULLIF(session_id,''))::int AS sessions,
              COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE COALESCE(consent_state->>'choice_recorded','false') = 'true')::int AS choice_sessions,
              COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE consent_state ? 'analytics_storage' OR consent_state ? 'ad_storage' OR consent_state ? 'consent_gcs')::int AS consent_signal_sessions,
              COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE consent_state->>'consent_source' IN ('datalayer','network_gcs'))::int AS consent_mode_sessions,
              COUNT(*) FILTER (WHERE consent_state->>'analytics_storage' = 'denied')::int AS analytics_denied_events,
              COUNT(*) FILTER (WHERE consent_state->>'ad_storage' = 'denied')::int AS ad_denied_events
       FROM events WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '24 hours'${vendorClause}`,
      args,
    ),
    query(
      `SELECT event_name, vendor, observation_kind, consent_state, delivery_outcome, gtm_tag_name, gtm_trigger_name, page_url, received_at
       FROM events
       WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '24 hours'
         AND (consent_state->>'analytics_storage' = 'denied' OR consent_state->>'ad_storage' = 'denied')
         ${vendor ? 'AND vendor = $2' : ''}
         AND vendor IN ('ga4','gads','meta','tiktok','linkedin','snapchat','pinterest')
       ORDER BY received_at DESC LIMIT 100`,
      args,
    ),
    query(
      `SELECT event_name, COUNT(*)::int AS blocked, COUNT(DISTINCT NULLIF(session_id,''))::int AS sessions,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(blocked_vendors::text, '')), NULL) AS vendor_signals
       FROM adblock_events
       WHERE site_id = $1 AND confidence IN ('confirmed','likely') AND ${noiseFilter} AND detected_at >= NOW() - INTERVAL '24 hours'
         ${vendor ? 'AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(blocked_vendors) = \'array\' THEN blocked_vendors ELSE \'[]\'::jsonb END) b(v) WHERE lower(b.v) = lower($2))' : ''}
       GROUP BY event_name
       ORDER BY blocked DESC LIMIT 100`,
      args,
    ),
    query(
      `SELECT DATE_TRUNC('hour', detected_at) AS hour, COUNT(*)::int AS blocked
       FROM adblock_events
       WHERE site_id = $1 AND confidence IN ('confirmed','likely') AND ${noiseFilter} AND detected_at >= NOW() - INTERVAL '24 hours'
         ${vendor ? 'AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(blocked_vendors) = \'array\' THEN blocked_vendors ELSE \'[]\'::jsonb END) b(v) WHERE lower(b.v) = lower($2))' : ''}
       GROUP BY DATE_TRUNC('hour', detected_at) ORDER BY hour ASC`,
      args,
    ),
    query(
      `SELECT COUNT(*)::int AS total_hits,
              COUNT(DISTINCT ai_bot_name)::int AS unique_platforms
       FROM events WHERE site_id = $1 AND ai_bot_name IS NOT NULL AND received_at >= NOW() - INTERVAL '24 hours'${vendorClause}`,
      args,
    ),
    query(
      `SELECT ai_bot_name, ai_bot_operator, ai_bot_purpose, COUNT(*)::int AS hits,
              COUNT(DISTINCT NULLIF(page_url,''))::int AS pages,
              MAX(received_at) AS last_seen,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(event_name,'')), NULL) AS event_names
       FROM events WHERE site_id = $1 AND ai_bot_name IS NOT NULL AND received_at >= NOW() - INTERVAL '24 hours'${vendorClause}
       GROUP BY ai_bot_name, ai_bot_operator, ai_bot_purpose
       ORDER BY hits DESC LIMIT 100`,
      args,
    ),
  ]);

  const rawOverview = overview.rows[0] || {};
  const totalSessions = Number(rawOverview.sessions || 0);
  const choiceSessions = Number(consent.rows[0]?.choice_sessions || 0);
  const consentSignalSessions = Number(consent.rows[0]?.consent_signal_sessions || 0);
  const choicePct = totalSessions ? Math.round((choiceSessions / totalSessions) * 1000) / 10 : null;
  const signalPct = totalSessions ? Math.round((consentSignalSessions / totalSessions) * 1000) / 10 : null;
  const consentModeDetected = Number(consent.rows[0]?.consent_mode_sessions || 0) > 0;

  const cmpCounts = new Map<string, number>();
  for (const row of consentEvents.rows) {
    const state = row.consent_state || {};
    const provider = String(state.cmp || state.cmp_name || state.consent_provider || '').trim();
    if (provider) cmpCounts.set(provider, (cmpCounts.get(provider) || 0) + 1);
  }
  const cmp = [...cmpCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const eventTrends = trends.rows.map((row: any) => ({ event_name: row.event_name, day: row.day, count: Number(row.count || 0) }));
  const pageRows = pages.rows.map((row: any) => ({ ...row, page_path: cleanPath(row.page_url), events: Number(row.events || 0), sessions: Number(row.sessions || 0), session_duration_seconds: Number(row.session_duration_seconds || 0) }));
  const blockedTotal = blockers.rows.reduce((sum: number, row: any) => sum + Number(row.blocked || 0), 0);
  const aiTotal = Number(ai.rows[0]?.total_hits || 0);

  const aiEventRows = aiEvents.rows.map((row: any) => ({
    status: 'Detected',
    event_name: row.event_name || 'Page view',
    ai_name: row.ai_bot_name,
    operator: row.ai_bot_operator,
    purpose: row.ai_bot_purpose,
    notes: `${Number(row.hits || 0).toLocaleString()} AI crawler hits${row.pages ? ` across ${Number(row.pages).toLocaleString()} pages` : ''}.`,
    last_seen: row.last_seen,
  }));

  return NextResponse.json({
    site: owner.rows[0],
    overview: {
      total_event_hits: Number(rawOverview.total_event_hits || 0),
      event_total: Number(rawOverview.event_total || 0),
      parameter_number: parameters.rows.length,
      sessions: totalSessions,
      successful_network_events: Number(rawOverview.successful_network_events || 0),
      failed_network_events: Number(rawOverview.failed_network_events || 0),
    },
    parameters: parameters.rows.map((row: any) => ({ ...row, coverage: Number(row.coverage || 0), reference_event_count: Number(row.reference_event_count || 0), mandatory_event_count: Number(row.mandatory_event_count || 0), missing_event_count: Number(row.missing_event_count || 0), passing_events: row.passing_events || [], failing_events: row.failing_events || [] })),
    eventTrends,
    pages: pageRows,
    consent: {
      cmp: cmp ? { name: cmp[0], observations: cmp[1], detected: true } : { name: 'Not detected', observations: 0, detected: false },
      consentMode: { detected: consentModeDetected, sessions: Number(consent.rows[0]?.consent_mode_sessions || 0), signalSessions: consentSignalSessions, signalPct },
      choiceRecorded: { sessions: choiceSessions, totalSessions, percent: choicePct, status: choicePct === null ? 'Collecting evidence' : `${choicePct}% of observed sessions` },
      eventsOutsideConsent: consentEvents.rows.map((row: any) => ({ status: 'Review', event_name: row.event_name || 'Unnamed event', vendor: row.vendor, compliant: row.vendor === 'ga4' ? true : false, gtm_tag_name: row.gtm_tag_name, gtm_trigger_name: row.gtm_trigger_name, page_url: row.page_url, consent_state: row.consent_state || {}, notes: row.vendor === 'ga4' ? 'Google Consent Mode can legitimately send cookieless measurement when analytics_storage is denied; review the consent mode state rather than treating the request itself as a violation.' : 'Vendor activity was observed while a consent storage signal was denied. Verify the vendor is configured with an appropriate consent check.' })),
      denied: { analytics: Number(consent.rows[0]?.analytics_denied_events || 0), ads: Number(consent.rows[0]?.ad_denied_events || 0) },
    },
    adblocks: { total: Number(rawOverview.total_event_hits || 0), successful: Number(rawOverview.successful_network_events || 0), blocked: blockedTotal, rows: blockers.rows.map((row: any) => ({ ...row, blocked: Number(row.blocked || 0), sessions: Number(row.sessions || 0), notes: 'Confirmed or likely blocker evidence. Correlation-only signals are excluded.' })), trend: blockerTrend.rows.map((row: any) => ({ hour: row.hour, blocked: Number(row.blocked || 0) })) },
    ai: { totalHits: aiTotal, uniquePlatforms: Number(ai.rows[0]?.unique_platforms || 0), platforms: aiEvents.rows.map((row: any) => ({ name: row.ai_bot_name, operator: row.ai_bot_operator, purpose: row.ai_bot_purpose, hits: Number(row.hits || 0) })), events: aiEventRows },
  });
}
