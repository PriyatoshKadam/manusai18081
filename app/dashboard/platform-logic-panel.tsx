'use client';

import { useEffect, useMemo, useState } from 'react';

type Logic = {
  label: string; identity: string; eventNamePolicy: string;
  endpointHosts?: string[]; endpointPaths?: string[]; loaderPatterns?: string[];
  runtimeGlobals?: string[]; gtmTypeTokens?: string[]; directTokens?: string[];
  identityFields?: string[]; eventFields?: string[]; standardEvents?: string[];
  eventAliases?: Record<string,string>; consentModel: string; consentFields?: string[];
  consentCategories?: string[]; clickIds?: string[]; attributionCookies?: string[];
  revenue?: { events?: string[]; value?: string[]; currency?: string[]; transaction?: string[]; dedupe?: string[] };
  baseline?: { lookbackDays?: number };
};

const names: Record<string,string> = {ga4:'Google Analytics 4',gads:'Google Ads',meta:'Meta',bing:'Microsoft Ads',tiktok:'TikTok',linkedin:'LinkedIn',snapchat:'Snapchat'};
const pretty=(v:string)=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

export default function PlatformLogicPanel({vendor,siteId}:{vendor:string;siteId:string}) {
  const [logic,setLogic]=useState<Logic|null>(null);
  const [summary,setSummary]=useState<any>(null);
  const [open,setOpen]=useState<string|null>(null);

  useEffect(()=>{
    if(!siteId)return;
    let cancelled=false;
    fetch('/api/platform-governance?siteId='+encodeURIComponent(siteId)+'&vendor='+encodeURIComponent(vendor),{cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(new Error('Unable to load platform logic')))
      .then(body=>{if(cancelled)return;const item=Array.isArray(body.vendors)?body.vendors[0]:null;setLogic(item?.logic||null);setSummary(item?.summary||null)})
      .catch(()=>{if(!cancelled){setLogic(null);setSummary(null)}})
    return()=>{cancelled=true};
  },[siteId,vendor]);

  const sections=useMemo(()=>{
    if(!logic)return [];
    const list=(v?:string[])=>v?.join(', ')||'—';
    return [
      {key:'network',title:'Network identification',lead:'Only requests matching this destination endpoint and payload identity are treated as platform traffic.',rows:[['Identity',pretty(logic.identity)],['Endpoint hosts',list(logic.endpointHosts)],['Endpoint paths',list(logic.endpointPaths)],['Event fields',list(logic.eventFields)],['Identity fields',list(logic.identityFields)]]},
      {key:'implementation',title:'Implementation detection',lead:'GTM, direct/SDK and loader evidence stay separate so GTM absence never becomes a false missing-event finding.',rows:[['GTM signatures',list(logic.gtmTypeTokens)],['Direct signatures',list(logic.directTokens)],['Runtime globals',list(logic.runtimeGlobals)],['Loaders',list(logic.loaderPatterns)]]},
      {key:'events',title:'Event identity & naming',lead:'Platform-specific identity rules are applied before event governance.',rows:[['Naming policy',pretty(logic.eventNamePolicy)],['Standard events',String(logic.standardEvents?.length||0)+' known identifiers'],['Aliases',Object.entries(logic.eventAliases||{}).map(([a,b])=>a+' → '+b).join(', ')||'None'],['Observed catalogue',String(summary?.events_observed||0)+' observed / '+String(summary?.events_defined||0)+' defined']]},
      {key:'consent',title:'Consent model',lead:'Consent semantics stay platform-specific. Google Consent Mode is not treated like a denied Meta, TikTok or Snapchat request.',rows:[['Model',pretty(logic.consentModel)],['Signals',list(logic.consentFields)],['Required categories',list(logic.consentCategories)]]},
      {key:'revenue',title:'Revenue & attribution',lead:'Purchase/value validation uses the platform’s own field names and deduplication model.',rows:[['Revenue events',list(logic.revenue?.events)],['Value fields',list(logic.revenue?.value)],['Currency fields',list(logic.revenue?.currency)],['Transaction fields',list(logic.revenue?.transaction)],['Deduplication',list(logic.revenue?.dedupe)],['Click IDs',list(logic.clickIds)],['Attribution cookies',list(logic.attributionCookies)]]},
    ];
  },[logic,summary]);

  if(!logic)return null;
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-[var(--border-soft)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--mon-fg)]">Platform-specific detection</p><h3 className="mt-1 font-display text-[17px] font-semibold tracking-tight text-[var(--text)]">{names[vendor]||logic.label} rules applied</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--text-2)]">This destination uses its own endpoint, identity, implementation, consent, revenue and attribution semantics.</p></div>
      <div className="flex items-center gap-2"><span className="rounded-full border border-[var(--ok-bd)] bg-[var(--ok-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ok-fg)]">8 governance layers</span><span className="rounded-full border border-[var(--mon)] bg-[var(--mon-tint)] px-2.5 py-1 text-[10px] font-semibold text-[var(--mon-fg)]">Platform aware</span></div>
    </div>
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {sections.map(s=>{const expanded=open===s.key;return <button key={s.key} type="button" onClick={()=>setOpen(expanded?null:s.key)} className="text-left rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--border-strong)]">
        <div className="flex items-center gap-3"><span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-[var(--mon-tint)] text-[10px] font-bold text-[var(--mon-fg)]">{s.title.split(' ').map(x=>x[0]).join('').slice(0,2)}</span><span className="flex-1 text-sm font-semibold text-[var(--text)]">{s.title}</span><span className="text-[var(--text-3)]">{expanded?'−':'+'}</span></div>
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-3)]">{s.lead}</p>
        {expanded?<div className="mt-4 space-y-2 border-t border-[var(--border-soft)] pt-3">{s.rows.map(([k,v])=><div key={k} className="flex items-start justify-between gap-4"><span className="text-[10px] font-semibold uppercase tracking-[.05em] text-[var(--text-3)]">{k}</span><span className="max-w-[68%] text-right text-[11px] font-medium leading-4 text-[var(--text-2)]">{v}</span></div>)}</div>:null}
      </button>})}
    </div>
    <div className="border-t border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-3"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[var(--text-3)]"><span><b className="text-[var(--text-2)]">{summary?.events_defined||0}</b> platform event rules</span><span><b className="text-[var(--text-2)]">{summary?.parameters||0}</b> parameter observations</span><span><b className="text-[var(--text-2)]">{summary?.issues||0}</b> current issues</span><span><b className="text-[var(--text-2)]">{logic.baseline?.lookbackDays||28}d</b> anomaly baseline</span></div></div>
  </section>;
}
