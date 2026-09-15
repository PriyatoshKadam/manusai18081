import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const dynamic = 'force-dynamic';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const purchaseFilter = `LOWER(COALESCE(event_name,'')) IN ('purchase','transaction','order_complete','ecommerce_purchase')`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport,'') <> 'performance'`;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const base = `
    SELECT
      ${occurrenceKey} AS occurrence_key,
      COALESCE(NULLIF(params->>'transaction_id',''), NULLIF(params->>'transactionId',''), NULLIF(params->>'transactionID','')) AS transaction_id,
      NULLIF(params->>'value','') AS raw_value,
      COALESCE(NULLIF(params->>'currency',''), NULLIF(params->>'currencyCode','')) AS currency,
      COALESCE(NULLIF(page_url,''),'') AS page_url,
      vendor,
      gtm_tag_name,
      gtm_trigger_name,
      session_id,
      client_id,
      received_at,
      observation_kind,
      delivery_outcome,
      status_code,
      failure_reason,
      params
    FROM events
    WHERE site_id = $1 AND received_at > NOW() - INTERVAL '30 days' AND ${purchaseFilter}
  `;

  const [recordsRes, trendRes, platformRes, issuesRes] = await Promise.all([
    query(`SELECT * FROM (${base}) purchases ORDER BY received_at DESC LIMIT 500`, [siteId]),
    query(`SELECT DATE(received_at) AS day, COUNT(DISTINCT COALESCE(transaction_id, occurrence_key))::int AS purchases,
                  COALESCE(SUM(CASE WHEN raw_value ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN raw_value::numeric ELSE 0 END),0)::numeric AS observed_value
             FROM (${base}) purchases GROUP BY DATE(received_at) ORDER BY day DESC LIMIT 30`, [siteId]),
    query(`SELECT COALESCE(vendor,'unknown') AS vendor, COUNT(DISTINCT COALESCE(transaction_id, occurrence_key))::int AS purchase_records,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND (delivery_outcome = 'delivered' OR (delivery_outcome IS NULL AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL)))::int AS delivered,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND (delivery_outcome IN ('http_error','blocked','beacon_rejected','network_error','aborted','timeout') OR (status_code >= 400)))::int AS failed
             FROM (${base}) purchases GROUP BY vendor ORDER BY purchase_records DESC`, [siteId]),
    query(`SELECT occurrence_key, COUNT(*)::int AS observations,
                  COUNT(DISTINCT NULLIF(params->>'transaction_id',''))::int AS transaction_ids,
                  COUNT(DISTINCT NULLIF(params->>'currency',''))::int AS currencies,
                  COUNT(DISTINCT NULLIF(params->>'value',''))::int AS values,
                  MAX(received_at) AS last_seen
             FROM (${base}) purchases GROUP BY occurrence_key HAVING COUNT(*) > 1 ORDER BY last_seen DESC LIMIT 100`, [siteId]),
  ]);

  const raw = recordsRes.rows as any[];
  const groups = new Map<string, any[]>();
  for (const row of raw) {
    const key = String(row.transaction_id || row.occurrence_key || row.received_at);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  const records = Array.from(groups.entries()).map(([key, rows]) => {
    const values = rows.map(r => Number(r.raw_value)).filter(Number.isFinite);
    const currencies = Array.from(new Set(rows.map(r => String(r.currency || '').trim().toUpperCase()).filter(Boolean)));
    const vendors = Array.from(new Set(rows.map(r => String(r.vendor || '').trim()).filter(Boolean)));
    const tags = Array.from(new Set(rows.map(r => String(r.gtm_tag_name || '').trim()).filter(Boolean)));
    const triggers = Array.from(new Set(rows.map(r => String(r.gtm_trigger_name || '').trim()).filter(Boolean)));
    const pages = Array.from(new Set(rows.map(r => String(r.page_url || '').trim()).filter(Boolean)));
    const validValues = Array.from(new Set(values.map(v => String(v))));
    const invalidValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && !Number.isFinite(Number(r.raw_value)));
    const missingValue = rows.every(r => r.raw_value === null || r.raw_value === '');
    const missingCurrency = rows.every(r => !String(r.currency || '').trim());
    const duplicate = rows.length > 1 && new Set(rows.map(r => `${r.vendor}|${r.received_at}|${r.observation_kind}`)).size < rows.length;
    let status = 'healthy';
    const issues: string[] = [];
    if (missingValue) { status = 'warn'; issues.push('Missing purchase value'); }
    else if (invalidValue) { status = 'warn'; issues.push('Invalid purchase value'); }
    if (missingCurrency) { status = 'warn'; issues.push('Missing currency'); }
    if (currencies.length > 1) { status = 'warn'; issues.push('Conflicting currencies'); }
    if (validValues.length > 1) { status = 'warn'; issues.push('Conflicting purchase values'); }
    if (rows.length > 1) { status = status === 'healthy' ? 'warn' : status; issues.push('Multiple purchase observations'); }
    if (rows.some(r => r.observation_kind === 'network' && ['http_error','blocked','beacon_rejected','network_error','aborted','timeout'].includes(String(r.delivery_outcome || '')))) {
      status = 'warn'; issues.push('Purchase delivery failure observed');
    }
    return {
      transaction_id: rows.find(r => r.transaction_id)?.transaction_id || null,
      occurrence_key: key,
      value: values.length ? values[0] : null,
      currency: currencies.length === 1 ? currencies[0] : currencies.length ? 'MIXED' : null,
      pages, vendors, gtm_tags: tags, gtm_triggers: triggers,
      observation_count: rows.length,
      status, issues,
      first_seen: rows.reduce((a, r) => !a || new Date(r.received_at) < new Date(a) ? r.received_at : a, null),
      last_seen: rows.reduce((a, r) => !a || new Date(r.received_at) > new Date(a) ? r.received_at : a, null),
    };
  });

  const healthy = records.filter(r => r.status === 'healthy').length;
  const totalValue = records.reduce((sum, r) => sum + (Number.isFinite(Number(r.value)) ? Number(r.value) : 0), 0);
  const currencies = Array.from(new Set(records.map(r => String(r.currency || '').trim()).filter(c => c && c !== 'MIXED')));
  const issueCounts: Record<string, number> = {};
  for (const record of records) for (const issue of record.issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;

  return NextResponse.json({
    source: 'ga4fix_event_telemetry',
    source_description: 'Revenue is calculated only from purchase events captured by the GA4Fix monitoring script. No GA4 admin or payment-provider totals are used.',
    window_days: 30,
    summary: {
      purchase_events: records.length,
      healthy_purchases: healthy,
      purchases_to_review: records.length - healthy,
      observed_value: currencies.length === 1 ? totalValue : null,
      currency: currencies.length === 1 ? currencies[0] : currencies.length > 1 ? 'MIXED' : null,
      average_order_value: currencies.length === 1 && records.length ? totalValue / records.length : null,
      unique_transactions: records.filter(r => r.transaction_id).length,
      duplicate_observations: records.filter(r => r.observation_count > 1).length,
      issue_counts: issueCounts,
    },
    records: records.slice(0, 100),
    trend: trendRes.rows,
    platforms: platformRes.rows,
    duplicate_groups: issuesRes.rows,
  });
}
