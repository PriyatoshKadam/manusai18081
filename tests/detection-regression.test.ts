import { describe, expect, it } from 'vitest';
import { classifyEvent, getStrongIdentity, paramsSignature } from '../lib/detection';

describe('duplicate detection regression rules', () => {
  it('classifies login and sign_up as custom events', () => {
    expect(classifyEvent('login', 'ga4')).toBe('custom');
    expect(classifyEvent('sign_up', 'ga4')).toBe('custom');
  });

  it('does not manufacture a strong identity for a login without event_id', () => {
    const event = {
      eventId: 1,
      siteId: 1,
      receivedAt: new Date(),
      vendor: 'ga4',
      eventName: 'login',
      pageUrl: 'https://example.com/login',
      clientId: 'c1',
      params: { method: 'Google' },
      rawUrl: '',
      dlPushIndex: 10,
      source: 'datalayer',
      observationKind: 'datalayer',
      sessionId: 's1',
      occurrenceId: 'occ-1',
      navigationId: 'nav-1',
    } as any;

    expect(getStrongIdentity(event)).toBeNull();
  });

  it('does not manufacture a strong identity for sign_up without event_id', () => {
    const event = {
      eventId: 1,
      siteId: 1,
      receivedAt: new Date(),
      vendor: 'ga4',
      eventName: 'sign_up',
      pageUrl: 'https://example.com/signup',
      clientId: 'c1',
      params: { method: 'email' },
      rawUrl: '',
      dlPushIndex: 11,
      source: 'datalayer',
      observationKind: 'datalayer',
      sessionId: 's1',
      occurrenceId: 'occ-2',
      navigationId: 'nav-1',
    } as any;

    expect(getStrongIdentity(event)).toBeNull();
  });

  it('keeps login payload normalization deterministic without treating it as identity', () => {
    expect(paramsSignature({ method: 'Google', debug_mode: true })).toContain('method=Google');
    expect(paramsSignature({ method: 'Google', debug_mode: true })).toBe(paramsSignature({ debug_mode: true, method: 'Google' }));
  });

  it('uses transaction_id as a strong identity for purchase', () => {
    const event = {
      eventId: 1,
      siteId: 1,
      receivedAt: new Date(),
      vendor: 'ga4',
      eventName: 'purchase',
      pageUrl: 'https://example.com/thank-you',
      clientId: 'c1',
      params: { transaction_id: 'ORD-123' },
      rawUrl: '',
      dlPushIndex: null,
      source: 'network',
    } as any;

    expect(getStrongIdentity(event)).toBe('transaction:ORD-123');
  });
});
