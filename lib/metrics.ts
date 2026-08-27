export const MIN_SAMPLE_SIZE = 30;

export function sampleAwareRate(numerator: number, denominator: number, minimum = MIN_SAMPLE_SIZE): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator < minimum || denominator <= 0) return null;
  return Math.min(1, Math.max(0, numerator / denominator));
}

export function sampleAwarePercent(numerator: number, denominator: number, minimum = MIN_SAMPLE_SIZE): string | null {
  const rate = sampleAwareRate(numerator, denominator, minimum);
  return rate === null ? null : `${(rate * 100).toFixed(1)}%`;
}

export function boundedSeverity(severity: string, distinctSessions: number, distinctPages: number): string {
  return severity === 'critical' || distinctSessions >= 50 || distinctPages >= 10 ? 'critical' : severity;
}
