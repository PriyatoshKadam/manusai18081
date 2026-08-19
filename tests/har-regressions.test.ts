import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const monitor = fs.readFileSync('public/monitor.js', 'utf8');
const auditPage = fs.readFileSync('app/dashboard/audit/page.tsx', 'utf8');
const duplicateRoute = fs.readFileSync('app/api/duplicates/route.ts', 'utf8');
const schema = fs.readFileSync('db/schema.sql', 'utf8');

 describe('HAR regression protections', () => {
  it('flushes queued telemetry during page exit and uses correlation-gap signals', () => {
    expect(monitor).toContain("window.addEventListener('pagehide', flushOnPageExit)");
    expect(monitor).toContain("document.visibilityState === 'hidden'");
    expect(monitor).toContain("reportBlocked('ga4_event_unmatched'");
    expect(monitor).toContain('text/plain;charset=UTF-8');
  });

  it('emits the runtime audit action as a monitorable dataLayer event', () => {
    expect(auditPage).toContain("event: 'run_audit'");
  });

  it('keeps network duplicate alerts visible in the dashboard API', () => {
    expect(duplicateRoute).toContain("'duplicate_network_request'");
  });

  it('stores ad-block confidence separately from correlation gaps', () => {
    expect(schema).toContain('confidence TEXT NOT NULL DEFAULT \'confirmed\'');
    expect(schema).toContain("'correlation_gap'");
  });
});
