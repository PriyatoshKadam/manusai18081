import {
  normaliseGovernanceVendor,
  platformEventName,
  type GovernanceVendor,
  PLATFORM_DETECTION,
} from './platform-governance';

export type RuntimeIdentity = {
  vendor: GovernanceVendor;
  identityType: 'event_name' | 'conversion_id_label' | 'conversion_id' | 'uet_event' | 'remarketing' | 'unknown';
  identityKey: string;
  eventName: string;
  displayName: string;
  destinationId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  eventId: string | null;
  requestKind: 'event' | 'conversion' | 'remarketing' | 'base_tag' | 'destination_goal' | 'unknown';
  debugTraffic: boolean;
};

export type ImplementationSource = 'gtm' | 'direct' | 'plugin' | 'sdk' | 'server' | 'hybrid' | 'unknown';

type AnyRow = Record<string, any>;

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

function flatten(value: Record<string, any>, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out[path] = child;
    // Preserve literal bracketed or dotted network keys exactly as well.
    out[key] = child;
  }
  return out;
}

function paramSources(row: AnyRow) {
  const params = asObject(row.params);
  const flat = flatten(params);
  const query: Record<string, string> = {};
  const rawUrl = String(row.raw_url || '');
  try {
    const parsed = new URL(rawUrl, 'https://gafix.invalid');
    parsed.searchParams.forEach((value, key) => { query[key] = value; });
  } catch {}
  const find = (names: string[]): string => {
    for (const name of names) {
      const direct = flat[name] ?? params[name] ?? query[name];
      if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct).trim();
      const lower = name.toLowerCase();
      const match = Object.entries(flat).find(([key, value]) => key.toLowerCase() === lower && value != null && String(value).trim() !== '');
      if (match) return String(match[1]).trim();
      const queryMatch = Object.entries(query).find(([key, value]) => key.toLowerCase() === lower && value.trim() !== '');
      if (queryMatch) return queryMatch[1].trim();
    }
    return '';
  };
  return { params, flat, query, rawUrl, find };
}

function cleanEvent(vendor: GovernanceVendor, raw: string) {
  const canonical = platformEventName(vendor, raw);
  return canonical || raw.trim();
}

function gadsRouteIdentity(rawUrl: string) {
  const sendTo = /(?:^|[?&])send_to=([^&]+)/i.exec(rawUrl);
  if (sendTo) {
    const decoded = decodeURIComponent(sendTo[1].replace(/\+/g, ' '));
    const m = /^(AW-?\d+)(?:\/([^&?#]+))?/i.exec(decoded);
    if (m) return { id: m[1].toUpperCase().startsWith('AW-') ? m[1].toUpperCase() : `AW-${m[1].replace(/^AW/i, '')}`, label: m[2] || '' };
  }
  const m = /\/pagead\/(?:1p-)?(?:viewthrough)?conversion\/(\d+|AW-?\d+)(?:\/([^/?#]+))?/i.exec(rawUrl);
  if (m) return { id: m[1].toUpperCase().startsWith('AW-') ? m[1].toUpperCase() : `AW-${m[1]}`, label: m[2] || '' };
  return { id: '', label: '' };
}

/** Build a stable, platform-aware identity from one browser/server observation. */
export function extractPlatformRuntimeIdentity(vendorInput: unknown, row: AnyRow): RuntimeIdentity | null {
  const vendor = normaliseGovernanceVendor(vendorInput);
  if (!vendor) return null;
  const src = paramSources(row);
  const find = src.find;
  const rawEvent = String(row.event_name || '').trim();
  const profile = PLATFORM_DETECTION[vendor];
  let eventName = rawEvent;
  let destinationId = '';
  let conversionId = '';
  let conversionLabel = '';
  let eventId = find(['event_id', 'eventId', 'eid']);
  let identityType: RuntimeIdentity['identityType'] = profile.identity;
  let requestKind: RuntimeIdentity['requestKind'] = 'event';
  let identityValue = '';

  if (vendor === 'ga4') {
    destinationId = find(['tid', 'measurement_id', 'measurementId', 'measurement_id']);
    eventName = find(['en', 'event_name', 'eventName', 'event']) || rawEvent;
    eventName = eventName.trim();
    identityValue = [destinationId.toLowerCase(), eventName.toLowerCase()].filter(Boolean).join('|') || eventName.toLowerCase();
    requestKind = 'event';
  } else if (vendor === 'gads') {
    const path = gadsRouteIdentity(src.rawUrl);
    const sendTo = find(['send_to', 'sendTo']);
    const send = /^(AW-?\d+)(?:\/([^/?#]+))?/i.exec(sendTo);
    conversionId = find(['conversion_id', 'conversionId', 'google_conversion_id', 'aw-id', 'tid']) || path.id || send?.[1] || '';
    conversionId = conversionId ? (conversionId.toUpperCase().startsWith('AW-') ? conversionId.toUpperCase() : `AW-${conversionId.replace(/^AW-?/i, '')}`) : '';
    conversionLabel = find(['conversion_label', 'conversionLabel', 'google_conversion_label', 'label']) || path.label || send?.[2] || '';
    requestKind = /viewthroughconversion|remarket|1p-conversion/i.test(src.rawUrl) && !conversionLabel ? 'remarketing' : conversionLabel ? 'conversion' : 'remarketing';
    identityType = requestKind === 'remarketing' ? 'remarketing' : 'conversion_id_label';
    destinationId = conversionId;
    eventName = conversionLabel ? (rawEvent || 'conversion') : requestKind === 'remarketing' ? 'remarketing' : rawEvent || 'conversion';
    identityValue = requestKind === 'conversion' ? `${conversionId.toLowerCase()}|${conversionLabel.toLowerCase()}` : `remarketing|${conversionId.toLowerCase()}`;
  } else if (vendor === 'meta') {
    destinationId = find(['id', 'pixel_id', 'pixelId']);
    eventName = find(['ev', 'event_name', 'eventName', 'event']) || rawEvent;
    eventName = cleanEvent(vendor, eventName);
    identityValue = [destinationId.toLowerCase(), eventName.toLowerCase()].filter(Boolean).join('|') || eventName.toLowerCase();
    requestKind = 'event';
  } else if (vendor === 'bing') {
    destinationId = find(['ti', 'tag_id', 'uet_tag_id']);
    eventName = find(['evt', 'event_name', 'eventName', 'event', 'ea', 'event_action']) || rawEvent;
    if (!eventName && row.page_url && /goal|destination/i.test(String(row.delivery_mode || ''))) {
      requestKind = 'destination_goal';
      eventName = `destination:${String(row.page_url).split('?')[0]}`;
    } else requestKind = 'event';
    identityValue = [destinationId.toLowerCase(), eventName.toLowerCase()].filter(Boolean).join('|') || eventName.toLowerCase();
  } else if (vendor === 'tiktok') {
    destinationId = find(['pixel_code', 'pixel', 'pixel_id', 'pixelId']);
    eventName = find(['event', 'event_name', 'eventName']) || rawEvent;
    eventName = cleanEvent(vendor, eventName);
    identityValue = [destinationId.toLowerCase(), eventName.toLowerCase()].filter(Boolean).join('|') || eventName.toLowerCase();
    requestKind = 'event';
  } else if (vendor === 'linkedin') {
    destinationId = find(['pid', 'partner_id', 'partnerId', '_linkedin_partner_id']);
    conversionId = find(['conversionId', 'conversion_id', 'conversion_id', 'conversion']);
    // eventId is a deduplication identifier, not the LinkedIn conversion identifier.
    conversionLabel = '';
    if (conversionId) {
      identityType = 'conversion_id';
      requestKind = 'conversion';
      eventName = rawEvent || 'conversion';
      identityValue = `${destinationId.toLowerCase()}|${conversionId.toLowerCase()}`;
    } else {
      identityType = 'conversion_id';
      requestKind = rawEvent ? 'event' : 'base_tag';
      eventName = rawEvent || 'insight_tag_base';
      identityValue = [destinationId.toLowerCase(), eventName.toLowerCase()].filter(Boolean).join('|') || 'insight_tag_base';
    }
  } else {
    destinationId = find(['pixel_id', 'pixelId', 'pid', 'id']);
    eventName = find(['event', 'ev', 'event_name', 'eventName']) || rawEvent;
    eventName = cleanEvent(vendor, eventName).toUpperCase();
    identityValue = [destinationId.toLowerCase(), eventName.toLowerCase()].filter(Boolean).join('|') || eventName.toLowerCase();
    requestKind = 'event';
  }

  const urlText = src.rawUrl.toLowerCase();
  const debugTraffic = vendor === 'ga4' && (
    find(['_dbg', 'debug_mode']) === '1' ||
    /\/debug\/mp\/collect/.test(urlText) ||
    /(?:^|[?&])debug_mode=1(?:&|$)/.test(urlText)
  );
  if (!eventName && !destinationId && !conversionId) return null;
  const displayName = vendor === 'gads'
    ? requestKind === 'conversion' ? `Conversion · ${conversionId || 'unknown ID'} / ${conversionLabel || 'unknown label'}` : `Remarketing · ${conversionId || 'unknown ID'}`
    : vendor === 'linkedin' && requestKind === 'conversion' ? `Conversion · ${conversionId}` : eventName;
  return {
    vendor,
    identityType,
    identityKey: `${vendor}:${identityValue || eventName.toLowerCase()}`,
    eventName: eventName || (requestKind === 'conversion' ? 'conversion' : ''),
    displayName: displayName || eventName || 'Unknown platform event',
    destinationId: destinationId || null,
    conversionId: conversionId || null,
    conversionLabel: conversionLabel || null,
    eventId: eventId || null,
    requestKind,
    debugTraffic,
  };
}

/** Conservative implementation-source classification. Lack of GTM correlation alone is not proof of direct code. */
export function classifyImplementationSource(row: AnyRow): ImplementationSource {
  const tag = String(row.gtm_tag_name || row.gtm_tag_id || '').trim();
  const confidence = String(row.gtm_correlation_confidence || '').trim().toLowerCase();
  const source = `${row.origin_source || ''} ${row.source || ''} ${row.implementation_source || ''} ${row.call_source || ''}`.toLowerCase();
  const mode = String(row.delivery_mode || '').toLowerCase();
  const direct = /direct|hard.?coded|website.?code|inline.?script/.test(source);
  const plugin = /plugin|cms|shopify|woocommerce|wordpress|wix|squarespace/.test(source);
  const sdk = /sdk|mobile.?app|ios|android/.test(source);
  const server = /server|capi|conversion.?api|measurement.?protocol|stape|ssgtm|gateway/.test(source + ' ' + mode);
  if (tag && confidence !== 'unmatched' && confidence !== 'none') return 'gtm';
  if (tag) return 'gtm';
  if (server) return 'server';
  if (plugin) return 'plugin';
  if (sdk) return 'sdk';
  if (direct) return 'direct';
  return 'unknown';
}

export type ParsedConsent = {
  analytics_storage?: 'granted' | 'denied';
  ad_storage?: 'granted' | 'denied';
  ad_user_data?: 'granted' | 'denied';
  ad_personalization?: 'granted' | 'denied';
  marketing?: 'granted' | 'denied';
  signalPresent: boolean;
  source: 'google_consent_mode' | 'microsoft_uet' | 'cmp' | 'none';
};

export function parsePlatformConsent(vendorInput: unknown, row: AnyRow): ParsedConsent {
  const vendor = normaliseGovernanceVendor(vendorInput);
  const state = asObject(row.consent_state);
  const src = paramSources(row);
  const result: ParsedConsent = { signalPresent: false, source: 'none' };
  const set = (key: keyof ParsedConsent, value: unknown) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['granted', 'accepted', 'allow', 'allowed', '1', 'g'].includes(normalized)) (result as any)[key] = 'granted';
    else if (['denied', 'rejected', 'deny', 'disallowed', '0', 'd'].includes(normalized)) (result as any)[key] = 'denied';
  };
  for (const key of ['analytics_storage','ad_storage','ad_user_data','ad_personalization','marketing']) {
    set(key as keyof ParsedConsent, state[key] ?? state[`${key}_consent`]);
  }

  if (vendor === 'ga4' || vendor === 'gads') {
    result.source = 'google_consent_mode';
    const gcs = src.find(['gcs']);
    // GA4 Consent State encoding: G1 + ad_storage bit + analytics_storage bit.
    const match = /^G1([01])([01])$/i.exec(gcs);
    if (match) {
      set('ad_storage', match[1]);
      set('analytics_storage', match[2]);
      result.signalPresent = true;
    }
    const gcd = src.find(['gcd']);
    if (gcd) result.signalPresent = true;
    if (src.find(['npa']) === '1') { result.ad_personalization = 'denied'; result.signalPresent = true; }
    if (['ad_storage','analytics_storage','ad_user_data','ad_personalization'].some((key) => (result as any)[key])) result.signalPresent = true;
  } else if (vendor === 'bing') {
    result.source = 'microsoft_uet';
    const asc = src.find(['asc', 'adStorageConsent']);
    if (asc) { set('ad_storage', asc); result.signalPresent = true; }
  } else if (vendor) {
    result.source = 'cmp';
    const cmpPresent = ['cmp_detected','cmp_provider','choice_recorded','marketing','marketing_storage','marketing_consent','categories','consent_categories'].some((key) => state[key] !== undefined);
    if (cmpPresent) result.signalPresent = true;
    if (result.marketing === undefined) {
      const cats = asObject(state.consent_categories || state.categories || state.purposes);
      set('marketing', cats.marketing ?? cats.advertising ?? state.marketing_storage ?? state.marketing_consent ?? state.marketing);
    }
  }
  if (state.choice_recorded !== undefined || state.cmp_provider || state.cmp_detected !== undefined) result.signalPresent = true;
  return result;
}

export function classifyDeliveryOutcome(row: AnyRow): {
  outcome: 'delivered' | 'http_error' | 'network_error' | 'timeout' | 'aborted' | 'beacon_rejected' | 'confirmed_blocked' | 'possible_blocked' | 'unknown';
  blockerEvidence: boolean;
  detail: string | null;
} {
  const value = String(row.delivery_outcome || row.delivery_status || '').toLowerCase();
  const reason = String(row.failure_reason || row.raw_error || row.signal || '').toLowerCase();
  const status = Number(row.status_code || 0);
  const explicitBlocked = /err_blocked_by_client|blocked_by_client|blocked_by_extension|err_blocked_by_extension|blocked_client/.test(reason);
  if (explicitBlocked) return { outcome: 'confirmed_blocked', blockerEvidence: true, detail: String(row.failure_reason || row.raw_error || row.signal) };
  if (value === 'blocked' || /blocker|ad.?block|privacy.?shield|tracker.?blocked/.test(reason)) return { outcome: 'possible_blocked', blockerEvidence: false, detail: String(row.failure_reason || row.raw_error || value) || null };
  if (value === 'delivered' || (status >= 200 && status < 400 && !reason)) return { outcome: 'delivered', blockerEvidence: false, detail: null };
  if (status >= 400) return { outcome: 'http_error', blockerEvidence: false, detail: `HTTP ${status}` };
  if (value === 'http_error') return { outcome: 'http_error', blockerEvidence: false, detail: String(row.failure_reason || '') || null };
  if (value === 'timeout' || /timeout|timed out/.test(reason)) return { outcome: 'timeout', blockerEvidence: false, detail: String(row.failure_reason || '') || null };
  if (value === 'aborted' || /abort/.test(reason)) return { outcome: 'aborted', blockerEvidence: false, detail: String(row.failure_reason || '') || null };
  if (value === 'beacon_rejected' || /beacon.*reject|queue.*refus/.test(reason)) return { outcome: 'beacon_rejected', blockerEvidence: false, detail: String(row.failure_reason || '') || null };
  if (value === 'network_error' || /network|cors|dns|tls|ssl|fetch failed|connection/.test(reason)) return { outcome: 'network_error', blockerEvidence: false, detail: String(row.failure_reason || '') || null };
  return { outcome: 'unknown', blockerEvidence: false, detail: String(row.failure_reason || '') || null };
}

/** Retains attribution when available; no click-id is required for direct/organic traffic. */
export function classifyAttribution(row: AnyRow) {
  const src = paramSources(row);
  const state = asObject(row.consent_state);
  const vendor = normaliseGovernanceVendor(row.vendor);
  const clickIds = vendor ? PLATFORM_DETECTION[vendor].clickIds : [];
  const clickId = src.find(clickIds);
  const utmSource = src.find(['utm_source']);
  const utmMedium = src.find(['utm_medium']);
  const utmCampaign = src.find(['utm_campaign']);
  const referrer = src.find(['dr','referrer','document_referrer']) || String(row.page_referrer || state.page_referrer || '');
  const landing = Boolean(state.landing_page || state.first_landing_page || row.is_landing_page);
  const sourceMedium = src.find(['source','medium','traffic_source','traffic_medium']);
  const paid = Boolean(clickId || utmMedium.toLowerCase().includes('paid') || /cpc|ppc|paid|social_paid|display|affiliate/i.test(utmMedium) || /gclid|fbclid|msclkid|ttclid|li_fat_id|sccid|scCid/i.test(String(row.raw_url || row.page_url || '')));
  const campaignData = Boolean(utmSource || utmMedium || utmCampaign || sourceMedium || referrer);
  const attributionPresent = Boolean(clickId || utmSource || utmMedium || utmCampaign || sourceMedium || referrer);
  const clickIdPersisted = Boolean(clickId || state.click_id || state.attribution_click_id);
  return {
    paid,
    attributionPresent,
    clickIdPresent: Boolean(clickId),
    clickIdPersisted,
    campaignPresent: Boolean(utmCampaign || state.utm_campaign),
    source: utmSource || sourceMedium || null,
    medium: utmMedium || state.utm_medium || null,
    campaign: utmCampaign || state.utm_campaign || null,
    referrer: referrer || null,
    landing,
    state,
    absentForPaid: paid && !attributionPresent,
  };
}
