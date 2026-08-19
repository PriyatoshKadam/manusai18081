import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { processPendingDeliveries } from '../../../lib/notifications';
import { refreshBaselines, runAnomalySweep } from '../../../lib/anomaly';
import { reconcileRevenue } from '../../../lib/revenue';
import { runEnabledSyntheticJourneys } from '../../../lib/synthetic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  const received = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || req.headers.get('x-cron-secret')?.trim();
  return Boolean(expected && received && received === expected);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const job = String(body?.job || 'all');
  if (job === 'deliveries') {
    await processPendingDeliveries(100);
    return NextResponse.json({ ok: true, job });
  }
  const sites = await query('SELECT id FROM sites ORDER BY id');
  const results: Record<string, unknown> = {};
  if (job === 'anomaly' || job === 'all') {
    results.anomaly = [];
    for (const site of sites.rows) {
      await refreshBaselines(Number(site.id));
      const findings = await runAnomalySweep(Number(site.id));
      (results.anomaly as any[]).push({ siteId: Number(site.id), findings: findings.length });
    }
  }
  if (job === 'all' || job === 'synthetic') results.synthetic = await runEnabledSyntheticJourneys();
  if (job === 'all' || job === 'revenue') {
    results.revenue = [];
    for (const site of sites.rows) {
      const findings = await reconcileRevenue(Number(site.id));
      (results.revenue as any[]).push({ siteId: Number(site.id), findings: findings.length });
    }
  }
  if (job === 'all') await processPendingDeliveries(100);
  return NextResponse.json({ ok: true, job, results });
}
