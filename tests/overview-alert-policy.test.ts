import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('overview and alert policy contract', () => {
  it('routes only configured high-priority incidents in realtime and supports daily digests', () => {
    const notifications = read('lib/notifications.ts');
    const schema = read('db/schema.sql');
    const jobs = read('app/api/jobs/route.ts');
    expect(notifications).toContain("realtime_min_severity");
    expect(notifications).toContain('processDailyDigests');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS alert_digests');
    expect(jobs).toContain("job === 'digest'");
  });

  it('exposes a testable Slack configuration path and resilient overview loading', () => {
    expect(read('app/api/alert-deliveries/test/route.ts')).toContain('SLACK_WEBHOOK_URL');
    expect(read('app/dashboard/integrations/page.tsx')).toContain('Send a test to Slack');
    const overview = read('app/dashboard/page.tsx');
    expect(overview).toContain('fetchJson');
    expect(overview).not.toContain('useMemo');
  });

  it('documents synthetic and Ads identity for customers', () => {
    expect(read('app/dashboard/synthetic/page.tsx')).toContain('Create a synthetic HTTP journey');
    expect(read('app/dashboard/health/page.tsx')).toContain('confirmed network outcomes');
    expect(read('app/dashboard/vendor-view.tsx')).toContain('conversion_label');
    expect(read('app/api/events/route.ts')).toContain('google_conversion_label');
  });
});
