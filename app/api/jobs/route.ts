import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { processDailyDigests, processPendingDeliveries } from '../../../lib/notifications';
import { refreshBaselines, runAnomalySweep } from '../../../lib/anomaly';
import { reconcileRevenue } from '../../../lib/revenue';
import { runEnabledSyntheticJourneys } from '../../../lib/synthetic';
import { rateLimit, requestKey } from '../../../lib/rate-limit';
import { reprocessDetectionFailures } from '../../../lib/detection';
import { refreshGtmSnapshotFreshness } from '../../../lib/gtm-inventory';
import { purgeRawTelemetry } from '../../../lib/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  const received = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || req.headers.get('x-cron-secret')?.trim();
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && crypto.timingSafeEqual(expectedBytes, receivedBytes);
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(requestKey(req, 'jobs'), 10, 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many job requests' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 4096) return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  const body = await req.json().catch(() => ({}));
  const job = String(body?.job || 'all');
  if (!['all', 'deliveries', 'anomaly', 'synthetic', 'revenue', 'digest', 'detection', 'gtm', 'retention'].includes(job)) return NextResponse.json({ error: 'Unsupported job' }, { status: 400 });
  if (job === 'detection') {
    return NextResponse.json({ ok: true, job, result: await reprocessDetectionFailures(100) });
  }
  if (job === 'gtm') {
    return NextResponse.json({ ok: true, job, result: await refreshGtmSnapshotFreshness(50) });
  }
  if (job === 'retention') {
    return NextResponse.json({ ok: true, job, result: await purgeRawTelemetry() });
  }
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
  if (job === 'all') { await reprocessDetectionFailures(100); await refreshGtmSnapshotFreshness(50); await processPendingDeliveries(100); await processDailyDigests(100); results.retention = await purgeRawTelemetry(); }
  if (job === 'digest') await processDailyDigests(100);
  return NextResponse.json({ ok: true, job, results });
}
