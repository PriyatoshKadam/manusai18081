import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { ACTIONABLE_BLOCKER_CONFIDENCES, INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';
import { MIN_SAMPLE_SIZE } from '../../../lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const noiseFilter = `NOT ${INTERNAL_CORRELATION_NOISE_SQL}`;
  const actionableFilter = `confidence IN (${ACTIONABLE_BLOCKER_CONFIDENCES})`;
  const [totals, byMethod, byVendor, recent, telemetryRecent, candidates] = await Promise.all([
    query(`SELECT
      (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'confirmed' AND detected_at > NOW() - INTERVAL '24 hours')::int AS blocked_events_24h,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(ip_hash,''))) FROM adblock_events WHERE site_id = $1 AND confidence = 'confirmed' AND detected_at > NOW() - INTERVAL '24 hours')::int AS blocked_sessions_24h,
      (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'correlation_gap' AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours')::int AS correlation_gaps_24h,
      (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'telemetry_gap' AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours')::int AS telemetry_gaps_24h,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(client_id,''))) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours')::int AS total_sessions_24h,
      (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND confidence = 'confirmed' AND event_name IS NOT NULL AND detected_at > NOW() - INTERVAL '24 hours')::int AS blocked_event_reports_24h,
      CASE WHEN (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(client_id,''))) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') < ${MIN_SAMPLE_SIZE} THEN NULL ELSE ROUND(100.0 * (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(ip_hash,''))) FROM adblock_events WHERE site_id = $1 AND confidence = 'confirmed' AND detected_at > NOW() - INTERVAL '24 hours') / NULLIF((SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(client_id,''))) FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'), 0), 1) END AS confirmed_rate_pct`, [siteId]),
    query(`SELECT detection_method, signal, confidence, COUNT(*)::int AS cnt, COUNT(DISTINCT COALESCE(NULLIF(session_id,''), NULLIF(ip_hash,'')))::int AS sessions
           FROM adblock_events WHERE site_id = $1 AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours'
           GROUP BY detection_method, signal, confidence ORDER BY cnt DESC LIMIT 50`, [siteId]),
    query(`SELECT vendor, COUNT(*)::int AS cnt FROM adblock_events a CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.blocked_vendors, '[]'::jsonb)) vendor
           WHERE a.site_id = $1 AND a.confidence = 'confirmed' AND a.detected_at > NOW() - INTERVAL '24 hours' GROUP BY vendor ORDER BY cnt DESC`, [siteId]),
    query(`SELECT detection_method, signal, confidence, event_name, blocked_url, page_url, session_id, detected_at
           FROM adblock_events WHERE site_id = $1 AND ${actionableFilter} AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours' ORDER BY detected_at DESC LIMIT 75`, [siteId]),
    query(`SELECT detection_method, signal, confidence, event_name, blocked_url, page_url, session_id, detected_at
           FROM adblock_events WHERE site_id = $1 AND confidence = 'telemetry_gap' AND ${noiseFilter} AND detected_at > NOW() - INTERVAL '24 hours' ORDER BY detected_at DESC LIMIT 75`, [siteId]),
    query(`SELECT detection_method, vendor, signal, raw_error, sample_count, first_seen, last_seen, last_page_url, last_blocked_url
           FROM blocker_pattern_candidates WHERE site_id = $1 AND status = 'candidate' ORDER BY sample_count DESC, last_seen DESC LIMIT 50`, [siteId]),
  ]);
  return NextResponse.json({ totals: { ...totals.rows[0], min_sample_size: MIN_SAMPLE_SIZE }, byMethod: byMethod.rows, byVendor: byVendor.rows, recent: recent.rows, telemetryRecent: telemetryRecent.rows, candidates: candidates.rows });
}
