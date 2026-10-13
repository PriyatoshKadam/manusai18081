import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { PLATFORM_DETECTION, normaliseGovernanceVendor, platformEventName } from '../../../lib/platform-governance';
import { isEmptyParameterValue, logicalDeliveryKey, logicalOccurrenceKey, safeNumber } from '../../../lib/platform-evidence';

export const dynamic = 'force-dynamic';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const purchaseFilter = `(LOWER(COALESCE(event_name,'')) IN ('purchase','transaction','order_complete','ecommerce_purchase','completepayment') OR (LOWER(COALESCE(vendor,''))='bing' AND LOWER(COALESCE(params->>'ea',params->>'event_action','')) IN ('purchase','order_complete')) OR (LOWER(COALESCE(vendor,''))='linkedin' AND (LOWER(COALESCE(event_name,''))='purchase' OR (LOWER(COALESCE(event_name,''))='conversion' AND (LOWER(COALESCE(params->>'conversion_value_type',params->>'conversionValueType',''))='dynamic' OR NULLIF(COALESCE(params->'conversionValue'->>'amount',params->>'conversionValue.amount',''),'') IS NOT NULL))) OR (LOWER(COALESCE(vendor,''))='gads' AND (LOWER(COALESCE(params->>'conversion_category',params->>'conversionCategory',params->>'goal_category',''))='purchase' OR LOWER(COALESCE(params->>'conversion_name',params->>'conversionName','')) LIKE '%purchase%')))`;
const networkObservation = `observation_kind = 'network' AND COALESCE(transport,'') <> 'performance'`;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = Number(new URL(req.url).searchParams.get('siteId'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'Valid siteId required' }, { status: 400 });
  const owner = await query('SELECT id, domain, vendor_routing_policy FROM sites WHERE id = $1 AND user_id = $2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const base = `
    SELECT
      ${occurrenceKey} AS occurrence_key,
      COALESCE(NULLIF(params->>'transaction_id',''), NULLIF(params->>'transactionId',''), NULLIF(params->>'transactionID',''), NULLIF(params->>'order_id',''), NULLIF(params->>'orderID',''), NULLIF(params->>'oid',''), NULLIF(params->>'cd[order_id]',''), NULLIF(params->'custom_data'->>'order_id',''), NULLIF(params->'properties'->>'order_id',''), NULLIF(params->>'properties.order_id','')) AS transaction_id,
      COALESCE(NULLIF(params->>'event_id',''), NULLIF(params->>'eventId',''), NULLIF(params->>'eid','')) AS dedupe_id,
      COALESCE(NULLIF(params->>'value',''), NULLIF(params->>'epn.value',''), NULLIF(params->>'ep.value',''), NULLIF(params->>'gv',''), NULLIF(params->>'conversion_value',''), NULLIF(params->>'revenue_value',''), NULLIF(params->>'event_value',''), NULLIF(params->>'ev',''), NULLIF(params->>'price',''), NULLIF(params->'conversionValue'->>'amount',''), NULLIF(params->>'conversionValue.amount',''), NULLIF(params->>'cd[value]',''), NULLIF(params->'custom_data'->>'value',''), NULLIF(params->'properties'->>'value',''), NULLIF(params->>'properties.value',''), NULLIF(params->'properties'->>'price',''), NULLIF(params->>'properties.price',''), NULLIF(params->>'ecomm_totalvalue','')) AS raw_value,
      COALESCE(NULLIF(params->>'currency',''), NULLIF(params->>'currencyCode',''), NULLIF(params->>'currency_code',''), NULLIF(params->>'gc',''), NULLIF(params->>'cu',''), NULLIF(params->'conversionValue'->>'currencyCode',''), NULLIF(params->>'conversionValue.currencyCode',''), NULLIF(params->>'cd[currency]',''), NULLIF(params->'custom_data'->>'currency',''), NULLIF(params->'properties'->>'currency',''), NULLIF(params->>'properties.currency','')) AS currency,
      COALESCE(NULLIF(page_url,''),'') AS page_url,
      COALESCE(NULLIF(raw_url,''),'') AS raw_url,
      consent_state,
      vendor,
      LOWER(COALESCE(event_name,'')) AS event_name,
      gtm_tag_name,
      gtm_trigger_name,
      session_id,
      client_id,
      occurrence_id,
      network_occurrence_id,
      origin_source,
      delivery_mode,
      transport,
      request_signature,
      received_at,
      observation_kind,
      delivery_outcome,
      status_code,
      failure_reason,
      params
    FROM events
    WHERE site_id = $1 AND received_at > NOW() - INTERVAL '30 days' AND ${purchaseFilter}
  `;

  const [recordsRes, trendRes, platformRes, issuesRes, duplicateTransactionsRes] = await Promise.all([
    query(`SELECT * FROM (${base}) purchases ORDER BY received_at DESC LIMIT 500`, [siteId]),
    query(`WITH raw_purchases AS (
                SELECT DATE(received_at) AS day, COALESCE(transaction_id, occurrence_key) AS transaction_key,
                  raw_value, NULLIF(UPPER(BTRIM(currency)),'') AS normalized_currency
                FROM (${base}) purchases
              ), transactions AS (
                SELECT day, transaction_key,
                  COUNT(DISTINCT raw_value) FILTER (WHERE raw_value ~ '^-?[0-9]+(\\.[0-9]+)?
    query(`SELECT COALESCE(vendor,'unknown') AS vendor, COUNT(DISTINCT COALESCE(transaction_id, dedupe_id, occurrence_key))::int AS purchase_records,
                  COUNT(DISTINCT COALESCE(network_occurrence_id,id::text)) FILTER (WHERE ${networkObservation} AND (delivery_outcome = 'delivered' OR (delivery_outcome IS NULL AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL)))::int AS delivered,
                  COUNT(DISTINCT COALESCE(network_occurrence_id,id::text)) FILTER (WHERE ${networkObservation} AND (delivery_outcome IN ('http_error','beacon_rejected','network_error','timeout') OR status_code >= 400))::int AS failed
             FROM (${base}) purchases GROUP BY vendor ORDER BY purchase_records DESC`, [siteId]),
    query(`SELECT occurrence_key, COUNT(*)::int AS observations,
                  COUNT(DISTINCT COALESCE(NULLIF(params->>'transaction_id',''),NULLIF(params->>'transactionId',''),NULLIF(params->>'order_id',''),NULLIF(params->>'oid',''),NULLIF(params->>'cd[order_id]','')))::int AS transaction_ids,
                  COUNT(DISTINCT NULLIF(UPPER(BTRIM(COALESCE(params->>'currency',params->>'currencyCode',params->>'currency_code',params->>'gc',params->>'cu'))),''))::int AS currencies,
                  COUNT(DISTINCT COALESCE(NULLIF(params->>'value',''),NULLIF(params->>'gv',''),NULLIF(params->>'price',''),NULLIF(params->>'conversion_value',''),NULLIF(params->>'ecomm_totalvalue',''),NULLIF(params->>'cd[value]','')))::int AS values,
                  MAX(received_at) AS last_seen
             FROM (${base}) purchases WHERE observation_kind='network' AND COALESCE(transport,'')<>'performance'
             GROUP BY occurrence_key HAVING COUNT(DISTINCT COALESCE(network_occurrence_id,id::text)) > 1 ORDER BY last_seen DESC LIMIT 100`, [siteId]),
    query(`SELECT vendor, transaction_id, COUNT(DISTINCT occurrence_key)::int AS occurrences,
                  COUNT(DISTINCT NULLIF(session_id,''))::int AS sessions, MAX(received_at) AS last_seen
             FROM (${base}) purchases
             WHERE transaction_id IS NOT NULL AND BTRIM(transaction_id)<>'' AND observation_kind='network' AND COALESCE(transport,'')<>'performance'
             GROUP BY vendor, transaction_id HAVING COUNT(DISTINCT occurrence_key)>1 ORDER BY last_seen DESC LIMIT 500`, [siteId]),
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
    const values = rows.map(r => r.raw_value === null || r.raw_value === undefined || r.raw_value === '' ? Number.NaN : Number(r.raw_value)).filter(Number.isFinite);
    const currencies = Array.from(new Set(rows.map(r => String(r.currency || '').trim().toUpperCase()).filter(Boolean)));
    const vendors = Array.from(new Set(rows.map(r => String(r.vendor || '').trim()).filter(Boolean)));
    const tags = Array.from(new Set(rows.map(r => String(r.gtm_tag_name || '').trim()).filter(Boolean)));
    const triggers = Array.from(new Set(rows.map(r => String(r.gtm_trigger_name || '').trim()).filter(Boolean)));
    const pages = Array.from(new Set(rows.map(r => String(r.page_url || '').trim()).filter(Boolean)));
    const validValues = Array.from(new Set(values.map(v => String(v))));
    const invalidValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && !Number.isFinite(Number(r.raw_value)));
    const negativeValue = values.some(v => v < 0);
    const hasValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && Number.isFinite(Number(r.raw_value)));
    const hasCurrency = rows.some(r => Boolean(String(r.currency || '').trim()));
    const requiresValue = rows.some(r => {
      const vendor=normaliseGovernanceVendor(r.vendor);
      const name=String(r.event_name||'').toLowerCase();
      if(vendor==='ga4') return ['purchase','transaction','order_complete','ecommerce_purchase'].includes(name);
      if(vendor==='meta') return name==='purchase';
      if(vendor==='tiktok') return ['purchase','completepayment'].includes(name);
      if(vendor==='snapchat') return name==='purchase';
      if(vendor==='bing') return name==='purchase' || (String(r.params?.ea||r.params?.event_action||'').toLowerCase()==='purchase' && Boolean(r.raw_value));
      if(vendor==='linkedin') return name==='purchase' || (name==='conversion' && r.params?.conversionValue?.amount!==undefined);
      if(vendor==='gads') return Boolean(r.transaction_id);
      return false;
    });
    const requiresCurrency = rows.some(r => {
      const vendor=normaliseGovernanceVendor(r.vendor);
      const name=String(r.event_name||'').toLowerCase();
      return (vendor==='ga4' && ['purchase','transaction','order_complete','ecommerce_purchase'].includes(name))
        || (vendor==='meta' && name==='purchase')
        || (vendor==='tiktok' && ['purchase','completepayment'].includes(name))
        || (vendor==='snapchat' && name==='purchase')
        || (vendor==='bing' && (name==='purchase' || String(r.params?.ea||r.params?.event_action||'').toLowerCase()==='purchase'))
        || (vendor==='linkedin' && (name==='purchase' || (name==='conversion' && r.params?.conversionValue?.amount!==undefined)));
    });
    const missingValue = requiresValue && !hasValue;
    const missingCurrency = requiresCurrency && !hasCurrency;
    const networkGroups=new Map<string,any[]>();
    for(const r of rows){
      if(r.observation_kind!=='network'||String(r.delivery_outcome||'')!=='delivered'||!r.session_id||!r.occurrence_id)continue;
      const key=String(r.vendor)+'|'+String(r.session_id)+':'+String(r.occurrence_id);
      const group=networkGroups.get(key)||[];group.push(r);networkGroups.set(key,group);
    }
    const hasDuplicateDelivery=Array.from(networkGroups.values()).some(group=>{
      if(group.length<2)return false;
      const times=group.map(r=>new Date(r.received_at).getTime()).filter(Number.isFinite);
      if(!times.length||Math.max(...times)-Math.min(...times)>10000)return false;
      const ids=Array.from(new Set(group.map(r=>String(r.params?.event_id||r.params?.eventId||r.params?.eid||'')).filter(Boolean)));
      const modes=Array.from(new Set(group.map(r=>String(r.delivery_mode||'unknown'))));
      const vendorsInGroup=new Set(group.map(r=>r.vendor));
      if(ids.length===1&&vendorsInGroup.size===1&&['meta','tiktok','snapchat'].includes(String(group[0].vendor))&&modes.length>1&&modes.some(m=>/server|capi|api/i.test(m)))return false;
      return true;
    });
    let status = 'healthy';
    const issues: string[] = [];
    if (missingValue) { status = 'warn'; issues.push('Missing purchase value'); }
    else if (invalidValue) { status = 'warn'; issues.push('Invalid purchase value'); }
    if (negativeValue) { status = 'warn'; issues.push('Negative purchase value'); }
    if (missingCurrency) { status = 'warn'; issues.push('Missing currency'); }
    if (currencies.length > 1) { status = 'warn'; issues.push('Conflicting currencies'); }
    if (validValues.length > 1) { status = 'warn'; issues.push('Conflicting purchase values'); }
    if (hasDuplicateDelivery) { status = 'warn'; issues.push('Duplicate delivery within one purchase occurrence'); }
    if (rows.some(r => r.observation_kind === 'network' && ['http_error','beacon_rejected'].includes(String(r.delivery_outcome || '')) || r.observation_kind === 'network' && Number(r.status_code)>=400)) {
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
      duplicate_observations: records.filter(r => r.issues.includes('Duplicate delivery within one purchase occurrence')).length,
      issue_counts: issueCounts,
    },
    records: records.slice(0, 100),
    trend: trendRes.rows,
    platforms: platformRes.rows,
    duplicate_groups: issuesRes.rows,
  });
}
)::int AS value_variants,
                  COUNT(DISTINCT normalized_currency)::int AS currency_variants,
                  MIN(raw_value::numeric) FILTER (WHERE raw_value ~ '^-?[0-9]+(\\.[0-9]+)?
    query(`SELECT COALESCE(vendor,'unknown') AS vendor, COUNT(DISTINCT COALESCE(transaction_id, occurrence_key))::int AS purchase_records,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND (delivery_outcome = 'delivered' OR (delivery_outcome IS NULL AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL)))::int AS delivered,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND (delivery_outcome IN ('http_error','beacon_rejected') OR (status_code >= 400)))::int AS failed
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
    const values = rows.map(r => r.raw_value === null || r.raw_value === undefined || r.raw_value === '' ? Number.NaN : Number(r.raw_value)).filter(Number.isFinite);
    const currencies = Array.from(new Set(rows.map(r => String(r.currency || '').trim().toUpperCase()).filter(Boolean)));
    const vendors = Array.from(new Set(rows.map(r => String(r.vendor || '').trim()).filter(Boolean)));
    const tags = Array.from(new Set(rows.map(r => String(r.gtm_tag_name || '').trim()).filter(Boolean)));
    const triggers = Array.from(new Set(rows.map(r => String(r.gtm_trigger_name || '').trim()).filter(Boolean)));
    const pages = Array.from(new Set(rows.map(r => String(r.page_url || '').trim()).filter(Boolean)));
    const validValues = Array.from(new Set(values.map(v => String(v))));
    const invalidValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && !Number.isFinite(Number(r.raw_value)));
    const negativeValue = values.some(v => v < 0);
    const hasValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && Number.isFinite(Number(r.raw_value)));
    const hasCurrency = rows.some(r => Boolean(String(r.currency || '').trim()));
    const requiresValue = rows.some(r => {
      const vendor=normaliseGovernanceVendor(r.vendor);
      const name=String(r.event_name||'').toLowerCase();
      if(vendor==='ga4') return ['purchase','transaction','order_complete','ecommerce_purchase'].includes(name);
      if(vendor==='meta') return name==='purchase';
      if(vendor==='tiktok') return ['purchase','completepayment'].includes(name);
      if(vendor==='snapchat') return name==='purchase';
      if(vendor==='bing') return name==='purchase' || (String(r.params?.ea||r.params?.event_action||'').toLowerCase()==='purchase' && Boolean(r.raw_value));
      if(vendor==='linkedin') return name==='purchase' || (name==='conversion' && r.params?.conversionValue?.amount!==undefined);
      if(vendor==='gads') return Boolean(r.transaction_id);
      return false;
    });
    const requiresCurrency = rows.some(r => {
      const vendor=normaliseGovernanceVendor(r.vendor);
      const name=String(r.event_name||'').toLowerCase();
      return (vendor==='ga4' && ['purchase','transaction','order_complete','ecommerce_purchase'].includes(name))
        || (vendor==='meta' && name==='purchase')
        || (vendor==='tiktok' && ['purchase','completepayment'].includes(name))
        || (vendor==='snapchat' && name==='purchase')
        || (vendor==='bing' && (name==='purchase' || String(r.params?.ea||r.params?.event_action||'').toLowerCase()==='purchase'))
        || (vendor==='linkedin' && (name==='purchase' || (name==='conversion' && r.params?.conversionValue?.amount!==undefined)));
    });
    const missingValue = requiresValue && !hasValue;
    const missingCurrency = requiresCurrency && !hasCurrency;
    const networkGroups=new Map<string,any[]>();
    for(const r of rows){
      if(r.observation_kind!=='network'||String(r.delivery_outcome||'')!=='delivered'||!r.session_id||!r.occurrence_id)continue;
      const key=String(r.vendor)+'|'+String(r.session_id)+':'+String(r.occurrence_id);
      const group=networkGroups.get(key)||[];group.push(r);networkGroups.set(key,group);
    }
    const hasDuplicateDelivery=Array.from(networkGroups.values()).some(group=>{
      if(group.length<2)return false;
      const times=group.map(r=>new Date(r.received_at).getTime()).filter(Number.isFinite);
      if(!times.length||Math.max(...times)-Math.min(...times)>10000)return false;
      const ids=Array.from(new Set(group.map(r=>String(r.params?.event_id||r.params?.eventId||r.params?.eid||'')).filter(Boolean)));
      const modes=Array.from(new Set(group.map(r=>String(r.delivery_mode||'unknown'))));
      const vendorsInGroup=new Set(group.map(r=>r.vendor));
      if(ids.length===1&&vendorsInGroup.size===1&&['meta','tiktok','snapchat'].includes(String(group[0].vendor))&&modes.length>1&&modes.some(m=>/server|capi|api/i.test(m)))return false;
      return true;
    });
    let status = 'healthy';
    const issues: string[] = [];
    if (missingValue) { status = 'warn'; issues.push('Missing purchase value'); }
    else if (invalidValue) { status = 'warn'; issues.push('Invalid purchase value'); }
    if (negativeValue) { status = 'warn'; issues.push('Negative purchase value'); }
    if (missingCurrency) { status = 'warn'; issues.push('Missing currency'); }
    if (currencies.length > 1) { status = 'warn'; issues.push('Conflicting currencies'); }
    if (validValues.length > 1) { status = 'warn'; issues.push('Conflicting purchase values'); }
    if (hasDuplicateDelivery) { status = 'warn'; issues.push('Duplicate delivery within one purchase occurrence'); }
    if (rows.some(r => r.observation_kind === 'network' && ['http_error','beacon_rejected'].includes(String(r.delivery_outcome || '')) || r.observation_kind === 'network' && Number(r.status_code)>=400)) {
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
      duplicate_observations: records.filter(r => r.issues.includes('Duplicate delivery within one purchase occurrence')).length,
      issue_counts: issueCounts,
    },
    records: records.slice(0, 100),
    trend: trendRes.rows,
    platforms: platformRes.rows,
    duplicate_groups: issuesRes.rows,
  });
}
) AS transaction_value
                FROM raw_purchases GROUP BY day, transaction_key
              )
              SELECT day, COUNT(*)::int AS purchases,
                CASE WHEN COUNT(*) FILTER (WHERE value_variants=1 AND currency_variants=1 AND transaction_value IS NOT NULL)=COUNT(*)
                  THEN SUM(transaction_value)::numeric ELSE NULL END AS observed_value,
                COUNT(*) FILTER (WHERE transaction_value IS NOT NULL AND value_variants=1)::int AS purchases_with_value,
                COUNT(*) FILTER (WHERE transaction_value IS NULL OR value_variants<>1)::int AS purchases_missing_or_conflicting_value,
                COUNT(*) FILTER (WHERE value_variants>1 OR currency_variants>1)::int AS conflicting_transactions
              FROM transactions GROUP BY day ORDER BY day DESC LIMIT 30`, [siteId]),
    query(`SELECT COALESCE(vendor,'unknown') AS vendor, COUNT(DISTINCT COALESCE(transaction_id, occurrence_key))::int AS purchase_records,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND (delivery_outcome = 'delivered' OR (delivery_outcome IS NULL AND status_code BETWEEN 200 AND 399 AND failure_reason IS NULL)))::int AS delivered,
                  COUNT(*) FILTER (WHERE ${networkObservation} AND (delivery_outcome IN ('http_error','beacon_rejected') OR (status_code >= 400)))::int AS failed
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
    const values = rows.map(r => r.raw_value === null || r.raw_value === undefined || r.raw_value === '' ? Number.NaN : Number(r.raw_value)).filter(Number.isFinite);
    const currencies = Array.from(new Set(rows.map(r => String(r.currency || '').trim().toUpperCase()).filter(Boolean)));
    const vendors = Array.from(new Set(rows.map(r => String(r.vendor || '').trim()).filter(Boolean)));
    const tags = Array.from(new Set(rows.map(r => String(r.gtm_tag_name || '').trim()).filter(Boolean)));
    const triggers = Array.from(new Set(rows.map(r => String(r.gtm_trigger_name || '').trim()).filter(Boolean)));
    const pages = Array.from(new Set(rows.map(r => String(r.page_url || '').trim()).filter(Boolean)));
    const validValues = Array.from(new Set(values.map(v => String(v))));
    const invalidValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && !Number.isFinite(Number(r.raw_value)));
    const negativeValue = values.some(v => v < 0);
    const hasValue = rows.some(r => r.raw_value !== null && r.raw_value !== '' && Number.isFinite(Number(r.raw_value)));
    const hasCurrency = rows.some(r => Boolean(String(r.currency || '').trim()));
    const requiresValue = rows.some(r => {
      const vendor=normaliseGovernanceVendor(r.vendor);
      const name=String(r.event_name||'').toLowerCase();
      if(vendor==='ga4') return ['purchase','transaction','order_complete','ecommerce_purchase'].includes(name);
      if(vendor==='meta') return name==='purchase';
      if(vendor==='tiktok') return ['purchase','completepayment'].includes(name);
      if(vendor==='snapchat') return name==='purchase';
      if(vendor==='bing') return name==='purchase' || (String(r.params?.ea||r.params?.event_action||'').toLowerCase()==='purchase' && Boolean(r.raw_value));
      if(vendor==='linkedin') return name==='purchase' || (name==='conversion' && r.params?.conversionValue?.amount!==undefined);
      if(vendor==='gads') return Boolean(r.transaction_id);
      return false;
    });
    const requiresCurrency = rows.some(r => {
      const vendor=normaliseGovernanceVendor(r.vendor);
      const name=String(r.event_name||'').toLowerCase();
      return (vendor==='ga4' && ['purchase','transaction','order_complete','ecommerce_purchase'].includes(name))
        || (vendor==='meta' && name==='purchase')
        || (vendor==='tiktok' && ['purchase','completepayment'].includes(name))
        || (vendor==='snapchat' && name==='purchase')
        || (vendor==='bing' && (name==='purchase' || String(r.params?.ea||r.params?.event_action||'').toLowerCase()==='purchase'))
        || (vendor==='linkedin' && (name==='purchase' || (name==='conversion' && r.params?.conversionValue?.amount!==undefined)));
    });
    const missingValue = requiresValue && !hasValue;
    const missingCurrency = requiresCurrency && !hasCurrency;
    const networkGroups=new Map<string,any[]>();
    for(const r of rows){
      if(r.observation_kind!=='network'||String(r.delivery_outcome||'')!=='delivered'||!r.session_id||!r.occurrence_id)continue;
      const key=String(r.vendor)+'|'+String(r.session_id)+':'+String(r.occurrence_id);
      const group=networkGroups.get(key)||[];group.push(r);networkGroups.set(key,group);
    }
    const hasDuplicateDelivery=Array.from(networkGroups.values()).some(group=>{
      if(group.length<2)return false;
      const times=group.map(r=>new Date(r.received_at).getTime()).filter(Number.isFinite);
      if(!times.length||Math.max(...times)-Math.min(...times)>10000)return false;
      const ids=Array.from(new Set(group.map(r=>String(r.params?.event_id||r.params?.eventId||r.params?.eid||'')).filter(Boolean)));
      const modes=Array.from(new Set(group.map(r=>String(r.delivery_mode||'unknown'))));
      const vendorsInGroup=new Set(group.map(r=>r.vendor));
      if(ids.length===1&&vendorsInGroup.size===1&&['meta','tiktok','snapchat'].includes(String(group[0].vendor))&&modes.length>1&&modes.some(m=>/server|capi|api/i.test(m)))return false;
      return true;
    });
    let status = 'healthy';
    const issues: string[] = [];
    if (missingValue) { status = 'warn'; issues.push('Missing purchase value'); }
    else if (invalidValue) { status = 'warn'; issues.push('Invalid purchase value'); }
    if (negativeValue) { status = 'warn'; issues.push('Negative purchase value'); }
    if (missingCurrency) { status = 'warn'; issues.push('Missing currency'); }
    if (currencies.length > 1) { status = 'warn'; issues.push('Conflicting currencies'); }
    if (validValues.length > 1) { status = 'warn'; issues.push('Conflicting purchase values'); }
    if (hasDuplicateDelivery) { status = 'warn'; issues.push('Duplicate delivery within one purchase occurrence'); }
    if (rows.some(r => r.observation_kind === 'network' && ['http_error','beacon_rejected'].includes(String(r.delivery_outcome || '')) || r.observation_kind === 'network' && Number(r.status_code)>=400)) {
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
      duplicate_observations: records.filter(r => r.issues.includes('Duplicate delivery within one purchase occurrence')).length,
      issue_counts: issueCounts,
    },
    records: records.slice(0, 100),
    trend: trendRes.rows,
    platforms: platformRes.rows,
    duplicate_groups: issuesRes.rows,
  });
}
