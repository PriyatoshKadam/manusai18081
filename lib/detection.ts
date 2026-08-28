import { query } from './db';
import { enqueueAlertDeliveries } from './notifications';
import { boundedSeverity } from './metrics';
import { classifyDeliveryOutcome, deliveryOutcomeLabel, isConfirmedDeliveryFailure, isDeliveryObservation, type DeliveryOutcome } from './delivery-outcome';

export interface ParsedEvent {
  siteId: number;
  eventId: number;
  receivedAt: Date | string;
  vendor: string;
  eventName: string | null;
  pageUrl: string;
  clientId: string | null;
  params: Record<string, any>;
  rawUrl: string;
  dlPushIndex: number | null;
  source: string | null;
  originSource?: string | null;
  measurementId?: string | null;
  transactionId?: string | null;
  dataLayerMatched?: boolean;
  observationKind?: string | null;
  sessionId?: string | null;
  occurrenceId?: string | null;
  networkOccurrenceId?: string | null;
  requestSignature?: string | null;
  transport?: string | null;
  gtmContainerId?: string | null;
  navigationId?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  failureReason?: string | null;
  beaconAccepted?: boolean | null;
  deliveryOutcome?: DeliveryOutcome;
  consentState?: Record<string, unknown>;
  webVitals?: Record<string, unknown>;
  revenueValue?: number | null;
  revenueValueStatus?: 'missing' | 'valid' | 'invalid';
  revenueCurrency?: string | null;
  resourceDomain?: string | null;
  resourceType?: string | null;
  deliveryMode?: 'first_party' | 'third_party' | 'unknown' | 'client_side' | 'server_side';
  isSynthetic?: boolean;
  gtmTagId?: string | null;
  gtmTagName?: string | null;
  gtmTriggerName?: string | null;
  gtmWorkspaceId?: string | null;
  gtmCorrelationConfidence?: string | null;
  missingParameters?: string[];
  observedParameters?: string[];
  parameterStatus?: string | null;
}

type DuplicateMatch = ParsedEvent & { id: number; beacon_accepted?: boolean | null; delivery_outcome?: DeliveryOutcome | null };
export type DuplicateConfidence = 'confirmed' | 'probable';
export interface DuplicateEvidence { previous: DuplicateMatch; score: number; confidence: DuplicateConfidence; reason: string; rootCause: string; }

export const GA4_AUTOMATIC_EVENTS = new Set(['page_view','scroll','click','user_engagement','session_start','first_visit','file_download','view_search_results','form_start','form_submit','video_start','video_progress','video_complete']);
export const GA4_RECOMMENDED_EVENTS = new Set(['login','sign_up','search','share','select_content','generate_lead','purchase','refund','join_group','tutorial_begin','tutorial_complete','earn_virtual_currency','spend_virtual_currency','view_item_list','select_item','view_item','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_shipping_info','add_payment_info','select_promotion','view_promotion','add_to_wishlist','qualify_lead','disqualify_lead','working_lead','close_convert_lead','close_unconvert_lead']);
const VENDOR_STANDARD_EVENTS: Record<string, Set<string>> = {
  meta: new Set(['pageview','viewcontent','search','addtocart','addtowishlist','initiatecheckout','addpaymentinfo','purchase','lead','completeregistration','contact','customizeproduct','findlocation','schedule','starttrial','submitapplication','subscribe']),
  tiktok: new Set(['viewcontent','clickbutton','search','addtocart','initiatecheckout','addpaymentinfo','purchase','completepayment','placeanorder','submitform','contact','completeregistration','download','subscribe','starttrial','lead','pageview']),
  snapchat: new Set(['page_view','pageview','view_content','search','add_cart','start_checkout','add_billing','purchase','sign_up','subscribe','start_trial','lead_generation','contact','add_to_wishlist','app_install','app_open','custom_event']),
  bing: new Set(['page_view','pageload','page_load','view_item','search','add_to_cart','begin_checkout','purchase','sign_up','generate_lead','add_payment_info','subscribe']),
  linkedin: new Set(['pageview','page_view']),
};
const INTERNAL_EVENTS = new Set(['exception','debug','monitor_event','monitor_ready']);
const NATURALLY_REPEATABLE_EVENTS = new Set(['scroll','click','user_engagement','video_progress']);
const NAVIGATION_EVENTS = new Set(['page_view','session_start','first_visit']);
const TRANSACTION_EVENTS = new Set(['purchase','refund']);
const HIGH_SENSITIVITY_EVENTS = new Set(['login','sign_up','sign_up_complete','generate_lead','subscribe','begin_checkout','add_payment_info','add_shipping_info','add_to_cart','remove_from_cart','view_cart','view_item','view_item_list','select_item','run_audit','lead','conversion']);
const STRONG_ID_REQUIRED_EVENTS = new Set(['login','sign_up','sign_up_complete','generate_lead','subscribe','lead','conversion']);

export function classifyEvent(eventName: string | null, vendor?: string | null): string {
  if (vendor?.toLowerCase() === 'gtm') return 'internal';
  if (!eventName) return 'unknown';
  const normalized = eventName.trim().toLowerCase();
  const normalizedVendor = vendor?.trim().toLowerCase() || '';
  if (INTERNAL_EVENTS.has(normalized)) return 'internal';
  if ((!normalizedVendor || normalizedVendor === 'ga4') && (GA4_AUTOMATIC_EVENTS.has(normalized) || GA4_RECOMMENDED_EVENTS.has(normalized))) return 'standard';
  if (VENDOR_STANDARD_EVENTS[normalizedVendor]?.has(normalized)) return 'standard';
  return 'custom';
}

export function normalizePageUrl(url: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url); parsed.hash = '';
    for (const key of ['_gl','_ga','_gac','gclid','fbclid','msclkid','ttclid','twclid','li_fat_id']) parsed.searchParams.delete(key);
    return parsed.href;
  } catch { return url.split('#')[0]; }
}

function firstValue(...values: unknown[]) { return values.find((value) => value !== undefined && value !== null && String(value).trim() !== ''); }
export function getTransactionId(params: Record<string, any>): string | null {
  const value = firstValue(params.transaction_id,params.transactionId,params['ep.transaction_id'],params['epn.transaction_id'],params.ecommerce?.transaction_id,params.ecommerce?.transactionId);
  return value ? String(value) : null;
}
export function getStrongIdentity(event: ParsedEvent): string | null {
  const transactionId = firstValue(event.transactionId, getTransactionId(event.params || {}));
  if (transactionId) return `transaction:${String(transactionId)}`;
  const eventId = firstValue(event.params?.event_id,event.params?.eventId,event.params?.eventID,event.params?.['ep.event_id'],event.params?.['epn.event_id']);
  return eventId ? `event_id:${String(eventId)}` : null; }
export function getEventIdentity(event: ParsedEvent): string | null { const strong = getStrongIdentity(event); if (strong) return `strong:${strong.replace(/^[^:]+:/, '')}`; if (event.sessionId && event.occurrenceId) return `occurrence:${event.sessionId}:${event.occurrenceId}`; if (event.requestSignature) return `request:${event.requestSignature}`; const normalized = normalizeRawUrl(event.rawUrl); return normalized ? `url:${normalized}` : null; }
function stableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableValue).sort().join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value as object).sort().map((key)=>`${key}:${stableValue((value as Record<string, unknown>)[key])}`).join('|')}}`;
  return String(value);
}
export function paramsSignature(params: Record<string, any> = {}) {
  const ignored = new Set(['_p','_s','sid','sct','seg','dt','dr','dl','ep.debug_mode']);
  return Object.keys(params).filter((key)=>!ignored.has(key)).sort().map((key)=>`${key}=${stableValue(params[key])}`).join('&').slice(0,1200);
}
function normalizeRawUrl(rawUrl: string | null): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    for (const key of ['_p','_s','tfd','_et','_tu','_eu','rcb','gcs','gcd','gcu','gcut','tag_exp','richsstsse','attribution-reporting-eligible','sst.rnd','sst.tft','sst.lpc','sst.navt','sst.ude','sst.syn','sst.sw_exp','ecid','cid','sid','sct','seg','_fplc','uaa','uab','uafvl','ul','sr']) parsed.searchParams.delete(key);
    const entries = Array.from(parsed.searchParams.entries()).sort(([ak,av],[bk,bv])=>ak.localeCompare(bk)||av.localeCompare(bv));
    parsed.search=''; for (const [key,value] of entries) parsed.searchParams.append(key,value); return parsed.href;
  } catch { return rawUrl; }
}
function sameNormalizedRequest(a:string|null,b:string|null){ const left=normalizeRawUrl(a),right=normalizeRawUrl(b); return !!left&&!!right&&left===right; }
function sameSession(a:ParsedEvent,b:ParsedEvent){ return !!a.sessionId&&a.sessionId===b.sessionId; }
function samePage(a:ParsedEvent,b:ParsedEvent){ return !!a.pageUrl&&!!b.pageUrl&&normalizePageUrl(a.pageUrl)===normalizePageUrl(b.pageUrl); }
function sameNavigation(a:ParsedEvent,b:ParsedEvent){ return !!a.navigationId&&!!b.navigationId&&a.navigationId===b.navigationId; }
function sameOccurrence(a:ParsedEvent,b:ParsedEvent){ return !!a.sessionId&&!!a.occurrenceId&&a.sessionId===b.sessionId&&a.occurrenceId===b.occurrenceId; }
function sameNetworkOccurrence(a:ParsedEvent,b:ParsedEvent){ return !!a.networkOccurrenceId&&!!b.networkOccurrenceId&&a.networkOccurrenceId===b.networkOccurrenceId; }
function eventClass(name:string):'navigation'|'repeatable'|'transaction'|'sensitive'|'custom'{ if(NAVIGATION_EVENTS.has(name))return'navigation'; if(NATURALLY_REPEATABLE_EVENTS.has(name))return'repeatable'; if(TRANSACTION_EVENTS.has(name))return'transaction'; if(HIGH_SENSITIVITY_EVENTS.has(name))return'sensitive'; return'custom'; }
function isDifferentNavigation(a:ParsedEvent,b:ParsedEvent){ if(a.navigationId&&b.navigationId&&a.navigationId!==b.navigationId)return true; return eventClass((a.eventName||'').trim().toLowerCase())==='navigation'&&!samePage(a,b); }
function isHardExpectedRepeat(a:ParsedEvent,b:ParsedEvent){ const name=(a.eventName||'').trim().toLowerCase(); if(NATURALLY_REPEATABLE_EVENTS.has(name))return true; if(name==='page_view'&&isDifferentNavigation(a,b))return true; return false; }
function isFailedTransport(event: Pick<ParsedEvent,'statusCode'|'failureReason'|'deliveryOutcome'>){ return event.deliveryOutcome ? isConfirmedDeliveryFailure(event.deliveryOutcome) : Boolean((event.statusCode !== null && event.statusCode !== undefined && event.statusCode >= 400) || event.failureReason); }
export function isTransportRetryPair(current: Pick<ParsedEvent,'requestSignature'|'statusCode'|'failureReason'|'receivedAt'|'deliveryOutcome'>, previous: Pick<DuplicateMatch,'requestSignature'|'statusCode'|'failureReason'|'receivedAt'|'deliveryOutcome'>){
  const sameSignature = Boolean(current.requestSignature && previous.requestSignature && current.requestSignature === previous.requestSignature);
  const previousFailed = isFailedTransport(previous);
  const currentSucceeded = current.deliveryOutcome ? current.deliveryOutcome === 'delivered' : !isFailedTransport(current);
  const gapMs = new Date(current.receivedAt).getTime() - new Date(previous.receivedAt).getTime();
  return sameSignature && previousFailed && currentSucceeded && gapMs >= 0 && gapMs <= 5000;
}
async function adaptiveDuplicateWindow(event: ParsedEvent, baseWindow: number) {
  const result = await query(`SELECT COALESCE(MAX(p75_latency_ms), 800)::numeric AS p75_latency_ms FROM tag_baselines WHERE site_id = $1 AND vendor = $2 AND (event_name = $3 OR event_name IS NULL) AND window_end >= NOW() - INTERVAL '8 days'`, [event.siteId, event.vendor, event.eventName]);
  const p75 = Number(result.rows[0]?.p75_latency_ms || 800);
  const multiplier = Math.min(3, Math.max(0.5, p75 / 800));
  return Math.max(1, Math.round(baseWindow * multiplier));
}

export function decodeGcs(value:string|null|undefined){ const gcs=String(value||'').trim().toUpperCase(); if(!/^G1[01]{2}$/.test(gcs))return null; const bits=gcs.slice(2); return {value:gcs,ad_storage:bits.charAt(0)==='1'?'granted':'denied',analytics_storage:bits.charAt(1)==='1'?'granted':'denied'}; }
function networkGcs(event:ParsedEvent){ const direct=firstValue(event.params?.gcs,event.params?.['gcs']); if(direct)return decodeGcs(String(direct))?.value||String(direct).trim().toUpperCase(); try{return new URL(event.rawUrl||'').searchParams.get('gcs')?.trim().toUpperCase()||null;}catch{return null;} }
function analyticsStorageDenied(event:ParsedEvent){ if(event.observationKind!=='network')return false; return decodeGcs(networkGcs(event))?.analytics_storage==='denied'; }
export function isGtmFanoutEvidence(event:ParsedEvent,previous:Pick<DuplicateMatch,'vendor'|'gtmContainerId'|'dlPushIndex'>&Partial<Pick<DuplicateMatch,'sessionId'|'occurrenceId'>>){ const same=Boolean(event.sessionId&&event.occurrenceId&&event.sessionId===previous.sessionId&&event.occurrenceId===previous.occurrenceId); return event.vendor==='gtm'||previous.vendor==='gtm'||same||Boolean(event.gtmContainerId||previous.gtmContainerId||event.dlPushIndex!==null||previous.dlPushIndex!==null); }
export function classifyDuplicateRootCause(current:ParsedEvent,previous:Pick<DuplicateMatch,'id'|'dlPushIndex'|'source'|'originSource'|'transport'|'rawUrl'>){ const currentOrigin=current.originSource||null; const previousOrigin=previous.originSource||null; const currentTransport=current.transport||null; const previousTransport=previous.transport||null; if(currentOrigin&&previousOrigin&&currentOrigin!==previousOrigin)return `The same event was observed through different implementation paths (${previousOrigin} and ${currentOrigin}). Check GTM against direct gtag() or SDK code.`; if(currentTransport&&previousTransport&&currentTransport!==previousTransport)return `The same implementation was observed using different request methods (${previousTransport} and ${currentTransport}). This alone does not prove duplicate tracking.`; if(current.dlPushIndex!==null&&previous.dlPushIndex!==null&&current.dlPushIndex!==previous.dlPushIndex)return 'The same event payload was pushed to the dataLayer more than once. Check application code, listeners, and GTM custom event pushes.'; if(current.dlPushIndex!==null&&current.dlPushIndex===previous.dlPushIndex)return 'One dataLayer occurrence produced multiple analytics observations. Check for multiple tags or duplicate GTM triggers.'; if(sameNormalizedRequest(current.rawUrl,previous.rawUrl))return 'The same normalized analytics request was observed more than once for one logical event. Check duplicated tags, triggers, or retries.'; return 'The same logical event identity was delivered more than once in the same browser session.'; }

async function findRecentCandidates(event:ParsedEvent,windowSeconds:number){ const name=(event.eventName||'').trim().toLowerCase(); const pageUrl=normalizePageUrl(event.pageUrl||''); const cls=eventClass(name); const samePageOnly=cls==='navigation'||cls==='custom'||cls==='sensitive'; const result=await query(`SELECT id,vendor,event_name,dl_push_index,source,origin_source,raw_url,page_url,client_id,params,received_at,observation_kind,session_id,occurrence_id,network_occurrence_id,request_signature,transport,gtm_container_id,navigation_id,status_code,latency_ms,failure_reason,beacon_accepted,delivery_outcome FROM events WHERE site_id=$1 AND vendor=$2 AND LOWER(COALESCE(event_name,''))=$3 AND id<>$4 AND received_at>=NOW()-($5*INTERVAL '1 second') AND ($6::boolean=false OR COALESCE(page_url,'')=$7) AND ($8::text IS NULL OR session_id=$8) ORDER BY received_at DESC LIMIT 100`,[event.siteId,event.vendor,name,event.eventId,windowSeconds,samePageOnly,pageUrl,event.sessionId||null]); return result.rows as DuplicateMatch[]; }
function asEvent(row:DuplicateMatch,current:ParsedEvent):DuplicateMatch{ return {...row,id:Number(row.id),siteId:current.siteId,eventId:Number(row.id),receivedAt:row.receivedAt,vendor:row.vendor||current.vendor,eventName:row.eventName||current.eventName,pageUrl:row.pageUrl||'',clientId:row.clientId||null,params:row.params||{},rawUrl:row.rawUrl||'',dlPushIndex:row.dlPushIndex===null?null:Number(row.dlPushIndex),source:row.source||null,originSource:row.originSource||null,observationKind:row.observationKind||'network',sessionId:row.sessionId||null,occurrenceId:row.occurrenceId||null,networkOccurrenceId:row.networkOccurrenceId||null,requestSignature:row.requestSignature||null,transport:row.transport||null,gtmContainerId:row.gtmContainerId||null,navigationId:row.navigationId||null,statusCode:row.statusCode===null?null:Number(row.statusCode),latencyMs:row.latencyMs===null?null:Number(row.latencyMs),failureReason:row.failureReason||null,beaconAccepted:row.beacon_accepted===null?null:row.beacon_accepted===true,deliveryOutcome:row.delivery_outcome||'unknown'}; }

function scoreDuplicate(current:ParsedEvent,previous:DuplicateMatch):DuplicateEvidence|null{
  const name=(current.eventName||'').trim().toLowerCase(); const cls=eventClass(name);
  if(isHardExpectedRepeat(current,previous)||current.observationKind!==previous.observationKind||sameNetworkOccurrence(current,previous)||sameOccurrence(current,previous))return null;
  if(current.observationKind === 'network' && previous.observationKind === 'network' && isTransportRetryPair(current, previous)) return null;
  if(cls==='navigation'&&isDifferentNavigation(current,previous))return null;

  const currentStrong=getStrongIdentity(current);
  const previousStrong=getStrongIdentity(previous);
  if(currentStrong&&currentStrong===previousStrong){
    if(cls==='transaction'||cls==='sensitive')return{previous,score:100,confidence:'confirmed',reason:'same transaction/event identity',rootCause:classifyDuplicateRootCause(current,previous)};
    if(sameSession(current,previous))return{previous,score:95,confidence:'confirmed',reason:'same strong identity in one session',rootCause:classifyDuplicateRootCause(current,previous)};
  }

  // login/sign_up and other high-value conversion events must not be marked duplicate from
  // matching payloads or repeated pushes. Without explicit event_id/occurrence_id (or the
  // transaction identity above), they are separate possible user actions, not proven duplicates.
  if(STRONG_ID_REQUIRED_EVENTS.has(name)){
    if(current.observationKind==='datalayer'&&previous.observationKind==='datalayer'&&sameSession(current,previous)){
      const samePush=current.dlPushIndex!==null&&previous.dlPushIndex!==null&&current.dlPushIndex===previous.dlPushIndex;
      if(samePush)return{previous,score:98,confidence:'confirmed',reason:'one dataLayer occurrence produced multiple observations',rootCause:classifyDuplicateRootCause(current,previous)};
    }
    if(current.observationKind==='network'&&previous.observationKind==='network'&&sameSession(current,previous)&&samePage(current,previous)){
      const differentNetworkOccurrence=!!current.networkOccurrenceId&&!!previous.networkOccurrenceId&&current.networkOccurrenceId!==previous.networkOccurrenceId;
      if(current.requestSignature&&previous.requestSignature&&current.requestSignature===previous.requestSignature&&differentNetworkOccurrence){
        return{previous,score:96,confidence:'confirmed',reason:'same conversion request identity with distinct network occurrences',rootCause:classifyDuplicateRootCause(current,previous)};
      }
    }
    return null;
  }

  if(current.observationKind==='datalayer'&&previous.observationKind==='datalayer'&&sameSession(current,previous)){
    const samePayload=paramsSignature(current.params)===paramsSignature(previous.params);
    const differentPush=current.dlPushIndex!==null&&previous.dlPushIndex!==null&&current.dlPushIndex!==previous.dlPushIndex;
    const samePush=current.dlPushIndex!==null&&previous.dlPushIndex!==null&&current.dlPushIndex===previous.dlPushIndex;
    if(samePayload&&differentPush&&!isDifferentNavigation(current,previous))return{previous,score:95,confidence:'confirmed',reason:'same payload pushed multiple times',rootCause:classifyDuplicateRootCause(current,previous)};
    if(samePayload&&samePush)return{previous,score:98,confidence:'confirmed',reason:'one dataLayer push produced multiple observations',rootCause:classifyDuplicateRootCause(current,previous)};
  }

  if(current.observationKind==='network'&&previous.observationKind==='network'){
    if(cls==='navigation'&&sameNavigation(current,previous)){ const networkChanged=current.networkOccurrenceId!==previous.networkOccurrenceId; const transportChanged=!!current.transport&&!!previous.transport&&current.transport!==previous.transport; if(!networkChanged&&!transportChanged)return null; }
    if(current.requestSignature&&previous.requestSignature&&current.requestSignature===previous.requestSignature){ if(cls==='navigation')return null; if(sameSession(current,previous)&&samePage(current,previous))return{previous,score:cls==='transaction'?95:85,confidence:cls==='transaction'?'confirmed':'probable',reason:'same request signature with distinct network observations',rootCause:classifyDuplicateRootCause(current,previous)}; }
    if(sameNormalizedRequest(current.rawUrl,previous.rawUrl)){ if(cls==='navigation')return null; if(sameSession(current,previous)&&samePage(current,previous))return{previous,score:75,confidence:'probable',reason:'same normalized request on the same page',rootCause:classifyDuplicateRootCause(current,previous)}; }
  }

  if((cls==='custom'||cls==='sensitive')&&sameSession(current,previous)&&samePage(current,previous)){
    const samePayload=paramsSignature(current.params)===paramsSignature(previous.params); const differentSource=!!current.source&&!!previous.source&&current.source!==previous.source; const differentPush=current.dlPushIndex!==previous.dlPushIndex;
    if(samePayload&&(differentSource||differentPush))return{previous,score:differentSource?90:75,confidence:differentSource?'confirmed':'probable',reason:differentSource?'multiple implementation paths with matching payload':'matching payload with separate observations',rootCause:classifyDuplicateRootCause(current,previous)};
  }
  return null;
}

export async function findDuplicateEvidence(event:ParsedEvent):Promise<DuplicateEvidence|null>{ if(!event.eventName)return null; const name=event.eventName.trim().toLowerCase(); if(NATURALLY_REPEATABLE_EVENTS.has(name))return null; const cls=eventClass(name); const baseWindow=cls==='transaction'||cls==='sensitive'?180:cls==='navigation'?15:getStrongIdentity(event)||event.requestSignature?30:8; const windowSeconds=await adaptiveDuplicateWindow(event,baseWindow); const rows=await findRecentCandidates(event,windowSeconds); let best:DuplicateEvidence|null=null; for(const raw of rows){const previous=asEvent(raw,event); const evidence=scoreDuplicate(event,previous); if(!evidence)continue; if(!best||evidence.score>best.score)best=evidence;} if(best){ const gapMs=Math.max(0,new Date(event.receivedAt).getTime()-new Date(best.previous.receivedAt).getTime()); (best as DuplicateEvidence & {windowSeconds:number;observedGapMs:number}).windowSeconds=windowSeconds; (best as DuplicateEvidence & {windowSeconds:number;observedGapMs:number}).observedGapMs=gapMs; } return best; }
export async function checkDuplicateEvent(event:ParsedEvent):Promise<DuplicateMatch|null>{ return (await findDuplicateEvidence(event))?.previous||null; }

async function createAlert(input:{siteId:number;severity:string;code:string;category?:string;vendor:string|null;eventName:string|null;message:string;rootCause:string;fixSteps:string[];pageUrl:string;raw:Record<string,unknown>;occurrenceCount?:number;distinctPushes?:number;dedupeMinutes?:number}){
  const dedupeMinutes=input.dedupeMinutes??10;
  const dedupeKey=`${input.code}:${input.vendor||''}:${input.eventName||''}`;
  const impact=await query(`SELECT COUNT(DISTINCT NULLIF(session_id,''))::int AS distinct_sessions, COUNT(DISTINCT NULLIF(page_url,''))::int AS distinct_pages FROM events WHERE site_id=$1 AND ($2::text IS NULL OR vendor=$2) AND ($3::text IS NULL OR LOWER(COALESCE(event_name,''))=LOWER($3)) AND received_at>=NOW()-($4::int*INTERVAL '1 minute')`,[input.siteId,input.vendor,input.eventName,dedupeMinutes]);
  const distinctSessions=Number(impact.rows[0]?.distinct_sessions||0);
  const distinctPages=Number(impact.rows[0]?.distinct_pages||0);
  const effectiveSeverity=boundedSeverity(input.severity,distinctSessions,distinctPages);
  const existing=await query(`UPDATE alerts SET occurrence_count=COALESCE(occurrence_count,1)+1,last_seen=NOW(),raw=$5::jsonb,distinct_sessions=$6,distinct_pages=$7,impact_updated_at=NOW(),severity=CASE WHEN severity='critical' OR $8='critical' THEN 'critical' ELSE severity END WHERE site_id=$1 AND code=$2 AND COALESCE(vendor,'')=COALESCE($4::text,'') AND COALESCE(event_name,'')=COALESCE($3::text,'') AND resolved=false AND created_at>=NOW()-($9::int*INTERVAL '1 minute') RETURNING id,severity`,[input.siteId,input.code,input.eventName,input.vendor,JSON.stringify(input.raw),distinctSessions,distinctPages,effectiveSeverity,dedupeMinutes]);
  if(existing.rowCount){
    if(effectiveSeverity === 'critical') await enqueueAlertDeliveries({alertId:Number(existing.rows[0].id),siteId:input.siteId,severity:'critical',category:input.category||'analytics',vendor:input.vendor,eventName:input.eventName,message:input.message,rootCause:input.rootCause,pageUrl:input.pageUrl,fixSteps:input.fixSteps});
    return;
  }
  const inserted=await query(`INSERT INTO alerts(site_id,severity,code,category,vendor,event_name,message,root_cause,fix_steps,page_url,raw,occurrence_count,distinct_pushes,confidence,dedupe_key,notification_status,last_seen,distinct_sessions,distinct_pages,impact_updated_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,1,$12,'confirmed',$13,'pending',NOW(),$14,$15,NOW() WHERE NOT EXISTS(SELECT 1 FROM alerts WHERE site_id=$1 AND code=$3 AND COALESCE(vendor,'')=COALESCE($5,'') AND COALESCE(event_name,'')=COALESCE($6,'') AND resolved=false AND created_at>=NOW()-($16::int*INTERVAL '1 minute')) RETURNING id`,[input.siteId,effectiveSeverity,input.code,input.category||'analytics',input.vendor,input.eventName,input.message,input.rootCause,JSON.stringify(input.fixSteps),input.pageUrl||null,JSON.stringify(input.raw),input.distinctPushes||null,dedupeKey,distinctSessions,distinctPages,dedupeMinutes]);
  if(inserted.rowCount)await enqueueAlertDeliveries({alertId:Number(inserted.rows[0].id),siteId:input.siteId,severity:effectiveSeverity,category:input.category||'analytics',vendor:input.vendor,eventName:input.eventName,message:input.message,rootCause:input.rootCause,pageUrl:input.pageUrl,fixSteps:input.fixSteps});
}

function getPurchaseCurrency(params:Record<string,any>){return firstValue(params.currency,params['ep.currency'],params['epn.currency'],params.cu,params.ecommerce?.currency,params.items?.[0]?.currency);}
function getPurchaseValue(params:Record<string,any>){return firstValue(params.value,params['ep.value'],params['epn.value'],params.ecommerce?.value);}
async function checkRequiredParameters(event:ParsedEvent){
  if (event.parameterStatus !== 'missing' || !event.missingParameters?.length) return;
  const missing = event.missingParameters.slice(0, 10);
  const tagContext = event.gtmTagName ? ` for GTM tag “${event.gtmTagName}”` : '';
  const code = event.vendor === 'gads' ? 'gads_missing_parameters' : 'missing_event_parameters';
  await createAlert({
    siteId: event.siteId,
    severity: event.eventName?.trim().toLowerCase() === 'purchase' ? 'critical' : 'warning',
    code,
    category: 'analytics',
    vendor: event.vendor,
    eventName: event.eventName,
    message: `${event.vendor.toUpperCase()} ${event.eventName || 'event'} is missing ${missing.join(', ')}${tagContext}.`,
    rootCause: `The observed request did not contain all required parameters. GTM match confidence is ${event.gtmCorrelationConfidence || 'unmatched'}; this is a payload-quality finding, not proof that the tag failed to fire.`,
    fixSteps: event.vendor === 'gads'
      ? ['Open the matched Google Ads tag in GTM and verify conversion ID and conversion label or send_to.', 'Check the request in the browser Network panel and confirm the conversion metadata is present.', 'If the tag is intentionally configured without one field, mark the implementation as not applicable rather than adding a placeholder.']
      : ['Open the matched GA4 tag in GTM and verify the event parameters.', 'Confirm the parameters are populated before the tag fires.', 'Use DebugView or Tag Assistant to verify the final request payload.'],
    pageUrl: event.pageUrl || '',
    raw: { eventId: event.eventId, missingParameters: missing, observedParameters: event.observedParameters || [], gtmTagId: event.gtmTagId || null, gtmTagName: event.gtmTagName || null, gtmTriggerName: event.gtmTriggerName || null, gtmCorrelationConfidence: event.gtmCorrelationConfidence || 'unmatched' },
    dedupeMinutes: 30,
  });
}
async function checkTransportAndConsent(event:ParsedEvent){
  if(!event.vendor||!['ga4','gads','meta','tiktok','linkedin','snapchat','pinterest'].includes(event.vendor))return;
  const outcome = event.deliveryOutcome || classifyDeliveryOutcome(event);
  if(isDeliveryObservation(event) && outcome !== 'delivered' && outcome !== 'unknown') { const label = deliveryOutcomeLabel(outcome); const code = outcome === 'http_error' ? 'tag_http_failure' : outcome === 'blocked' ? 'tag_blocked' : outcome === 'beacon_rejected' ? 'tag_beacon_rejected' : 'tag_transport_failure'; await createAlert({siteId:event.siteId,severity:event.eventName?.trim().toLowerCase()==='purchase'?'critical':'warning',code,category:outcome === 'blocked' ? 'blocker' : 'transport',vendor:event.vendor,eventName:event.eventName,message:`${event.vendor} ${event.eventName||'tag'}: ${label}.`,rootCause:outcome === 'http_error' ? 'The browser exposed an HTTP error response from the destination.' : outcome === 'beacon_rejected' ? 'The browser did not accept the beacon for asynchronous delivery; no vendor response was available.' : 'The browser observed a transport problem. This does not by itself prove an ad blocker.',fixSteps:['Check the request URL and response status in the browser Network panel.','Check CSP, consent rules, browser extensions, and vendor endpoint configuration.','Compare the dataLayer push with the network request in GTM Preview or Tag Assistant.'],pageUrl:event.pageUrl||'',raw:{eventId:event.eventId,outcome,statusCode:event.statusCode||null,latencyMs:event.latencyMs||null,failureReason:event.failureReason||null,beaconAccepted:event.beaconAccepted ?? null,rawUrl:event.rawUrl||null},dedupeMinutes:10});}
  if(event.vendor==='ga4'&&analyticsStorageDenied(event)){const gcs=networkGcs(event);await createAlert({siteId:event.siteId,severity:'info',code:'ga4_consent_denied',category:'consent',vendor:event.vendor,eventName:event.eventName,message:`GA4 ${event.eventName||'event'} was sent while analytics_storage was denied (${gcs}).`,rootCause:'Consent Mode state indicates analytics storage is denied. This is a consent state, not proof of ad blocking.',fixSteps:['Verify the CMP default and update sequence in Tag Assistant.','Determine whether the request is an allowed cookieless measurement request.','Compare the gcs value before and after consent changes.'],pageUrl:event.pageUrl||'',raw:{eventId:event.eventId,gcs,consentState:event.consentState||{},params:event.params},dedupeMinutes:30});}
}
async function checkPurchase(event:ParsedEvent){if(event.vendor!=='ga4'||event.eventName?.trim().toLowerCase()!=='purchase')return;const currency=getPurchaseCurrency(event.params);const value=getPurchaseValue(event.params);const transactionId=getTransactionId(event.params);if(event.revenueValueStatus==='invalid')await createAlert({siteId:event.siteId,severity:'critical',code:'invalid_purchase_value',vendor:event.vendor,eventName:event.eventName,message:'Purchase event contains an invalid value.',rootCause:'A purchase value was present but was not a valid number, so GAfix did not use it for revenue comparison.',fixSteps:['Send a numeric purchase value before the tag fires.','Use the same value and currency in each purchase implementation.','Verify the final request in the browser Network panel.'],pageUrl:event.pageUrl,raw:{eventId:event.eventId,transactionId:transactionId||null,rawValue:value??null,params:event.params}});if(!currency)await createAlert({siteId:event.siteId,severity:'critical',code:'missing_purchase_currency',vendor:event.vendor,eventName:event.eventName,message:'Purchase event is missing a currency parameter.',rootCause:'GA4 received purchase without currency.',fixSteps:['Send currency with every purchase event.','Use a three-letter ISO 4217 code such as USD, EUR, or INR.','Verify currency is present in GTM and direct-code purchase implementations.'],pageUrl:event.pageUrl,raw:{eventId:event.eventId,transactionId:transactionId||null,value:value||null,params:event.params}});if(!transactionId)await createAlert({siteId:event.siteId,severity:'critical',code:'missing_purchase_transaction_id',vendor:event.vendor,eventName:event.eventName,message:'Purchase event is missing transaction_id.',rootCause:'Without transaction_id, duplicate purchase detection cannot reliably identify the same transaction.',fixSteps:['Send a unique transaction_id with every purchase.','Use the same transaction ID across all purchase implementations.','Do not generate a new transaction_id each time the tag fires.'],pageUrl:event.pageUrl,raw:{eventId:event.eventId,value:value||null,currency:currency||null,params:event.params}});}
async function checkFirstSeenCustomEvent(event:ParsedEvent){if(event.vendor!=='ga4'||!event.eventName||classifyEvent(event.eventName)!=='custom')return;const result=await query(`INSERT INTO custom_events_seen(site_id,event_name,first_seen,last_seen,count) VALUES($1,$2,NOW(),NOW(),1) ON CONFLICT(site_id,event_name) DO UPDATE SET last_seen=NOW(),count=custom_events_seen.count+1 RETURNING(xmax=0)AS first_seen`,[event.siteId,event.eventName.trim().toLowerCase()]);if(result.rows[0]?.first_seen)await createAlert({siteId:event.siteId,severity:'info',code:'custom_event_detected',category:'analytics',vendor:event.vendor,eventName:event.eventName,message:`Custom GA4 event detected: ${event.eventName}.`,rootCause:'This event is not in GA4\'s automatic/recommended event set; validate the GTM event name and parameters.',fixSteps:['Check the GTM trigger that creates the event.','Confirm the event name is intentional and consistent across SPA routes.','Open DebugView or Tag Assistant to validate parameters.'],pageUrl:event.pageUrl,raw:{source:event.source,observationKind:event.observationKind,params:event.params},dedupeMinutes:60});}
async function createDuplicateAlert(event:ParsedEvent,evidence:DuplicateEvidence){const duplicate=evidence.previous;const name=event.eventName?.trim().toLowerCase()||'';const samePush=event.dlPushIndex!==null&&duplicate.dlPushIndex!==null&&event.dlPushIndex===duplicate.dlPushIndex;const differentImplementation=!!event.originSource&&!!duplicate.originSource&&event.originSource!==duplicate.originSource;const code=samePush?'gtm_multiple_tags_or_triggers':differentImplementation?'gtm_and_direct_implementation':name==='purchase'?'duplicate_purchase':name==='page_view'?'duplicate_page_view':'duplicate_event';await createAlert({siteId:event.siteId,severity:name==='purchase'||evidence.score>=95?'critical':'warning',code,category:'duplicate',vendor:event.vendor,eventName:event.eventName,message:name==='page_view'?'The same page view may have been delivered more than once for one navigation.':`${event.eventName} may have been delivered more than once for the same logical occurrence.`,rootCause:evidence.rootCause,pageUrl:event.pageUrl,occurrenceCount:2,distinctPushes:event.dlPushIndex!==null&&duplicate.dlPushIndex!==null&&event.dlPushIndex!==duplicate.dlPushIndex?2:1,fixSteps:['Check whether more than one GTM tag or trigger sends this event.','Check direct gtag() or vendor SDK implementations alongside GTM.','For purchase/refund, verify transaction_id is unique and stable.','For custom conversions, add an explicit event_id when the same business action may be retried.','For SPA page views, compare navigation_id and occurrence_id before treating repeated page_view requests as duplicates.'],raw:{confidence:evidence.confidence,evidenceStrength:evidence.confidence,score:evidence.score,reason:evidence.reason,rootCauseHypothesis:evidence.rootCause,evidenceSignals:[evidence.reason, event.requestSignature && duplicate.requestSignature && event.requestSignature === duplicate.requestSignature ? 'same request signature' : null, event.networkOccurrenceId && duplicate.networkOccurrenceId && event.networkOccurrenceId !== duplicate.networkOccurrenceId ? 'distinct network occurrences' : null].filter(Boolean),windowSeconds:(evidence as DuplicateEvidence & {windowSeconds?:number}).windowSeconds||null,observedGapMs:(evidence as DuplicateEvidence & {observedGapMs?:number}).observedGapMs||null,eventId:event.eventId,duplicateOf:duplicate.id,sessionId:event.sessionId,occurrenceId:event.occurrenceId,duplicateOccurrenceId:duplicate.occurrenceId,navigationId:event.navigationId,duplicateNavigationId:duplicate.navigationId,dlPushIndex:event.dlPushIndex,duplicateDlPushIndex:duplicate.dlPushIndex,requestSignature:event.requestSignature,transport:event.transport,originSource:event.originSource,duplicateOriginSource:duplicate.originSource}});}
export async function runDetection(event:ParsedEvent){
  await checkFirstSeenCustomEvent(event);
  await checkRequiredParameters(event);
  await checkTransportAndConsent(event);
  const evidence=await findDuplicateEvidence(event);
  if(evidence?.confidence==='confirmed')await createDuplicateAlert(event,evidence);
  await checkPurchase(event);
}

function errorText(error: unknown){ return (error instanceof Error ? error.message : String(error || 'Unknown detection error')).slice(0, 1000); }
export async function recordDetectionFailure(event: ParsedEvent, error: unknown){
  const message=errorText(error);
  await query(`INSERT INTO detection_failures(site_id,event_id,error,attempts,next_attempt_at,last_attempt_at) VALUES($1,$2,$3,1,NOW()+INTERVAL '1 minute',NOW()) ON CONFLICT(event_id) DO UPDATE SET error=EXCLUDED.error,attempts=LEAST(detection_failures.attempts+1,10),next_attempt_at=NOW()+(LEAST(POWER(2,detection_failures.attempts),60)*INTERVAL '1 minute'),last_attempt_at=NOW(),resolved_at=NULL`,[event.siteId,event.eventId,message]);
}
export async function processPersistedEvent(event: ParsedEvent){
  try{
    await runDetection(event);
    await query(`UPDATE events SET detection_status='scored',detection_error=NULL,detection_attempts=COALESCE(detection_attempts,0)+1,detection_last_attempt_at=NOW() WHERE id=$1`,[event.eventId]);
    await query(`UPDATE detection_failures SET resolved_at=NOW(),last_attempt_at=NOW() WHERE event_id=$1 AND resolved_at IS NULL`,[event.eventId]);
    return {ok:true as const};
  }catch(error){
    await query(`UPDATE events SET detection_status='failed',detection_error=$2,detection_attempts=COALESCE(detection_attempts,0)+1,detection_last_attempt_at=NOW() WHERE id=$1`,[event.eventId,errorText(error)]);
    await recordDetectionFailure(event,error);
    throw error;
  }
}
function persistedRowToEvent(row:any): ParsedEvent { return {siteId:Number(row.site_id),eventId:Number(row.id),receivedAt:row.received_at,vendor:row.vendor,eventName:row.event_name,pageUrl:row.page_url||'',clientId:row.client_id||null,params:row.params||{},rawUrl:row.raw_url||'',dlPushIndex:row.dl_push_index===null?null:Number(row.dl_push_index),source:row.source||null,originSource:row.origin_source||null,observationKind:row.observation_kind||'network',sessionId:row.session_id||null,occurrenceId:row.occurrence_id||null,networkOccurrenceId:row.network_occurrence_id||null,requestSignature:row.request_signature||null,transport:row.transport||null,gtmContainerId:row.gtm_container_id||null,navigationId:row.navigation_id||null,statusCode:row.status_code===null?null:Number(row.status_code),latencyMs:row.latency_ms===null?null:Number(row.latency_ms),failureReason:row.failure_reason||null,beaconAccepted:row.beacon_accepted===null?null:row.beacon_accepted===true,deliveryOutcome:row.delivery_outcome||'unknown',consentState:row.consent_state||{},webVitals:row.web_vitals||{},revenueValue:row.revenue_value===null?null:Number(row.revenue_value),revenueValueStatus:row.revenue_value_status==='valid'||row.revenue_value_status==='invalid'?row.revenue_value_status:'missing',revenueCurrency:row.revenue_currency||null,transactionId:row.transaction_id||null,resourceDomain:row.resource_domain||null,resourceType:row.resource_type||null,deliveryMode:row.delivery_mode||'unknown',isSynthetic:row.is_synthetic===true,gtmTagId:row.gtm_tag_id||null,gtmTagName:row.gtm_tag_name||null,gtmTriggerName:row.gtm_trigger_name||null,gtmWorkspaceId:row.gtm_workspace_id||null,gtmCorrelationConfidence:row.gtm_correlation_confidence||null,missingParameters:Array.isArray(row.missing_parameters)?row.missing_parameters:[],observedParameters:Array.isArray(row.observed_parameters)?row.observed_parameters:[],parameterStatus:row.parameter_status||null}; }
export async function reprocessDetectionFailures(limit=100){
  const due=await query(`SELECT e.* FROM detection_failures f JOIN events e ON e.id=f.event_id WHERE f.resolved_at IS NULL AND f.next_attempt_at<=NOW() AND f.attempts<5 ORDER BY f.next_attempt_at ASC LIMIT $1`,[limit]);
  let processed=0;
  for(const row of due.rows){ try{ await processPersistedEvent(persistedRowToEvent(row)); processed+=1; }catch(error){ console.error('Detection retry failed:',errorText(error)); } }
  return {processed,attempted:due.rows.length};
}
