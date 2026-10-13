import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { PLATFORM_DETECTION, normaliseGovernanceVendor } from '../../../lib/platform-governance';

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
        BOOL_OR(LOWER(COALESCE(consent_state->>'cmp_detected','false'))='true' OR NULLIF(consent_state->>'cmp_provider','') IS NOT NULL OR event_name ~* '(termly|onetrust|cookiebot|cookieyes|usercentrics|didomi|quantcast|trustarc|iubenda|consent.*save|consent.*update|userpref)') AS cmp_observed,
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
        COUNT(*) FILTER (WHERE first_seen>=NOW()-INTERVAL '24 hours' AND NOT signal AND cmp_observed)::int AS first_request_missing,
        COUNT(*) FILTER (WHERE cmp_observed)::int AS cmp_observed_sessions,
        COUNT(*) FILTER (WHERE cmp_observed AND NOT choice)::int AS cmp_no_choice,
        COUNT(*) FILTER (WHERE cmp_observed AND choice AND (analytics_granted OR ads_granted))::int AS cmp_accepted,
        COUNT(*) FILTER (WHERE cmp_observed AND choice AND NOT analytics_granted AND NOT ads_granted)::int AS cmp_rejected
      FROM s`,args),
    query(`WITH s AS (
      SELECT DATE_TRUNC('day',received_at)::date AS day, NULLIF(session_id,'') AS session_id,
        BOOL_OR(LOWER(COALESCE(consent_state->>'choice_recorded','false'))='true') AS choice,
        BOOL_OR(LOWER(COALESCE(consent_state->>'analytics_storage',''))='granted' OR LOWER(COALESCE(consent_state->>'ad_storage',''))='granted') AS accepted,
        BOOL_OR(LOWER(COALESCE(consent_state->>'cmp_detected','false'))='true' OR NULLIF(consent_state->>'cmp_provider','') IS NOT NULL OR event_name ~* '(termly|onetrust|cookiebot|cookieyes|usercentrics|didomi|quantcast|trustarc|iubenda|consent.*save|consent.*update|userpref)') AS cmp_observed
      FROM events WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '31 days' GROUP BY day,NULLIF(session_id,''))
      SELECT day, COUNT(*) FILTER(WHERE session_id IS NOT NULL)::int AS sessions,
        COUNT(*) FILTER(WHERE session_id IS NOT NULL AND cmp_observed)::int AS cmp_sessions,
        COUNT(*) FILTER(WHERE session_id IS NOT NULL AND cmp_observed AND choice AND accepted)::int AS accepted,
        COUNT(*) FILTER(WHERE session_id IS NOT NULL AND cmp_observed AND choice AND NOT accepted)::int AS rejected,
        COUNT(*) FILTER(WHERE session_id IS NOT NULL AND cmp_observed AND NOT choice)::int AS ignored
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
        AND consent_state IS NOT NULL AND consent_state <> '{}'::jsonb
      ORDER BY received_at DESC LIMIT 1000`,args),
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

  const consentEvidenceRows = (violationResult.rows as any[]).flatMap((row:any) => {
    const state = row.consent_state && typeof row.consent_state === 'object' ? row.consent_state : {};
    const vendorKey = norm(row.vendor);
    const mappedVendor = normaliseGovernanceVendor(vendorKey);
    const model = mappedVendor ? PLATFORM_DETECTION[mappedVendor]?.consentModel : undefined;
    const choiceRecorded = norm(state.choice_recorded) === 'true' || norm(state.choiceRecorded) === 'true';
    const categoryState = state.consent_categories || state.categories || state.purposes || {};
    const marketingDecision = norm(state.marketing_storage || state.marketing_consent || state.marketing || categoryState.marketing || categoryState.advertising || state.ad_storage);
    const analyticsDecision = norm(state.analytics_storage);
    const explicitMarketingDecision = ['marketing_storage','marketing_consent','marketing'].some((k)=>Object.prototype.hasOwnProperty.call(state,k)) ||
      ['marketing','advertising'].some((k)=>Object.prototype.hasOwnProperty.call(categoryState,k));
    if (['granted','accepted','allow','allowed'].includes(marketingDecision) || ['granted','accepted','allow','allowed'].includes(analyticsDecision)) return [];
    if (choiceRecorded && explicitMarketingDecision && ['denied','rejected','denied_by_user','false'].includes(marketingDecision) && CONSENT_VENDORS.has(vendorKey)) {
      return [{ ...row, classification:'technical_violation', model }];
    }
    if (analyticsDecision==='denied' || norm(state.ad_storage)==='denied' || ['denied','rejected','denied_by_user','false'].includes(marketingDecision)) {
      return [{ ...row, classification:'consent_signal_only', model }];
    }
    return [];
  });
  const technicalViolationRows = consentEvidenceRows.filter((r:any)=>r.classification==='technical_violation');
    const summary = summaryResult.rows[0] || {};
  const cmpObservedSessions = Number(summary.cmp_observed_sessions || 0);
  const currentRate = cmpObservedSessions > 0 ? pct(Number(summary.cmp_accepted || 0), cmpObservedSessions) : 0;
  const trend = trendResult.rows.map((r:any) => ({day:r.day,sessions:Number(r.sessions||0),cmp_sessions:Number(r.cmp_sessions||0),accepted:Number(r.accepted||0),rejected:Number(r.rejected||0),ignored:Number(r.ignored||0),acceptance_rate:Number(r.cmp_sessions||0)>0?pct(Number(r.accepted||0),Number(r.cmp_sessions||0)):0}));
  const recent = trend.filter((r:any)=>new Date(r.day).getTime()>=Date.now()-2*86400000).reduce((a:any,r:any)=>({sessions:a.sessions+r.sessions,cmp_sessions:a.cmp_sessions+r.cmp_sessions,accepted:a.accepted+r.accepted}),{sessions:0,cmp_sessions:0,accepted:0});
  const prior = trend.filter((r:any)=>{const t=new Date(r.day).getTime();return t>=Date.now()-4*86400000&&t<Date.now()-2*86400000}).reduce((a:any,r:any)=>({sessions:a.sessions+r.sessions,cmp_sessions:a.cmp_sessions+r.cmp_sessions,accepted:a.accepted+r.accepted}),{sessions:0,cmp_sessions:0,accepted:0});
  const priorRate=prior.cmp_sessions>=20?pct(prior.accepted,prior.cmp_sessions):0;
  const issues: Issue[]=[];
  const issueTime = trend[trend.length-1]?.day ? new Date(trend[trend.length-1].day).toISOString() : null;
  const rateDrop=currentRate-priorRate;
  if (recent.cmp_sessions>=20 && prior.cmp_sessions>=20 && rateDrop <= -10) issues.push({code:'consent_acceptance_drop',severity:'warning',title:'Consent acceptance rate dropped',message:`Acceptance is ${currentRate}% versus ${priorRate}% in the preceding comparison window (${Math.abs(rateDrop).toFixed(1)} percentage points lower).`,timestamp:issueTime});
  const currentRejected=pct(Number(summary.cmp_rejected||0),cmpObservedSessions); const priorRejected=100-priorRate;
  if (recent.cmp_sessions>=20 && prior.cmp_sessions>=20 && currentRejected-priorRejected>=10) issues.push({code:'consent_rejection_spike',severity:'warning',title:'Consent rejection rate increased',message:`Rejection is ${currentRejected}% versus approximately ${priorRejected.toFixed(1)}% in the preceding comparison window.`,timestamp:issueTime});
  const ignoredRate=pct(Number(summary.cmp_no_choice||0),cmpObservedSessions);
  if (ignoredRate>=20 && Number(summary.sessions||0)>=20) issues.push({code:'consent_no_choice_spike',severity:'warning',title:'Consent choices are missing',message:`${ignoredRate}% of observed sessions have consent telemetry but no recorded choice. Check CMP initialization and consent update timing.`,timestamp:issueTime});
  const noSignalRate=pct(Number(summary.no_signal||0),Number(summary.sessions||0));
  if ((Number(cmp.cmp_events||0)>0 || Number(summary.signalled||0)>0) && noSignalRate>=20 && Number(summary.sessions||0)>=20) issues.push({code:'consent_never_detected',severity:'warning',title:'Consent signal not detected',message:`${noSignalRate}% of sessions contain no analytics_storage, ad_storage or consent_gcs signal anywhere in the observed session.`,timestamp:issueTime});
  if ((Number(cmp.cmp_events||0)>0 || Number(summary.signalled||0)>0) && Number(summary.first_request_missing||0)>0) issues.push({code:'consent_missing_first_request',severity:'warning',title:'Consent missing on first tracking request',message:`${Number(summary.first_request_missing).toLocaleString()} recent session(s) started with a tracking event before a consent signal was observed.`,timestamp:firstRequestResult.rows[0]?.received_at || null});
  for (const row of consentEvidenceRows as any[]) issues.push({code:row.classification==='technical_violation'?'consent_enforcement_failure':'consent_signal_denied',severity:row.classification==='technical_violation'?'warning':'info',title:row.classification==='technical_violation'?'Tracking observed despite explicit marketing denial':'Denied consent signal observed',message:row.classification==='technical_violation'?`${VENDOR_LABELS[norm(row.vendor)]||row.vendor} received a delivered request while an explicit marketing purpose was denied after a recorded choice.`:`${VENDOR_LABELS[norm(row.vendor)]||row.vendor} sent a request with a denied consent signal. This is evidence only; Google Consent Mode cookieless pings and ambiguous mappings are not violations.`,vendor:row.vendor,event_name:row.event_name,page_url:row.page_url,gtm_tag_name:row.gtm_tag_name,gtm_trigger_name:row.gtm_trigger_name,timestamp:row.received_at});
  const destinations=destinationResult.rows.map((r:any)=>{const v=norm(r.vendor);const relevant=CONSENT_VENDORS.has(v);const violationsCount=technicalViolationRows.filter((x:any)=>norm(x.vendor)===v).length;return {vendor:v,name:VENDOR_LABELS[v]||v,sessions:Number(r.sessions||0),choice_rate:pct(Number(r.choice_sessions||0),Number(r.sessions||0)),analytics_denied:Number(r.analytics_denied||0),ad_denied:Number(r.ad_denied||0),violations:violationsCount,status:violationsCount?'Needs attention':'Healthy',last_seen:r.last_seen,relevant_consent:relevant};});
  const cmp = cmpResult.rows[0] || {};
  return NextResponse.json({siteId,vendor,summary:{sessions:Number(summary.sessions||0),choice_recorded:Number(summary.choice_recorded||0),accepted:Number(summary.cmp_accepted||0),rejected:Number(summary.cmp_rejected||0),partial:Number(summary.partial||0),cmp_observed_sessions:cmpObservedSessions,acceptance_rate_basis:'CMP-observed sessions only; a detected CMP interaction is not proof that every exposed session was instrumented',ignored:Number(summary.no_choice_with_signal||0),no_choice_no_signal:Number(summary.no_choice_no_signal||0),signalled:Number(summary.signalled||0),no_signal:Number(summary.no_signal||0),first_request_missing:Number(summary.first_request_missing||0),acceptance_rate:currentRate,change_vs_prior:change(currentRate,priorRate),cmp_detected:Number(cmp.cmp_events||0)>0,cmp_events:Number(cmp.cmp_events||0),cmp_sessions:Number(cmp.cmp_sessions||0),cmp_event_names:cmp.cmp_event_names||[],cmp_last_seen:cmp.last_cmp_seen||null},trend,destinations,issues,first_request_examples:firstRequestResult.rows.slice(0,50),no_signal_sessions:Number(noSignalResult.rows[0]?.no_signal||0),recent_violations:technicalViolationRows.slice(0,100)});
}
