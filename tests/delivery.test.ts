import { describe, expect, it } from 'vitest';
import { classifyDeliveryMode, isPlatformDomain } from '../lib/delivery';

describe('delivery mode classification', () => {
  const site = { domain: 'shop.example.com', first_party_domain: 'events.example.com' };

  it('classifies a request to the page host as first-party', () => {
    expect(classifyDeliveryMode('https://shop.example.com/collect', 'https://shop.example.com/checkout', site)).toBe('first_party');
  });

  it('classifies a configured custom endpoint as first-party', () => {
    expect(classifyDeliveryMode('https://events.example.com/ga4', 'https://shop.example.com/checkout', site)).toBe('first_party');
  });

  it('classifies the configured application origin as first-party', () => {
    expect(classifyDeliveryMode('https://dev-app.gafix.ai/collect', 'https://shop.example.com/checkout', { ...site, appOrigin: 'https://dev-app.gafix.ai' })).toBe('first_party');
  });

  it('classifies a known platform host as a vendor destination', () => {
    expect(classifyDeliveryMode('https://www.google-analytics.com/g/collect', 'https://shop.example.com/checkout', site)).toBe('third_party');
  });

  it('does not label an unrelated host as first-party', () => {
    expect(classifyDeliveryMode('https://collector.vendor.test/collect', 'https://shop.example.com/checkout', site)).toBe('unknown');
  });

  it('recognizes platform hosts for blocker evidence', () => {
    expect(isPlatformDomain('analytics.tiktok.com')).toBe(true);
    expect(isPlatformDomain('events.example.com')).toBe(false);
  });
});
