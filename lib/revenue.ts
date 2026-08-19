import { query } from './db';
import { enqueueAlertDeliveries } from './notifications';

function money(value: number | null | undefined) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

export async function reconcileRevenue(siteId: number) {
  const rows = await query(
    `SELECT transaction_id, MAX(revenue_currency) AS currency, vendor,
            SUM(COALESCE(revenue_value,0))::numeric AS value,
            COUNT(*)::int AS fires
       FROM events
      WHERE site_id = $1 AND transaction_id IS NOT NULL AND transaction_id <> '' AND received_at > NOW() - INTERVAL '30 days'
      GROUP BY transaction_id, vendor`, [siteId],
  );
  const groups = new Map<string, any>();
  for (const row of rows.rows) {
    const key = String(row.transaction_id);
    const current = groups.get(key) || { transactionId: key, currency: row.currency || null, vendorValues: {}, vendorPresence: {}, fires: {} };
    current.vendorValues[row.vendor] = money(row.value);
    current.vendorPresence[row.vendor] = true;
    current.fires[row.vendor] = Number(row.fires) || 0;
    groups.set(key, current);
  }
  const findings: any[] = [];
  for (const item of groups.values()) {
    const values = Object.values(item.vendorValues).map(Number).filter((value) => value > 0);
    const vendors = Object.keys(item.vendorValues);
    const max = values.length ? Math.max(...values) : 0;
    const min = values.length ? Math.min(...values) : 0;
    const delta = max - min;
    const missingVendors = vendors.length < 2 ? [] : Object.keys(item.vendorValues).filter((vendor) => !item.vendorPresence[vendor]);
    const status = vendors.length < 2 ? 'single_vendor' : delta > Math.max(1, max * 0.05) ? 'value_mismatch' : 'matched';
    await query(
      `INSERT INTO revenue_reconciliations (site_id, transaction_id, currency, vendor_values, vendor_presence, missing_vendors, delta_value, status, last_seen)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,NOW())
       ON CONFLICT (site_id, transaction_id) DO UPDATE SET currency=EXCLUDED.currency, vendor_values=EXCLUDED.vendor_values, vendor_presence=EXCLUDED.vendor_presence, missing_vendors=EXCLUDED.missing_vendors, delta_value=EXCLUDED.delta_value, status=EXCLUDED.status, last_seen=NOW()`,
      [siteId, item.transactionId, item.currency, JSON.stringify(item.vendorValues), JSON.stringify(item.vendorPresence), JSON.stringify(missingVendors), delta, status],
    );
    if (status === 'value_mismatch') {
      const message = `Transaction ${item.transactionId} has a ${delta.toFixed(2)} ${item.currency || ''} revenue mismatch across ${vendors.join(', ')}.`;
      const inserted = await query(
        `INSERT INTO alerts (site_id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, raw, confidence, dedupe_key, notification_status)
         SELECT $1,'warning','revenue_reconciliation_mismatch','revenue',NULL,'purchase',$2,$3,$4::jsonb,$5::jsonb,'confirmed',$6,'pending'
          WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE site_id=$1 AND code='revenue_reconciliation_mismatch' AND dedupe_key=$6 AND resolved=false AND created_at > NOW()-INTERVAL '24 hours')
         RETURNING id`,
        [siteId, message, 'At least two vendors reported materially different purchase values for the same transaction_id.', JSON.stringify(['Verify the purchase payload and currency in each vendor implementation.', 'Check whether one vendor uses cents while another uses major currency units.', 'Inspect duplicate purchase tags and server/client deduplication.']), JSON.stringify(item), `revenue:${item.transactionId}`],
      );
      if (inserted.rowCount) void enqueueAlertDeliveries({ alertId: Number(inserted.rows[0].id), siteId, severity: 'warning', category: 'revenue', vendor: null, eventName: 'purchase', message, rootCause: 'Cross-vendor purchase values differ for the same transaction_id.', fixSteps: ['Verify purchase payloads and currencies across vendors.', 'Check cents-versus-major-unit conversion.', 'Inspect duplicate purchase tags and server/client deduplication.'] });
      findings.push({ ...item, status, delta });
    }
  }
  return findings;
}
