import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

type Issue = { code: string; severity: 'critical' | 'warning' | 'info'; title: string; message: string; vendor?: string; event_name?: string; page_url?: string; gtm_tag_name?: string | null; gtm_trigger_name?: string | null; timestamp: string | null };
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
const change = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : (a > 0 ? 100 : 0);
const CONSENT_VENDORS = new Set(['gads','meta','tiktok','linkedin','bing','snapchat']);
const VENDOR_LABELS: Record<string,string> = { ga4:'Google Analytics 4', gads:'Google Ads', meta:'Meta', tiktok:'TikTok', linkedin:'LinkedIn', bing:'Microsoft Ads', snapchat:'Snapchat' };
const CMP_EVENT_PATTERN = /(termly|onetrust|cookiebot|cookieyes|consentmanager|usercentrics|didomi|quantcast|trustarc|iubenda|complianz|consent.*save|consent.*update|userpref)/i;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = norm(url.searchParams.get('vendor')) || null;
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const owner = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const vendorClause = vendor ? ' AND vendor=$2' : '';
  const args = vendor ? [siteId,vendor] : [siteId];

  const [summaryResult, trendResult, destinationResult, violationResult, firstRequestResult, noSignalResult, cmpResult] = await Promise.all([
    query(`WITH s AS (
      SELECT NULLIF(session_id,'') AS session_id,
        BOOL_OR(LOWER(COALESCE(consent_state->>'choice_recorded','false'))='true') AS choice,
        BOOL_OR(LOWER(COALESCE(consent_state->>'analytics_storage',''))='granted') AS analytics_granted,
        BOOL_OR(LOWER(COALESCE(consent_state->>'ad_storage',''))='granted') AS ads_granted,
        BOOL_OR(consent_state ? 'analytics_storage' OR consent_state ? 'ad_storage' OR consent_state ? 'consent_gcs') AS signal,
        MIN(received_at) AS first_seen, MAX(received_at) AS last_seen
      FROM events WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '30 days' GROUP BY NULLIF(session_id,''))
      SELECT COUNT(*) FILTER (WHERE session_id IS NOT NULL)::int AS sessions,
        COUNT(*) FILTER (WHERE choice)::int AS choice_recorded,
        COUNT(*) FILTER (WHERE choice AND (analytics_granted OR ads_granted))::int AS accepted,
        COUNT(*) FILTER (WHERE choice AND NOT analytics_granted AND NOT ads_granted)::int AS rejected,
        COUNT(*) FILTER (WHERE choice AND analytics_granted <> ads_granted)::int AS partial,
        COUNT(*) FILTER (WHERE NOT choice AND signal)::int AS no_choice_with_signal,
        COUNT(*) FILTER (WHERE NOT choice AND NOT signal)::int AS no_choice_no_signal,
        COUNT(*) FILTER (WHERE signal)::int AS signalled,
        COUNT(*) FILTER (WHERE NOT signal)::int AS no_signal,
        COUNT(*) FILTER (WHERE first_seen>=NOW()-INTERVAL '24 hours' AND NOT signal)::int AS first_request_missing
      FROM s`,args),
    query(`WITH s AS (
      SELECT DATE_TRUNC('day',received_at)::date AS day, NULLIF(session_id,'') AS session_id,
        BOOL_OR(LOWER(COALESCE(consent_state->>'choice_recorded','false'))='true') AS choice,
        BOOL_OR(LOWER(COALESCE(consent_state->>'analytics_storage',''))='granted' OR LOWER(COALESCE(consent_state->>'ad_storage',''))='granted') AS accepted
      FROM events WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '31 days' GROUP BY day,NULLIF(session_id,''))
      SELECT day, COUNT(*) FILTER(WHERE session_id IS NOT NULL)::int AS sessions,
        COUNT(*) FILTER(WHERE choice AND accepted)::int AS accepted,
        COUNT(*) FILTER(WHERE choice AND NOT accepted)::int AS rejected,
        COUNT(*) FILTER(WHERE NOT choice)::int AS ignored
      FROM s GROUP BY day ORDER BY day`,args),
    query(`SELECT vendor,
        COUNT(DISTINCT NULLIF(session_id,''))::int AS sessions,
        COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE LOWER(COALESCE(consent_state->>'choice_recorded','false'))='true')::int AS choice_sessions,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(consent_state->>'analytics_storage',''))='denied')::int AS analytics_denied,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(consent_state->>'ad_storage',''))='denied')::int AS ad_denied,
        COUNT(*) FILTER (WHERE delivery_outcome='delivered' AND LOWER(COALESCE(consent_state->>'analytics_storage',''))='denied')::int AS delivered_analytics_denied,
        COUNT(*) FILTER (WHERE delivery_outcome='delivered' AND LOWER(COALESCE(consent_state->>'ad_storage',''))='denied')::int AS delivered_ads_denied,
        MAX(received_at) AS last_seen
      FROM events WHERE site_id=$1 AND received_at>=NOW()-INTERVAL '30 days'${vendorClause}
      GROUP BY vendor ORDER BY sessions DESC`,args),
    query(`SELECT event_name,vendor,page_url,gtm_tag_name,gtm_trigger_name,received_at,delivery_outcome,consent_state
      FROM events WHERE site_id=$1 AND received_at>=NOW()-INTERVAL '30 days'${vendorClause}
        AND delivery_outcome='delivered'
        AND ((LOWER(COALESCE(consent_state->>'ad_storage',''))='denied' AND vendor IN ('gads','meta','tiktok','linkedin','bing','snapchat'))
          OR (LOWER(COALESCE(consent_state->>'analytics_storage',''))='denied' AND vendor NOT IN ('ga4','gads')))
      ORDER BY received_at DESC LIMIT 500`,args),
    query(`WITH firsts AS (
      SELECT DISTINCT ON (NULLIF(session_id,'')) NULLIF(session_id,'') AS session_id,event_name,vendor,page_url,gtm_tag_name,gtm_trigger_name,received_at,consent_state
      FROM events WHERE site_id=$1 AND received_at>=NOW()-INTERVAL '30 days'${vendorClause} ORDER BY NULLIF(session_id,''),received_at ASC)
      SELECT * FROM firsts WHERE session_id IS NOT NULL AND NOT (consent_state ? 'analytics_storage' OR consent_state ? 'ad_storage' OR consent_state ? 'consent_gcs') ORDER BY received_at DESC LIMIT 250`,args),
    query(`SELECT COUNT(DISTINCT NULLIF(session_id,''))::int AS sessions,
        COUNT(DISTINCT NULLIF(session_id,'')) FILTER (WHERE NOT (consent_state ? 'analytics_storage' OR consent_state ? 'ad_storage' OR consent_state ? 'consent_gcs'))::int AS no_signal
      FROM events WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '30 days'`,args),
    query(`SELECT COUNT(*)::int AS cmp_events,
        COUNT(DISTINCT NULLIF(session_id,''))::int AS cmp_sessions,
        MAX(received_at) AS last_cmp_seen,
        ARRAY_AGG(DISTINCT event_name) FILTER (WHERE event_name IS NOT NULL) AS cmp_event_names
      FROM events WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '30 days' AND event_name ~* $${vendor ? 3 : 2}`, vendor ? [siteId,vendor,CMP_EVENT_PATTERN.source] : [siteId,CMP_EVENT_PATTERN.source]),
  ]);

  const summary = summaryResult.rows[0] || {};
  const currentRate = pct(Number(summary.accepted||0), Number(summary.choice_recorded||0));
  const trend = trendResult.rows.map((r:any) => ({day:r.day,sessions:Number(r.sessions||0),accepted:Number(r.accepted||0),rejected:Number(r.rejected||0),ignored:Number(r.ignored||0),acceptance_rate:pct(Number(r.accepted||0),Number(r.sessions||0))}));
  const recent = trend.filter((r:any)=>new Date(r.day).getTime()>=Date.now()-2*86400000).reduce((a:any,r:any)=>({sessions:a.sessions+r.sessions,accepted:a.accepted+r.accepted}),{sessions:0,accepted:0});
  const prior = trend.filter((r:any)=>{const t=new Date(r.day).getTime();return t>=Date.now()-4*86400000&&t<Date.now()-2*86400000}).reduce((a:any,r:any)=>({sessions:a.sessions,accepted:a.accepted}),{sessions:0,accepted:0});
  const priorRate=pct(prior.accepted,prior.sessions);
  const issues: Issue[]=[];
  const issueTime = trend[trend.length-1]?.day ? new Date(trend[trend.length-1].day).toISOString() : null;
  const rateDrop=currentRate-priorRate;
  if (recent.sessions>=20 && prior.sessions>=20 && rateDrop <= -10) issues.push({code:'consent_acceptance_drop',severity:'warning',title:'Consent acceptance rate dropped',message:`Acceptance is ${currentRate}% versus ${priorRate}% in the preceding comparison window (${Math.abs(rateDrop).toFixed(1)} percentage points lower).`,timestamp:issueTime});
  const currentRejected=pct(Number(summary.rejected||0),Number(summary.choice_recorded||0)); const priorRejected=100-priorRate;
  if (recent.sessions>=20 && prior.sessions>=20 && currentRejected-priorRejected>=10) issues.push({code:'consent_rejection_spike',severity:'warning',title:'Consent rejection rate increased',message:`Rejection is ${currentRejected}% versus approximately ${priorRejected.toFixed(1)}% in the preceding comparison window.`,timestamp:issueTime});
  const ignoredRate=pct(Number(summary.no_choice_with_signal||0),Number(summary.sessions||0));
  if (ignoredRate>=20 && Number(summary.sessions||0)>=20) issues.push({code:'consent_no_choice_spike',severity:'warning',title:'Consent choices are missing',message:`${ignoredRate}% of observed sessions have consent telemetry but no recorded choice. Check CMP initialization and consent update timing.`,timestamp:issueTime});
  const noSignalRate=pct(Number(summary.no_signal||0),Number(summary.sessions||0));
  if (noSignalRate>=20 && Number(summary.sessions||0)>=20) issues.push({code:'consent_never_detected',severity:'warning',title:'Consent signal not detected',message:`${noSignalRate}% of sessions contain no analytics_storage, ad_storage or consent_gcs signal anywhere in the observed session.`,timestamp:issueTime});
  if (Number(summary.first_request_missing||0)>0) issues.push({code:'consent_missing_first_request',severity:'warning',title:'Consent missing on first tracking request',message:`${Number(summary.first_request_missing).toLocaleString()} recent session(s) started with a tracking event before a consent signal was observed.`,timestamp:firstRequestResult.rows[0]?.received_at || null});
  for (const row of violationResult.rows as any[]) issues.push({code:CONSENT_VENDORS.has(norm(row.vendor))?'consent_violation':'consent_signal_denied',severity:CONSENT_VENDORS.has(norm(row.vendor))?'critical':'info',title:CONSENT_VENDORS.has(norm(row.vendor))?'Consent violation':'Consent Mode denied delivery',message:CONSENT_VENDORS.has(norm(row.vendor))?`${VENDOR_LABELS[norm(row.vendor)]||row.vendor} received a delivered tracking request while the relevant consent storage was denied.`:`${VENDOR_LABELS[norm(row.vendor)]||row.vendor} sent a request while analytics storage was denied; this is reported as evidence, not automatically a violation.`,vendor:row.vendor,event_name:row.event_name,page_url:row.page_url,gtm_tag_name:row.gtm_tag_name,gtm_trigger_name:row.gtm_trigger_name,timestamp:row.received_at});
  const destinations=destinationResult.rows.map((r:any)=>{const v=norm(r.vendor);const relevant=CONSENT_VENDORS.has(v);const violationsCount=(violationResult.rows as any[]).filter(x=>norm(x.vendor)===v).length;return {vendor:v,name:VENDOR_LABELS[v]||v,sessions:Number(r.sessions||0),choice_rate:pct(Number(r.choice_sessions||0),Number(r.sessions||0)),analytics_denied:Number(r.analytics_denied||0),ad_denied:Number(r.ad_denied||0),violations:violationsCount,status:violationsCount?'Needs attention':'Healthy',last_seen:r.last_seen,relevant_consent:relevant};});
  const cmp = cmpResult.rows[0] || {};
  return NextResponse.json({siteId,vendor,summary:{sessions:Number(summary.sessions||0),choice_recorded:Number(summary.choice_recorded||0),accepted:Number(summary.accepted||0),rejected:Number(summary.rejected||0),partial:Number(summary.partial||0),ignored:Number(summary.no_choice_with_signal||0),no_choice_no_signal:Number(summary.no_choice_no_signal||0),signalled:Number(summary.signalled||0),no_signal:Number(summary.no_signal||0),first_request_missing:Number(summary.first_request_missing||0),acceptance_rate:currentRate,change_vs_prior:change(currentRate,priorRate),cmp_detected:Number(cmp.cmp_events||0)>0,cmp_events:Number(cmp.cmp_events||0),cmp_sessions:Number(cmp.cmp_sessions||0),cmp_event_names:cmp.cmp_event_names||[],cmp_last_seen:cmp.last_cmp_seen||null},trend,destinations,issues,first_request_examples:firstRequestResult.rows.slice(0,50),no_signal_sessions:Number(noSignalResult.rows[0]?.no_signal||0),recent_violations:violationResult.rows.slice(0,100)});
}
