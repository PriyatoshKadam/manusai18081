import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

type Issue = { code: string; severity: 'warning' | 'info'; title: string; message: string; timestamp: string | null };
type Spec = { event: string; parameter: string; expectedType?: string; presence?: string; tagName?: string; triggerName?: string; configuredValue?: unknown };

const REQUIRED: Record<string, Record<string, string>> = {
  ga4: { v:'string', tid:'string', cid:'string', en:'string' },
  gads: { tid:'string', 'aw-id':'string', label:'string', l:'string' },
  meta: { id:'string', ev:'string', event_name:'string', event_time:'number', event_id:'string', event_source_url:'string', action_source:'string' },
  tiktok: { event:'string', event_type:'string', event_id:'string', message_id:'string', event_time:'number', event_source:'string', event_source_url:'string', pixel:'string', sdkid:'string' },
  linkedin: { pid:'string', conversion:'string', conversionHappenedAt:'number', eventId:'string', userIds:'array' },
  bing: { ti:'string' },
  snapchat: {},
};

const ALIASES: Record<string,string> = {
  conversionvalue:'value', currencycode:'currency', transactionid:'transaction_id', orderid:'order_id', eventid:'event_id', eventtime:'event_time', eventsourceurl:'event_source_url', actionsource:'action_source', contentids:'content_ids', contenttype:'content_type', contentname:'content_name', numitems:'num_items', searchstring:'search_string', predictedltv:'predicted_ltv', deliverycategory:'delivery_category', subscriptionid:'subscription_id'
};
const INTERNAL = new Set(['enablelinkerparams','enablenewcustomerreporting','enableconversionlinker','enableproductreporting','redactvisitorip','eptoincludedropdown','uptoincludedropdown','measurementid','conversionid','access_token','accesstoken','pixelid','sdkid','tagid','containerid','accountid','transporturl','cookieflags','cookiepath','cookiedomain']);

function norm(value: unknown) { return String(value ?? '').trim().toLowerCase(); }
function asArray(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function snake(value: string) { return value.replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/[^a-zA-Z0-9_\[\].-]+/g,'_').toLowerCase(); }
function mapParam(value: string) { const n=norm(value); return ALIASES[n] || snake(value); }
function emptyValue(value: unknown) { return value == null || (typeof value === 'string' && (value.trim()==='' || value.trim()==='undefined' || value.trim()==='null')); }

function extractSpecs(tags: unknown, triggers: unknown[]): Spec[] {
  const triggerNames = new Map<string,string>();
  for (const trigger of triggers) {
    if (!trigger || typeof trigger !== 'object') continue;
    const t:any = trigger;
    const name=String(t.name||'').trim(); const id=String(t.triggerId||'').trim();
    if(id) triggerNames.set(id,name||id);
  }
  const specs: Spec[]=[];
  const walk = (node:any, tag:any, eventHint='') => {
    if (!node || typeof node !== 'object') return;
    const event = norm(node.eventName ?? node.event_name ?? eventHint);
    const params = Array.isArray(node.parameter) ? node.parameter : [];
    if (params.length && tag) {
      for (const p of params) {
        if (!p || typeof p !== 'object') continue;
        const key=String(p.key||'').trim(); if(!key) continue;
        const mapped=mapParam(key);
        const raw=norm(key);
        if (INTERNAL.has(raw)) continue;
        if (raw==='eventname') continue;
        const value=p.value;
        const isPayload = Object.prototype.hasOwnProperty.call(REQUIRED, '') || REQUIRED.ga4[mapped] || REQUIRED.gads[mapped] || REQUIRED.meta[mapped] || REQUIRED.tiktok[mapped] || REQUIRED.linkedin[mapped] || REQUIRED.bing[mapped] || /^(value|currency|transaction_id|order_id|items|content_|user_|custom_|x-)/.test(mapped) || (typeof value==='string' && value.includes('{{'));
        if(!isPayload) continue;
        const expected = REQUIRED.ga4[mapped] || REQUIRED.gads[mapped] || REQUIRED.meta[mapped] || REQUIRED.tiktok[mapped] || REQUIRED.linkedin[mapped] || REQUIRED.bing[mapped];
        const firing = asArray(tag.firingTriggerId).map(String);
        const triggerName = firing.map(id=>triggerNames.get(id)||'').find(Boolean) || '';
        specs.push({event,parameter:mapped,expectedType:expected,tagName:String(tag.name||''),triggerName,configuredValue:value});
      }
    }
    for (const [key,value] of Object.entries(node)) {
      const nextEvent=/event(name)?|event_name/i.test(key) && typeof value==='string' ? norm(value) : event;
      if(Array.isArray(value)) value.forEach(x=>walk(x,tag,nextEvent)); else if(value && typeof value==='object') walk(value,tag,nextEvent);
    }
  };
  for (const tag of asArray(tags)) walk(tag,tag,norm((tag as any)?.eventName));
  return specs;
}

export async function GET(req: NextRequest) {
  const session=await getSession(); if(!session) return NextResponse.json({error:'Unauthorized'},{status:401});
  const url=new URL(req.url); const siteId=Number(url.searchParams.get('siteId')); const vendor=norm(url.searchParams.get('vendor'));
  if(!Number.isSafeInteger(siteId)||siteId<=0) return NextResponse.json({error:'siteId required'},{status:400});
  const owner=await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]);
  if(!owner.rows[0]) return NextResponse.json({error:'Not found'},{status:404});

  const args=vendor?[siteId,vendor]:[siteId]; const vendorClause=vendor?' AND vendor=$2':'';
  const observed=await query(`SELECT LOWER(COALESCE(event_name,'')) event_name, LOWER(parameter_name) parameter_name,
      COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'),network_occurrence_id,id::text))::int hits,
      COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'),network_occurrence_id,id::text)) FILTER (WHERE received_at>=NOW()-INTERVAL '24 hours')::int hits_24h,
      COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'),network_occurrence_id,id::text)) FILTER (WHERE (jsonb_typeof(params->parameter_name)='null' OR (jsonb_typeof(params->parameter_name)='string' AND btrim(params->>parameter_name)='')))::int empty_hits,
      MAX(received_at) last_seen,
      ARRAY_AGG(DISTINCT CASE jsonb_typeof(params->parameter_name) WHEN 'boolean' THEN 'boolean' WHEN 'number' THEN 'number' WHEN 'string' THEN 'string' WHEN 'array' THEN 'array' WHEN 'object' THEN 'object' WHEN 'null' THEN 'null' ELSE 'unknown' END) observed_types,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(source,'')),NULL) sources
    FROM events CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(params)='object' THEN params ELSE '{}'::jsonb END) parameter_name
    WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '30 days'
    GROUP BY LOWER(COALESCE(event_name,'')),LOWER(parameter_name)`,args);
  const totals=await query(`SELECT LOWER(COALESCE(event_name,'')) event_name, COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'),network_occurrence_id,id::text))::int hits FROM events WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '30 days' GROUP BY LOWER(COALESCE(event_name,''))`,args);
  const totalMap=new Map<string,number>(totals.rows.map((r:any)=>[norm(r.event_name),Number(r.hits||0)]));
  const snapshotRows=await query(`SELECT fetched_at,tags,triggers FROM gtm_config_snapshots WHERE site_id=$1 ORDER BY fetched_at DESC LIMIT 1`,[siteId]).catch(()=>({rows:[] as any[]}));
  const snapshot=snapshotRows.rows[0]||null; const specs= snapshot ? extractSpecs(snapshot.tags,asArray(snapshot.triggers)) : [];
  const required=REQUIRED[vendor]||{}; const keys=new Map<string,Spec>();
  for(const [parameter,expectedType] of Object.entries(required)) keys.set(`|${norm(parameter)}`,{event:'',parameter,expectedType,presence:'required'});
  for(const spec of specs) { if(spec.parameter.startsWith('_')) continue; const platformExpected=required[spec.parameter]; keys.set(`${spec.event}|${norm(spec.parameter)}`,{...spec,expectedType:spec.expectedType||platformExpected,presence:'configured'}); }

  const rows:any[]=[];
  for(const spec of Array.from(keys.values())) {
    const matching=observed.rows.filter((r:any)=>norm(r.parameter_name)===norm(spec.parameter)&&(!spec.event||norm(r.event_name)===norm(spec.event)));
    const hits=matching.reduce((n:number,r:any)=>n+Number(r.hits||0),0); const hits24=matching.reduce((n:number,r:any)=>n+Number(r.hits_24h||0),0);
    const emptyHits=matching.reduce((n:number,r:any)=>n+Number(r.empty_hits||0),0);
    const types=Array.from(new Set(matching.flatMap((r:any)=>asArray(r.observed_types)))) as string[];
    const issues:Issue[]=[];
    const latest=matching.reduce((v:any,r:any)=>!v||new Date(r.last_seen)>new Date(v)?r.last_seen:v,null);
    if(spec.presence==='required'&&hits===0) issues.push({code:'missing_property',severity:'warning',title:'Missing Property',message:`Required parameter ${spec.parameter} is not present in the observed network payload for ${spec.event||'the configured events'}.`,timestamp:latest});
    if(spec.presence==='configured'&&emptyHits>0) issues.push({code:'empty_parameter',severity:'warning',title:'Empty Parameter Value',message:`GTM tag ${spec.tagName||'configuration'} is configured with ${spec.parameter}, but the network payload contains an empty value.`,timestamp:latest});
    if(spec.expectedType&&types.some(t=>t!=='null'&&t!==spec.expectedType)) issues.push({code:'type_collision',severity:'warning',title:'Type Collision',message:`Expected ${spec.expectedType}; observed ${types.filter(t=>t!=='null').join(', ')}.`,timestamp:latest});
    if(spec.presence==='forbidden'&&hits>0) issues.push({code:'forbidden_property',severity:'warning',title:'Forbidden Property',message:`Parameter ${spec.parameter} is forbidden for this specification but was observed.`,timestamp:latest});
    const coverage=spec.event ? (totalMap.get(norm(spec.event))||0) : Array.from(totalMap.values()).reduce((a,b)=>a+b,0); const pct=coverage>0?Math.min(100,Math.round((hits/coverage)*1000)/10):0;
    rows.push({parameter_name:spec.parameter,event:spec.event||null,status:issues.length?'Warn':hits24?'OK':spec.presence==='required'?'Warn':'Off',expected_type:spec.expectedType||null,observed_types:types,presence:spec.presence||'optional',events:Array.from(new Set(matching.map((r:any)=>String(r.event_name||'')).filter(Boolean))),sources:Array.from(new Set(spec.tagName?[spec.tagName,...matching.flatMap((r:any)=>asArray(r.sources).map(String))]:matching.flatMap((r:any)=>asArray(r.sources).map(String)))),hits,hits_24h:hits24,coverage:pct,issues,last_seen:latest,tag_name:spec.tagName||null,trigger_name:spec.triggerName||null});
  }
  return NextResponse.json({siteId,vendor,parameters:rows,summary:{total:rows.length,warnings:rows.filter(r=>r.status==='Warn').length,missing:rows.filter(r=>r.issues.some((i:any)=>i.code==='missing_property')).length,type_collisions:rows.filter(r=>r.issues.some((i:any)=>i.code==='type_collision')).length,empty:rows.filter(r=>r.issues.some((i:any)=>i.code==='empty_parameter')).length,forbidden:rows.filter(r=>r.issues.some((i:any)=>i.code==='forbidden_property')).length}});
}
