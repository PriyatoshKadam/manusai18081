import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { INTERNAL_CORRELATION_NOISE_SQL } from '../../../lib/adblock-evidence';

const network = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = url.searchParams.get('vendor')?.trim().toLowerCase() || null;
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const vendorClause = vendor ? ' AND e.vendor = $2' : '';
  const args = vendor ? [siteId, vendor] : [siteId];
  const result = await query(
    `WITH hours AS (
       SELECT generate_series(date_trunc('hour', NOW() - INTERVAL '23 hours'), date_trunc('hour', NOW()), INTERVAL '1 hour') AS hour
     ),
     deliveries AS (
       SELECT date_trunc('hour', e.received_at) AS hour,
              COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE ${network} AND e.delivery_outcome = 'delivered')::int AS successful
       FROM events e
       WHERE e.site_id = $1 AND e.received_at >= NOW() - INTERVAL '24 hours'${vendorClause}
       GROUP BY date_trunc('hour', e.received_at)
     ),
     blocked AS (
       SELECT date_trunc('hour', detected_at) AS hour, COUNT(*)::int AS blocked
       FROM adblock_events
       WHERE site_id = $1 AND confidence IN ('confirmed','likely') AND NOT ${INTERNAL_CORRELATION_NOISE_SQL}
         AND detected_at >= NOW() - INTERVAL '24 hours'
         ${vendor ? `AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(blocked_vendors) = 'array' THEN blocked_vendors ELSE '[]'::jsonb END) b(v) WHERE lower(b.v) = lower($2))` : ''}
       GROUP BY date_trunc('hour', detected_at)
     )
     SELECT hours.hour, COALESCE(deliveries.successful,0)::int AS successful, COALESCE(blocked.blocked,0)::int AS blocked
     FROM hours LEFT JOIN deliveries USING (hour) LEFT JOIN blocked USING (hour)
     ORDER BY hours.hour ASC`,
    args,
  );
  return NextResponse.json({ trend: result.rows.map((row: any) => ({ hour: row.hour, successful: Number(row.successful || 0), blocked: Number(row.blocked || 0) })) });
}
