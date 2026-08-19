import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeTelemetryEvent } from '../lib/ingest-validation';

describe('TagDrishti-style feature contract', () => {
  it('accepts vendor-function observations and normalizes revenue evidence', () => {
    const event = normalizeTelemetryEvent({ vendor: 'meta', eventName: 'Purchase', observationKind: 'function', params: { value: 1299.5, currency: 'INR', transaction_id: 'order-1' }, rawUrl: 'https://connect.facebook.net/tr', isSynthetic: false });
    expect(event.observationKind).toBe('function');
    expect(event.revenueValue).toBe(1299.5);
    expect(event.revenueCurrency).toBe('INR');
    expect(event.transactionId).toBe('order-1');
    expect(event.resourceDomain).toBe('connect.facebook.net');
  });

  it('keeps required evidence tables and browser compliance hooks present', () => {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const monitor = readFileSync(new URL('../public/monitor.js', import.meta.url), 'utf8');
    for (const table of ['alert_policies', 'alert_deliveries', 'tag_baselines', 'anomaly_runs', 'revenue_reconciliations', 'synthetic_journeys', 'synthetic_runs', 'script_allowlist', 'compliance_findings', 'site_webhooks']) expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(monitor).toContain("securitypolicyviolation");
    expect(monitor).toContain("sri_missing");
    expect(monitor).toContain('patchVendorFunctions');
    expect(monitor).toContain("captureVital('inp'");
  });
});
