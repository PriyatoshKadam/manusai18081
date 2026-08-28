import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyRevenueStatus } from '../lib/revenue';
import { classifyDeliveryMode, deliveryModeLabel } from '../lib/delivery';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('accuracy contracts', () => {
  it('does not call a dataLayer-only observation a successful delivery', () => {
    const source = read('app/api/tag-health/route.ts');
    expect(source).toContain("const successfulDelivery = `${networkObservation} AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL`;");
    expect(source).toContain("sample_basis: 'network_delivery_attempts'");
  });

  it('distinguishes missing tools, mismatched currencies, and matching records', () => {
    expect(classifyRevenueStatus({ expectedVendors: ['ga4', 'gads'], observedVendors: ['ga4'], currencies: ['USD'], invalidValue: false, values: [100], delta: null })).toBe('missing_vendor');
    expect(classifyRevenueStatus({ expectedVendors: ['ga4', 'gads'], observedVendors: ['ga4', 'gads'], currencies: ['USD', 'INR'], invalidValue: false, values: [100, 100], delta: null })).toBe('currency_mismatch');
    expect(classifyRevenueStatus({ expectedVendors: ['ga4', 'gads'], observedVendors: ['ga4', 'gads'], currencies: ['USD'], invalidValue: false, values: [100, 100], delta: 0 })).toBe('matched');
    expect(classifyRevenueStatus({ expectedVendors: ['ga4'], observedVendors: ['ga4'], currencies: ['USD'], invalidValue: true, values: [], delta: null })).toBe('invalid_value');
  });

  it('does not describe a first-party destination as proof of server-side processing', () => {
    expect(classifyDeliveryMode('https://events.example.com/collect', 'https://shop.example.com/checkout', { domain: 'shop.example.com', first_party_domain: 'events.example.com' })).toBe('first_party');
    expect(deliveryModeLabel('first_party')).toBe('First-party destination');
    expect(read('app/dashboard/flow-summary.tsx')).toContain('does not alone prove server-side processing');
  });

  it('keeps monitor implementation origin separate from request transport', () => {
    const monitor = read('public/monitor.js');
    expect(monitor).toContain('originSource: implementationSource');
    expect(monitor).toContain("source: transport || 'network'");
    expect(monitor).toContain("networkOccurrenceId: 'network-' + (++networkOccurrence)");
  });

  it('does not expose full keys in the authenticated site list or dashboard layout', () => {
    expect(read('app/api/sites/route.ts')).not.toContain('SELECT id, domain, api_key');
    expect(read('app/dashboard/layout.tsx')).not.toContain('SELECT id, domain, api_key');
  });
});
