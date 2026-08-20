import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isBlockedHostname, isSafeOutboundUrl } from '../lib/outbound';
import { normalizeTelemetryEvent, redactTelemetryUrl } from '../lib/ingest-validation';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('security hardening', () => {
  it('blocks private and metadata outbound destinations', async () => {
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
    expect(await isSafeOutboundUrl('https://127.0.0.1/webhook')).toBe(false);
    expect(await isSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('redacts credentials and sensitive query parameters from telemetry URLs', () => {
    const redacted = redactTelemetryUrl('https://shop.example/checkout?email=user@example.com&token=secret&foo=bar#fragment');
    expect(redacted).toBe('https://shop.example/checkout?foo=bar');
  });

  it('drops sensitive event parameters and pseudonymizes client identifiers', () => {
    const previous = process.env.IP_HASH_SECRET;
    process.env.IP_HASH_SECRET = 'test-only-secret-that-is-long-enough';
    try {
      const event = normalizeTelemetryEvent({
        vendor: 'ga4',
        eventName: 'purchase',
        clientId: '123.456',
        pageUrl: 'https://shop.example/checkout?email=user@example.com&order_id=abc',
        rawUrl: 'https://www.google-analytics.com/g/collect?cid=123.456&gcs=G111&token=secret',
        params: { value: 100, email: 'user@example.com', authorization: 'Bearer secret', currency: 'USD' },
      });
      expect(event.clientId).toMatch(/^[a-f0-9]{32}$/);
      expect(event.params).toEqual({ value: 100, currency: 'USD' });
      expect(event.pageUrl).toBe('https://shop.example/checkout?order_id=abc');
      expect(event.rawUrl).toBe('https://www.google-analytics.com/g/collect?gcs=G111');
    } finally {
      if (previous === undefined) delete process.env.IP_HASH_SECRET; else process.env.IP_HASH_SECRET = previous;
    }
  });

  it('enforces tenant scope for synthetic execution and fail-open monitoring hooks', () => {
    expect(read('lib/synthetic.ts')).toContain('j.site_id = $2');
    expect(read('lib/synthetic.ts')).toContain('s.user_id = $3');
    expect(read('app/api/synthetic/route.ts')).toContain('userId: Number(session.uid)');
    expect(read('public/monitor.js')).toContain('try { parsed = network(url, body,');
    expect(read('public/monitor.js')).toContain('return original.apply(this, arguments);');
  });

  it('enforces same-origin unsafe API requests and constant-time cron authorization', () => {
    expect(read('proxy.ts')).toContain('Cross-site request blocked');
    expect(read('app/api/jobs/route.ts')).toContain('crypto.timingSafeEqual');
    expect(read('app/api/jobs/route.ts')).toContain("Unsupported job");
  });

  it('keeps read endpoints side-effect free and neutralizes CSV formulas', () => {
    const policy = read('app/api/alert-policy/route.ts');
    expect(policy.split('export async function POST')[0]).not.toContain('INSERT INTO alert_policies');
    expect(read('app/api/export/route.ts')).toContain('/^[-=+@]/');
  });
});
