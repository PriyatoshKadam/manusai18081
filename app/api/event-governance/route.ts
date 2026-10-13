import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { allRules, canonicalEvent, eventNameValidation, normaliseGovernanceVendor, platformEventName } from '../../../lib/platform-governance';

const occurrenceKey = `COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)`;
const network = `observation_kind = 'network' AND COALESCE(transport, '') <> 'performance'`;
const nonBlockedFailure = `(${network} AND delivery_outcome IN ('http_error','beacon_rejected','network_error','timeout','aborted')) OR (${network} AND (delivery_outcome IS NULL OR delivery_outcome = 'unknown') AND ((status_code IS NOT NULL AND status_code >= 400) OR failure_reason IN ('beacon_rejected','network_error','timeout','aborted') OR failure_reason LIKE 'http_%'))`;
const consentSignal = `(LOWER(COALESCE(code,'')) LIKE '%consent%' OR LOWER(COALESCE(category,'')) LIKE '%consent%' OR LOWER(COALESCE(message,'')) LIKE '%consent%' OR LOWER(COALESCE(message,'')) LIKE '%analytics_storage%' OR LOWER(COALESCE(message,'')) LIKE '%ad_storage%' OR LOWER(COALESCE(message,'')) LIKE '%ad_user_data%' OR LOWER(COALESCE(message,'')) LIKE '%ad_personalization%' OR LOWER(COALESCE(message,'')) LIKE '%g100%' OR LOWER(COALESCE(root_cause,'')) LIKE '%consent%' OR LOWER(COALESCE(fix_steps::text,'')) LIKE '%consent%')`;
const STANDARD_REQUIRED: Record<string, string[]> = { purchase: ['transaction_id', 'value', 'currency'], refund: ['transaction_id'], add_to_cart: ['items'], view_item: ['items'], view_item_list: ['items'], begin_checkout: ['items'], remove_from_cart: ['items'], select_item: ['items'] };
const STANDARD_TYPES: Record<string, Record<string, string[]>> = {
  purchase: { transaction_id: ['string'], value: ['number'], currency: ['string'], items: ['array'] },
  refund: { transaction_id: ['string'], value: ['number'], currency: ['string'], items: ['array'] },
  add_to_cart: { items: ['array'], value: ['number'], currency: ['string'] },
  view_item: { items: ['array'], value: ['number'], currency: ['string'] },
  view_item_list: { items: ['array'] },
  begin_checkout: { items: ['array'], value: ['number'], currency: ['string'] },
  remove_from_cart: { items: ['array'] },
  select_item: { items: ['array'] },
  login: { method: ['string'] },
  sign_up: { method: ['string'] },
  generate_lead: { value: ['number'], currency: ['string'] },
};
const DUPLICATE_NOISE_EVENTS = new Set(['scroll', 'click', 'user_engagement', 'video_progress']);
const VENDOR_ALIASES: Record<string, string> = { microsoftads: 'bing', microsoft_ads: 'bing', google_ads: 'gads', googleads: 'gads' };
function normaliseVendor(value: unknown) { const v = String(value || '').trim().toLowerCase(); return VENDOR_ALIASES[v] || v; }
function normaliseName(value: unknown) { return String(value || '').trim().toLowerCase(); }
function parseJson(value: unknown): any[] { if (Array.isArray(value)) return value; if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } } return []; }
function percentChange(current: number, baseline: number) { return baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : 0; }
function vendorFromTag(tag: any): string { const type = normaliseName(tag?.type); const name = normaliseName(tag?.name); if (type.includes('googleanalytics') || ['gaawe','gaawc'].includes(type)) return 'ga4'; if (type.includes('googleads') || type === 'awct' || type === 'sp' || name.includes('google ads')) return 'gads'; if (type.includes('facebook') || type.includes('meta') || name.includes('facebook') || name.includes('meta pixel')) return 'meta'; if (type.includes('tiktok') || type.includes('tik_tok') || name.includes('tiktok') || name.includes('tik tok')) return 'tiktok'; if (type.includes('linkedin') || name.includes('linkedin') || name.includes('insight tag')) return 'linkedin'; if (type.includes('microsoft') || type.includes('bing') || name.includes('bing') || name.includes('uet')) return 'bing'; if (type.includes('snapchat') || type.includes('snap') || name.includes('snapchat') || name.includes('snap pixel')) return 'snapchat'; return 'other'; }
function gtmConfiguredEvents(snapshot: any, vendor: string) {
  const tags = parseJson(snapshot?.tags);
  const triggers = parseJson(snapshot?.triggers);
  const triggerById = new Map(triggers.map((t: any) => [String(t.triggerId || ''), t]));
  const configured = new Map<string, any>();
  const usableValue = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text && !text.includes('{{') && !text.includes('}}') && !/^undefined|null$/i.test(text) ? text : '';
  };
  const paramsOf = (tag: any) => {
    const out: Record<string, unknown> = {};
    for (const p of (Array.isArray(tag?.parameter) ? tag.parameter : [])) {
      const key = String(p?.key || '').trim();
      if (key) out[key] = p?.value;
    }
    return out;
  };
  const fromParams = (p: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      const value = usableValue(p[key]);
      if (value) return value;
    }
    return '';
  };
  for (const tag of tags) {
    if (vendorFromTag(tag) !== vendor) continue;
    const tagName = usableValue(tag.name);
    if (!tagName || /gafix|monitor/i.test(tagName)) continue;

    const p = paramsOf(tag);
    const directEvent = usableValue(tag.eventName) || usableValue(tag.event_name) || fromParams(p, ['eventName','event_name','event','event_name_override']);
    let expectedName = directEvent;
    if (vendor === 'gads') {
      expectedName = fromParams(p, ['conversionLabel','conversion_label','google_conversion_label','label']) ||
        usableValue(tag.eventName) || fromParams(p, ['conversionId','conversion_id','google_conversion_id','aw-id']);
    } else if (vendor === 'bing') {
      const type = String(tag.type || '').toLowerCase();
      expectedName = directEvent || (type.includes('baut') ? fromParams(p, ['eventType','event_type']) : '');
      if (!expectedName && fromParams(p, ['eventCategory','ec','eventAction','ea'])) expectedName = 'custom';
    } else if (vendor === 'linkedin') {
      expectedName = directEvent || fromParams(p, ['conversionId','conversion_id','conversion','eventId','event_id']);
    } else if (vendor === 'ga4') {
      expectedName = directEvent || fromParams(p, ['eventName','event_name']);
    }
    expectedName = usableValue(expectedName);
    if (!expectedName) continue;

    const linkedTriggers = (Array.isArray(tag.firingTriggerIds) ? tag.firingTriggerIds : [])
      .map((id: any) => triggerById.get(String(id))).filter(Boolean);
    const triggerNames = linkedTriggers.map((t: any) => String(t.name || t.triggerId || '')).filter(Boolean);
    const opportunityNames = linkedTriggers.flatMap((t: any) => {
      const candidates = [t.customEventName, ...(Array.isArray(t.customEventFilter) ? t.customEventFilter : []).flatMap((f: any) => {
        const params = Array.isArray(f?.parameter) ? f.parameter : [];
        const arg1 = params.find((p: any) => String(p?.key || '').toLowerCase() === 'arg1');
        return [arg1?.value];
      })];
      return candidates.map(usableValue).filter(Boolean);
    });
    const isAllPages = linkedTriggers.some((t: any) => {
      const name = String(t.name || '').toLowerCase();
      const type = String(t.type || '').toLowerCase();
      return /all pages|initialization|page view|pageview|history change/.test(name) ||
        ['pageview','initialization','historychange'].includes(type);
    });
    const canonical = platformEventName(vendor as any, expectedName);
    const key = `${vendor}:${normaliseName(canonical)}`;
    const current = configured.get(key) || {
      vendor,
      event_name: canonical,
      tag_names: [],
      trigger_names: [],
      opportunity_names: [],
      all_pages_opportunity: false,
      parameter_keys: [],
    };
    if (!current.tag_names.includes(tagName)) current.tag_names.push(tagName);
    for (const triggerName of triggerNames) if (!current.trigger_names.includes(triggerName)) current.trigger_names.push(triggerName);
    for (const name of opportunityNames) if (!current.opportunity_names.some((x: string) => normaliseName(x) === normaliseName(name))) current.opportunity_names.push(name);
    current.all_pages_opportunity = current.all_pages_opportunity || isAllPages;
    for (const parameterKey of Array.isArray(tag.parameterKeys) ? tag.parameterKeys : []) {
      if (!current.parameter_keys.includes(String(parameterKey))) current.parameter_keys.push(String(parameterKey));
    }
    configured.set(key, current);
  }
  return configured;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url); const siteId = Number(url.searchParams.get('siteId')); const vendor = normaliseVendor(url.searchParams.get('vendor'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  if (!vendor) return NextResponse.json({ error: 'vendor required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2 LIMIT 1', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [events, params, alerts, snapshotResult, duplicateResult] = await Promise.all([
    query(`SELECT LOWER(COALESCE(event_name,'')) AS event_name, event_type, vendor,
      COUNT(DISTINCT ${occurrenceKey})::int AS lifetime_hits,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '30 days')::int AS hits_30d,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at < NOW() - INTERVAL '30 days')::int AS prior_60d_hits,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours')::int AS hits_24h,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '48 hours' AND received_at < NOW() - INTERVAL '24 hours')::int AS prior_hits_24h,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '8 days' AND received_at < NOW() - INTERVAL '1 day')::int AS prior_7d_hits,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '8 days' AND received_at < NOW() - INTERVAL '7 days')::int AS same_dow_1,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '15 days' AND received_at < NOW() - INTERVAL '14 days')::int AS same_dow_2,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '22 days' AND received_at < NOW() - INTERVAL '21 days')::int AS same_dow_3,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '29 days' AND received_at < NOW() - INTERVAL '28 days')::int AS same_dow_4,
      COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours' AND ${network})::int AS attempts_24h,
      COUNT(DISTINCT ${occurrenceKey}) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours' AND ${nonBlockedFailure})::int AS failed_24h,
      MIN(received_at) AS first_seen, MAX(received_at) AS last_seen,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(event_name,'')),NULL) AS observed_event_names,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_tag_name,'')),NULL) AS observed_gtm_tags,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_trigger_name,'')),NULL) AS observed_gtm_triggers,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT gtm_correlation_confidence),NULL) AS correlation_confidences,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT parameter_status),NULL) AS parameter_statuses,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT missing_parameters),NULL) AS missing_parameters
      FROM events WHERE site_id = $1 AND vendor = $2 AND received_at >= NOW() - INTERVAL '90 days'
      GROUP BY LOWER(COALESCE(event_name,'')), event_type, vendor ORDER BY lifetime_hits DESC LIMIT 1000`, [siteId, vendor]),
    query(`SELECT LOWER(COALESCE(event_name,'')) AS event_name, vendor, LOWER(key) AS parameter_name, COUNT(DISTINCT ${occurrenceKey})::int AS hits, ARRAY_AGG(DISTINCT jsonb_typeof(value)) AS types
      FROM events e CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(e.params)='object' THEN e.params ELSE '{}'::jsonb END)
      WHERE e.site_id = $1 AND e.vendor = $2 AND e.received_at >= NOW() - INTERVAL '30 days'
      GROUP BY LOWER(COALESCE(event_name,'')), vendor, LOWER(key) ORDER BY hits DESC LIMIT 10000`, [siteId, vendor]),
    query(`SELECT id, severity, code, category, vendor, event_name, message, root_cause, fix_steps, created_at FROM alerts WHERE site_id = $1 AND resolved = false AND ($2::text IS NULL OR vendor = $2) AND NOT ${consentSignal} ORDER BY created_at DESC LIMIT 500`, [siteId, vendor]),
    query(`SELECT tags, triggers, variables, fetched_at, environment, snapshot_version_id, live_version_id, live_version_name, snapshot_stale FROM gtm_config_snapshots WHERE site_id = $1 AND user_id = $2 ORDER BY fetched_at DESC LIMIT 1`, [siteId, session.uid]),
    query(`WITH fanout AS (
      SELECT LOWER(COALESCE(event_name,'')) AS event_name, occurrence_id, session_id,
             COUNT(*)::int AS delivery_count, MIN(received_at) AS first_delivery, MAX(received_at) AS last_delivery,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_tag_name,'')),NULL) AS gtm_tags,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_trigger_name,'')),NULL) AS gtm_triggers,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(gtm_correlation_confidence,'')),NULL) AS confidences,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(resource_domain,'')),NULL) AS destinations
        FROM events
       WHERE site_id = $1 AND vendor = $2 AND received_at >= NOW() - INTERVAL '30 days'
         AND ${network} AND delivery_outcome = 'delivered' AND NULLIF(occurrence_id,'') IS NOT NULL
       GROUP BY LOWER(COALESCE(event_name,'')), occurrence_id, session_id
      HAVING COUNT(*) >= 2
    ) SELECT * FROM fanout
     WHERE last_delivery - first_delivery <= INTERVAL '10 seconds'
       AND event_name <> ALL($3::text[])
     ORDER BY delivery_count DESC, last_delivery DESC LIMIT 250`, [siteId, vendor, Array.from(DUPLICATE_NOISE_EVENTS)]),
  ]);

  const snapshot = snapshotResult.rows[0] || null;
  const configured = gtmConfiguredEvents(snapshot, vendor);
  const duplicateByEvent = new Map<string, any>();
  for (const duplicate of duplicateResult.rows as any[]) { const key = governanceVendor ? normaliseName(platformEventName(governanceVendor, duplicate.event_name)) : normaliseName(duplicate.event_name); const current = duplicateByEvent.get(key) || { delivery_count: 0, occurrences: 0, examples: [] }; current.delivery_count += Number(duplicate.delivery_count || 0); current.occurrences += 1; if (current.examples.length < 3) current.examples.push({ delivery_count: Number(duplicate.delivery_count || 0), first_delivery: duplicate.first_delivery, last_delivery: duplicate.last_delivery, gtm_tags: duplicate.gtm_tags || [], gtm_triggers: duplicate.gtm_triggers || [], destinations: duplicate.destinations || [] }); duplicateByEvent.set(key, current); }

  const byName = new Map<string, any>();
  for (const row of events.rows as any[]) {
    const rawEventName = normaliseName(row.event_name); const eventName = governanceVendor ? normaliseName(platformEventName(governanceVendor, row.event_name)) : rawEventName; const key = `${vendor}:${eventName}`; const props = (params.rows as any[]).filter((p) => normaliseName(p.event_name) === rawEventName); const config = configured.get(key) || null; const issues: any[] = [];
    const add = (code: string, severity: 'critical'|'warning'|'info', message: string, detail: string, evidence?: any, timestamp?: any) => { const fingerprint = `${code}:${message}`; if (!issues.some((i) => i.fingerprint === fingerprint)) issues.push({ code, severity, message, detail, evidence, timestamp: timestamp || row.last_seen || row.first_seen || null, fingerprint }); };
    const firstSeen = row.first_seen ? new Date(row.first_seen) : null;
    if (firstSeen && firstSeen.getTime() >= Date.now() - 86400000) add('new_event','info','New event detected',`First observed ${firstSeen.toLocaleString()}. Review it against the GTM configuration and tracking plan.`,undefined,row.first_seen);
    if (firstSeen && Array.isArray(row.observed_event_names) && row.observed_event_names.length > 1) add('event_naming_inconsistency','warning','Event naming inconsistency detected',`The same logical event was observed under multiple names: ${row.observed_event_names.join(', ')}. Normalize casing, separators and implementation naming so the event has one canonical name.`,{ observedNames: row.observed_event_names },row.last_seen);
    const rawNames = Array.isArray(row.observed_event_names) ? row.observed_event_names.map((n:any)=>String(n||'').trim()).filter(Boolean) : [String(row.event_name || '').trim()].filter(Boolean);
    const governanceVendor = normaliseGovernanceVendor(vendor);
    for (const rawName of rawNames) {
      if (!governanceVendor) continue;
      const validation = eventNameValidation(governanceVendor, rawName);
      if (!validation.valid) add(validation.issueCode || 'event_name_validation','warning','Event identity needs review',validation.message || 'The observed event identity does not match this platform’s naming contract.',{ observedName: rawName, suggestion: validation.suggestion || null, platform: vendor },row.last_seen);
    }
    const historicDaily = Number(row.prior_60d_hits || 0) / 60;
    if (Number(row.hits_30d || 0) === 0 && historicDaily >= 5 && row.last_seen) {
      add('offline_event','warning','Event has gone quiet',`The event was previously active (about ${Math.round(historicDaily)} occurrences/day over the prior 60 days) but has not been observed in the last 30 days. Last observed ${new Date(row.last_seen).toLocaleString()}.`,{ prior_60d_hits: Number(row.prior_60d_hits || 0), current_30d_hits: 0 },row.last_seen);
    }
    const sameDow = [row.same_dow_1,row.same_dow_2,row.same_dow_3,row.same_dow_4].map((x:any)=>Number(x || 0));
    const sampleDays = sameDow.filter((x:number)=>x>0);
    if (sampleDays.length >= 3) {
      const baselineMean = sampleDays.reduce((a:number,b:number)=>a+b,0)/sampleDays.length;
      const variance = sampleDays.reduce((a:number,b:number)=>a+Math.pow(b-baselineMean,2),0)/sampleDays.length;
      const baselineStd = Math.sqrt(variance);
      const current = Number(row.hits_24h || 0);
      const delta = baselineMean > 0 ? ((current-baselineMean)/baselineMean)*100 : 0;
      const statisticallyUnusual = Math.abs(current-baselineMean) >= Math.max(3*baselineStd, baselineMean*0.3);
      if (baselineMean >= 20 && statisticallyUnusual && delta <= -30) {
        const severity = delta <= -60 ? 'critical' : 'warning';
        add('traffic_drop',severity,`Traffic dropped ${Math.round(Math.abs(delta))}%`,`Current 24-hour volume is ${current.toLocaleString()} versus the same-weekday 28-day baseline of ${Math.round(baselineMean).toLocaleString()} (${sampleDays.length} usable comparison windows).`,{ current, baseline: Math.round(baselineMean), stddev: Math.round(baselineStd), comparison_windows: sampleDays.length },row.last_seen);
      }
      if (baselineMean >= 20 && statisticallyUnusual && delta >= 100) {
        const severity = delta >= 300 ? 'critical' : 'warning';
        add('traffic_peak',severity,`Traffic increased ${Math.round(delta)}%`,`Current 24-hour volume is ${current.toLocaleString()} versus the same-weekday 28-day baseline of ${Math.round(baselineMean).toLocaleString()}.`,{ current, baseline: Math.round(baselineMean), stddev: Math.round(baselineStd), comparison_windows: sampleDays.length },row.last_seen);
      }
    }
    const attempts24 = Number(row.attempts_24h || 0);
    const failed24 = Number(row.failed_24h || 0);
    const failureRate = attempts24 > 0 ? failed24 / attempts24 : 0;
    if (attempts24 >= 30 && (failed24 >= 10 || failureRate >= 0.02)) {
      const severe = failureRate >= 0.10;
      add(severe ? 'delivery_failure' : 'delivery_warning', severe ? 'critical' : 'warning', `${failed24.toLocaleString()} delivery failures (${Math.round(failureRate*1000)/10}%)`, `Observed ${failed24} failed outcomes across ${attempts24} network attempts in the last 24 hours. Blocker evidence, consent suppression and correlation gaps are evaluated separately.`,{ attempts: attempts24, failures: failed24, failure_rate: Math.round(failureRate*10000)/100 },row.last_seen);
    }
    const duplicate = duplicateByEvent.get(eventName); if (duplicate) add('duplicate_event','warning','Duplicate event delivery detected',`The same logical occurrence produced ${duplicate.delivery_count.toLocaleString()} successful ${row.event_name} deliveries across ${duplicate.occurrences} occurrence windows within 10 seconds. This is strong evidence of double firing rather than a traffic-volume anomaly.`,{ delivery_count: duplicate.delivery_count, occurrence_windows: duplicate.occurrences, examples: duplicate.examples },duplicate.examples?.[0]?.last_delivery || row.last_seen);
    if (duplicate && ((Array.isArray(row.observed_gtm_tags) && row.observed_gtm_tags.length > 1) || (Array.isArray(row.observed_gtm_triggers) && row.observed_gtm_triggers.length > 1))) add('gtm_multiple_tags_or_triggers','warning','Multiple GTM tags/triggers contributed to this event',`A duplicate delivery was observed while multiple GTM tags/triggers were correlated with the event. Review GTM Preview to determine whether more than one implementation is firing the same destination.`,{ gtmTags: row.observed_gtm_tags || [], gtmTriggers: row.observed_gtm_triggers || [] },duplicate.examples?.[0]?.last_delivery || row.last_seen);
    const eventSpec = governanceVendor ? canonicalEvent(governanceVendor, row.event_name) : undefined;
    const rules = governanceVendor ? allRules(governanceVendor, row.event_name) : [];
    for (const rule of rules) {
      const acceptedNames = [rule.name, ...(rule.aliases || [])].map(normaliseName);
      const prop = props.find((p:any) => acceptedNames.includes(normaliseName(p.parameter_name)));
      const coverage = Number(prop?.hits || 0) / Math.max(Number(row.lifetime_hits || 0), 1);
      if (rule.presence === 'required' && (!prop || coverage < 0.8)) {
        add('missing_property','warning',`Missing required parameter: ${rule.name}`,`${rule.name} is present on ${Math.round(coverage * 100)}% of observed ${row.event_name} events; the platform rule marks it required for this event.`,{ coverage: Math.round(coverage * 1000) / 10, expected: 'required', aliases: rule.aliases || [] },row.last_seen);
      }
      const types = Array.isArray(prop?.types) ? prop.types.map(String).filter((t:string)=>t && t !== 'null') : [];
      if (types.length > 1 && Number(prop?.hits || 0) >= 20) add('type_collision','warning',`Type collision: ${rule.name}`,`Observed payload types vary across enough samples: ${types.join(', ')}. Review the value normalization before changing the implementation.`,{ observedTypes: types, sample_hits: Number(prop?.hits || 0) },row.last_seen);
      if (rule.type && types.length && Number(prop?.hits || 0) >= 20) {
        const expectedType = rule.type;
        const nonNumericOnly = expectedType === 'number' && types.every((t:string)=>t==='number'||t==='string');
        if (!nonNumericOnly && types.some((t:string)=>t !== expectedType)) add('property_type_validation','warning',`Invalid type: ${rule.name}`,`The platform contract expects ${expectedType}; observed values have type(s) ${types.join(', ')}.`,{ observedTypes: types, expectedType, sample_hits: Number(prop?.hits || 0) },row.last_seen);
      }
    }
    const reportedMissing = new Set<string>(); for (const raw of Array.isArray(row.missing_parameters) ? row.missing_parameters.flat(Infinity) : []) { const name = String(raw || '').trim().toLowerCase(); if (name) reportedMissing.add(name); } for (const name of reportedMissing) add('missing_property','warning',`Missing property: ${name}`,'The event telemetry marked this property as missing on observed traffic.',undefined,row.last_seen);
    // IMPORTANT: Event governance does not compare arbitrary network parameters against GTM parameterKeys.
    // Network-only properties are legitimate and must not become Events errors. GTM parameter specifications
    // are evaluated by the Parameters section, where GTM is the source of truth and network traffic is used
    // only to verify whether configured parameters are actually present and correctly typed.
    for (const alert of (alerts.rows as any[]).filter((a) => normaliseName(a.event_name) === eventName)) { const code = String(alert.code || 'tracking_alert'); if (/ad.?block|blocked|pixel/i.test(code) || /ad.?block|blocked/i.test(String(alert.message || ''))) continue; add(`alert:${code}`, alert.severity === 'critical' ? 'critical' : 'warning', alert.message || code, alert.root_cause || alert.fix_steps || 'Open the alert for the captured evidence.',undefined,alert.created_at); }
    const status = issues.some((i) => i.severity === 'critical' || i.severity === 'warning') ? 'Warn' : issues.some((i) => i.code === 'new_event') ? 'New' : row.hits_24h > 0 ? 'OK' : 'Off';
    const issueOutput = issues.map(({ fingerprint, ...issue }) => issue);
    const allIssueDetails = issueOutput.map((issue: any, index: number) => {
      const timestamp = issue.timestamp ? new Date(issue.timestamp).toLocaleString() : 'Timestamp unavailable';
      return `${index + 1}. ${issue.message}${issue.detail ? ` — ${issue.detail}` : ''} — Detected: ${timestamp}`;
    }).join('\n');
    if (issueOutput.length) issueOutput[0] = { ...issueOutput[0], detail: allIssueDetails };
    if (issueOutput.length > 1) issueOutput.splice(1);
    byName.set(key, { event_name: row.event_name || 'unnamed event', vendor, event_type: row.event_type || 'standard', status, hits_24h: Number(row.hits_24h || 0), prior_hits_24h: Number(row.prior_hits_24h || 0), lifetime_hits: Number(row.lifetime_hits || 0), hits_30d: Number(row.hits_30d || 0), first_seen: row.first_seen, last_seen: row.last_seen, gtm: { configured: Boolean(config), tag_names: config?.tag_names || row.observed_gtm_tags || [], trigger_names: config?.trigger_names || row.observed_gtm_triggers || [], correlation_confidences: row.correlation_confidences || [], snapshot_fetched_at: snapshot?.fetched_at || null, snapshot_environment: snapshot?.environment || null, snapshot_stale: Boolean(snapshot?.snapshot_stale) }, issues: issueOutput, properties: props.map((p: any) => ({ parameter_name: p.parameter_name, hits: Number(p.hits || 0), types: p.types || [] })) });
  }
  const opportunityRowsResult = await query(`
    SELECT event_name, event_type, source, observation_kind, page_url, received_at, params
      FROM events
     WHERE site_id=$1 AND received_at >= NOW() - INTERVAL '30 days'
       AND (
         LOWER(COALESCE(observation_kind,'')) IN ('datalayer','data_layer','data-layer','gtm','client_event','runtime_event')
         OR LOWER(COALESCE(source,'')) IN ('datalayer','data_layer','data-layer','gtm')
       )
     ORDER BY received_at DESC LIMIT 5000
  `, [siteId]).catch(() => ({ rows: [] as any[] }));
  const opportunityRows = opportunityRowsResult.rows as any[];
  const opportunities = new Map<string, number>();
  for (const observed of opportunityRows) {
    const raw = String(observed.event_name || observed.params?.event || observed.params?.event_name || observed.params?.en || '').trim();
    if (!raw) continue;
    const canonical = governanceVendor ? platformEventName(governanceVendor, raw) : raw;
    const name = normaliseName(canonical);
    opportunities.set(name, (opportunities.get(name) || 0) + 1);
  }
  const siteActivity = opportunityRows.length;
  const snapshotAgeMs = snapshot?.fetched_at ? Date.now() - new Date(snapshot.fetched_at).getTime() : Number.POSITIVE_INFINITY;
  const snapshotUsableForMissing = Boolean(snapshot && !snapshot.snapshot_stale && snapshot.environment !== 'workspace' && snapshotAgeMs >= 0 && snapshotAgeMs <= 24 * 60 * 60 * 1000);

  if (snapshotUsableForMissing) {
    for (const [key, config] of configured.entries()) {
      const observed = byName.get(key);
      const matchingOpportunityCount = (config.opportunity_names || []).reduce((sum:number, name:string) => {
        const canonical = governanceVendor ? platformEventName(governanceVendor, name) : name;
        return sum + Number(opportunities.get(normaliseName(canonical)) || 0);
      }, 0);
      const hasOpportunity = matchingOpportunityCount > 0 || (config.all_pages_opportunity && siteActivity > 0);
      const missingInThirtyDays = !observed || Number(observed.hits_30d || 0) === 0;
      if (!hasOpportunity || !missingInThirtyDays) continue;
      const issue = {
        code: 'missing_event',
        severity: 'warning',
        message: `Expected event not observed: ${config.event_name}`,
        detail: `The fresh live GTM snapshot contains ${config.tag_names.join(', ') || 'an active tag'} with trigger(s) ${config.trigger_names.join(', ') || 'that could not be named'}, and a matching execution opportunity was observed ${matchingOpportunityCount ? `(${matchingOpportunityCount} matching trigger opportunities)` : '(site activity matched an all-pages trigger)'}; however, no matching destination event was observed in the last 30 days. This is a tracking-gap candidate, not proof of network delivery failure or ad blocking.`,
        evidence: { gtmTags: config.tag_names, gtmTriggers: config.trigger_names, opportunities: matchingOpportunityCount, allPagesOpportunity: Boolean(config.all_pages_opportunity && siteActivity > 0), snapshotFetchedAt: snapshot?.fetched_at, liveVersionId: snapshot?.live_version_id },
        timestamp: snapshot?.fetched_at || null
      };
      if (observed) {
        observed.issues = [...(observed.issues || []).filter((i:any) => i.code !== 'missing_event'), issue];
        observed.status = 'Warn';
      } else {
        byName.set(key, {
          event_name: config.event_name, vendor, event_type: 'configured', status: 'Warn',
          hits_24h: 0, prior_hits_24h: 0, lifetime_hits: 0, hits_30d: 0, first_seen: null, last_seen: null,
          gtm: { configured: true, tag_names: config.tag_names, trigger_names: config.trigger_names, correlation_confidences: [], snapshot_fetched_at: snapshot?.fetched_at || null, snapshot_environment: snapshot?.environment || null, snapshot_stale: false },
          issues: [issue], properties: []
        });
      }
    }
  }

  const summary = Array.from(byName.values());
  return NextResponse.json({
    events: summary,
    gtm: {
      connected: Boolean(snapshot), fetched_at: snapshot?.fetched_at || null, environment: snapshot?.environment || null,
      snapshot_version_id: snapshot?.snapshot_version_id || null, live_version_id: snapshot?.live_version_id || null,
      live_version_name: snapshot?.live_version_name || null, snapshot_stale: Boolean(snapshot?.snapshot_stale)
    },
    summary: {
      total: summary.length,
      ok: summary.filter((r) => r.status === 'OK').length,
      new: summary.filter((r) => r.status === 'New').length,
      warn: summary.filter((r) => r.status === 'Warn').length,
      off: summary.filter((r) => r.status === 'Off').length,
      missing: summary.filter((r) => r.issues.some((i: any) => i.code === 'missing_event')).length,
      duplicates: summary.filter((r) => r.issues.some((i: any) => i.code === 'duplicate_event')).length,
      naming: summary.filter((r) => r.issues.some((i: any) => i.code === 'event_name_validation' || i.code === 'event_naming_inconsistency')).length,
      typeValidation: summary.filter((r) => r.issues.some((i: any) => i.code === 'property_type_validation')).length,
      unexpectedProperties: 0
    }
  });
}
