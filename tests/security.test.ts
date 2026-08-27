import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isBlockedHostname, isSafeOutboundUrl } from '../lib/outbound';
import { normalizeTelemetryEvent, redactTelemetryUrl } from '../lib/ingest-validation';
import { hostnameMatches, telemetryOriginAllowed } from '../lib/telemetry-origin';

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
    const monitor = read('public/monitor.js');
    expect(monitor).toContain('return original.apply(this, arguments);');
    expect(monitor).toContain("var opaque = parsed.statusCode === 0 && response.type === 'opaque'");
    expect(monitor).toContain('if (!response.ok && !opaque)');
  });

  it('enforces same-origin unsafe API requests while exempting telemetry paths', () => {
    const proxy = read('proxy.ts');
    expect(proxy).toContain('Cross-site request blocked');
    expect(proxy).toContain('!TELEMETRY_PATHS.has(req.nextUrl.pathname)');
    expect(read('app/api/jobs/route.ts')).toContain('crypto.timingSafeEqual');
    expect(read('app/api/jobs/route.ts')).toContain("Unsupported job");
  });

  it('accepts explicit app/www sibling hosts for one monitored site without allowing unrelated origins', () => {
    expect(hostnameMatches('app.mokkup.ai', 'www.mokkup.ai')).toBe(true);
    expect(hostnameMatches('www.mokkup.ai', 'app.mokkup.ai')).toBe(true);
    expect(telemetryOriginAllowed('app.mokkup.ai', 'www.mokkup.ai', 'www.mokkup.ai')).toBe(true);
    expect(telemetryOriginAllowed('evil.mokkup.ai', 'www.mokkup.ai', 'www.mokkup.ai')).toBe(false);
    expect(telemetryOriginAllowed('app.other.com', 'www.mokkup.ai', 'www.mokkup.ai')).toBe(false);
  });

  it('keeps telemetry authentication key-based with bounded rotation overlap', () => {
    const ingest = read('app/api/ingest/route.ts');
    const blocked = read('app/api/blocked/route.ts');
    const sites = read('app/api/sites/[id]/route.ts');
    expect(ingest).toContain('previous_api_key = $1 AND previous_api_key_expires_at > NOW()');
    expect(blocked).toContain('previous_api_key = $1 AND previous_api_key_expires_at > NOW()');
    expect(sites).toContain("body?.action !== 'rotate_api_key'");
    expect(sites).toContain("INTERVAL '48 hours'");
    expect(ingest).not.toContain('Telemetry origin is not registered for this site');
  });

  it('records detection failures and recurring blocker candidates without weakening collection auth', () => {
    expect(read('lib/detection.ts')).toContain('detection_failures');
    expect(read('app/api/jobs/route.ts')).toContain("job === 'detection'");
    expect(read('app/api/jobs/route.ts')).toContain("job === 'gtm'");
    expect(read('lib/gtm-inventory.ts')).toContain('refreshGtmSnapshotFreshness');
    expect(read('app/api/blocked/route.ts')).toContain('blocker_pattern_candidates');
    expect(read('app/api/adblock/route.ts')).toContain('candidates: candidates.rows');
  });

  it('keeps GTM setup failures recoverable and does not expose raw runtime errors', () => {
    const page = read('app/dashboard/gtm-connect/page.tsx');
    expect(page).toContain('Configure NEXT_PUBLIC_MONITOR_ORIGIN on the deployed service');
    expect(page).toContain('setAccounts(data.accounts || [])');
    expect(page).toContain('setWorkspaces(data.workspaces || [])');
    expect(page).not.toContain('window.history.replaceState');
    expect(page).not.toContain('router.replace');
  });

  it('downgrades non-live GTM inventory matches instead of claiming runtime identity', () => {
    const inventory = read('lib/gtm-inventory.ts');
    expect(inventory).toContain("inventory.snapshotStale && baseConfidence === 'configuration_match' ? 'likely_match'");
    expect(read('app/dashboard/gtm-connect/page.tsx')).toContain('Choose a workspace to read tag, trigger, and variable metadata.');
  });

  it('keeps read endpoints side-effect free and neutralizes CSV formulas', () => {
    const policy = read('app/api/alert-policy/route.ts');
    expect(policy.split('export async function POST')[0]).not.toContain('INSERT INTO alert_policies');
    expect(read('app/api/export/route.ts')).toContain('/^[-=+@]/');
  });
});
