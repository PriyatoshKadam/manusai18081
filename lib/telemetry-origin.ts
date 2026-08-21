function normalizeHostname(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .split('/')[0];
}

/**
 * Match a browser origin to a monitored site.
 *
 * The configured hostname remains authoritative, while www./app. are treated
 * as explicit sibling aliases for sites that serve the same product across
 * those common web-app hosts. We do not accept arbitrary sibling subdomains.
 */
export function hostnameMatches(host: string | null, candidate: string | null) {
  const normalizedHost = normalizeHostname(host);
  const normalizedCandidate = normalizeHostname(candidate);
  if (!normalizedHost || !normalizedCandidate) return false;
  if (normalizedHost === normalizedCandidate || normalizedHost.endsWith(`.${normalizedCandidate}`)) return true;

  const base = normalizedCandidate.replace(/^(?:www|app)\./, '');
  if (!base || base === normalizedCandidate) return false;
  return normalizedHost === `www.${base}` || normalizedHost === `app.${base}`;
}

export function telemetryOriginAllowed(host: string | null, domain: string | null, firstPartyDomain: string | null) {
  return !host || hostnameMatches(host, domain) || hostnameMatches(host, firstPartyDomain);
}
