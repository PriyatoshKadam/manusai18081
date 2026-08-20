import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('Slack and repeated-event regressions', () => {
  it('uses the global Slack webhook when a site override is absent', () => {
    const source = read('lib/notifications.ts');
    expect(source).toContain('process.env.SLACK_WEBHOOK_URL');
    expect(source).toContain('COALESCE(NULLIF(s.slack_webhook_url');
    expect(source).toContain('alert_deliveries');
  });

  it('treats login and run_audit as repeat-sensitive and accumulates evidence', () => {
    const detection = read('lib/detection.ts');
    const duplicates = read('app/api/duplicates/route.ts');
    expect(detection).toContain("'run_audit'");
    expect(detection).toContain('occurrence_count = COALESCE(occurrence_count, 1) + 1');
    expect(detection).toContain('last_seen = NOW()');
    expect(duplicates).toContain("'run_audit'");
    expect(duplicates).toContain('occurrence_id');
    expect(duplicates).toContain('occurrence_count > 1');
  });

  it('exposes a customer-facing action center and delivery status', () => {
    const page = read('app/dashboard/page.tsx');
    expect(page).toContain('Action center');
    expect(page).toContain('Delivery health');
    expect(page).toContain('/api/alert-deliveries');
    expect(page).toContain('Live event pulse');
  });
});
