import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { MIN_SAMPLE_SIZE } from '../../../lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [health, anomalies, revenue, compliance, performance] = await Promise.all([
    query(`SELECT vendor, event_name, COUNT(*)::int AS fires,
                  SUM(CASE WHEN (status_code IS NULL OR status_code < 400) AND failure_reason IS NULL THEN 1 ELSE 0 END)::int AS successes,
                  SUM(CASE WHEN status_code >= 400 OR failure_reason IS NOT NULL THEN 1 ELSE 0 END)::int AS failures,
                  COALESCE(ROUND(AVG(latency_ms))::int,0) AS avg_latency_ms,
                  COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency_ms))::int,0) AS p75_latency_ms,
                  SUM(CASE WHEN LOWER(COALESCE(consent_state->>'analytics_storage','')) = 'denied' THEN 1 ELSE 0 END)::int AS consent_denied,
                  MAX(received_at) AS last_seen
             FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours'
            GROUP BY vendor, event_name ORDER BY failures DESC, fires DESC LIMIT 200`, [siteId]),
    query(`SELECT id, severity, code, vendor, event_name, message, root_cause, raw, created_at FROM alerts WHERE site_id = $1 AND category = 'anomaly' AND resolved = false ORDER BY created_at DESC LIMIT 50`, [siteId]),
    query(`SELECT transaction_id, currency, vendor_values, missing_vendors, delta_value, status, last_seen FROM revenue_reconciliations WHERE site_id = $1 ORDER BY last_seen DESC LIMIT 50`, [siteId]),
    query(`SELECT category, severity, page_url, resource_url, evidence, status, last_seen FROM compliance_findings WHERE site_id = $1 AND status = 'open' ORDER BY last_seen DESC LIMIT 50`, [siteId]),
    query(`SELECT page_url, COUNT(*)::int AS samples, COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'lcp','')::numeric))::int,0) AS p75_lcp, COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'fcp','')::numeric))::int,0) AS p75_fcp, COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'inp','')::numeric))::int,0) AS p75_inp, COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'ttfb','')::numeric))::int,0) AS p75_ttfb, COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY NULLIF(web_vitals->>'cls','')::numeric)::numeric,3),0) AS p75_cls FROM events WHERE site_id=$1 AND web_vitals <> '{}'::jsonb AND received_at > NOW()-INTERVAL '7 days' GROUP BY page_url ORDER BY samples DESC LIMIT 50`, [siteId]),
  ]);
  const rows = health.rows.map((row: any) => {
    const fires = Number(row.fires) || 0;
    const successRate = fires >= MIN_SAMPLE_SIZE ? (Number(row.successes) / fires) : null;
    const healthScore = fires >= MIN_SAMPLE_SIZE ? Math.max(0, Math.round((Number(row.successes) / Math.max(1, fires)) * 100 - Math.min(30, Number(row.failures) * 2))) : null;
    return { ...row, success_rate: successRate, health_score: healthScore, sample_size: fires, min_sample_size: MIN_SAMPLE_SIZE };
  });
  return NextResponse.json({ health: rows, anomalies: anomalies.rows, revenue: revenue.rows, compliance: compliance.rows, performance: performance.rows, min_sample_size: MIN_SAMPLE_SIZE });
}
