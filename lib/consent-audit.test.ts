import { describe, expect, it } from 'vitest';
import { evaluateConsentAudit } from './consent-audit';

describe('evaluateConsentAudit', () => {
  it('stops at the first critical tier', () => {
    const result = evaluateConsentAudit({ cmpDetected: false, bannerDelayedAfterOtherScripts: true, vendorStatuses: ['Review'] });
    expect(result.tier).toBe('Critical');
    expect(result.findings[0]).toMatch(/No banner\/CMP/);
  });

  it('returns moderate when no critical condition exists', () => {
    const result = evaluateConsentAudit({
      cmpDetected: true,
      bannerRendered: true,
      acceptRejectEquivalentForNonNecessaryVendor: false,
      nonNecessaryVendorBeforeBannerOrInteraction: false,
      rejectionPersistsAcrossReload: true,
      rejectControlFunctional: true,
      bannerHasZeroControls: false,
      consentSignalMalformed: false,
      vendorStatuses: ['Compliant'],
      bannerDelayedAfterOtherScripts: true,
    });
    expect(result.tier).toBe('Moderate');
  });

  it('does not call an incomplete browser audit optimal', () => {
    const result = evaluateConsentAudit({ cmpDetected: true, vendorStatuses: ['Compliant'] });
    expect(result.tier).toBe('Inconclusive');
    expect(result.unsupportedChecks.length).toBeGreaterThan(0);
  });
});
