import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

const STANDARD_SPECS: Record<string, Record<string, { type: string; presence: 'required' | 'optional' }>> = {
  purchase: { transaction_id:{type:'string',presence:'required'}, value:{type:'number',presence:'required'}, currency:{type:'string',presence:'required'}, items:{type:'array',presence:'required'} },
  refund: { transaction_id:{type:'string',presence:'required'}, value:{type:'number',presence:'required'}, currency:{type:'string',presence:'required'}, items:{type:'array',presence:'required'} },
  add_to_cart: { items:{type:'array',presence:'required'}, value:{type:'number',presence:'optional'}, currency:{type:'string',presence:'optional'} },
  view_item: { items:{type:'array',presence:'required'}, value:{type:'number',presence:'optional'}, currency:{type:'string',presence:'optional'} },
  view_item_list: { items:{type:'array',presence:'required'} },
  begin_checkout: { items:{type:'array',presence:'required'}, value:{type:'number',presence:'optional'}, currency:{type:'string',presence:'optional'} },
  remove_from_cart: { items:{type:'array',presence:'required'} },
  select_item: { items:{type:'array',presence:'required'} },
  login: { method:{type:'string',presence:'optional'} },
  sign_up: { method:{type:'string',presence:'optional'} },
  generate_lead: { value:{type:'number',presence:'optional'}, currency:{type:'string',presence:'optional'} },
};

function asArray(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function normalizeName(value: unknown) { return String(value ?? '').trim().toLowerCase(); }

function collectExplicitSpecs(value: unknown, eventHint = '') {
  const specs = new Map<string, any>();
  const walk = (node: any, currentEvent = eventHint) => {
    if (!node || typeof node !== 'object') return;
    const event = normalizeName(node.eventName ?? node.event_name ?? node.event ?? currentEvent);
    const name = normalizeName(node.parameterName ?? node.parameter_name ?? node.propertyName ?? node.property_name);
    if (name && (node.type || node.valueType || node.dataType || node.presence || node.required !== undefined || node.enum || node.regex || node.pattern || node.forbidden)) {
      specs.set(`${event}|${name}`, {
        event, name,
        type: normalizeName(node.type ?? node.valueType ?? node.dataType) || undefined,
        presence: node.presence ? normalizeName(node.presence) : node.required === true ? 'required' : node.forbidden === true ? 'forbidden' : undefined,
        enum: asArray(node.enum).map(String),
        regex: typeof node.regex === 'string' ? node.regex : typeof node.pattern === 'string' ? node.pattern : undefined,
        conditional: node.conditional ?? node.condition ?? undefined,
      });
    }
    for (const [k,v] of Object.entries(node)) {
      const nextEvent = /event(name)?|trigger(name)?/i.test(k) && typeof v === 'string' ? normalizeName(v) : event;
      if (Array.isArray(v)) v.forEach(x => walk(x, nextEvent));
      else if (v && typeof v === 'object') walk(v, nextEvent);
    }
  };
  walk(value);
  return Array.from(specs.values());
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const siteId = Number(url.searchParams.get('siteId'));
  const vendor = normalizeName(url.searchParams.get('vendor'));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const owner = await query('SELECT id FROM sites WHERE id=$1 AND user_id=$2', [siteId, session.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const args = vendor ? [siteId, vendor] : [siteId];
  const vendorClause = vendor ? ' AND vendor=$2' : '';
  const observed = await query(
    `SELECT LOWER(COALESCE(event_name,'')) AS event_name,
            LOWER(parameter_name) AS parameter_name,
            COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text))::int AS hits,
            COUNT(DISTINCT NULLIF(session_id,''))::int AS sessions,
            COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)) FILTER (WHERE received_at >= NOW()-INTERVAL '24 hours')::int AS hits_24h,
            COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text)) FILTER (WHERE received_at >= NOW()-INTERVAL '7 days')::int AS hits_7d,
            MAX(received_at) AS last_seen,
            ARRAY_AGG(DISTINCT CASE jsonb_typeof(params->parameter_name) WHEN 'boolean' THEN 'boolean' WHEN 'number' THEN 'number' WHEN 'string' THEN 'string' WHEN 'array' THEN 'array' WHEN 'object' THEN 'object' WHEN 'null' THEN 'null' ELSE 'unknown' END) AS observed_types,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(source,'')), NULL) AS sources
       FROM events
       CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(params)='object' THEN params ELSE '{}'::jsonb END) parameter_name
      WHERE site_id=$1${vendorClause} AND received_at >= NOW()-INTERVAL '30 days'
      GROUP BY LOWER(COALESCE(event_name,'')), LOWER(parameter_name)
      ORDER BY hits DESC`, args);

  const missing = await query(
    `SELECT LOWER(COALESCE(event_name,'')) AS event_name, LOWER(TRIM(value)) AS parameter_name, COUNT(DISTINCT COALESCE(NULLIF(session_id || ':' || occurrence_id, ':'), network_occurrence_id, id::text))::int AS missing_hits
       FROM events CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(missing_parameters)='array' THEN missing_parameters ELSE '[]'::jsonb END) x(value)
      WHERE site_id=$1${vendorClause} AND received_at >= NOW()-INTERVAL '30 days' AND NULLIF(TRIM(value),'') IS NOT NULL
      GROUP BY LOWER(COALESCE(event_name,'')), LOWER(TRIM(value))`, args);

  const snapshotRows = await query(
    `SELECT fetched_at, snapshot_stale, environment, tags, triggers
       FROM gtm_config_snapshots WHERE site_id=$1 ORDER BY fetched_at DESC LIMIT 1`, [siteId]
  ).catch(() => ({ rows: [] as any[] }));
  const snapshot = snapshotRows.rows[0] || null;
  const gtmSpecs = snapshot ? collectExplicitSpecs({ tags: snapshot.tags, triggers: snapshot.triggers }) : [];
  const specByEventParam = new Map(gtmSpecs.map((s:any) => [`${s.event}|${s.name}`, s]));

  const rows = new Map<string, any>();
  for (const r of observed.rows) {
    const key = String(r.parameter_name);
    const row = rows.get(key) || { parameter_name:key, hits:0, hits_24h:0, hits_7d:0, events:new Set<string>(), sources:new Set<string>(), observed_types:new Set<string>(), missing_hits:0, specs:[] };
    row.hits += Number(r.hits||0); row.hits_24h += Number(r.hits_24h||0); row.hits_7d += Number(r.hits_7d||0);
    if (r.event_name) row.events.add(r.event_name); asArray(r.sources).forEach(x=>x&&row.sources.add(String(x))); asArray(r.observed_types).forEach(x=>x&&row.observed_types.add(String(x)));
    const spec = specByEventParam.get(`${r.event_name}|${key}`); if (spec) row.specs.push(spec);
    rows.set(key,row);
  }
  for (const r of missing.rows) {
    const key = String(r.parameter_name); const row = rows.get(key) || { parameter_name:key, hits:0,hits_24h:0,hits_7d:0,events:new Set<string>(),sources:new Set<string>(),observed_types:new Set<string>(),missing_hits:0,specs:[] };
    row.missing_hits += Number(r.missing_hits||0); if(r.event_name) row.events.add(r.event_name); const spec=specByEventParam.get(`${r.event_name}|${key}`); if(spec&&!row.specs.some((s:any)=>s.event===spec.event&&s.name===spec.name)) row.specs.push(spec); rows.set(key,row);
  }

  const output = Array.from(rows.values()).map(row => {
    const events = Array.from(row.events) as string[];
    const observedTypes = Array.from(row.observed_types) as string[];
    const explicit = row.specs.find((s:any)=>s.type||s.presence||s.enum?.length||s.regex||s.conditional);
    const standard = vendor === 'ga4' ? events.map(e => STANDARD_SPECS[e]?.[row.parameter_name]).find(Boolean) : undefined;
    const expectedType = explicit?.type || standard?.type || null;
    const presence = explicit?.presence || standard?.presence || (row.missing_hits > 0 ? 'required' : 'optional');
    const issues:any[] = [];
    if (expectedType && observedTypes.some(t => t !== expectedType && t !== 'null')) issues.push({code:'type_collision', severity:'warning', title:'Type collision', message:`Expected ${expectedType}; observed ${observedTypes.join(', ')}.`, detail:`Observed across ${row.hits.toLocaleString()} parameter hits.`});
    if (presence === 'required' && row.missing_hits > 0) issues.push({code:'missing_property', severity:'warning', title:'Missing parameter', message:`Required parameter missing in ${row.missing_hits.toLocaleString()} observed event occurrences.`, detail:`Affected events: ${events.join(', ') || 'unknown'}.`});
    if (presence === 'forbidden') issues.push({code:'forbidden_property', severity:'warning', title:'Forbidden parameter', message:'This parameter is explicitly forbidden by the configured specification.'});
    if (explicit?.enum?.length) issues.push({code:'enum_validation', severity:'warning', title:'Enum validation', message:`Expected one of: ${explicit.enum.join(', ')}.`});
    if (explicit?.regex) issues.push({code:'regex_validation', severity:'warning', title:'Regex validation', message:`Values must match ${explicit.regex}.`});
    if (explicit?.conditional) issues.push({code:'conditional_property', severity:'info', title:'Conditional parameter', message:'Presence is governed by a conditional rule.'});
    const status = issues.some(i=>i.severity==='warning') ? 'Warn' : row.hits === 0 ? 'Off' : row.hits_24h === 0 ? 'Off' : 'OK';
    return { parameter_name:row.parameter_name, status, hits:row.hits, hits_24h:row.hits_24h, hits_7d:row.hits_7d, missing_hits:row.missing_hits, coverage:row.hits+row.missing_hits ? Math.round(row.hits/(row.hits+row.missing_hits)*1000)/10 : 100, events, sources:Array.from(row.sources), observed_types:observedTypes, expected_type:expectedType, presence, issues, last_seen:row.last_seen || null };
  }).sort((a,b)=>Number(b.hits||0)-Number(a.hits||0));

  const summary = { total:output.length, healthy:output.filter(r=>r.status==='OK').length, warnings:output.filter(r=>r.status==='Warn').length, offline:output.filter(r=>r.status==='Off').length, missing:output.filter(r=>r.issues.some((i:any)=>i.code==='missing_property')).length, type_collisions:output.filter(r=>r.issues.some((i:any)=>i.code==='type_collision')).length, validation:output.filter(r=>r.issues.some((i:any)=>['enum_validation','regex_validation'].includes(i.code))).length, forbidden:output.filter(r=>r.issues.some((i:any)=>i.code==='forbidden_property')).length };
  return NextResponse.json({ siteId, vendor:vendor||null, snapshot: snapshot ? { fetched_at:snapshot.fetched_at, snapshot_stale:Boolean(snapshot.snapshot_stale), environment:snapshot.environment } : null, summary, parameters:output });
}
