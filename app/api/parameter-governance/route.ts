import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

type ParameterStatus = 'required' | 'auto' | 'conditional' | 'optional' | 'undocumented';
type ParameterSpec = { type?: string; status: ParameterStatus; aliases?: string[] };

const CATALOG: Record<string, Record<string, ParameterSpec>> = {
  ga4: {
    v:{status:'required',type:'string'}, tid:{status:'required',type:'string'}, cid:{status:'required',type:'string'}, en:{status:'required',type:'string'},
    gtm:{status:'auto'}, _p:{status:'auto'}, _s:{status:'auto'}, uid:{status:'optional',type:'string'},
    gcs:{status:'conditional'}, gcd:{status:'conditional'}, gcu:{status:'conditional'}, gcut:{status:'undocumented'}, npa:{status:'conditional'}, dma:{status:'conditional'}, dma_cps:{status:'conditional'}, are:{status:'conditional'}, pscdl:{status:'auto'}, ir:{status:'auto'},
    sid:{status:'auto'}, sct:{status:'auto'}, seg:{status:'auto'}, _fv:{status:'auto'}, _ss:{status:'auto'}, _nsi:{status:'conditional'}, _gaz:{status:'undocumented'}, _fplc:{status:'conditional'}, _et:{status:'auto',type:'number'}, _c:{status:'conditional'},
    uaa:{status:'auto'}, uab:{status:'auto'}, uafvl:{status:'auto'}, uamb:{status:'auto'}, uam:{status:'auto'}, uap:{status:'auto'}, uapv:{status:'auto'}, uaw:{status:'auto'}, ul:{status:'auto'}, sr:{status:'auto'}, ur:{status:'auto'},
    dl:{status:'auto'}, dr:{status:'auto'}, dt:{status:'auto'}, dh:{status:'auto'}, tag_exp:{status:'auto'}, gdid:{status:'auto'}, _dbg:{status:'conditional'}, _edid:{status:'conditional'}, _eu:{status:'undocumented'}, frm:{status:'auto'}, tt:{status:'undocumented'}, _glv:{status:'undocumented'}, _rnd:{status:'conditional'}, richsstsse:{status:'conditional'},
    cu:{status:'conditional',type:'string'}, pi:{status:'optional'}, pn:{status:'optional'}, cn:{status:'optional'}, cs:{status:'optional'}, cm:{status:'conditional'}, cc:{status:'conditional'}, ct:{status:'conditional'}, ccf:{status:'conditional'}, cmt:{status:'conditional'},
    'sst.uc':{status:'conditional'}, 'sst.rnd':{status:'auto'}, 'sst.gcd':{status:'conditional'}, 'sst.tft':{status:'auto'}, 'sst.etld':{status:'undocumented'}, 'sst.lpc':{status:'undocumented'}, 'sst.navt':{status:'undocumented'}, 'sst.ude':{status:'undocumented'}, 'sst.sw_exp':{status:'undocumented'},
    ecid:{status:'undocumented'}, ngs:{status:'undocumented'}, rcb:{status:'undocumented'}, _tu:{status:'undocumented'}, 'gap.sstd':{status:'undocumented'}, tfd:{status:'undocumented'}, gaf:{status:'undocumented'},
  },
  gads: {
    tid:{status:'required',type:'string'}, 'aw-id':{status:'required',type:'string'}, label:{status:'required',type:'string'}, l:{status:'required',type:'string'}, value:{status:'optional',type:'number'}, currency:{status:'optional',type:'string'}, oid:{status:'optional',type:'string'}, gclid:{status:'conditional'}, gclaw:{status:'auto'}, gcldc:{status:'auto'}, gclsrc:{status:'conditional'}, auid:{status:'undocumented'}, gcs:{status:'conditional'}, gcd:{status:'conditional'}, email:{status:'optional'}, phone_number:{status:'optional'}, 'address.first_name':{status:'optional'}, 'address.last_name':{status:'optional'}, 'address.street':{status:'optional'}, 'address.city':{status:'optional'}, 'address.region':{status:'optional'}, 'address.postal_code':{status:'optional'}, 'address.country':{status:'optional'}, ec_mode:{status:'conditional'}, ecomm_prodid:{status:'optional'}, ecomm_pagetype:{status:'optional'}, ecomm_totalvalue:{status:'optional',type:'number'}, items:{status:'optional',type:'array'},
  },
  meta: {
    id:{status:'required',type:'string'}, ev:{status:'required',type:'string'}, dl:{status:'auto'}, rl:{status:'auto'}, if:{status:'auto'}, fbp:{status:'auto'}, fbc:{status:'conditional'}, eid:{status:'optional'}, coo:{status:'conditional'}, cd:{status:'optional'},
    'ud[em]':{status:'optional'}, 'ud[ph]':{status:'optional'}, 'ud[fn]':{status:'optional'}, 'ud[ln]':{status:'optional'}, 'ud[ct]':{status:'optional'}, 'ud[st]':{status:'optional'}, 'ud[zp]':{status:'optional'}, 'ud[country]':{status:'optional'}, 'ud[ge]':{status:'optional'}, 'ud[external_id]':{status:'optional'},
    em:{status:'optional'}, ph:{status:'optional'}, fn:{status:'optional'}, ln:{status:'optional'}, ge:{status:'optional'}, db:{status:'optional'}, ct:{status:'optional'}, st:{status:'optional'}, zp:{status:'optional'}, country:{status:'optional'}, external_id:{status:'optional'}, client_ip_address:{status:'auto'}, client_user_agent:{status:'auto'}, subscription_id:{status:'optional'}, fb_login_id:{status:'optional'}, lead_id:{status:'optional'}, page_id:{status:'optional'}, page_scoped_user_id:{status:'optional'}, ctwa_clid:{status:'optional'}, ig_account_id:{status:'optional'}, ig_sid:{status:'optional'}, anon_id:{status:'optional'}, madid:{status:'optional'},
    event_name:{status:'required',type:'string'}, event_time:{status:'required',type:'number'}, event_id:{status:'required',type:'string'}, event_source_url:{status:'required',type:'string'}, action_source:{status:'required',type:'string'}, currency:{status:'optional'}, value:{status:'optional',type:'number'}, content_ids:{status:'optional'}, content_type:{status:'optional'}, content_name:{status:'optional'}, contents:{status:'optional',type:'array'}, num_items:{status:'optional',type:'number'}, order_id:{status:'optional'}, search_string:{status:'optional'}, status:{status:'optional'}, predicted_ltv:{status:'optional',type:'number'}, delivery_category:{status:'optional'},
  },
  tiktok: {
    event:{status:'required',type:'string'}, event_type:{status:'required',type:'string'}, event_id:{status:'required',type:'string'}, message_id:{status:'required',type:'string'}, event_time:{status:'required',type:'number'}, event_source:{status:'required',type:'string'}, event_source_url:{status:'required',type:'string'}, pixel:{status:'required'}, sdkid:{status:'required'}, email:{status:'optional'}, phone_number:{status:'optional'}, external_id:{status:'optional'}, ttclid:{status:'conditional'}, ttp:{status:'auto'}, partner_id:{status:'optional'}, content_type:{status:'optional'}, content_id:{status:'optional'}, contents:{status:'optional',type:'array'}, content_name:{status:'optional'}, content_category:{status:'optional'}, currency:{status:'optional'}, value:{status:'optional',type:'number'}, quantity:{status:'optional',type:'number'}, description:{status:'optional'}, query:{status:'optional'}, status:{status:'optional'}, order_id:{status:'optional'}, shop_id:{status:'optional'},
  },
  linkedin: {
    pid:{status:'required',type:'string'}, fmt:{status:'auto'}, url:{status:'auto'}, time:{status:'auto'}, conversionId:{status:'conditional'}, li_fat_id:{status:'conditional'}, li_sugr:{status:'auto'}, cpuid:{status:'auto'}, conversion:{status:'required',type:'string'}, conversionHappenedAt:{status:'required',type:'number'}, eventId:{status:'required',type:'string'}, 'user.userIds[]':{status:'required',type:'array'}, userIds:{status:'required',type:'array'}, 'user.userInfo':{status:'optional'}, 'user.lead':{status:'optional'}, 'user.externalIds[]':{status:'optional',type:'array'}, externalIds:{status:'optional',type:'array'}, 'conversionValue.currencyCode':{status:'optional'}, 'conversionValue.amount':{status:'optional'},
  },
  bing: {
    ti:{status:'required',type:'string'}, evt:{status:'auto'}, p:{status:'auto'}, r:{status:'auto'}, tl:{status:'auto'}, ec:{status:'optional'}, ea:{status:'optional'}, el:{status:'optional'}, ev:{status:'optional'}, gv:{status:'optional',type:'number'}, gc:{status:'optional'}, msclkid:{status:'conditional'}, spa:{status:'conditional'}, asc:{status:'conditional'}, adStorageConsent:{status:'conditional'}, em:{status:'optional'}, ph:{status:'optional'}, ecomm_pagetype:{status:'optional'}, ecomm_prodid:{status:'optional'}, ecomm_category:{status:'optional'}, ecomm_totalvalue:{status:'optional',type:'number'}, transaction_id:{status:'optional'},
  },
  snapchat: {},
};

function asArray(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function norm(value: unknown): string { return String(value ?? '').trim().toLowerCase(); }

function collectExplicitSpecs(value: unknown, eventHint = '') {
  const specs = new Map<string, any>();
  const walk = (node: any, currentEvent = eventHint) => {
    if (!node || typeof node !== 'object') return;
    const event = norm(node.eventName ?? node.event_name ?? node.event ?? currentEvent);
    const name = norm(node.parameterName ?? node.parameter_name ?? node.propertyName ?? node.property_name);
    if (name && (node.type || node.valueType || node.dataType || node.presence || node.required !== undefined || node.enum || node.regex || node.pattern || node.forbidden)) {
      specs.set(`${event}|${name}`, { event, name, type:norm(node.type ?? node.valueType ?? node.dataType)||undefined, presence:node.presence ? norm(node.presence) : node.required === true ? 'required' : node.forbidden === true ? 'forbidden' : undefined, enum:asArray(node.enum).map(String), regex:typeof node.regex==='string'?node.regex:typeof node.pattern==='string'?node.pattern:undefined, conditional:node.conditional ?? node.condition ?? undefined });
    }
    for (const [k,v] of Object.entries(node)) {
      const nextEvent = /event(name)?|trigger(name)?/i.test(k) && typeof v === 'string' ? norm(v) : event;
      if (Array.isArray(v)) v.forEach(x=>walk(x,nextEvent)); else if (v && typeof v==='object') walk(v,nextEvent);
    }
  };
  walk(value); return Array.from(specs.values());
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({error:'Unauthorized'},{status:401});
  const url = new URL(req.url); const siteId = Number(url.searchParams.get('siteId')); const vendor = norm(url.searchParams.get('vendor'));
  if (!Number.isSafeInteger(siteId) || siteId<=0) return NextResponse.json({error:'siteId required'},{status:400});
  const owner = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2',[siteId,session.uid]);
  if (!owner.rows[0]) return NextResponse.json({error:'Not found'},{status:404});

  const args = vendor ? [siteId,vendor] : [siteId]; const vendorClause = vendor ? ' AND vendor=$2' : '';
  const observed = await query(`SELECT LOWER(COALESCE(event_name,'')) AS event_name, LOWER(parameter_name) AS parameter_name,
      COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text))::int AS hits,
      COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)) FILTER (WHERE received_at>=NOW()-INTERVAL '24 hours')::int AS hits_24h,
      COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)) FILTER (WHERE received_at>=NOW()-INTERVAL '7 days')::int AS hits_7d,
      MAX(received_at) AS last_seen,
      ARRAY_AGG(DISTINCT CASE jsonb_typeof(params->parameter_name) WHEN 'boolean' THEN 'boolean' WHEN 'number' THEN 'number' WHEN 'string' THEN 'string' WHEN 'array' THEN 'array' WHEN 'object' THEN 'object' WHEN 'null' THEN 'null' ELSE 'unknown' END) AS observed_types,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(source,'')),NULL) AS sources
    FROM events CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(params)='object' THEN params ELSE '{}'::jsonb END) parameter_name
    WHERE site_id=$1${vendorClause} AND received_at>=NOW()-INTERVAL '30 days'
    GROUP BY LOWER(COALESCE(event_name,'')),LOWER(parameter_name)`,args);

  const snapshotRows = await query(`SELECT fetched_at,snapshot_stale,environment,tags,triggers FROM gtm_config_snapshots WHERE site_id=$1 ORDER BY fetched_at DESC LIMIT 1`,[siteId]).catch(()=>({rows:[] as any[]}));
  const snapshot = snapshotRows.rows[0] || null;
  const gtmSpecs = snapshot ? collectExplicitSpecs({tags:snapshot.tags,triggers:snapshot.triggers}) : [];
  const catalog = CATALOG[vendor] || {};

  // The Parameters tab should show real governance data. GTM remains the source of
  // explicit specifications, while the platform catalog supplies required/optional
  // classifications when GTM does not expose parameter metadata. Auto parameters are
  // the only catalog parameters intentionally hidden from this UI.
  const configured = new Map<string, any>();
  for (const spec of gtmSpecs) {
    const platform = catalog[spec.name];
    if (platform?.status === 'auto') continue;
    configured.set(`${spec.event}|${spec.name}`, {...spec, platform});
  }

  // Add platform-defined required/optional/conditional parameters so the table does
  // not disappear when the GTM export contains no explicit parameter metadata. These
  // are evaluated against network traffic; network-only properties are not errors.
  for (const [name, platform] of Object.entries(catalog)) {
    if (platform.status === 'auto' || platform.status === 'undocumented') continue;
    const observedMatches = observed.rows.filter((r:any) => norm(r.parameter_name) === norm(name));
    const events = Array.from(new Set(observedMatches.map((r:any)=>String(r.event_name||'')).filter(Boolean)));
    const key = `|${norm(name)}`;
    if (!configured.has(key)) configured.set(key, {event:'', name:norm(name), type:platform.type, presence:platform.status, platform, catalogOnly:true, observedEvents:events});
  }

  const output = Array.from(configured.values()).map((spec:any) => {
    const matching = observed.rows.filter((r:any) => norm(r.parameter_name) === spec.name && (!spec.event || norm(r.event_name) === spec.event));
    const hits = matching.reduce((n:any,r:any)=>n+Number(r.hits||0),0);
    const hits24 = matching.reduce((n:any,r:any)=>n+Number(r.hits_24h||0),0);
    const hits7 = matching.reduce((n:any,r:any)=>n+Number(r.hits_7d||0),0);
    const observedTypes = Array.from(new Set(matching.flatMap((r:any)=>asArray(r.observed_types)))) as string[];
    const expectedType = spec.type || spec.platform?.type || null;
    const presence = spec.presence || spec.platform?.status || 'optional';
    const issues:any[] = [];
    if (expectedType && observedTypes.some(t=>t!=='null' && t!==expectedType)) issues.push({code:'type_collision',severity:'warning',title:'Type collision',message:`Expected ${expectedType}; network traffic observed ${observedTypes.join(', ')}.`});
    if (presence === 'required' && hits === 0) issues.push({code:'missing_property',severity:'warning',title:'Required parameter missing',message:`Required parameter ${spec.name} was not observed in the network payload.`});
    if (presence === 'forbidden') issues.push({code:'forbidden_property',severity:'warning',title:'Forbidden parameter',message:'This parameter is explicitly forbidden by the GTM specification.'});
    if (spec.enum?.length) issues.push({code:'enum_validation',severity:'warning',title:'Enum validation',message:`GTM expects one of: ${spec.enum.join(', ')}.`});
    if (spec.regex) issues.push({code:'regex_validation',severity:'warning',title:'Regex validation',message:`GTM defines a value pattern: ${spec.regex}.`});
    if (spec.conditional) issues.push({code:'conditional_property',severity:'info',title:'Conditional parameter',message:'This parameter is governed by a conditional rule; absence is not treated as an error unless the condition is active.'});

    const status = issues.some(i=>i.severity==='warning') ? 'Warn' : hits24>0 ? 'OK' : hits>0 ? 'Off' : presence==='required' ? 'Warn' : 'Off';
    const sources = Array.from(new Set(matching.flatMap((r:any)=>asArray(r.sources).map(String))));
    return {
      parameter_name: spec.name,
      event: spec.event || null,
      status,
      hits,
      hits_24h:hits24,
      hits_7d:hits7,
      missing_hits:matching.length ? 0 : 0,
      coverage:hits>0?100:0,
      events:spec.event?[spec.event]:Array.from(new Set(matching.map((r:any)=>String(r.event_name||'')).filter(Boolean))),
      sources,
      observed_types:observedTypes,
      expected_type:expectedType,
      presence,
      reference_status:spec.platform?.status || spec.presence || 'configured',
      issues,
      last_seen:matching.reduce((latest:any,r:any)=>!latest||new Date(r.last_seen)>new Date(latest)?r.last_seen:latest,null),
    };
  }).sort((a,b)=>String(a.event||'').localeCompare(String(b.event||''))||String(a.parameter_name).localeCompare(String(b.parameter_name)));

  const summary={total:output.length,healthy:output.filter(r=>r.status==='OK').length,warnings:output.filter(r=>r.status==='Warn').length,offline:output.filter(r=>r.status==='Off').length,missing:output.filter(r=>r.issues.some((i:any)=>i.code==='missing_property')).length,type_collisions:output.filter(r=>r.issues.some((i:any)=>i.code==='type_collision')).length,validation:output.filter(r=>r.issues.some((i:any)=>['enum_validation','regex_validation'].includes(i.code))).length,forbidden:output.filter(r=>r.issues.some((i:any)=>i.code==='forbidden_property')).length};
  return NextResponse.json({siteId,vendor:vendor||null,snapshot:snapshot?{fetched_at:snapshot.fetched_at,snapshot_stale:Boolean(snapshot.snapshot_stale),environment:snapshot.environment}:null,summary,parameters:output});
}
