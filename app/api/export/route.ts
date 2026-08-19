import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';
const queries: Record<string, string> = {
  events: `SELECT received_at, vendor, event_name, observation_kind, page_url, status_code, latency_ms, failure_reason, revenue_value, revenue_currency, transaction_id, resource_domain, consent_state, is_synthetic FROM events WHERE site_id=$1 AND received_at > NOW()-INTERVAL '30 days' ORDER BY received_at DESC LIMIT 10000`,
  alerts: `SELECT created_at, severity, category, code, vendor, event_name, message, root_cause, confidence, resolved, page_url FROM alerts WHERE site_id=$1 AND created_at > NOW()-INTERVAL '90 days' ORDER BY created_at DESC LIMIT 5000`,
  revenue: `SELECT last_seen, transaction_id, currency, vendor_values, missing_vendors, delta_value, status FROM revenue_reconciliations WHERE site_id=$1 ORDER BY last_seen DESC LIMIT 5000`,
  synthetic: `SELECT started_at, finished_at, status, duration_ms, error, evidence FROM synthetic_runs WHERE site_id=$1 ORDER BY started_at DESC LIMIT 5000`,
};
function csv(rows: any[]) { if (!rows.length) return ''; const keys = Object.keys(rows[0]); const quote = (value: unknown) => `"${String(typeof value === 'object' && value !== null ? JSON.stringify(value) : value ?? '').replace(/"/g, '""')}"`; return [keys.join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\n'); }
export async function GET(req: NextRequest) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(req.url).searchParams; const siteId = Number(params.get('siteId')); const kind = params.get('kind') || 'events'; const format = params.get('format') || 'json';
  if (!Number.isSafeInteger(siteId) || siteId <= 0 || !queries[kind]) return NextResponse.json({ error: 'Valid siteId and export kind required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2', [siteId, session.uid]); if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const result = await query(queries[kind], [siteId]);
  if (format === 'csv') return new NextResponse(csv(result.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ga4fix-${kind}-${siteId}.csv"`, 'Cache-Control': 'no-store' } });
  return NextResponse.json({ kind, rows: result.rows });
}
