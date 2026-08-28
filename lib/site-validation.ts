const MAX_FIELD_LENGTH = 160;

export type SiteInput = {
  domain: string;
  gtm_container_id?: string | null;
  ga4_measurement_id?: string | null;
  gads_conversion_id?: string | null;
  meta_pixel_id?: string | null;
  tiktok_pixel_id?: string | null;
  linkedin_partner_id?: string | null;
  bing_uet_tag_id?: string | null;
  snapchat_pixel_id?: string | null;
  first_party_domain?: string | null;
  slack_webhook_url?: string | null;
  vendor_routing_policy?: unknown;
  purchase_routing_vendors?: unknown;
};

export type NormalizedSiteInput = SiteInput & {
  domain: string;
  gtm_container_id: string | null;
  ga4_measurement_id: string | null;
  gads_conversion_id: string | null;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  linkedin_partner_id: string | null;
  bing_uet_tag_id: string | null;
  snapchat_pixel_id: string | null;
  first_party_domain: string | null;
  slack_webhook_url: string | null;
  vendor_routing_policy: Record<string, unknown>;
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

const ROUTING_VENDORS = new Set(['ga4', 'gads', 'meta', 'tiktok', 'linkedin', 'bing', 'snapchat']);
function normalizeRoutingPolicy(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Purchase routing must be an object');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['default', 'events'].includes(key))) throw new Error('Purchase routing contains an unsupported setting');
  const output: Record<string, unknown> = {};
  const normalizeList = (candidate: unknown, field: string) => {
    if (!Array.isArray(candidate) || candidate.length > ROUTING_VENDORS.size) throw new Error(`${field} must be a list of tracking tools`);
    if (candidate.some((item) => typeof item !== 'string')) throw new Error(`${field} must contain tracking tool names`);
    const vendors = candidate.map((item) => String(item).trim().toLowerCase());
    if (vendors.some((vendor) => !ROUTING_VENDORS.has(vendor))) throw new Error(`${field} contains an unsupported tracking tool`);
    return [...new Set(vendors)];
  };
  if ('default' in input) output.default = normalizeList(input.default, 'Purchase routing default');
  if ('events' in input) {
    if (!input.events || typeof input.events !== 'object' || Array.isArray(input.events)) throw new Error('Purchase routing events must be an object');
    const events: Record<string, string[]> = {};
    for (const [eventName, candidate] of Object.entries(input.events as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9_.:-]{1,120}$/.test(eventName)) throw new Error('Purchase routing event name is invalid');
      events[eventName.trim().toLowerCase()] = normalizeList(candidate, `Purchase routing for ${eventName}`);
    }
    output.events = events;
  }
  if (!Object.keys(output).length) throw new Error('Purchase routing must include default or events');
  return output;
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
    'linkedin_partner_id' in input
  ) {
    result.linkedin_partner_id =
      identifier(
        input.linkedin_partner_id,
        'LinkedIn partner ID',
        /^[0-9]+$/
      );
  }

  if (
    !partial ||
    'bing_uet_tag_id' in input
  ) {
    result.bing_uet_tag_id =
      identifier(
        input.bing_uet_tag_id,
        'Bing UET tag ID',
        /^[0-9]+$/
      );
  }

  if (
    !partial ||
    'snapchat_pixel_id' in input
  ) {
    result.snapchat_pixel_id =
      identifier(
        input.snapchat_pixel_id,
        'Snapchat Pixel ID',
        /^[a-f0-9-]{16,64}$/i
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

  if (!partial || 'vendor_routing_policy' in input || 'purchase_routing_vendors' in input) {
    if ('purchase_routing_vendors' in input) {
      const rawVendors = text(input.purchase_routing_vendors, 'Purchase routing tools') || '';
      const vendors = rawVendors ? rawVendors.split(',').map((vendor) => vendor.trim()).filter(Boolean) : [];
      result.vendor_routing_policy = vendors.length ? normalizeRoutingPolicy({ events: { purchase: vendors } }) : {};
    } else {
      result.vendor_routing_policy = normalizeRoutingPolicy(input.vendor_routing_policy);
    }
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
