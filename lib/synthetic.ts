import { query } from './db';
import { enqueueAlertDeliveries } from './notifications';

function safeUrl(value: string, base?: string) {
  try { return new URL(value, base); } catch { return null; }
}
function allowed(url: URL, domain: string, firstParty: string | null) {
  const host = url.hostname.toLowerCase();
  const candidates = [domain, firstParty].filter(Boolean).map((value) => String(value).replace(/^https?:\/\//, '').split('/')[0].toLowerCase());
  return candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

export async function runSyntheticJourney(journeyId: number) {
  const result = await query(`SELECT j.*, s.domain, s.first_party_domain FROM synthetic_journeys j JOIN sites s ON s.id = j.site_id WHERE j.id = $1 AND j.enabled = true`, [journeyId]);
  const journey = result.rows[0];
  if (!journey) return null;
  const started = Date.now();
  const evidence: any = { steps: [], startUrl: journey.start_url };
  let status = 'passed';
  let error: string | null = null;
  let current = safeUrl(journey.start_url);
  if (!current || !allowed(current, journey.domain, journey.first_party_domain)) { status = 'failed'; error = 'Journey URL is outside the monitored site allowlist'; }
  const steps = Array.isArray(journey.steps) ? journey.steps : [];
  if (status === 'passed') {
    for (const step of steps.slice(0, 30)) {
      const target = safeUrl(String(step?.url || step?.path || ''), current?.toString());
      if (!target || !allowed(target, journey.domain, journey.first_party_domain)) { status = 'failed'; error = 'Journey step is outside the monitored site allowlist'; break; }
      const startedStep = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(target, { method: String(step?.method || 'GET').toUpperCase(), redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'GA4Fix-Synthetic/1.0' } });
        const stepEvidence = { url: target.toString(), status: response.status, ok: response.ok, latencyMs: Date.now() - startedStep, expectedStatus: step?.expectedStatus || 200 };
        evidence.steps.push(stepEvidence);
        if (response.status !== Number(step?.expectedStatus || 200)) { status = 'failed'; error = `Expected HTTP ${step?.expectedStatus || 200}, received ${response.status}`; break; }
        current = target;
      } catch (err) { status = 'failed'; error = err instanceof Error ? err.message : 'Synthetic request failed'; evidence.steps.push({ url: target.toString(), ok: false, latencyMs: Date.now() - startedStep, error }); break; }
      finally { clearTimeout(timer); }
    }
  }
  const run = await query(`INSERT INTO synthetic_runs (journey_id, site_id, status, evidence, duration_ms, error, finished_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,NOW()) RETURNING id`, [journey.id, journey.site_id, status, JSON.stringify(evidence), Date.now() - started, error]);
  await query(`UPDATE synthetic_journeys SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1`, [journey.id]);
  if (status === 'failed') {
    const message = `Synthetic journey ${journey.name} failed: ${error || 'unknown error'}.`;
    const inserted = await query(`INSERT INTO alerts (site_id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, raw, confidence, dedupe_key, notification_status)
      SELECT $1,'warning','synthetic_journey_failed','synthetic',NULL,NULL,$2,$3,$4::jsonb,$5::jsonb,'confirmed',$6,'pending'
       WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE site_id=$1 AND code='synthetic_journey_failed' AND dedupe_key=$6 AND resolved=false AND created_at > NOW()-INTERVAL '1 hour') RETURNING id`, [journey.site_id, message, 'A configured synthetic site journey did not meet its expected HTTP contract.', JSON.stringify(['Open the journey evidence and reproduce the failing URL.', 'Check deployment, redirects, consent gates, and server responses.', 'Compare synthetic failure with real-user telemetry before changing tags.']), JSON.stringify({ journeyId: journey.id, runId: run.rows[0]?.id, evidence, error }), `synthetic:${journey.id}`]);
    if (inserted.rowCount) void enqueueAlertDeliveries({ alertId: Number(inserted.rows[0].id), siteId: Number(journey.site_id), severity: 'warning', category: 'synthetic', vendor: null, eventName: null, message, rootCause: 'The configured synthetic journey did not meet its expected HTTP contract.', fixSteps: ['Open the journey evidence and reproduce the failing URL.', 'Check deployment, redirects, consent gates, and server responses.'] });
  }
  return { journeyId: Number(journey.id), runId: Number(run.rows[0].id), status, evidence, error };
}

export async function runEnabledSyntheticJourneys(siteId?: number) {
  const rows = await query(`SELECT id FROM synthetic_journeys WHERE enabled = true ${siteId ? 'AND site_id = $1' : ''} ORDER BY id`, siteId ? [siteId] : []);
  const results = [];
  for (const row of rows.rows) results.push(await runSyntheticJourney(Number(row.id)));
  return results;
}
