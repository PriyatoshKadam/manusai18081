import { describe, expect, it } from 'vitest';
import { classifyDuplicateRootCause, classifyEvent, getEventIdentity, normalizePageUrl } from '../lib/detection';
import { normalizeHostname, normalizeSiteInput } from '../lib/site-validation';
import { normalizeTelemetryEvent, parseIngestBody } from '../lib/ingest-validation';
import { buildGtmAuthorizationUrl, decryptSecret, encryptSecret, monitorTagPayload } from '../lib/gtm';

describe('site validation', () => {
  it('normalizes hostnames and rejects paths', () => {
    expect(normalizeHostname('https://Shop.Acme.com/', 'Domain', true)).toBe('shop.acme.com');
    expect(normalizeHostname('https//dev-app.gafix.ai', 'Domain', true)).toBe('dev-app.gafix.ai');
    expect(() => normalizeHostname('shop.acme.com/path', 'Domain', true)).toThrow();
  });

  it('validates vendor identifiers', () => {
    expect(normalizeSiteInput({ domain: 'shop.acme.com', gtm_container_id: 'GTM-ABC123', ga4_measurement_id: 'G-ABC123' })).toMatchObject({
      domain: 'shop.acme.com',
      gtm_container_id: 'GTM-ABC123',
      ga4_measurement_id: 'G-ABC123',
    });
    expect(() => normalizeSiteInput({ domain: 'shop.acme.com', ga4_measurement_id: 'not-a-ga4-id' })).toThrow();
  });
});

describe('event identity and classification', () => {
  const base = {
    siteId: 1,
    eventId: 2,
    receivedAt: new Date(),
    vendor: 'ga4',
    eventName: 'purchase',
    pageUrl: 'https://shop.acme.com/checkout#confirmation',
    clientId: 'client-1',
    params: { transaction_id: 'order-123' },
    rawUrl: '',
    dlPushIndex: 4,
    source: 'gtm',
  };

  it('ignores URL fragments and prefers transaction identity', () => {
    expect(normalizePageUrl(base.pageUrl)).toBe('https://shop.acme.com/checkout');
    expect(getEventIdentity(base)).toBe('strong:order-123');
  });

  it('classifies standard, custom, and missing events', () => {
    expect(classifyEvent('page_view')).toBe('standard');
    expect(classifyEvent('run_audit')).toBe('custom');
    expect(classifyEvent('gtm.click', 'gtm')).toBe('internal');
    expect(classifyEvent(null)).toBe('unknown');
  });

  it('explains duplicate root cause from dataLayer and transport evidence', () => {
    expect(classifyDuplicateRootCause(base, { id: 1, dlPushIndex: 3, source: 'gtm', rawUrl: null })).toContain('dataLayer');
    expect(classifyDuplicateRootCause({ ...base, dlPushIndex: 4, source: 'fetch' }, { id: 1, dlPushIndex: 4, source: 'gtm', rawUrl: null })).toContain('transport');
  });
});

describe('GTM Connect helpers', () => {
  it('builds scoped OAuth URLs and round-trips encrypted credentials', () => {
    const originalSecret = process.env.SESSION_SECRET;
    const originalClient = process.env.GTM_CLIENT_ID;
    const originalRedirect = process.env.GTM_REDIRECT_URI;
    process.env.SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars';
    process.env.GTM_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    process.env.GTM_REDIRECT_URI = 'https://monitor.example.com/api/gtm/callback';
    try {
      const authorization = new URL(buildGtmAuthorizationUrl('state-token'));
      expect(authorization.searchParams.get('client_id')).toBe(process.env.GTM_CLIENT_ID);
      expect(authorization.searchParams.get('access_type')).toBe('offline');
      expect(authorization.searchParams.get('scope')).toContain('tagmanager.publish');
      expect(decryptSecret(encryptSecret('refresh-token-value'))).toBe('refresh-token-value');

      delete process.env.GTM_REDIRECT_URI;
      const fallbackAuthorization = new URL(buildGtmAuthorizationUrl('state-token', 'https://monitoring-0jsu.onrender.com/api/gtm/connect'));
      expect(fallbackAuthorization.searchParams.get('redirect_uri')).toBe('https://monitoring-0jsu.onrender.com/api/gtm/callback');
    } finally {
      process.env.SESSION_SECRET = originalSecret;
      process.env.GTM_CLIENT_ID = originalClient;
      process.env.GTM_REDIRECT_URI = originalRedirect;
    }
  });

  it('builds a bounded Custom HTML monitor tag payload', () => {
    process.env.NEXT_PUBLIC_MONITOR_ORIGIN = 'https://monitor.example.com/';
    const tag = monitorTagPayload({ id: 1, api_key: 'a'.repeat(48) }, 'trigger-1');
    expect(tag.type).toBe('html');
    expect(tag.firingTriggerId).toEqual(['trigger-1']);
    expect(tag.parameter[0].value).toContain('https://monitor.example.com/monitor.js?apiKey=');
    delete process.env.NEXT_PUBLIC_MONITOR_ORIGIN;
  });
});

describe('ingest validation', () => {
  it('accepts bounded valid batches and normalizes fields', () => {
    const result = parseIngestBody(JSON.stringify({ apiKey: 'a'.repeat(48), events: [{ vendor: 'GA4', eventName: 'purchase', pageUrl: 'https://shop.acme.com', params: { value: 10 } }] }));
    expect(result.apiKey).toHaveLength(48);
    expect(result.events[0]).toMatchObject({ vendor: 'ga4', eventName: 'purchase' });
  });

  it('rejects oversized batches', () => {
    expect(() => parseIngestBody(JSON.stringify({ apiKey: 'a'.repeat(48), events: new Array(101).fill({ vendor: 'ga4' }) }))).toThrow('maximum');
  });

  it('preserves custom event observations and occurrence metadata', () => {
    expect(normalizeTelemetryEvent({ vendor: 'GA4', eventName: 'run_audit', observationKind: 'datalayer', sessionId: 'session-1', occurrenceId: 'event-1', navigationId: 'nav-1', gtmContainerId: 'GTM-ABC123', params: { audit_type: 'full' } })).toMatchObject({ vendor: 'ga4', eventName: 'run_audit', observationKind: 'datalayer', sessionId: 'session-1', occurrenceId: 'event-1', navigationId: 'nav-1' });
  });

  it('preserves bounded response, latency, consent, and vitals evidence', () => {
    expect(normalizeTelemetryEvent({ vendor: 'ga4', eventName: 'run_audit', statusCode: 204, latencyMs: 87.4, failureReason: null, consentState: { analytics_storage: 'granted' }, webVitals: { lcp: 1234.56 } })).toMatchObject({ statusCode: 204, latencyMs: 87, consentState: { analytics_storage: 'granted' }, webVitals: { lcp: 1234.56 } });
  });

  it('rejects unsafe observation kinds and tokens', () => {
    expect(() => normalizeTelemetryEvent({ vendor: 'ga4', eventName: 'run_audit', observationKind: 'javascript:alert(1)' })).toThrow('Invalid observation kind');
  });
});
