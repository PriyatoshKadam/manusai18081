const MAX_FIELD_LENGTH = 160;

export type SiteInput = {
  domain: string;
  gtm_container_id?: string | null;
  ga4_measurement_id?: string | null;
  gads_conversion_id?: string | null;
  meta_pixel_id?: string | null;
  tiktok_pixel_id?: string | null;
  first_party_domain?: string | null;
  slack_webhook_url?: string | null;
};

export type NormalizedSiteInput = SiteInput & {
  domain: string;
  gtm_container_id: string | null;
  ga4_measurement_id: string | null;
  gads_conversion_id: string | null;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  first_party_domain: string | null;
  slack_webhook_url: string | null;
};

function text(
  value: unknown,
  field: string
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${field} must be text`);
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }

  return normalized;
}

/**
 * Normalize a hostname supplied by a user.
 *
 * Accepted:
 *
 *   example.com
 *   www.example.com
 *   https://example.com
 *   http://example.com
 *   https//example.com
 *   https:/example.com
 *
 * Returned value:
 *
 *   example.com
 *
 * Important:
 * We ALWAYS strip the protocol before returning.
 * This prevents values such as:
 *
 *   https//example.com
 *
 * from later becoming:
 *
 *   https://https//example.com
 */
export function normalizeHostname(
  value: unknown,
  field: string,
  required = false
): string | null {
  const input = text(value, field);

  if (!input) {
    if (required) {
      throw new Error(`${field} is required`);
    }

    return null;
  }

  let hostnameInput = input.trim();

  /*
   * Remove valid and malformed protocols.
   *
   * Examples:
   *
   * https://example.com
   * https//example.com
   * https:/example.com
   * http://example.com
   * http//example.com
   */
  hostnameInput = hostnameInput
    .replace(/^https?:?\/{0,2}/i, '')
    .replace(/^\/+/, '');

  if (!hostnameInput) {
    throw new Error(
      `${field} must be a valid hostname`
    );
  }

  const candidate = `https://${hostnameInput}`;

  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `${field} must be a valid hostname`
    );
  }

  /*
   * Only a hostname is allowed.
   *
   * Reject:
   *
   * example.com/path
   * example.com?foo=bar
   * example.com#hash
   * user:pass@example.com
   */
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${field} must contain only a hostname`
    );
  }

  if (
    !parsed.hostname ||
    parsed.hostname.includes('..') ||
    !/^[a-z0-9.-]+$/i.test(
      parsed.hostname
    )
  ) {
    throw new Error(
      `${field} must be a valid hostname`
    );
  }

  return parsed.hostname
    .toLowerCase()
    .replace(/\.$/, '');
}

function identifier(
  value: unknown,
  field: string,
  pattern?: RegExp
): string | null {
  const normalized = text(value, field);

  if (!normalized) {
    return null;
  }

  if (
    pattern &&
    !pattern.test(normalized)
  ) {
    throw new Error(
      `${field} has an invalid format`
    );
  }

  return normalized;
}

export function normalizeSiteInput(
  input: Record<string, unknown>,
  partial = false
): Partial<NormalizedSiteInput> {
  const result: Partial<NormalizedSiteInput> = {};

  if (
    !partial ||
    'domain' in input
  ) {
    result.domain =
      normalizeHostname(
        input.domain,
        'Domain',
        true
      ) as string;
  }

  if (
    !partial ||
    'gtm_container_id' in input
  ) {
    result.gtm_container_id =
      identifier(
        input.gtm_container_id,
        'GTM container ID',
        /^GTM-[A-Z0-9]+$/i
      );
  }

  if (
    !partial ||
    'ga4_measurement_id' in input
  ) {
    result.ga4_measurement_id =
      identifier(
        input.ga4_measurement_id,
        'GA4 measurement ID',
        /^G-[A-Z0-9]+$/i
      );
  }

  if (
    !partial ||
    'gads_conversion_id' in input
  ) {
    result.gads_conversion_id =
      identifier(
        input.gads_conversion_id,
        'Google Ads conversion ID',
        /^AW-[A-Z0-9]+(?:\/[A-Z0-9_-]+)?$/i
      );
  }

  if (
    !partial ||
    'meta_pixel_id' in input
  ) {
    result.meta_pixel_id =
      identifier(
        input.meta_pixel_id,
        'Meta Pixel ID',
        /^[A-Z0-9_-]+$/i
      );
  }

  if (
    !partial ||
    'tiktok_pixel_id' in input
  ) {
    result.tiktok_pixel_id =
      identifier(
        input.tiktok_pixel_id,
        'TikTok Pixel ID',
        /^[A-Z0-9_-]+$/i
      );
  }

  if (
    !partial ||
    'first_party_domain' in input
  ) {
    result.first_party_domain =
      normalizeHostname(
        input.first_party_domain,
        'First-party domain'
      );
  }

  if (
    !partial ||
    'slack_webhook_url' in input
  ) {
    const webhook = text(
      input.slack_webhook_url,
      'Slack webhook URL'
    );

    if (webhook) {
      let parsed: URL;

      try {
        parsed = new URL(webhook);
      } catch {
        throw new Error(
          'Slack webhook URL must be a valid HTTPS URL'
        );
      }

      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'hooks.slack.com'
      ) {
        throw new Error(
          'Slack webhook URL must use hooks.slack.com over HTTPS'
        );
      }
    }

    result.slack_webhook_url =
      webhook;
  }

  return result;
}
