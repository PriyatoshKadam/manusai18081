import { describe, expect, it } from 'vitest';
import { parameterHealth } from '../lib/gtm-inventory';

describe('Reproduction of reported issues', () => {
  it('should detect LinkedIn partner_id from attribution_trigger URL', () => {
    const url = 'https://px.ads.linkedin.com/attribution_trigger?pid=5250281&time=1788165843324&url=https%3A%2F%2Fapp.mokkup.ai%2Fdashboard&tm=gtmv2';
    const health = parameterHealth('linkedin', 'page_view', {}, url);
    console.log('LinkedIn Health:', JSON.stringify(health));
    expect(health.parameterStatus).toBe('complete');
    expect(health.missingParameters).toHaveLength(0);
    expect(health.observedParameters).toContain('pid');
  });

  it('should detect Google Ads conversion_id from rmkt/collect URL', () => {
    const url = 'https://www.google.com/rmkt/collect/11078102743/?random=1788166114128&cv=11&fst=1788166114128&fmt=8&bg=ffffff&guid=ON&async=1';
    const health = parameterHealth('gads', 'conversion', {}, url);
    console.log('Google Ads Remarketing Health:', JSON.stringify(health));
    expect(health.parameterStatus).toBe('not_applicable');
    expect(health.missingParameters).toHaveLength(0);
  });

  it('should detect Google Ads conversion_id and label from first-party proxy URL', () => {
    const url = 'https://app.mokkup.ai/gtg1/gs/pagead/conversion/11078102743/?random=1788166603378&cv=11&en=conversion&label=Dk4NCNjuisQcENfduaIp';
    const health = parameterHealth('gads', 'conversion', {}, url);
    console.log('Google Ads Proxy Health:', JSON.stringify(health));
    expect(health.parameterStatus).toBe('complete');
    expect(health.observedParameters).toContain('conversion_id');
    expect(health.observedParameters).toContain('label');
  });
});
