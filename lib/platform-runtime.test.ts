import { describe, expect, it } from 'vitest';
import {
  classifyAttribution,
  classifyDeliveryOutcome as classifyRuntimeDeliveryOutcome,
  classifyImplementationSource,
  extractPlatformRuntimeIdentity,
  parsePlatformConsent,
} from './platform-runtime';

describe('platform runtime identity adapters', () => {
  it('extracts GA4 event identity from protocol parameters', () => {
    const result = extractPlatformRuntimeIdentity('ga4', {
      event_name: 'unknown',
      params: { tid: 'G-ABC123', en: 'purchase', epn: { value: 99.95 } },
      raw_url: 'https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&en=purchase',
    });
    expect(result?.vendor).toBe('ga4');
    expect(result?.eventName).toBe('purchase');
    expect(result?.destinationId).toBe('G-ABC123');
    expect(result?.identityKey).toContain('ga4:g-abc123|purchase');
  });

  it('treats Google Ads conversion ID and label as the identity', () => {
    const result = extractPlatformRuntimeIdentity('gads', {
      event_name: 'purchase',
      raw_url: 'https://www.google.com/pagead/conversion/123456789/AbCdEf?send_to=AW-123456789%2FAbCdEf',
    });
    expect(result?.requestKind).toBe('conversion');
    expect(result?.conversionId).toBe('AW-123456789');
    expect(result?.conversionLabel).toBe('AbCdEf');
    expect(result?.identityKey).toContain('aw-123456789|abcdef');
  });

  it('does not mistake LinkedIn partner ID for conversion ID', () => {
    const base = extractPlatformRuntimeIdentity('linkedin', {
      event_name: '',
      params: { pid: '998877' },
      raw_url: 'https://px.ads.linkedin.com/collect?pid=998877',
    });
    const conversion = extractPlatformRuntimeIdentity('linkedin', {
      event_name: '',
      params: { pid: '998877', conversionId: '12345' },
      raw_url: 'https://px.ads.linkedin.com/collect?pid=998877&conversionId=12345',
    });
    expect(base?.requestKind).toBe('base_tag');
    expect(base?.conversionId).toBeNull();
    expect(conversion?.requestKind).toBe('conversion');
    expect(conversion?.conversionId).toBe('12345');
    expect(conversion?.destinationId).toBe('998877');
  });

  it('normalizes TikTok legacy event aliases and Snapchat case', () => {
    const tiktok = extractPlatformRuntimeIdentity('tiktok', { event_name: 'CompletePayment', params: { event: 'CompletePayment', pixel_code: 'TT-1' } });
    const snapchat = extractPlatformRuntimeIdentity('snapchat', { event_name: 'purchase', params: { event: 'purchase', pixel_id: 'SNAP-1' } });
    expect(tiktok?.eventName.toLowerCase()).toContain('purchase');
    expect(snapchat?.eventName).toBe('PURCHASE');
  });

  it('decodes GA4 Consent Mode gcs bits without calling denial an ad-blocker', () => {
    const result = parsePlatformConsent('ga4', { params: { gcs: 'G110' }, raw_url: 'https://www.google-analytics.com/g/collect?gcs=G110' });
    expect(result.ad_storage).toBe('granted');
    expect(result.analytics_storage).toBe('denied');
    expect(result.signalPresent).toBe(true);
  });

  it('does not classify generic network failures as confirmed blockers', () => {
    expect(classifyRuntimeDeliveryOutcome({ delivery_outcome: 'network_error', failure_reason: 'CORS request failed' }).outcome).toBe('network_error');
    expect(classifyRuntimeDeliveryOutcome({ delivery_outcome: 'timeout', failure_reason: 'request timed out' }).blockerEvidence).toBe(false);
    expect(classifyRuntimeDeliveryOutcome({ failure_reason: 'net::ERR_BLOCKED_BY_CLIENT' }).outcome).toBe('confirmed_blocked');
  });

  it('requires positive evidence to classify a mixed implementation', () => {
    expect(classifyImplementationSource({ gtm_tag_name: 'Meta Purchase', origin_source: 'hardcoded' })).toBe('hybrid');
    expect(classifyImplementationSource({ gtm_tag_name: '', origin_source: '' })).toBe('unknown');
  });

  it('reports missing click ID only when the session has paid context', () => {
    const paid = classifyAttribution({ vendor: 'meta', params: { utm_source: 'facebook', utm_medium: 'paid_social' } });
    const organic = classifyAttribution({ vendor: 'meta', params: { utm_source: 'facebook', utm_medium: 'social' } });
    expect(paid.absentForPaid).toBe(true);
    expect(organic.absentForPaid).toBe(false);
  });
});
