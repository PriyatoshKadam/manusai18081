import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Finding = {
  key: string;
  category: string;
  severity: 'pass' | 'info' | 'warning' | 'critical';
  title: string;
  evidence: string;
  fix: string;
};

async function ownedSite(siteId: number, uid: string | number) {
  const result = await query('SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2', [siteId, uid]);
  return result.rows[0] || null;
}

async function buildAudit(siteId: number) {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM events WHERE site_id = $1 AND vendor = 'ga4' AND observation_kind = 'monitor_ready' AND received_at > NOW() - INTERVAL '1 hour') AS heartbeats,
      (SELECT COUNT(*)::int FROM events WHERE site_id = $1 AND vendor = 'ga4' AND received_at > NOW() - INTERVAL '24 hours') AS ga4_events,
      (SELECT COUNT(*)::int FROM events WHERE site_id = $1 AND vendor = 'ga4' AND ((status_code IS NOT NULL AND status_code >= 400) OR failure_reason IS NOT NULL) AND received_at > NOW() - INTERVAL '24 hours') AS ga4_failures,
      (SELECT COUNT(*)::int FROM events WHERE site_id = $1 AND event_type = 'custom' AND received_at > NOW() - INTERVAL '24 hours') AS custom_events,
      (SELECT COUNT(*)::int FROM events WHERE site_id = $1 AND consent_state <> '{}'::jsonb AND received_at > NOW() - INTERVAL '24 hours') AS consent_observations,
      (SELECT COUNT(*)::int FROM events WHERE site_id = $1 AND web_vitals <> '{}'::jsonb AND received_at > NOW() - INTERVAL '24 hours') AS vitals_observations,
      (SELECT COUNT(*)::int FROM adblock_events WHERE site_id = $1 AND detected_at > NOW() - INTERVAL '24 hours') AS adblock_signals,
      (SELECT COUNT(DISTINCT vendor)::int FROM events WHERE site_id = $1 AND received_at > NOW() - INTERVAL '24 hours') AS vendors,
      (SELECT COUNT(*)::int FROM alerts WHERE site_id = $1 AND resolved = false) AS open_alerts,
      (SELECT COUNT(*)::int FROM alerts WHERE site_id = $1 AND resolved = false AND category IN ('analytics', 'gtm')) AS duplicate_alerts
  `, [siteId]);
  const data = result.rows[0] || {};
  const findings: Finding[] = [];
  const add = (key: string, category: string, pass: boolean, title: string, evidence: string, fix: string, severity: Finding['severity'] = 'warning') => findings.push({ key, category, severity: pass ? 'pass' : severity, title, evidence, fix });

  add('monitor_heartbeat', 'Monitoring', Number(data.heartbeats) > 0, 'Independent monitor heartbeat', Number(data.heartbeats) > 0 ? `${data.heartbeats} monitor heartbeat(s) observed in the last hour.` : 'No monitor heartbeat observed in the last hour.', 'Install the compact monitor directly in <head>, outside GTM, and verify monitor.js returns JavaScript.');
  add('ga4_delivery', 'GA4', Number(data.ga4_events) > 0, 'GA4 events are arriving', Number(data.ga4_events) > 0 ? `${data.ga4_events} logical GA4 occurrence(s) observed in the last 24 hours.` : 'No GA4 events observed in the last 24 hours.', 'Trigger a known GA4 event and confirm /api/ingest returns HTTP 200.');
  add('ga4_failures', 'Transport', Number(data.ga4_failures) === 0, 'GA4 transport health', Number(data.ga4_failures) === 0 ? 'No GA4 HTTP or transport failures observed.' : `${data.ga4_failures} failed GA4 transport observation(s) recorded.`, 'Review status code, CSP, consent state, ad blockers, and the failing request URL.');
  add('custom_events', 'Data quality', Number(data.custom_events) > 0, 'Custom event coverage', Number(data.custom_events) > 0 ? `${data.custom_events} custom event occurrence(s) observed.` : 'No custom event occurrence observed yet.', 'Trigger a business event such as run_audit, login, sign_up, or purchase and validate its dataLayer and network evidence.', 'info');
  add('consent_signals', 'Consent', Number(data.consent_observations) > 0, 'Consent state evidence', Number(data.consent_observations) > 0 ? `${data.consent_observations} event(s) carried consent/GPC state.` : 'No consent state evidence observed.', 'Verify Consent Mode v2 and CMP callbacks are visible before analytics events fire.', 'info');
  add('web_vitals', 'Performance', Number(data.vitals_observations) > 0, 'Core Web Vitals evidence', Number(data.vitals_observations) > 0 ? `${data.vitals_observations} event(s) carried Web Vitals evidence.` : 'No Web Vitals evidence observed yet.', 'Keep the monitor in <head> and allow the page to remain open long enough for LCP and layout-shift observations.', 'info');
  add('adblock_signals', 'Resilience', Number(data.adblock_signals) > 0, 'Ad-blocker signal coverage', Number(data.adblock_signals) > 0 ? `${data.adblock_signals} ad-block signal(s) recorded.` : 'No ad-block signal recorded; this can be healthy or simply untested.', 'Review the Ad-blocker Impact page and test a blocked analytics request.', 'info');
  add('duplicate_evidence', 'GTM', Number(data.duplicate_alerts) === 0, 'Duplicate implementation health', Number(data.duplicate_alerts) === 0 ? 'No unresolved analytics/GTM duplicate alert.' : `${data.duplicate_alerts} unresolved analytics/GTM duplicate alert(s).`, 'Compare GTM trigger count, tag count, dataLayer pushes, and network requests for the affected event.');
  add('open_alerts', 'Incidents', Number(data.open_alerts) === 0, 'Open incident queue', Number(data.open_alerts) === 0 ? 'No unresolved alerts.' : `${data.open_alerts} unresolved alert(s) require review.`, 'Open the relevant diagnostics section and resolve or mute findings after the underlying implementation is corrected.');

  const checksTotal = findings.length;
  const checksPassed = findings.filter((finding) => finding.severity === 'pass').length;
  const score = Math.round((checksPassed / checksTotal) * 100);
  return { score, checksTotal, checksPassed, findings, evidence: data };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const site = await ownedSite(siteId, session.uid);
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const latest = await query('SELECT id, mode, score, checks_total, checks_passed, findings, created_at FROM audit_runs WHERE site_id = $1 ORDER BY created_at DESC LIMIT 1', [siteId]);
  return NextResponse.json({ site, live: await buildAudit(siteId), latest: latest.rows[0] || null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const siteId = Number(body?.siteId);
    if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    const site = await ownedSite(siteId, session.uid);
    if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const audit = await buildAudit(siteId);
    const inserted = await query('INSERT INTO audit_runs (site_id, mode, score, checks_total, checks_passed, findings) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id, created_at', [siteId, 'runtime_evidence', audit.score, audit.checksTotal, audit.checksPassed, JSON.stringify(audit.findings)]);
    return NextResponse.json({ ok: true, audit, run: inserted.rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid audit request' }, { status: 400 });
  }
}
