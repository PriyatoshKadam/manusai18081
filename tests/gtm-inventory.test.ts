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
      { tagId: '3', name: 'Google Ads Remarketing', type: 'sp', firingTriggerId: ['12'], parameter: [{ key: 'conversionId', value: '11078102743' }] },
      { tagId: '4', name: 'Meta Pixel Base', type: 'html', firingTriggerId: ['13'], parameter: [{ key: 'pixelId', value: '832600056900407' }] },
      { tagId: '5', name: 'LinkedIn Insight Tag', type: 'html', firingTriggerId: ['14'], parameter: [{ key: 'partnerId', value: '2919002' }] },
    ],
    triggers: [
      { triggerId: '10', name: 'Login event', type: 'customEvent' },
      { triggerId: '11', name: 'Signup event', type: 'customEvent' },
      { triggerId: '12', name: 'All Pages', type: 'pageview' },
      { triggerId: '13', name: 'Meta All Pages', type: 'pageview' },
      { triggerId: '14', name: 'LinkedIn All Pages', type: 'pageview' },
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
    expect(parameterHealth('gads', 'conversion', {}, 'https://www.googleadservices.com/pagead/conversion/11078102743/?label=Dk4NCNjuisQcENfduaIp&en=conversion')).toMatchObject({ parameterStatus: 'complete', missingParameters: [], observedParameters: ['conversion_id', 'label'] });
    expect(parameterHealth('gads', 'gtag.config', {}, 'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/11078102743/?en=gtag.config')).toMatchObject({ parameterStatus: 'not_applicable', missingParameters: [] });
    expect(parameterHealth('gads', 'page_view', {}, null).parameterStatus).toBe('not_applicable');
    expect(parameterHealth('meta', 'PageView', { id: '832600056900407', ev: 'PageView' }, 'https://www.facebook.com/tr/?id=832600056900407&ev=PageView')).toMatchObject({ parameterStatus: 'complete', missingParameters: [] });
    expect(parameterHealth('linkedin', 'page_view', { pid: '2919002' }, 'https://px.ads.linkedin.com/collect?v=2&pid=2919002')).toMatchObject({ parameterStatus: 'complete', missingParameters: [] });
  });

  it('matches Meta Pixel and LinkedIn Insight Tag by platform identifier', () => {
    const meta = correlateEventWithGtm({ vendor: 'meta', eventName: 'PageView', params: { id: '832600056900407', ev: 'PageView' }, rawUrl: 'https://www.facebook.com/tr/?id=832600056900407&ev=PageView' }, inventory);
    expect(meta.tagName).toBe('Meta Pixel Base');
    expect(meta.triggerName).toBe('Meta All Pages');
    expect(meta.confidence).toBe('configuration_match');
    const linkedin = correlateEventWithGtm({ vendor: 'linkedin', eventName: 'page_view', params: { pid: '2919002' }, rawUrl: 'https://px.ads.linkedin.com/collect?v=2&pid=2919002' }, inventory);
    expect(linkedin.tagName).toBe('LinkedIn Insight Tag');
    expect(linkedin.triggerName).toBe('LinkedIn All Pages');
    expect(linkedin.confidence).toBe('configuration_match');
  });

  it('matches the Google Ads Remarketing tag for view-through configuration requests', () => {
    const result = correlateEventWithGtm({ vendor: 'gads', eventName: 'gtag.config', rawUrl: 'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/11078102743/?en=gtag.config' }, inventory);
    expect(result.tagName).toBe('Google Ads Remarketing');
    expect(result.triggerName).toBe('All Pages');
    expect(result.confidence).toBe('configuration_match');
  });
});
