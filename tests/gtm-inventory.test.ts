import { describe, expect, it } from 'vitest';
import { correlateEventWithGtm, normalizeGtmInventory, parameterHealth } from '../lib/gtm-inventory';

describe('GTM inventory correlation', () => {
  const inventory = normalizeGtmInventory({
    accountId: '123',
    containerId: '456',
    workspaceId: '789',
    tags: [
      { tagId: '1', name: 'GA4 Login Tag', type: 'gaawe', firingTriggerId: ['10'], parameter: [{ key: 'eventName', value: 'login' }, { key: 'measurementId', value: 'G-TEST' }] },
      { tagId: '2', name: 'Google Ads Signup', type: 'awct', firingTriggerId: ['11'], parameter: [{ key: 'conversionId', value: 'AW-123' }, { key: 'conversionLabel', value: 'SignupLabel' }] },
    ],
    triggers: [
      { triggerId: '10', name: 'Login event', type: 'customEvent' },
      { triggerId: '11', name: 'Signup event', type: 'customEvent' },
    ],
  });

  it('matches a unique GA4 tag and trigger by event name', () => {
    const result = correlateEventWithGtm({ vendor: 'ga4', eventName: 'login', params: { tid: 'G-TEST' } }, inventory);
    expect(result.tagName).toBe('GA4 Login Tag');
    expect(result.triggerName).toBe('Login event');
    expect(result.confidence).toBe('configuration_match');
  });

  it('matches Google Ads by conversion ID and label', () => {
    const result = correlateEventWithGtm({ vendor: 'gads', eventName: 'conversion', params: { tid: 'AW-123', conversion_label: 'SignupLabel' }, rawUrl: 'https://www.googleadservices.com/pagead/conversion/AW-123/SignupLabel' }, inventory);
    expect(result.tagName).toBe('Google Ads Signup');
    expect(result.triggerName).toBe('Signup event');
    expect(result.confidence).toBe('configuration_match');
  });

  it('reports ambiguity instead of claiming one tag when candidates tie', () => {
    const ambiguous = normalizeGtmInventory({ ...inventory, tags: [
      { tagId: '1', name: 'Login A', type: 'gaawe', firingTriggerId: ['10'], parameter: [{ key: 'eventName', value: 'login' }] },
      { tagId: '2', name: 'Login B', type: 'gaawe', firingTriggerId: ['10'], parameter: [{ key: 'eventName', value: 'login' }] },
    ] });
    const result = correlateEventWithGtm({ vendor: 'ga4', eventName: 'login' }, ambiguous);
    expect(result.tagName).toBeNull();
    expect(result.confidence).toBe('ambiguous');
  });

  it('checks required purchase and Google Ads conversion parameters from request data', () => {
    expect(parameterHealth('ga4', 'purchase', { value: 10 }, null)).toMatchObject({ parameterStatus: 'missing', missingParameters: ['currency', 'transaction_id'] });
    expect(parameterHealth('gads', 'conversion', { tid: 'AW-123' }, 'https://www.googleadservices.com/pagead/conversion/AW-123/')).toMatchObject({ parameterStatus: 'missing', missingParameters: ['conversion_label'] });
    expect(parameterHealth('gads', 'page_view', {}, null).parameterStatus).toBe('not_applicable');
  });
});
