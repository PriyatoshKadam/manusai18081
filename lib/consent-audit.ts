export type ConsentVendorStatus = 'Compliant' | 'Violation' | 'Review' | 'Dormant' | 'N/A';

export type ConsentAuditEvidence = {
  inCrawler?: boolean;
  gpcEnabled?: boolean;
  cmpDetected?: boolean;
  bannerRendered?: boolean;
  acceptRejectEquivalentForNonNecessaryVendor?: boolean;
  nonNecessaryVendorBeforeBannerOrInteraction?: boolean;
  rejectionPersistsAcrossReload?: boolean;
  rejectControlFunctional?: boolean;
  bannerHasZeroControls?: boolean;
  consentSignalMalformed?: boolean;
  vendorStatuses?: ConsentVendorStatus[];
  gpcIgnoredByVendor?: boolean;
  bannerDelayedAfterOtherScripts?: boolean;
  rejectRequiresMoreStepsThanAccept?: boolean;
  blanketOnlyNoCategoryGranularity?: boolean;
  inconsistentAcrossPages?: boolean;
  inconsistentConsentModeAcrossVendors?: boolean;
};

export type ConsentAuditResult = {
  tier: 'Critical' | 'Moderate' | 'Optimal' | 'Inconclusive';
  findings: string[];
  unsupportedChecks: string[];
};

/**
 * Mirrors the supplied consent-audit table in priority order. A missing browser
 * crawler signal is intentionally treated as unknown, never as a pass/fail.
 */
export function evaluateConsentAudit(evidence: ConsentAuditEvidence): ConsentAuditResult {
  const critical: Array<[boolean | undefined, string]> = [
    [evidence.cmpDetected === false, 'No banner/CMP detected at all.'],
    [evidence.acceptRejectEquivalentForNonNecessaryVendor === true, 'Accept and Reject produce equivalent firing for a non-necessary vendor.'],
    [evidence.nonNecessaryVendorBeforeBannerOrInteraction === true, 'A non-necessary vendor fired before the banner rendered or before interaction.'],
    [evidence.rejectionPersistsAcrossReload === false, 'A rejected choice does not persist across reload/new session.'],
    [evidence.rejectControlFunctional === false, 'No functioning Reject control exists.'],
    [evidence.bannerHasZeroControls === true, 'The banner renders with no detectable Accept or Reject controls.'],
    [evidence.consentSignalMalformed === true, 'The consent signal is malformed.'],
    [evidence.vendorStatuses?.some((status) => status === 'Violation'), 'At least one vendor is classified as Violation.'],
    [evidence.gpcEnabled === true && evidence.gpcIgnoredByVendor === true, 'A vendor ignores a bare Global Privacy Control signal.'],
  ];
  const criticalFindings = critical.filter(([matched]) => matched).map(([, message]) => message);
  if (criticalFindings.length) return { tier: 'Critical', findings: criticalFindings, unsupportedChecks: unsupportedChecks(evidence) };

  const moderate: Array<[boolean | undefined, string]> = [
    [evidence.bannerDelayedAfterOtherScripts === true, 'The banner renders after other scripts have already started.'],
    [evidence.rejectRequiresMoreStepsThanAccept === true, 'Reject requires more steps than Accept.'],
    [evidence.blanketOnlyNoCategoryGranularity === true, 'Only accept-all/reject-all exists without per-category granularity.'],
    [evidence.inconsistentAcrossPages === true, 'The consent banner is inconsistent across pages/subdomains.'],
    [evidence.inconsistentConsentModeAcrossVendors === true, 'Consent Mode is confirmed for some vendors but not others.'],
    [evidence.vendorStatuses?.some((status) => status === 'Review'), 'At least one vendor is classified as Review.'],
  ];
  const moderateFindings = moderate.filter(([matched]) => matched).map(([, message]) => message);
  if (moderateFindings.length) return { tier: 'Moderate', findings: moderateFindings, unsupportedChecks: unsupportedChecks(evidence) };

  const unsupported = unsupportedChecks(evidence);
  if (unsupported.length) return { tier: 'Inconclusive', findings: [], unsupportedChecks: unsupported };
  return { tier: 'Optimal', findings: [], unsupportedChecks: [] };
}

function unsupportedChecks(evidence: ConsentAuditEvidence) {
  const checks: Array<[keyof ConsentAuditEvidence, string]> = [
    ['cmpDetected', 'CMP/banner detection'],
    ['bannerRendered', 'Banner render timing'],
    ['acceptRejectEquivalentForNonNecessaryVendor', 'Accept-vs-Reject differential vendor firing'],
    ['nonNecessaryVendorBeforeBannerOrInteraction', 'Pre-consent vendor firing timing'],
    ['rejectionPersistsAcrossReload', 'Reject persistence across reload/new session'],
    ['rejectControlFunctional', 'Reject control functionality'],
    ['bannerHasZeroControls', 'Banner control scan'],
    ['consentSignalMalformed', 'Consent signal schema validation'],
    ['gpcIgnoredByVendor', 'GPC pass'],
    ['bannerDelayedAfterOtherScripts', 'Banner timing comparison'],
    ['rejectRequiresMoreStepsThanAccept', 'Accept-vs-Reject click-path length'],
    ['blanketOnlyNoCategoryGranularity', 'Category-level control scan'],
    ['inconsistentAcrossPages', 'Cross-page/subdomain consistency'],
    ['inconsistentConsentModeAcrossVendors', 'Cross-vendor Consent Mode consistency'],
  ];
  return checks.filter(([key]) => evidence[key] === undefined).map(([, label]) => label);
}
