import { describe, expect, it } from 'vitest';
import { classifyEvent, decodeGcs, getStrongIdentity, isTransportRetryPair, paramsSignature } from './detection';

describe('tracking detection rules', () => {
  it('classifies unknown event names as custom', () => {
    expect(classifyEvent('audit_completed', 'ga4')).toBe('custom');
  });

  it('classifies page_view as standard', () => {
    expect(classifyEvent('page_view', 'ga4')).toBe('standard');
  });

  it('extracts transaction_id as the strongest identity', () => {
    expect(getStrongIdentity({
      siteId: 1, eventId: 1, receivedAt: new Date(), vendor: 'ga4', eventName: 'purchase',
      pageUrl: 'https://example.com/thank-you', clientId: null, params: { transaction_id: 'ORD-123' },
      rawUrl: '', dlPushIndex: null, source: 'gtm',
    })).toBe('transaction:ORD-123');
  });

  it('does not treat parameter order as a payload change', () => {
    expect(paramsSignature({ b: 2, a: 1 })).toBe(paramsSignature({ a: 1, b: 2 }));
  });

  it('decodes all Consent Mode gcs storage combinations', () => {
    expect(decodeGcs('G100')).toEqual({ value: 'G100', ad_storage: 'denied', analytics_storage: 'denied' });
    expect(decodeGcs('G101')).toEqual({ value: 'G101', ad_storage: 'denied', analytics_storage: 'granted' });
    expect(decodeGcs('G110')).toEqual({ value: 'G110', ad_storage: 'granted', analytics_storage: 'denied' });
    expect(decodeGcs('G111')).toEqual({ value: 'G111', ad_storage: 'granted', analytics_storage: 'granted' });
  });

  it('classifies recommended and vendor standard events', () => {
    expect(classifyEvent('login', 'ga4')).toBe('standard');
    expect(classifyEvent('Purchase', 'meta')).toBe('standard');
    expect(classifyEvent('CompletePayment', 'tiktok')).toBe('standard');
    expect(classifyEvent('PURCHASE', 'snapchat')).toBe('standard');
    expect(classifyEvent('pageLoad', 'bing')).toBe('standard');
    expect(classifyEvent('lead_submitted', 'meta')).toBe('custom');
  });

  it('recognizes failed-then-successful identical requests as transport retries', () => {
    const previous = { requestSignature: 'sig', statusCode: 0, failureReason: 'network_error', receivedAt: new Date('2026-08-27T00:00:00.000Z') } as any;
    const current = { requestSignature: 'sig', statusCode: 204, failureReason: null, receivedAt: new Date('2026-08-27T00:00:02.000Z') } as any;
    expect(isTransportRetryPair(current, previous)).toBe(true);
    expect(isTransportRetryPair({ ...current, requestSignature: 'other' }, previous)).toBe(false);
  });
});
