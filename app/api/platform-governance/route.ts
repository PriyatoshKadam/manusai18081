import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { PLATFORM_GOVERNANCE, PLATFORM_DETECTION, canonicalEvent, canonicalParameter, eventNameValidation, normaliseGovernanceVendor, platformEventName, GovernanceVendor } from '../../../lib/platform-governance';

export const dynamic='force-dynamic';
const vendors=Object.keys(PLATFORM_GOVERNANCE) as GovernanceVendor[];
const key=(session:any,occ:any,id:any)=>`COALESCE(NULLIF(${session} || ':' || ${occ}, ':'), network_occurrence_id, ${id}::text)`;
function jsonObject(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function typeOf(v:any){if(v===null)return'null';if(Array.isArray(v))return'array';if(typeof v==='number')return'number';if(typeof v==='boolean')return'boolean';if(typeof v==='string')return'string';if(typeof v==='object')return'object';return'unknown';}
function norm(v:any){return String(v??'').trim().toLowerCase();}

export async function GET(req:NextRequest){
 const session=await getSession(); if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=new URL(req.url); const siteId=Number(url.searchParams.get('siteId')); const requested=normaliseGovernanceVendor(url.searchParams.get('vendor')) as GovernanceVendor;
 if(!Number.isSafeInteger(siteId)||siteId<=0)return NextResponse.json({error:'siteId required'},{status:400});
 const owner=await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]); if(!owner.rows[0])return NextResponse.json({error:'Not found'},{status:404});
 const selected=requested&&vendors.includes(requested)?[requested]:vendors;
 const out:any[]=[];
 for(const vendor of selected){
  const eventsRes=await query(`SELECT id,event_name,event_type,params,received_at,session_id,occurrence_id,network_occurrence_id,page_url,resource_domain,status_code,delivery_outcome,failure_reason,observation_kind,delivery_mode,origin_source,request_signature,gtm_tag_name,gtm_trigger_name,consent_state,client_id FROM events WHERE site_id=$1 AND vendor=$2 AND received_at>NOW()-INTERVAL '30 days' ORDER BY received_at DESC LIMIT 5000`,[siteId,vendor]);
  const rows=eventsRes.rows as any[]; const observedNames=new Map<string,{raw:string;count:number;last:string|null;rows:any[]}>();
  for(const row of rows){const rawName=norm(row.event_name);if(!rawName)continue;const n=norm(platformEventName(vendor,row.event_name));const x=observedNames.get(n)||{raw:String(row.event_name),count:0,last:null,rows:[]};x.count++;x.last=x.last||row.received_at;x.rows.push(row);observedNames.set(n,x);}
  const eventRows:any[]=[]; let issueCount=0,missingEventCount=0,duplicateCount=0,deliveryFailures=0,consentIssues=0;
  const catalog=PLATFORM_GOVERNANCE[vendor];
  for(const spec of catalog.events){
   const obs=observedNames.get(norm(spec.name)) || spec.aliases?.map(a=>observedNames.get(norm(a))).find(Boolean);
   const issues:any[]=[];
   if(!obs){ continue; }
   else{
    const first=obs.rows[obs.rows.length-1];
    const parameterSamples:any[]=[]; for(const r of obs.rows.slice(0,1000)){const p=jsonObject(r.params);const occurrence=String(r.session_id&&r.occurrence_id?r.session_id+':'+r.occurrence_id:r.network_occurrence_id||r.id);for(const [name,value] of Object.entries(p))parameterSamples.push({name:norm(name),type:typeOf(value),value,occurrence});}
    const nameValidation=eventNameValidation(vendor,obs.raw);if(!nameValidation.valid)issues.push({code:nameValidation.issueCode||'invalid_event_name',severity:'warning',message:nameValidation.message||'Event identity does not match platform naming rules.',suggestion:nameValidation.suggestion||null});
    for(const rule of spec.parameters){
      const accepted= [norm(rule.name), ...(rule.aliases||[]).map(norm)];
      const matching=parameterSamples.filter(p=>accepted.includes(p.name));
      const hits=new Set(matching.map((p:any)=>p.occurrence)).size;
      const coverage=obs.count>0?Math.min(1,hits/obs.count):0;
      const present=coverage>=0.8;
      if(rule.presence==='required'&&!present)issues.push({code:'missing_parameter',severity:'warning',parameter:rule.name,message:`Required parameter ${rule.name} was present on ${Math.round(coverage*100)}% of observed ${spec.name} occurrences; platform contract expects it on at least 80%.`});
      if(rule.type&&hits>=20){
        const types=Array.from(new Set(matching.map(p=>p.type).filter((t:string)=>t!=='null'&&t!=='unknown')));
        if(types.length>1)issues.push({code:'type_collision',severity:'warning',parameter:rule.name,message:`${rule.name} changes type across ${hits} samples: ${types.join(', ')}.`});
        const expected=rule.type;
        const onlyParseableNumbers=expected==='number'&&types.every((t:string)=>t==='number'||t==='string')&&matching.every(p=>p.value===null||p.value===undefined||p.value===''||Number.isFinite(Number(p.value)));
        if(types.some((t:string)=>t!==expected)&&!onlyParseableNumbers)issues.push({code:'property_type_validation',severity:'warning',parameter:rule.name,message:`${rule.name} is expected as ${expected}; observed ${types.join(', ')}.`});
      }
    }
    const duplicateGroups=new Map<string,any[]>();
    for(const r of obs.rows){
      if(r.observation_kind!=='network'||String(r.delivery_outcome||'')!=='delivered'||!r.session_id||!r.occurrence_id)continue;
      const id=`${r.session_id}:${r.occurrence_id}`;
      const group=duplicateGroups.get(id)||[];group.push(r);duplicateGroups.set(id,group);
    }
    const confirmedDuplicateGroups=Array.from(duplicateGroups.values()).filter(group=>{
      if(group.length<2)return false;
      const times=group.map(r=>new Date(r.received_at).getTime()).filter(Number.isFinite);
      if(!times.length||Math.max(...times)-Math.min(...times)>10000)return false;
      const eventIds=Array.from(new Set(group.map(r=>String(r.params?.event_id||r.params?.eventId||r.params?.eid||'')).filter(Boolean)));
      const modes=Array.from(new Set(group.map(r=>String(r.delivery_mode||'unknown'))));
      if(['meta','tiktok','snapchat'].includes(vendor)&&eventIds.length===1&&modes.length>1&&modes.some(m=>/server|capi|api/i.test(m)))return false;
      return true;
    });
    const repeated=confirmedDuplicateGroups.length;
    if(repeated&&spec.dedupe?.length){duplicateCount+=repeated;issues.push({code:'duplicate_event',severity:'warning',message:`${repeated} logical ${spec.name} occurrence(s) produced multiple successful network deliveries within 10 seconds. Repeated IDs across separate sessions alone are not considered duplicates.`});}
    const failed=obs.rows.filter(r=>r.observation_kind==='network'&&(['http_error','beacon_rejected'].includes(String(r.delivery_outcome||''))||Number(r.status_code)>=400)).length;
    const anomalies=obs.rows.filter(r=>r.observation_kind==='network'&&['network_error','timeout','aborted'].includes(String(r.delivery_outcome||''))).length;
    deliveryFailures+=failed;if(failed)issues.push({code:'delivery_failure',severity:'warning',message:`${failed} explicit HTTP/beacon delivery failure(s) were observed for ${spec.name}. Generic transport anomalies and blocker evidence are classified separately.`});
    if(anomalies)issues.push({code:'transport_anomaly',severity:'info',message:`${anomalies} network error/timeout/abort observations were recorded for ${spec.name}; these are not proof of ad blocking.`});
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
    eventRows.push({event_name:obs.raw,event_type:isPlatformStandard?'Standard':'Custom',status:isPlatformStandard?'OK':'New',count:obs.count,last_seen:obs.last,issues:!isPlatformStandard&&!identityBased?[{code:'undocumented_event',severity:'info',message:`${obs.raw} is observed traffic not in the known ${catalog.label} event catalogue. This is discovery context, not a tracking error; confirm whether it is an intended custom event.`}]:[],gtm_tag_names:Array.from(new Set(obs.rows.map(r=>r.gtm_tag_name).filter(Boolean))),gtm_trigger_names:Array.from(new Set(obs.rows.map(r=>r.gtm_trigger_name).filter(Boolean))),page_count:new Set(obs.rows.map(r=>r.page_url).filter(Boolean)).size});
  }
  const parameters:any[]=[]; const byParam=new Map<string,{events:Set<string>;types:Set<string>;hits:number;last:string|null}>();
  for(const row of rows){const p=jsonObject(row.params);for(const [name,value] of Object.entries(p)){const n=norm(name);const eventKey=norm(platformEventName(vendor,row.event_name));const mapKey=eventKey+'|'+n;const x=byParam.get(mapKey)||{events:new Set<string>(),types:new Set<string>(),hits:0,last:null};x.events.add(String(row.event_name||''));x.types.add(typeOf(value));x.hits++;x.last=x.last||row.received_at;byParam.set(mapKey,x);}}
  for(const [eventName,eventSpec] of catalog.events.map(e=>[e.name,e] as const)){const canonicalName=platformEventName(vendor,eventName);const obs=observedNames.get(norm(canonicalName));if(!obs)continue;for(const rule of eventSpec.parameters){const prefix=norm(canonicalName)+'|';const x=byParam.get(prefix+norm(rule.name))||rule.aliases?.map(a=>byParam.get(prefix+norm(a))).find(Boolean);const coverage=obs.count?Math.min(1,Number(x?.hits||0)/obs.count):0;const present=coverage>=0.8;const issues:any[]=[];if(rule.presence==='required'&&!present)issues.push({code:'missing_parameter',message:'Required parameter '+rule.name+' was present on '+Math.round(coverage*100)+'% of observed '+eventName+' occurrences; expected at least 80%.'});if(x&&rule.type&&Number(x.hits||0)>=20){const types=Array.from(x.types).filter(t=>t!=='null');if(types.length>1)issues.push({code:'type_collision',message:'Type varies across '+x.hits+' samples: '+types.join(', ')+'.'});const numericString=rule.type==='number'&&types.every(t=>t==='number'||t==='string');if(types.some(t=>t!==rule.type)&&!numericString)issues.push({code:'property_type_validation',message:'Expected '+rule.type+'; observed '+types.join(', ')+'.'});}parameters.push({event_name:eventName,parameter_name:rule.name,presence:rule.presence,type:rule.type||'any',hits:x?.hits||0,events:x?Array.from(x.events):[],observed_types:x?Array.from(x.types):[],last_seen:x?.last||null,coverage:Math.round(coverage*1000)/10,status:issues.length?'Warn':present?'OK':rule.presence==='optional'||rule.presence==='conditional'?'OK':'Warn',issues});}}
  const pages=Array.from(new Map(rows.filter(r=>r.page_url).map(r=>[String(r.page_url),{page_url:String(r.page_url),events:new Set<string>(),hits:0,last_seen:r.received_at,issues:[]}])).values()).map((p:any)=>{for(const r of rows.filter(x=>String(x.page_url||'')===p.page_url)){p.events.add(String(r.event_name||''));p.hits++;if(new Date(r.received_at)>new Date(p.last_seen))p.last_seen=r.received_at;}return{...p,events:Array.from(p.events),issues:[]};});
  const blockers=await query(`SELECT COUNT(*)::int AS count FROM adblock_events WHERE site_id=$1 AND vendor=$2 AND detected_at>NOW()-INTERVAL '30 days' AND confidence IN ('confirmed','likely')`,[siteId,vendor]).catch(()=>({rows:[{count:0}]}));
  const healthy=eventRows.filter(e=>e.status==='OK').length; const warnings=eventRows.filter(e=>e.status==='Warn').length; const custom=eventRows.filter(e=>e.status==='New').length;
  issueCount=eventRows.reduce((n,e)=>n+e.issues.length,0);
  out.push({vendor,label:catalog.label,summary:{events_defined:catalog.events.length,events_observed:eventRows.length,healthy,warnings,custom,missing_events:missingEventCount,parameters:parameters.length,issues:issueCount,duplicates:duplicateCount,delivery_failures:deliveryFailures,consent_affected:consentIssues,blocker_signals:Number(blockers.rows[0]?.count||0)},events:eventRows,parameters,pages,catalog:{events:catalog.events,common:catalog.common}});
 }
 return NextResponse.json({siteId,vendors:out,generated_at:new Date().toISOString()});
}
