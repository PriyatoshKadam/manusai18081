import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { PLATFORM_GOVERNANCE, PLATFORM_DETECTION, canonicalEvent, canonicalParameter, eventNameValidation, normaliseGovernanceVendor, platformEventName, GovernanceVendor } from '../../../lib/platform-governance';
import { flattenParameterValues, isEmptyParameterValue, logicalDeliveryKey, logicalOccurrenceKey, observedValueType } from '../../../lib/platform-evidence';

export const dynamic='force-dynamic';
const vendors=Object.keys(PLATFORM_GOVERNANCE) as GovernanceVendor[];
const key=(session:any,occ:any,id:any)=>`COALESCE(NULLIF(${session} || ':' || ${occ}, ':'), network_occurrence_id, ${id}::text)`;
function jsonObject(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function norm(v:any){return String(v??'').trim().toLowerCase();}

export async function GET(req:NextRequest){
 const session=await getSession(); if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=new URL(req.url); const siteId=Number(url.searchParams.get('siteId')); const requested=normaliseGovernanceVendor(url.searchParams.get('vendor')) as GovernanceVendor;
 if(!Number.isSafeInteger(siteId)||siteId<=0)return NextResponse.json({error:'siteId required'},{status:400});
 const owner=await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]); if(!owner.rows[0])return NextResponse.json({error:'Not found'},{status:404});
 const selected=requested&&vendors.includes(requested)?[requested]:vendors;
 const out:any[]=[];
 for(const vendor of selected){
  const eventsRes=await query(`SELECT id,event_name,event_type,params,received_at,session_id,occurrence_id,network_occurrence_id,page_url,resource_domain,status_code,delivery_outcome,failure_reason,observation_kind,delivery_mode,transport,origin_source,request_signature,raw_url,gtm_tag_name,gtm_trigger_name,consent_state,client_id FROM events WHERE site_id=$1 AND vendor=$2 AND received_at>NOW()-INTERVAL '30 days' ORDER BY received_at DESC LIMIT 5000`,[siteId,vendor]);
  const rows=eventsRes.rows as any[]; const observedNames=new Map<string,{raw:string;count:number;last:string|null;rows:any[];occurrences:Set<string>}>();
  for(const row of rows){const rawName=norm(row.event_name);if(!rawName)continue;const n=norm(platformEventName(vendor,row.event_name));const x=observedNames.get(n)||{raw:String(row.event_name),count:0,last:null,rows:[],occurrences:new Set<string>()};x.rows.push(row);x.occurrences.add(logicalOccurrenceKey(row));x.count=x.occurrences.size;x.last=x.last||row.received_at;observedNames.set(n,x);}
  const eventRows:any[]=[]; let issueCount=0,missingEventCount=0,duplicateCount=0,deliveryFailures=0,consentIssues=0;
  const catalog=PLATFORM_GOVERNANCE[vendor];
  for(const spec of catalog.events){
   const obs=observedNames.get(norm(spec.name)) || spec.aliases?.map(a=>observedNames.get(norm(a))).find(Boolean);
   const issues:any[]=[];
   if(!obs){ continue; }
   else{
    const first=obs.rows[obs.rows.length-1];
    const allNetworkRows=obs.rows.filter((r:any)=>r.observation_kind==='network'&&String(r.transport||'')!=='performance');
    const parameterRows=allNetworkRows.length?allNetworkRows:[];
    const parameterOccurrenceCount=new Set(parameterRows.map((r:any)=>logicalOccurrenceKey(r))).size;
    const parameterSamples:any[]=[]; for(const r of parameterRows.slice(0,1000)){const p=jsonObject(r.params);const occurrence=logicalOccurrenceKey(r);for(const field of flattenParameterValues(p))parameterSamples.push({name:norm(field.name),type:observedValueType(field.value),value:field.value,empty:isEmptyParameterValue(field.value),occurrence,observedAt:r.received_at});}
    const nameValidation=eventNameValidation(vendor,obs.raw);if(!nameValidation.valid)issues.push({code:nameValidation.issueCode||'invalid_event_name',severity:'warning',message:nameValidation.message||'Event identity does not match platform naming rules.',suggestion:nameValidation.suggestion||null});
    for(const rule of spec.parameters){
      const accepted=[norm(rule.name),...(rule.aliases||[]).map(norm)];
      const matching=parameterSamples.filter(p=>accepted.includes(p.name));
      const sentOccurrences=new Set(matching.map((p:any)=>p.occurrence));
      const validOccurrences=new Set(matching.filter((p:any)=>!p.empty).map((p:any)=>p.occurrence));
      const sentCoverage=parameterOccurrenceCount?Math.min(1,sentOccurrences.size/parameterOccurrenceCount):0;
      const coverage=parameterOccurrenceCount?Math.min(1,validOccurrences.size/parameterOccurrenceCount):0;
      const hasEnoughEvidence=parameterOccurrenceCount>=1;
      const purchaseLike=['purchase','refund','transaction','order_complete','ecommerce_purchase','completepayment','purchase_conversion'].includes(norm(spec.name));
      const criticalParameter=rule.name==='transaction_id'&&['ga4','gads','bing','meta','tiktok','linkedin'].includes(vendor)&&purchaseLike
        || rule.name==='value'&&purchaseLike&&['ga4','meta','tiktok'].includes(vendor)
        || rule.name==='price'&&purchaseLike&&vendor==='snapchat';
      const severity=criticalParameter?'critical':'warning';
      if(rule.presence==='required'&&hasEnoughEvidence&&coverage<0.8){
        const emptyOnly=sentCoverage>=0.8;
        issues.push({code:emptyOnly?'required_parameter_empty':'missing_parameter',severity,parameter:rule.name,message:emptyOnly
          ?`Parameter ${rule.name} was sent but was empty or unresolved on ${Math.round((sentCoverage-coverage)*100)}% of logical ${spec.name} occurrences. Empty includes null, blank, undefined, NaN and unresolved template values; the value "0" is valid.`
          :`Required parameter ${rule.name} was present and non-empty on ${Math.round(coverage*100)}% of observed network ${spec.name} occurrences; the platform rule expects it on at least 80%.`});
      }
      const emptyRate=matching.length?matching.filter((p:any)=>p.empty).length/matching.length:0;
      if(rule.presence!=='required'&&matching.length>=20&&emptyRate>=0.5){
        issues.push({code:'empty_parameter',severity:'info',parameter:rule.name,message:`${rule.name} was empty or unresolved in ${Math.round(emptyRate*100)}% of ${matching.length} supplied values. This is informational for optional/conditional fields unless their condition is active.`});
      }
      if(rule.type&&matching.length>=5){
        const validSamples=matching.filter((p:any)=>!p.empty);
        const types=Array.from(new Set(validSamples.map((p:any)=>p.type).filter((t:string)=>t!=='null'&&t!=='unknown')));
        if(types.length>1)issues.push({code:'type_collision',severity:'warning',parameter:rule.name,message:`${rule.name} changes type across supplied values: ${types.join(', ')}.`});
        const expected=rule.type;
        const onlyParseableNumbers=expected==='number'&&types.every((t:string)=>t==='number'||t==='string')&&validSamples.every((p:any)=>Number.isFinite(Number(p.value)));
        if(types.some((t:string)=>t!==expected)&&!onlyParseableNumbers)issues.push({code:'property_type_validation',severity:'warning',parameter:rule.name,message:`${rule.name} is expected as ${expected}; observed ${types.join(', ')}.`});
      }
    }
    if(!parameterRows.length&&spec.parameters.some((rule:any)=>rule.presence==='required')){
      issues.push({code:'parameter_verification_unavailable',severity:'info',message:`No vendor network payload was captured for ${spec.name}; required parameter compliance is not observable in this window. This is not a parameter pass or fail.`});
    }
    const duplicateGroups=new Map<string,any[]>();
    for(const r of obs.rows){
      if(r.observation_kind!=='network'||String(r.transport||'')==='performance'||String(r.delivery_outcome||'')!=='delivered')continue;
      const id=logicalOccurrenceKey(r);
      const group=duplicateGroups.get(id)||[];group.push(r);duplicateGroups.set(id,group);
    }
    const confirmedDuplicateGroups=Array.from(duplicateGroups.values()).filter(group=>{
      const distinctDeliveries=new Set(group.map((r:any)=>logicalDeliveryKey(r)));
      if(distinctDeliveries.size<2)return false;
      const times=group.map(r=>new Date(r.received_at).getTime()).filter(Number.isFinite);
      if(!times.length||Math.max(...times)-Math.min(...times)>10000)return false;
      const eventIds=Array.from(new Set(group.map(r=>String(r.params?.event_id||r.params?.eventId||r.params?.eid||'')).filter(Boolean)));
      const transactionIds=Array.from(new Set(group.map(r=>String(r.params?.transaction_id||r.params?.transactionId||r.params?.order_id||r.params?.oid||'')).filter(Boolean)));
      if(eventIds.length>1||transactionIds.length>1)return false;
      const modes=Array.from(new Set(group.map(r=>String(r.delivery_mode||'unknown').toLowerCase())));
      if(['meta','tiktok','snapchat'].includes(vendor)&&eventIds.length===1&&modes.some(m=>/server|capi|api/.test(m))&&modes.some(m=>/browser|pixel|client/.test(m)))return false;
      return true;
    });
    const repeated=confirmedDuplicateGroups.length;
    if(repeated&&spec.dedupe?.length){duplicateCount+=repeated;issues.push({code:'duplicate_event',severity:'warning',message:`${repeated} logical ${spec.name} occurrence(s) produced multiple successful network deliveries within 10 seconds. Repeated IDs across separate sessions alone are not considered duplicates.`});}
    const technicalFailureOutcomes=new Set(['http_error','beacon_rejected','network_error','timeout']);
    const attempts=obs.rows.filter(r=>r.observation_kind==='network'&&String(r.transport||'')!=='performance'&&String(r.delivery_outcome||'')!=='blocked');
    const deliveryAttempts=new Set(attempts.map((r:any)=>logicalDeliveryKey(r))).size;
    const failedRows=attempts.filter(r=>technicalFailureOutcomes.has(String(r.delivery_outcome||''))||Number(r.status_code)>=400);
    const failed=new Set(failedRows.map((r:any)=>logicalDeliveryKey(r))).size;
    const anomalies=obs.rows.filter(r=>r.observation_kind==='network'&&['aborted'].includes(String(r.delivery_outcome||''))).length;
    const profile=PLATFORM_DETECTION[vendor];
    const failureRate=deliveryAttempts?failed/deliveryAttempts:0;
    if(deliveryAttempts>=profile.baseline.minimumDeliveryAttempts&&failureRate>=profile.baseline.deliveryWarningRate){
      deliveryFailures+=failed;
      issues.push({code:'delivery_failure',severity:failureRate>=profile.baseline.deliveryCriticalRate?'critical':'warning',message:`${failed} technical failures among ${deliveryAttempts} distinct delivery attempts for ${spec.name} (${Math.round(failureRate*1000)/10}%). Confirmed/likely blocker outcomes are reported separately.`});
    }else if(failed){
      issues.push({code:'delivery_attempt_failed',severity:'info',message:`${failed} technical delivery failure(s) occurred across ${deliveryAttempts} attempts for ${spec.name}; the platform's delivery-rate rule needs at least ${profile.baseline.minimumDeliveryAttempts} attempts before it raises a rate-based warning.`});
    }
    if(anomalies)issues.push({code:'delivery_aborted',severity:'info',message:`${anomalies} aborted observation(s) occurred for ${spec.name}. Aborts are not proof of delivery failure or ad blocking.`});
    const consent=obs.rows.filter(r=>{const c=jsonObject(r.consent_state);return String(c.analytics_storage||'').toLowerCase()==='denied'||String(c.ad_storage||'').toLowerCase()==='denied';}).length;
    consentIssues+=consent;if(consent)issues.push({code:'consent_affected',severity:'info',message:`${consent} observed ${spec.name} record(s) had denied storage. This is evidence for review, not proof of a consent violation.`});
    eventRows.push({event_name:obs.raw,event_type:first?.event_type||'Standard',status:issues.some(i=>i.severity==='warning')?'Warn':'OK',count:obs.count,last_seen:obs.last,issues,gtm_tag_names:Array.from(new Set(obs.rows.map(r=>r.gtm_tag_name).filter(Boolean))),gtm_trigger_names:Array.from(new Set(obs.rows.map(r=>r.gtm_trigger_name).filter(Boolean))),page_count:new Set(obs.rows.map(r=>r.page_url).filter(Boolean)).size});
   }
  }
  for(const [name,obs] of observedNames){
    if(canonicalEvent(vendor,name))continue;
    const profile=PLATFORM_DETECTION[vendor];
    const isPlatformStandard=(profile?.standardEvents||[]).some((n:string)=>norm(platformEventName(vendor,n))===norm(name));
    const identityBased=['conversion_id_label','conversion_id'].includes(profile?.identity);
    const validation=eventNameValidation(vendor,obs.raw);
    const issues:any[]=[];
    if(!validation.valid)issues.push({code:validation.issueCode||'invalid_event_name',severity:'warning',message:validation.message||'The observed platform event or conversion identity is invalid.',suggestion:validation.suggestion||null});
    if(!isPlatformStandard&&!identityBased&&validation.valid)issues.push({code:'undocumented_event',severity:'info',message:`${obs.raw} is observed traffic not in the known ${catalog.label} event catalogue. This is discovery context, not a tracking error; confirm whether it is an intended custom event.`});
    eventRows.push({event_name:obs.raw,event_type:isPlatformStandard?'Standard':'Custom',status:issues.some(i=>i.severity==='warning')?'Warn':isPlatformStandard?'OK':'New',count:obs.count,last_seen:obs.last,issues,gtm_tag_names:Array.from(new Set(obs.rows.map(r=>r.gtm_tag_name).filter(Boolean))),gtm_trigger_names:Array.from(new Set(obs.rows.map(r=>r.gtm_trigger_name).filter(Boolean))),page_count:new Set(obs.rows.map(r=>r.page_url).filter(Boolean)).size});
  }
  const parameters:any[]=[]; const byParam=new Map<string,{events:Set<string>;types:Set<string>;hits:number;emptyHits:number;last:string|null}>();
  for(const row of rows.filter((r:any)=>r.observation_kind==='network'&&String(r.transport||'')!=='performance')){const eventKey=norm(platformEventName(vendor,row.event_name));for(const field of flattenParameterValues(jsonObject(row.params))){const n=norm(field.name);const mapKey=eventKey+'|'+n;const x=byParam.get(mapKey)||{events:new Set<string>(),types:new Set<string>(),hits:0,emptyHits:0,last:null};x.events.add(String(row.event_name||''));x.types.add(observedValueType(field.value));x.hits++;if(isEmptyParameterValue(field.value))x.emptyHits++;x.last=x.last||row.received_at;byParam.set(mapKey,x);}}
  for(const [eventName,eventSpec] of catalog.events.map(e=>[e.name,e] as const)){const canonicalName=platformEventName(vendor,eventName);const obs=observedNames.get(norm(canonicalName));if(!obs)continue;const networkRows=obs.rows.filter((r:any)=>r.observation_kind==='network'&&String(r.transport||'')!=='performance');const networkOccurrences=new Set(networkRows.map((r:any)=>logicalOccurrenceKey(r)));for(const rule of eventSpec.parameters){const accepted=[norm(rule.name),...(rule.aliases||[]).map(norm)];const xCandidates=Array.from(byParam.entries()).filter(([key])=>key.startsWith(norm(canonicalName)+'|')&&accepted.includes(key.split('|').slice(1).join('|'))).map(([,value])=>value);const x=xCandidates.sort((a,b)=>b.hits-a.hits)[0];const matchingSamples=networkRows.flatMap((row:any)=>flattenParameterValues(jsonObject(row.params)).filter((field:any)=>accepted.includes(norm(field.name))).map((field:any)=>({field,row,occurrence:logicalOccurrenceKey(row)})));const sentOccurrences=new Set(matchingSamples.map((s:any)=>s.occurrence));const validOccurrences=new Set(matchingSamples.filter((s:any)=>!isEmptyParameterValue(s.field.value)).map((s:any)=>s.occurrence));const coverage=networkOccurrences.size?Math.min(1,validOccurrences.size/networkOccurrences.size):0;const sentCoverage=networkOccurrences.size?Math.min(1,sentOccurrences.size/networkOccurrences.size):0;const issues:any[]=[];if(rule.presence==='required'&&networkOccurrences.size&&coverage<0.8)issues.push({code:sentCoverage>=0.8?'required_parameter_empty':'missing_parameter',message:sentCoverage>=0.8?'Required parameter '+rule.name+' was sent but empty or unresolved on some occurrences.':'Required parameter '+rule.name+' was present and non-empty on '+Math.round(coverage*100)+'% of captured network occurrences; expected at least 80%.'});if(rule.presence!=='required'&&matchingSamples.length>=20&&matchingSamples.filter((s:any)=>isEmptyParameterValue(s.field.value)).length/matchingSamples.length>=0.5)issues.push({code:'empty_parameter',message:rule.name+' is empty or unresolved in at least half of supplied values.'});const types=Array.from(new Set(matchingSamples.filter((s:any)=>!isEmptyParameterValue(s.field.value)).map((s:any)=>observedValueType(s.field.value)).filter((t:string)=>t!=='null')));if(rule.type&&matchingSamples.length>=5){if(types.length>1)issues.push({code:'type_collision',message:'Type varies across supplied values: '+types.join(', ')+'.'});const numericString=rule.type==='number'&&types.every(t=>t==='number'||t==='string')&&matchingSamples.filter((s:any)=>!isEmptyParameterValue(s.field.value)).every((s:any)=>Number.isFinite(Number(s.field.value)));if(types.some(t=>t!==rule.type)&&!numericString)issues.push({code:'property_type_validation',message:'Expected '+rule.type+'; observed '+types.join(', ')+'.'});}parameters.push({event_name:eventName,parameter_name:rule.name,presence:rule.presence,type:rule.type||'any',hits:x?.hits||0,empty_hits:x?.emptyHits||0,events:x?Array.from(x.events):[],observed_types:x?Array.from(x.types):[],last_seen:x?.last||null,coverage:Math.round(coverage*1000)/10,sent_coverage:Math.round(sentCoverage*1000)/10,status:issues.length?'Warn':coverage>=0.8?'OK':rule.presence==='optional'||rule.presence==='conditional'?'OK':networkOccurrences.size?'Warn':'Not observable',issues});}}
  const pages=Array.from(new Map(rows.filter(r=>r.page_url).map(r=>[String(r.page_url),{page_url:String(r.page_url),events:new Set<string>(),hits:0,last_seen:r.received_at,issues:[]}])).values()).map((p:any)=>{for(const r of rows.filter(x=>String(x.page_url||'')===p.page_url)){p.events.add(String(r.event_name||''));p.hits++;if(new Date(r.received_at)>new Date(p.last_seen))p.last_seen=r.received_at;}return{...p,events:Array.from(p.events),issues:[]};});
  const blockers=await query(`SELECT COUNT(*)::int AS count FROM adblock_events a WHERE a.site_id=$1 AND a.detected_at>NOW()-INTERVAL '30 days' AND a.confidence IN ('confirmed','likely') AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(a.blocked_vendors)='array' THEN a.blocked_vendors ELSE '[]'::jsonb END) AS b(value) WHERE LOWER(b.value)=LOWER($2))`,[siteId,vendor]).catch(()=>({rows:[{count:0}]}));
  const missingExpected=await query(`SELECT COUNT(*)::int AS count FROM alerts WHERE site_id=$1 AND LOWER(COALESCE(vendor,''))=$2 AND code IN ('missing_event','offline_event','event_stopped_firing_on_page') AND resolved=FALSE AND muted=FALSE`,[siteId,vendor]).catch(()=>({rows:[{count:0}]}));
  missingEventCount=Number(missingExpected.rows[0]?.count||0);
  const healthy=eventRows.filter(e=>e.status==='OK').length; const warnings=eventRows.filter(e=>e.status==='Warn').length; const custom=eventRows.filter(e=>e.status==='New').length;
  issueCount=eventRows.reduce((n,e)=>n+e.issues.length,0);
  out.push({vendor,label:catalog.label,summary:{events_defined:catalog.events.length,events_observed:eventRows.length,healthy,warnings,custom,missing_events:missingEventCount,parameters:parameters.length,issues:issueCount,duplicates:duplicateCount,delivery_failures:deliveryFailures,consent_affected:consentIssues,blocker_signals:Number(blockers.rows[0]?.count||0)},events:eventRows,parameters,pages,catalog:{events:catalog.events,common:catalog.common}});
 }
 return NextResponse.json({siteId,vendors:out,generated_at:new Date().toISOString()});
}
