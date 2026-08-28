import { query } from './db';
import { enqueueAlertDeliveries } from './notifications';

const ALLOWED_VENDORS = ['ga4', 'gads', 'meta', 'tiktok', 'linkedin', 'bing', 'snapchat'] as const;
type Vendor = (typeof ALLOWED_VENDORS)[number];
export type RevenueStatus = 'matched' | 'single_vendor' | 'missing_vendor' | 'value_mismatch' | 'currency_mismatch' | 'invalid_value' | 'observed_unconfigured';

type SiteConfig = {
  vendor_routing_policy: unknown;
  ga4_measurement_id: string | null;
  gads_conversion_id: string | null;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  linkedin_partner_id: string | null;
  bing_uet_tag_id: string | null;
  snapchat_pixel_id: string | null;
};

function money(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function configuredVendors(site: SiteConfig): Vendor[] {
  const configured: Array<[Vendor, unknown]> = [
    ['ga4', site.ga4_measurement_id],
    ['gads', site.gads_conversion_id],
    ['meta', site.meta_pixel_id],
    ['tiktok', site.tiktok_pixel_id],
    ['linkedin', site.linkedin_partner_id],
    ['bing', site.bing_uet_tag_id],
    ['snapchat', site.snapchat_pixel_id],
  ];
  return configured.filter(([, value]) => typeof value === 'string' && value.trim()).map(([vendor]) => vendor);
}

function routingPolicy(policy: unknown, eventName: string): Vendor[] | null {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
  const input = policy as Record<string, unknown>;
  const events = input.events;
  const candidate = events && typeof events === 'object' && !Array.isArray(events)
    ? (events as Record<string, unknown>)[eventName]
    : input.default;
  if (!Array.isArray(candidate)) return null;
  const vendors = candidate.filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Vendor => (ALLOWED_VENDORS as readonly string[]).includes(value));
  return [...new Set(vendors)];
}

function authoritativeRank(row: any) {
  const network = row.observation_kind === 'network';
  const successful = network && Number(row.status_code) >= 200 && Number(row.status_code) <= 399 && !row.failure_reason;
  const validValue = row.revenue_value_status === 'valid' || (row.revenue_value_status === 'missing' && row.revenue_value !== null);
  return (successful ? 0 : network ? 1 : 2) * 10 + (validValue ? 0 : 1);
}

export function classifyRevenueStatus(input: { expectedVendors: string[]; observedVendors: string[]; currencies: string[]; invalidValue: boolean; values: number[]; delta: number | null }) : RevenueStatus {
  const missing = input.expectedVendors.filter((vendor) => !input.observedVendors.includes(vendor));
  const unconfigured = input.expectedVendors.length > 0 && input.observedVendors.some((vendor) => !input.expectedVendors.includes(vendor));
  const currencyMismatch = input.currencies.length > 1;
  const max = input.values.length ? Math.max(...input.values) : 0;
  const valueMismatch = input.delta !== null && input.delta > Math.max(1, max * 0.05);
  if (currencyMismatch) return 'currency_mismatch';
  if (input.invalidValue && input.values.length === 0) return 'invalid_value';
  if (missing.length > 0) return 'missing_vendor';
  if (valueMismatch) return 'value_mismatch';
  if (unconfigured) return 'observed_unconfigured';
  if (input.observedVendors.length < 2) return input.expectedVendors.length ? 'single_vendor' : 'observed_unconfigured';
  return 'matched';
}

function statusAlert(status: RevenueStatus, item: any, vendors: string[]) {
  if (status === 'missing_vendor') {
    return {
      code: 'revenue_missing_vendor',
      message: `Purchase ${item.transactionId} was not observed in every enabled tracking tool.`,
      rootCause: `The purchase was observed in ${vendors.join(', ') || 'one or more tools'}, but the enabled-tool list also expects ${item.missingVendors.join(', ')}. This is an observation gap, not proof that a payment was lost.`,
      steps: ['Confirm that this purchase should be sent to every enabled tracking tool.', 'Check the purchase trigger and vendor tags in GTM Preview or Tag Assistant.', 'Compare the final network requests after publishing the fix.'],
    };
  }
  if (status === 'currency_mismatch') {
    return {
      code: 'revenue_currency_mismatch',
      message: `Purchase ${item.transactionId} uses different currencies across tracking tools.`,
      rootCause: `The observed purchase values cannot be compared safely because the tools reported ${Object.values(item.vendorCurrencies).join(', ')}.`,
      steps: ['Send the same three-letter currency code to every purchase tag.', 'Check whether each tool receives the currency from the same dataLayer variable.', 'Recheck the purchase after the currency values agree.'],
    };
  }
  if (status === 'invalid_value') {
    return {
      code: 'revenue_invalid_value',
      message: `Purchase ${item.transactionId} contains an invalid value in tracking data.`,
      rootCause: 'At least one purchase value was present but was not a valid number, so GAfix did not use it for reconciliation.',
      steps: ['Check that the purchase value is a number before the tag fires.', 'Check that the currency is sent with the value.', 'Verify the final request in the browser Network panel.'],
    };
  }
  if (status === 'value_mismatch') {
    return {
      code: 'revenue_reconciliation_mismatch',
      message: `Purchase ${item.transactionId} has different values across tracking tools.`,
      rootCause: 'At least two tools reported materially different valid values for the same transaction and currency.',
      steps: ['Compare the purchase payload in each vendor tag.', 'Check whether one tool uses cents while another uses major currency units.', 'Check duplicate purchase tags and client/server deduplication.'],
    };
  }
  return null;
}

async function createFindingAlert(siteId: number, item: any, status: RevenueStatus, vendors: string[]) {
  const alert = statusAlert(status, item, vendors);
  if (!alert) return;
  const inserted = await query(
    `INSERT INTO alerts (site_id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, raw, confidence, dedupe_key, notification_status)
     SELECT $1,'warning',$2,'revenue',NULL,'purchase',$3,$4,$5::jsonb,$6::jsonb,'probable',$7,'pending'
      WHERE NOT EXISTS (
        SELECT 1 FROM alerts WHERE site_id=$1 AND code=$2 AND dedupe_key=$7 AND resolved=false AND created_at > NOW()-INTERVAL '24 hours'
      ) RETURNING id`,
    [siteId, alert.code, alert.message, alert.rootCause, JSON.stringify(alert.steps), JSON.stringify(item), `revenue:${alert.code}:${item.transactionId}`],
  );
  if (inserted.rowCount) {
    void enqueueAlertDeliveries({
      alertId: Number(inserted.rows[0].id), siteId, severity: 'warning', category: 'revenue', vendor: null,
      eventName: 'purchase', message: alert.message, rootCause: alert.rootCause, fixSteps: alert.steps,
    });
  }
}

export async function reconcileRevenue(siteId: number) {
  const siteResult = await query(
    `SELECT vendor_routing_policy, ga4_measurement_id, gads_conversion_id, meta_pixel_id, tiktok_pixel_id,
            linkedin_partner_id, bing_uet_tag_id, snapchat_pixel_id
       FROM sites WHERE id=$1 LIMIT 1`,
    [siteId],
  );
  const site = siteResult.rows[0] as SiteConfig | undefined;
  if (!site) return [];

  // Pick one authoritative row per transaction/vendor. Successful network evidence wins;
  // dataLayer/function observations are retained only when no network delivery exists.
  const rows = await query(
    `WITH ranked AS (
       SELECT e.*,
              ROW_NUMBER() OVER (
                PARTITION BY e.site_id, e.transaction_id, e.vendor
                ORDER BY
                  CASE WHEN e.observation_kind='network' AND COALESCE(e.transport, '') <> 'performance' AND e.status_code BETWEEN 200 AND 399 AND e.failure_reason IS NULL THEN 0
                       WHEN e.observation_kind='network' AND COALESCE(e.transport, '') <> 'performance' THEN 1 ELSE 2 END,
                  CASE WHEN e.revenue_value_status='valid' OR (e.revenue_value_status='missing' AND e.revenue_value IS NOT NULL) THEN 0 ELSE 1 END,
                  e.received_at DESC, e.id DESC
              ) AS row_rank
         FROM events e
        WHERE e.site_id=$1
          AND e.observation_kind <> 'diagnostic' AND COALESCE(e.transport, '') <> 'performance'
          AND e.transaction_id IS NOT NULL AND e.transaction_id <> ''
          AND e.received_at > NOW() - INTERVAL '30 days'
     )
     SELECT transaction_id, vendor, revenue_value, revenue_value_status, revenue_currency,
            observation_kind, status_code, failure_reason, received_at
       FROM ranked WHERE row_rank=1
      ORDER BY received_at DESC`,
    [siteId],
  );

  const expectedDefault = configuredVendors(site);
  const groups = new Map<string, any>();
  for (const row of rows.rows) {
    const transactionId = String(row.transaction_id);
    const item = groups.get(transactionId) || {
      transactionId,
      vendorValues: {},
      vendorPresence: {},
      vendorCurrencies: {},
      invalidVendors: [],
      expectedVendors: routingPolicy(site.vendor_routing_policy, 'purchase') || expectedDefault,
    };
    const vendor = String(row.vendor || 'unknown');
    item.vendorPresence[vendor] = true;
    if (row.revenue_currency) item.vendorCurrencies[vendor] = String(row.revenue_currency).toUpperCase();
    const valueStatus = row.revenue_value_status || (row.revenue_value === null ? 'missing' : 'valid');
    const value = valueStatus === 'valid' || (valueStatus === 'missing' && row.revenue_value !== null) ? money(row.revenue_value) : null;
    if (valueStatus === 'invalid') item.invalidVendors.push(vendor);
    if (value !== null) item.vendorValues[vendor] = value;
    groups.set(transactionId, item);
  }

  const findings: any[] = [];
  for (const item of groups.values()) {
    const observedVendors = Object.keys(item.vendorPresence);
    const expectedVendors = item.expectedVendors;
    item.missingVendors = expectedVendors.length ? expectedVendors.filter((vendor: string) => !item.vendorPresence[vendor]) : [];
    const currencies = [...new Set(Object.values(item.vendorCurrencies).filter(Boolean).map(String))];
    item.currency = currencies.length === 1 ? currencies[0] : currencies.length > 1 ? 'MIXED' : null;
    const values = Object.values(item.vendorValues).map(Number).filter(Number.isFinite);
    const max = values.length ? Math.max(...values) : 0;
    const min = values.length ? Math.min(...values) : 0;
    const currencyMismatch = currencies.length > 1;
    const delta = currencyMismatch || values.length < 2 ? null : max - min;
    const status = classifyRevenueStatus({ expectedVendors, observedVendors, currencies, invalidValue: item.invalidVendors.length > 0, values, delta });

    item.status = status;
    item.delta = delta;
    item.observedVendors = observedVendors;
    await query(
      `INSERT INTO revenue_reconciliations
         (site_id, transaction_id, currency, vendor_values, vendor_presence, missing_vendors, vendor_currencies, delta_value, status, last_seen)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,NOW())
       ON CONFLICT (site_id, transaction_id) DO UPDATE SET
         currency=EXCLUDED.currency, vendor_values=EXCLUDED.vendor_values, vendor_presence=EXCLUDED.vendor_presence,
         missing_vendors=EXCLUDED.missing_vendors, vendor_currencies=EXCLUDED.vendor_currencies,
         delta_value=EXCLUDED.delta_value, status=EXCLUDED.status, last_seen=NOW()`,
      [siteId, item.transactionId, item.currency, JSON.stringify(item.vendorValues), JSON.stringify(item.vendorPresence), JSON.stringify(item.missingVendors), JSON.stringify(item.vendorCurrencies), item.delta, status],
    );
    await createFindingAlert(siteId, item, status, observedVendors);
    if (['missing_vendor', 'value_mismatch', 'currency_mismatch', 'invalid_value'].includes(status)) findings.push(item);
  }
  return findings;
}
