import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyRevenueStatus } from '../lib/revenue';
import { classifyDeliveryMode, deliveryModeLabel } from '../lib/delivery';
import { classifyDeliveryOutcome } from '../lib/delivery-outcome';
import { normalizeSiteInput } from '../lib/site-validation';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('accuracy contracts', () => {
  it('does not call a dataLayer-only observation a successful delivery', () => {
    const source = read('app/api/tag-health/route.ts');
    expect(source).toContain("const successfulDelivery=`${networkObservation} AND delivery_outcome='delivered'`");
    expect(source).toContain("sample_basis:'confirmed_network_delivery_outcomes'");
  });

  it('distinguishes confirmed failures from transport anomalies', () => {
    const source = read('app/api/tag-health/route.ts');
    expect(source).toContain("delivery_outcome IN ('http_error','blocked','beacon_rejected')");
    expect(source).toContain("delivery_outcome IN('network_error','aborted','timeout','unknown')");
    expect(source).not.toContain("delivery_outcome IN('http_error','network_error','aborted','timeout','blocked','beacon_rejected')");
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
    expect(monitor).toContain("networkOccurrenceId: observationKind === 'network' ? 'network-' + (++networkOccurrence) : null");
  });

  it('classifies delivery outcomes without calling status-zero evidence delivered', () => {
    expect(classifyDeliveryOutcome({ observationKind: 'network', transport: 'fetch', statusCode: 204, failureReason: null })).toBe('delivered');
    expect(classifyDeliveryOutcome({ observationKind: 'network', transport: 'fetch', statusCode: 503, failureReason: 'http_503' })).toBe('http_error');
    expect(classifyDeliveryOutcome({ observationKind: 'network', transport: 'fetch', statusCode: 0, failureReason: 'network_error' })).toBe('network_error');
    expect(classifyDeliveryOutcome({ observationKind: 'network', transport: 'xhr', statusCode: 0, failureReason: 'aborted' })).toBe('aborted');
    expect(classifyDeliveryOutcome({ observationKind: 'network', transport: 'sendBeacon', statusCode: null, failureReason: 'beacon_rejected', beaconAccepted: false })).toBe('beacon_rejected');
    expect(classifyDeliveryOutcome({ observationKind: 'network', transport: 'fetch', statusCode: 0, failureReason: 'http_0' })).toBe('unknown');
    expect(classifyDeliveryOutcome({ observationKind: 'resource', transport: 'performance', statusCode: null })).toBe('unknown');
  });

  it('requires explicit purchase routing and rejects negative purchase values', () => {
    expect(normalizeSiteInput({ domain: 'example.com', purchase_routing_vendors: 'ga4, meta' }).vendor_routing_policy).toEqual({ events: { purchase: ['ga4', 'meta'] } });
    expect(normalizeSiteInput({ domain: 'example.com', purchase_routing_vendors: '' }).vendor_routing_policy).toEqual({});
    expect(() => normalizeSiteInput({ domain: 'example.com', purchase_routing_vendors: 'ga4, unknown' })).toThrow();
    expect(read('lib/ingest-validation.ts')).toContain("normalizedEventName === 'purchase' ? rawRevenue >= 0");
  });

  it('keeps ordinary resource errors out of compliance findings', () => {
    expect(read('lib/compliance.ts')).not.toContain("'resource_error'");
    expect(read('public/monitor.js')).toContain("diagnostic('resource_error'");
  });

  it('does not expose full keys in the authenticated site list or dashboard layout', () => {
    expect(read('app/api/sites/route.ts')).not.toContain('SELECT id, domain, api_key');
    expect(read('app/dashboard/layout.tsx')).not.toContain('SELECT id, domain, api_key');
  });
});
