import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const monitor = fs.readFileSync('public/monitor.js', 'utf8');
const auditPage = fs.readFileSync('app/dashboard/audit/page.tsx', 'utf8');
const duplicateRoute = fs.readFileSync('app/api/duplicates/route.ts', 'utf8');
const schema = fs.readFileSync('db/schema.sql', 'utf8');
const nextConfig = fs.readFileSync('next.config.js', 'utf8');
const adblockRoute = fs.readFileSync('app/api/adblock/route.ts', 'utf8');
const adblockEvidence = fs.readFileSync('lib/adblock-evidence.ts', 'utf8');

 describe('HAR regression protections', () => {
  it('flushes queued telemetry during page exit and uses correlation-gap signals', () => {
    expect(monitor).toContain("window.addEventListener('pagehide', flushOnPageExit)");
    expect(monitor).toContain("document.visibilityState === 'hidden'");
    expect(monitor).toContain("reportBlocked('ga4_event_unmatched'");
    expect(monitor).toContain("if (event.vendor !== 'ga4') return event;");
    expect(monitor).toContain('function eventNameValue');
    expect(monitor).toContain('function gadsEventName');
    expect(monitor).toContain("params.conversion_label || params.google_conversion_label || params.label");
    expect(monitor).toContain('text/plain;charset=UTF-8');
    expect(monitor).toContain('consentFromParams');
    expect(monitor).toContain('recentNetworkEvents');
    expect(monitor).toContain("mode: 'no-cors'");
    expect(monitor).toContain("text/plain;charset=UTF-8");
    expect(nextConfig).toContain('no-store, max-age=0, must-revalidate');
  });

  it('emits the runtime audit action as a monitorable dataLayer event', () => {
    expect(auditPage).toContain("event: 'run_audit'");
  });

  it('does not surface GTM and consent lifecycle noise as ad-blocker detections', () => {
    expect(adblockRoute).toContain('INTERNAL_CORRELATION_NOISE_SQL');
    expect(adblockEvidence).toContain("event_name ILIKE 'gtm.%'");
    expect(adblockEvidence).toContain("event_name ILIKE 'termly.%'");
    expect(adblockEvidence).toContain("userprefupdate");
  });

  it('keeps malformed vendor observations from invalidating the entire ingest batch', () => {
    expect(readFileSync('lib/ingest-validation.ts', 'utf8')).toContain('Events must include at least one valid event');
    expect(readFileSync('lib/ingest-validation.ts', 'utf8')).toContain('filter((event): event is NormalizedTelemetryEvent');
  });

  it('keeps network duplicate alerts visible in the dashboard API', () => {
    expect(duplicateRoute).toContain("'duplicate_network_request'");
    expect(duplicateRoute).toContain('derivedFanout');
  });

  it('stores ad-block confidence separately from correlation gaps', () => {
    expect(schema).toContain('confidence TEXT NOT NULL DEFAULT \'confirmed\'');
    expect(schema).toContain("'correlation_gap'");
  });
});
