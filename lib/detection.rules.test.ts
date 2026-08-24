import { describe, expect, it } from 'vitest';
import { classifyEvent, decodeGcs, getStrongIdentity, paramsSignature } from './detection';

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

  it('decodes Consent Mode gcs values', () => {
    expect(decodeGcs('G100')).toEqual({ value: 'G100', ad_storage: 'denied', analytics_storage: 'denied' });
    expect(decodeGcs('G111')).toEqual({ value: 'G111', ad_storage: 'granted', analytics_storage: 'granted' });
  });
});
