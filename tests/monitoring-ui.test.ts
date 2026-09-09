import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('monitoring command center UI', () => {
  it('uses real evidence sections and avoids vendor-side certainty claims', () => {
    const source = read('app/dashboard/monitoring-command-center.tsx');
    expect(source).toContain("'Overview'");
    expect(source).toContain("'Alerts'");
    expect(source).toContain("'Tracking sources'");
    expect(source).toContain("'Consent'");
    expect(source).toContain("'GTM setup'");
    expect(source).toContain('does not claim that a vendor processed a request');
    expect(source).toContain('first-party destination is not by itself proof of server-side processing');
  });

  it('keeps the monitoring panel connected to existing tenant-scoped data', () => {
    const page = read('app/dashboard/page.tsx');
    expect(page).toContain('<MonitoringCommandCenter');
    expect(page).toContain('stats={stats}');
    expect(page).toContain('flow={data.flow || []}');
    expect(page).toContain('blockedFlow={data.blockedFlow || []}');
    expect(page).toContain('siteId={siteId}');
  });
});
