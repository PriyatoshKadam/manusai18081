export type DeliveryMode = 'client_side' | 'server_side' | 'unknown';

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
  /(^|\.)google-analytics\.com$/,
  /(^|\.)analytics\.google\.com$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)googleadservices\.com$/,
  /(^|\.)googlesyndication\.com$/,
  /(^|\.)facebook\.net$/,
  /(^|\.)facebook\.com$/,
  /(^|\.)analytics\.tiktok\.com$/,
  /(^|\.)business-api\.tiktok\.com$/,
  /(^|\.)px\.ads\.linkedin\.com$/,
  /(^|\.)snapchat\.com$/,
  /(^|\.)pinterest\.com$/,
  /(^|\.)pinimg\.com$/,
  /(^|\.)bat\.bing\.com$/,
  /(^|\.)reddit\.com$/,
  /(^|\.)criteo\.com$/,
  /(^|\.)clarity\.ms$/,
  /(^|\.)hotjar\.com$/,
  /(^|\.)segment\.io$/,
  /(^|\.)mixpanel\.com$/,
  /(^|\.)amplitude\.com$/,
];

export function isPlatformDomain(host: string | null) {
  return !!host && PLATFORM_HOSTS.some((pattern) => pattern.test(host));
}

/**
 * Classifies the destination, never trusting a browser-supplied mode label.
 * A request to the page's own host or a configured first-party/custom domain is
 * server-side; known ad-tech platform hosts are client-side; everything else
 * remains unknown until the operator configures the endpoint.
 */
export function classifyDeliveryMode(rawUrl: string | null | undefined, pageUrl: string | null | undefined, site: { domain?: string | null; first_party_domain?: string | null; firstPartyDomain?: string | null; appOrigin?: string | null }): DeliveryMode {
  const destination = hostname(rawUrl);
  if (!destination) return 'unknown';
  const pageHost = hostname(pageUrl);
  const configuredFirstParty = site.first_party_domain ?? site.firstPartyDomain ?? null;
  if (hostnameMatches(destination, pageHost) || hostnameMatches(destination, site.domain) || hostnameMatches(destination, configuredFirstParty) || hostnameMatches(destination, site.appOrigin)) return 'server_side';
  if (isPlatformDomain(destination)) return 'client_side';
  return 'unknown';
}

export function deliveryModeLabel(mode: DeliveryMode | string | null | undefined) {
  if (mode === 'server_side') return 'Server-side';
  if (mode === 'client_side') return 'Client-side';
  return 'Unclassified';
}
