function stripWww(value: string) {
  return value.startsWith('www.') ? value.slice(4) : value;
}

export function normalizeOriginHost(value: string | null | undefined) {
  if (!value) return null;
  try {
    const candidate = value.includes('://') ? new URL(value).hostname : new URL(`https://${value}`).hostname;
    return candidate.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function hostnameMatches(host: string | null | undefined, candidate: string | null | undefined) {
  const normalizedHost = normalizeOriginHost(host);
  const normalizedCandidate = normalizeOriginHost(candidate);
  if (!normalizedHost || !normalizedCandidate) return false;
  const hostVariants = [normalizedHost, stripWww(normalizedHost)];
  const candidateVariants = [normalizedCandidate, stripWww(normalizedCandidate)];
  return hostVariants.some((hostVariant) => candidateVariants.some((candidateVariant) => hostVariant === candidateVariant || hostVariant.endsWith(`.${candidateVariant}`)));
}
