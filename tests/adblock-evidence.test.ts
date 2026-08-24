import { describe, expect, it } from 'vitest';
import { isInternalCorrelationNoise } from '../lib/adblock-evidence';

describe('ad-blocker evidence classification', () => {
  it('suppresses lifecycle correlation noise regardless of stored confidence', () => {
    for (const confidence of ['correlation_gap', 'telemetry_gap', undefined]) {
      expect(isInternalCorrelationNoise('ga4_event_unmatched', 'Termly.consentSaveDone', confidence)).toBe(true);
      expect(isInternalCorrelationNoise('ga4_event_unmatched', 'userPrefUpdate', confidence)).toBe(true);
      expect(isInternalCorrelationNoise('ga4_event_unmatched', 'gtm.dom', confidence)).toBe(true);
    }
  });

  it('does not suppress customer analytics events or other detection methods', () => {
    expect(isInternalCorrelationNoise('ga4_event_unmatched', 'menu_clicks', 'telemetry_gap')).toBe(false);
    expect(isInternalCorrelationNoise('resource_error', 'userPrefUpdate', 'telemetry_gap')).toBe(false);
    expect(isInternalCorrelationNoise('ga4_event_unmatched', 'TermlyConsent', 'correlation_gap')).toBe(false);
  });
});
