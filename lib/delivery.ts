export type DeliveryMode = 'first_party' | 'third_party' | 'unknown';

function hostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase(); } catch {
    try { return new URL(`https://${value}`).hostname.toLowerCase(); } catch { return null; }
  }
}

export function hostnameMatches(host: string | null, candidate: string | null | undefined) {
  if (!host || !candidate) return false;
  const normalized = String(candidate).toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
  return host === normalized || host.endsWith(`.${normalized}`);
}

const PLATFORM_HOSTS = [
  /(^|\.)google-analytics\.com$/, /(^|\.)analytics\.google\.com$/, /(^|\.)googletagmanager\.com$/,
  /(^|\.)googleadservices\.com$/, /(^|\.)googlesyndication\.com$/, /(^|\.)facebook\.net$/,
  /(^|\.)facebook\.com$/, /(^|\.)analytics\.tiktok\.com$/, /(^|\.)business-api\.tiktok\.com$/,
  /(^|\.)px\.ads\.linkedin\.com$/, /(^|\.)snapchat\.com$/, /(^|\.)pinterest\.com$/,
  /(^|\.)pinimg\.com$/, /(^|\.)bat\.bing\.com$/, /(^|\.)reddit\.com$/, /(^|\.)criteo\.com$/,
  /(^|\.)clarity\.ms$/, /(^|\.)hotjar\.com$/, /(^|\.)segment\.io$/, /(^|\.)mixpanel\.com$/,
  /(^|\.)amplitude\.com$/,
];

export function isPlatformDomain(host: string | null) {
  return !!host && PLATFORM_HOSTS.some((pattern) => pattern.test(host));
}

/**
 * Classifies only what the browser can prove from the request destination.
 * A first-party destination is not proof that a server-side container processed it.
 */
export function classifyDeliveryMode(rawUrl: string | null | undefined, pageUrl: string | null | undefined, site: { domain?: string | null; first_party_domain?: string | null; firstPartyDomain?: string | null; appOrigin?: string | null }): DeliveryMode {
  const destination = hostname(rawUrl);
  if (!destination) return 'unknown';
  const pageHost = hostname(pageUrl);
  const configuredFirstParty = site.first_party_domain ?? site.firstPartyDomain ?? null;
  if (hostnameMatches(destination, pageHost) || hostnameMatches(destination, site.domain) || hostnameMatches(destination, configuredFirstParty) || hostnameMatches(destination, site.appOrigin)) return 'first_party';
  if (isPlatformDomain(destination)) return 'third_party';
  return 'unknown';
}

export function deliveryModeLabel(mode: DeliveryMode | string | null | undefined) {
  if (mode === 'first_party' || mode === 'server_side') return 'First-party destination';
  if (mode === 'third_party' || mode === 'client_side') return 'Vendor destination';
  return 'Destination unclear';
}
