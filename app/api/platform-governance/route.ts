import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { PLATFORM_GOVERNANCE, canonicalEvent, canonicalParameter, GovernanceVendor } from '../../../lib/platform-governance';

export const dynamic='force-dynamic';
const vendors=Object.keys(PLATFORM_GOVERNANCE) as GovernanceVendor[];
const key=(session:any,occ:any,id:any)=>`COALESCE(NULLIF(${session} || ':' || ${occ}, ':'), network_occurrence_id, ${id}::text)`;
function jsonObject(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function typeOf(v:any){if(v===null)return'null';if(Array.isArray(v))return'array';if(typeof v==='number')return'number';if(typeof v==='boolean')return'boolean';if(typeof v==='string')return'string';if(typeof v==='object')return'object';return'unknown';}
function norm(v:any){return String(v??'').trim().toLowerCase();}

export async function GET(req:NextRequest){
 const session=await getSession(); if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=new URL(req.url); const siteId=Number(url.searchParams.get('siteId')); const requested=norm(url.searchParams.get('vendor')) as GovernanceVendor;
 if(!Number.isSafeInteger(siteId)||siteId<=0)return NextResponse.json({error:'siteId required'},{status:400});
 const owner=await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]); if(!owner.rows[0])return NextResponse.json({error:'Not found'},{status:404});
 const selected=requested&&vendors.includes(requested)?[requested]:vendors;
 const out:any[]=[];
 for(const vendor of selected){
  const eventsRes=await query(`SELECT id,event_name,event_type,params,received_at,session_id,occurrence_id,network_occurrence_id,page_url,resource_domain,status_code,delivery_outcome,failure_reason,observation_kind,gtm_tag_name,gtm_trigger_name,consent_state,client_id FROM events WHERE site_id=$1 AND vendor=$2 AND received_at>NOW()-INTERVAL '30 days' ORDER BY received_at DESC LIMIT 5000`,[siteId,vendor]);
  const rows=eventsRes.rows as any[]; const observedNames=new Map<string,{raw:string;count:number;last:string|null;rows:any[]}>();
  for(const row of rows){const n=norm(row.event_name);if(!n)continue;const x=observedNames.get(n)||{raw:String(row.event_name),count:0,last:null,rows:[]};x.count++;x.last=x.last||row.received_at;x.rows.push(row);observedNames.set(n,x);}
  const eventRows:any[]=[]; let issueCount=0,missingEventCount=0,duplicateCount=0,deliveryFailures=0,consentIssues=0;
  const catalog=PLATFORM_GOVERNANCE[vendor];
  for(const spec of catalog.events){
   const obs=observedNames.get(norm(spec.name)) || spec.aliases?.map(a=>observedNames.get(norm(a))).find(Boolean);
   const issues:any[]=[];
   if(!obs){missingEventCount++;issues.push({code:'missing_event',severity:'warning',message:`${spec.name} is defined by ${catalog.label} but no matching event was observed in the last 30 days.`});}
   else{
    const first=obs.rows[obs.rows.length-1];
    const parameterSamples:any[]=[]; for(const r of obs.rows.slice(0,1000)){const p=jsonObject(r.params);for(const [name,value] of Object.entries(p))parameterSamples.push({name:norm(name),type:typeOf(value),value});}
    for(const rule of spec.parameters){const matching=parameterSamples.filter(p=>p.name===norm(rule.name)||rule.aliases?.some(a=>p.name===norm(a))); const present=matching.length>0;
      if(rule.presence==='required'&&!present)issues.push({code:'missing_parameter',severity:'warning',parameter:rule.name,message:`Required parameter ${rule.name} was not observed for ${spec.name}.`});
      if(present&&rule.type&&matching.some(p=>p.type!=='null'&&p.type!==rule.type))issues.push({code:'type_collision',severity:'warning',parameter:rule.name,message:`${rule.name} is expected as ${rule.type}, but observed ${Array.from(new Set(matching.map(p=>p.type))).join(', ')}.`});
    }
    const occurrenceMap=new Map<string,number>(); for(const r of obs.rows){const id=r.params?.transaction_id||r.params?.event_id||r.params?.eventId||r.params?.order_id; if(id)occurrenceMap.set(String(id),(occurrenceMap.get(String(id))||0)+1);}
    const repeated=Array.from(occurrenceMap.values()).filter(v=>v>1).length; if(repeated&&spec.dedupe?.length){duplicateCount+=repeated;issues.push({code:'duplicate_event',severity:'warning',message:`${repeated} repeated ${spec.name} occurrence identifier(s) were observed.`});}
    const failed=obs.rows.filter(r=>r.observation_kind==='network'&&(Number(r.status_code)>=400||['http_error','blocked','beacon_rejected','network_error','timeout','aborted'].includes(String(r.delivery_outcome||'')))).length;
    deliveryFailures+=failed;if(failed)issues.push({code:'delivery_failure',severity:'warning',message:`${failed} network delivery failure(s) were observed for ${spec.name}.`});
    const consent=obs.rows.filter(r=>{const c=jsonObject(r.consent_state);return String(c.analytics_storage||'').toLowerCase()==='denied'||String(c.ad_storage||'').toLowerCase()==='denied';}).length;
    consentIssues+=consent;if(consent)issues.push({code:'consent_affected',severity:'info',message:`${consent} observed ${spec.name} record(s) had denied storage. This is evidence for review, not proof of a consent violation.`});
    eventRows.push({event_name:obs.raw,event_type:first?.event_type||'Standard',status:issues.some(i=>i.severity==='warning')?'Warn':'OK',count:obs.count,last_seen:obs.last,issues,gtm_tag_names:Array.from(new Set(obs.rows.map(r=>r.gtm_tag_name).filter(Boolean))),gtm_trigger_names:Array.from(new Set(obs.rows.map(r=>r.gtm_trigger_name).filter(Boolean))),page_count:new Set(obs.rows.map(r=>r.page_url).filter(Boolean)).size});
   }
  }
  for(const [name,obs] of observedNames){if(canonicalEvent(vendor,name))continue;eventRows.push({event_name:obs.raw,event_type:'Custom',status:'New',count:obs.count,last_seen:obs.last,issues:[{code:'undocumented_event',severity:'info',message:`${obs.raw} is observed traffic but is not one of the built-in ${catalog.label} governance events. Define it explicitly if it is an intentional custom conversion.`}],gtm_tag_names:Array.from(new Set(obs.rows.map(r=>r.gtm_tag_name).filter(Boolean))),gtm_trigger_names:Array.from(new Set(obs.rows.map(r=>r.gtm_trigger_name).filter(Boolean))),page_count:new Set(obs.rows.map(r=>r.page_url).filter(Boolean)).size});}
  const parameters:any[]=[]; const byParam=new Map<string,{events:Set<string>;types:Set<string>;hits:number;last:string|null}>();
  for(const row of rows){const p=jsonObject(row.params);for(const [name,value] of Object.entries(p)){const n=norm(name);const x=byParam.get(n)||{events:new Set<string>(),types:new Set<string>(),hits:0,last:null};x.events.add(String(row.event_name||''));x.types.add(typeOf(value));x.hits++;x.last=x.last||row.received_at;byParam.set(n,x);}}
  for(const [eventName,eventSpec] of catalog.events.map(e=>[e.name,e] as const)){const obs=observedNames.get(norm(eventName));if(!obs)continue;for(const rule of eventSpec.parameters){const x=byParam.get(norm(rule.name))||rule.aliases?.map(a=>byParam.get(norm(a))).find(Boolean);const present=!!x;const issues:any[]=[];if(rule.presence==='required'&&!present)issues.push({code:'missing_parameter',message:`Required parameter ${rule.name} is missing.`});if(x&&rule.type&&Array.from(x.types).some(t=>t!=='null'&&t!==rule.type))issues.push({code:'type_collision',message:`Expected ${rule.type}; observed ${Array.from(x.types).join(', ')}.`});parameters.push({event_name:eventName,parameter_name:rule.name,presence:rule.presence,type:rule.type||'any',hits:x?.hits||0,events:x?Array.from(x.events):[],observed_types:x?Array.from(x.types):[],last_seen:x?.last||null,status:issues.length?'Warn':present?'OK':rule.presence==='optional'||rule.presence==='conditional'?'OK':'Warn',issues});}}
  const pages=Array.from(new Map(rows.filter(r=>r.page_url).map(r=>[String(r.page_url),{page_url:String(r.page_url),events:new Set<string>(),hits:0,last_seen:r.received_at,issues:[]}])).values()).map((p:any)=>{for(const r of rows.filter(x=>String(x.page_url||'')===p.page_url)){p.events.add(String(r.event_name||''));p.hits++;if(new Date(r.received_at)>new Date(p.last_seen))p.last_seen=r.received_at;}return{...p,events:Array.from(p.events),issues:[]};});
  const blockers=await query(`SELECT COUNT(*)::int AS count FROM adblock_events WHERE site_id=$1 AND vendor=$2 AND detected_at>NOW()-INTERVAL '30 days' AND confidence IN ('confirmed','likely')`,[siteId,vendor]).catch(()=>({rows:[{count:0}]}));
  const healthy=eventRows.filter(e=>e.status==='OK').length; const warnings=eventRows.filter(e=>e.status==='Warn').length; const custom=eventRows.filter(e=>e.status==='New').length;
  issueCount=eventRows.reduce((n,e)=>n+e.issues.length,0);
  out.push({vendor,label:catalog.label,summary:{events_defined:catalog.events.length,events_observed:eventRows.length,healthy,warnings,custom,missing_events:missingEventCount,parameters:parameters.length,issues:issueCount,duplicates:duplicateCount,delivery_failures:deliveryFailures,consent_affected:consentIssues,blocker_signals:Number(blockers.rows[0]?.count||0)},events:eventRows,parameters,pages,catalog:{events:catalog.events,common:catalog.common}});
 }
 return NextResponse.json({siteId,vendors:out,generated_at:new Date().toISOString()});
}
