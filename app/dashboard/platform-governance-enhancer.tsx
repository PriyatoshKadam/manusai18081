'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

type VendorSummary={vendor:string;label:string;summary:{events_defined:number;events_observed:number;healthy:number;warnings:number;custom:number;missing_events:number;parameters:number;issues:number;duplicates:number;delivery_failures:number;consent_affected:number;blocker_signals:number}};

export default function PlatformGovernanceEnhancer({vendor}:{vendor:string}){
 const search=useSearchParams(); const siteId=search.get('siteId')||'';
 useEffect(()=>{
  if(!siteId||!vendor)return; let cancelled=false; let timer:any;
  const render=async()=>{
   try{
    const res=await fetch(`/api/platform-governance?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`,{cache:'no-store'}); if(!res.ok)return; const data=await res.json(); if(cancelled)return;
    const s:VendorSummary|undefined=Array.isArray(data.vendors)?data.vendors[0]:undefined; if(!s)return;
    let node=document.getElementById('platform-governance-contract');
    if(!node){node=document.createElement('section');node.id='platform-governance-contract';node.className='rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4';const nav=document.querySelector('nav');nav?.parentElement?.insertBefore(node,nav.nextSibling);}
    const x=s.summary; const status=x.warnings>0?'Needs attention':x.missing_events>0?'Needs attention':'Healthy';
    node.innerHTML=`<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--text-3)]">Platform governance contract</div><div class="mt-1 text-sm font-semibold text-[var(--text)]">${s.label} · ${status}</div><div class="mt-1 text-[11px] text-[var(--text-2)]">Platform-specific event and parameter rules are evaluated against observed telemetry. Network-only properties are not treated as GTM errors.</div></div><div class="flex flex-wrap gap-2 text-[10px]"><span class="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">${x.healthy} healthy</span><span class="rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">${x.warnings} warnings</span><span class="rounded-full bg-sky-500/10 px-2 py-1 text-sky-300">${x.custom} custom</span><span class="rounded-full bg-rose-500/10 px-2 py-1 text-rose-300">${x.issues} issues</span></div></div><div class="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4 lg:grid-cols-8"><div><b>${x.events_defined}</b><span> event rules</span></div><div><b>${x.events_observed}</b><span> observed</span></div><div><b>${x.parameters}</b><span> parameter rules</span></div><div><b>${x.missing_events}</b><span> missing events</span></div><div><b>${x.duplicates}</b><span> duplicate signals</span></div><div><b>${x.delivery_failures}</b><span> delivery failures</span></div><div><b>${x.consent_affected}</b><span> consent signals</span></div><div><b>${x.blocker_signals}</b><span> blocker signals</span></div></div>`;
   }catch{}
  };
  render(); timer=setInterval(render,30000); return()=>{cancelled=true;clearInterval(timer);document.getElementById('platform-governance-contract')?.remove();};
 },[siteId,vendor]);
 return null;
}
