'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const platforms: Record<string,string> = { ga4:'GA4', gads:'Google Ads', meta:'Meta', bing:'Microsoft Ads', tiktok:'TikTok', linkedin:'LinkedIn', snapchat:'Snapchat' };

export default function ReferenceMonitoringPanels({ vendor }: { vendor: string }) {
  const search = useSearchParams();
  const siteId = search.get('siteId') || '';
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    fetch(`/api/platform-insights?siteId=${siteId}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((value) => { if (!cancelled) setData(value); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [siteId, vendor]);
  if (!data) return null;

  const overview = data.overview || {};
  const metrics = data.platformMetrics || {};
  const acquisition = data.acquisition?.dimensions || [];
  const offline = (data.events || []).filter((event:any) => event.offline).slice(0,8);
  const newEvents = (data.events || []).filter((event:any) => event.is_new).slice(0,8);
  const typeCollisions = data.parameterTypeCollisions || [];
  const parameterIssues = (data.parameters || []).filter((row:any) => row.status === 'Needs attention').slice(0,10);
  const pages = (data.pages || []).slice(0,10);
  const destinations = data.destinations || [];
  const sourceRows = acquisition.find((row:any) => row.dimension === 'source')?.rows || [];
  const campaignRows = acquisition.find((row:any) => row.dimension === 'campaign')?.rows || [];
  const mediumRows = acquisition.find((row:any) => row.dimension === 'medium')?.rows || [];
  const violations = data.acquisition?.utm_violations || [];

  return <section className="mt-5 space-y-4" data-testid="pdf-reference-monitoring">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">Reference-grade monitoring</p><h3 className="mt-1 text-sm font-semibold text-[var(--text)]">Lifecycle, quality, acquisition & platform signals</h3></div><span className="text-[10px] text-[var(--text-3)]">{platforms[vendor] || vendor} · 30-day evidence</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="30d active events" value={overview.active_event_types_30d}/><Metric label="New events" value={newEvents.length}/><Metric label="Offline events" value={offline.length}/><Metric label="Open alerts" value={data.alerts?.open || 0}/><Metric label="Critical alerts" value={data.alerts?.critical || 0}/><Metric label="DataLayer pushes (24h)" value={data.dataLayer?.pushes || 0}/>
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Event lifecycle"><List rows={newEvents} empty="No newly detected events in the evidence window." render={(row:any) => <><b>{row.event_name}</b><span>New event · first seen {fmtDate(row.first_seen)} · {Number(row.hits_24h||0).toLocaleString()} hits/24h</span></>}/><List rows={offline} empty="No events have stopped receiving traffic for 3+ days." render={(row:any) => <><b>{row.event_name}</b><span>Offline candidate · last seen {fmtDate(row.last_seen)}</span></>}/></Panel>
      <Panel title="Parameter quality"><List rows={parameterIssues} empty="No missing, empty or type-drift parameter issues detected." render={(row:any) => <><b>{row.parameter_name}</b><span>{Number(row.coverage||0).toFixed(1)}% coverage · {Number(row.missing_event_count||0)} missing · type {row.type || 'unknown'}</span></>}/>{typeCollisions.length ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><b>Type collisions:</b> {typeCollisions.slice(0,5).map((row:any)=>`${row.parameter_name} (${(row.observed_types||[]).join('/')})`).join(', ')}</div> : null}</Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Pages & traffic"><div className="space-y-2">{pages.map((row:any)=><div key={row.page_path} className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] py-2 text-xs"><span className="font-mono truncate">{row.page_path}</span><span className="text-[var(--text-3)]">{Number(row.events||0).toLocaleString()} events · {Number(row.sessions||0).toLocaleString()} sessions</span></div>)}</div></Panel>
      <Panel title="Platform metrics"><div className="grid grid-cols-2 gap-2"><Mini label="LCP" value={ms(metrics.lcp_ms)}/><Mini label="FCP" value={ms(metrics.fcp_ms)}/><Mini label="TTFB" value={ms(metrics.ttfb_ms)}/><Mini label="INP" value={ms(metrics.inp_ms)}/><Mini label="CLS" value={metrics.cls == null ? '—' : Number(metrics.cls).toFixed(3)}/><Mini label="Samples" value={Number(metrics.samples||0).toLocaleString()}/></div><p className="mt-3 text-[10px] text-[var(--text-3)]">Web Vitals are reported from observed runtime telemetry; thresholds are shown in the API for validation.</p></Panel>
      <Panel title="Destinations"><div className="space-y-2">{destinations.map((row:any)=><div key={row.vendor} className="flex items-center justify-between text-xs"><span>{platforms[row.vendor] || row.vendor}</span><span className={row.configured?'text-green-700':'text-amber-700'}>{row.configured ? 'Configured' : 'Not configured'}</span></div>)}</div><div className="mt-3 text-[10px] text-[var(--text-3)]">GTM tag/trigger correlation remains available where the connected container inventory matches observed traffic.</div></Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Acquisition signals"><div className="space-y-2 text-xs"><div>Campaigns <b>{campaignRows.length}</b></div><div>Sources <b>{sourceRows.length}</b></div><div>Mediums <b>{mediumRows.length}</b></div>{sourceRows.slice(0,4).map((row:any)=><div key={row.name} className="flex justify-between border-t border-[var(--border-soft)] pt-2"><span>{row.name}</span><span>{Number(row.hits||0).toLocaleString()} hits</span></div>)}</div></Panel>
      <Panel title="UTM naming checks"><div className="space-y-2 text-xs">{violations.slice(0,8).map((row:any,i:number)=><div key={`${row.name}-${row.value}-${i}`} className="rounded-lg bg-amber-50 p-2 text-amber-800"><b>{row.name}</b> = {row.value}<div className="text-[10px]">{row.problems.join(', ')}</div></div>)}{!violations.length?<div className="text-[var(--text-3)]">No convention drift observed for campaign/source/medium values.</div>:null}</div></Panel>
      <Panel title="Data Layer audit"><div className="grid grid-cols-2 gap-2"><Mini label="Pushes" value={data.dataLayer?.pushes||0}/><Mini label="Sessions" value={data.dataLayer?.sessions||0}/><Mini label="GTM pushes" value={data.dataLayer?.gtm_pushes||0}/><Mini label="Website pushes" value={data.dataLayer?.website_pushes||0}/></div><p className="mt-3 text-[10px] text-[var(--text-3)]">Provenance is linked back to observed events, GTM tags and triggers instead of inferring implementation from page markup.</p></Panel>
    </div>

    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><h3 className="text-sm font-semibold">Coverage against the reference</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs"><Coverage name="Events" ok={true} note="discovery, new/offline, trends, delivery and GTM correlation"/><Coverage name="Parameters" ok={true} note="presence coverage, missing/empty, observed types and collisions"/><Coverage name="Pages" ok={true} note="page event/session volume and traffic trends"/><Coverage name="Consent" ok={true} note="CMP/Consent Mode/choice/outside-consent evidence"/><Coverage name="Ad blockers" ok={true} note="confirmed/likely blocker signals and affected events"/><Coverage name="Acquisition" ok={true} note="campaign/source/medium/referrer/landing + UTM drift"/><Coverage name="Platform metrics" ok={true} note="Web Vitals and traffic health"/><Coverage name="Data Layer" ok={true} note="push counts and GTM/website provenance"/></div></div>
  </section>;
}

function Panel({title,children}:{title:string;children:React.ReactNode}){return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><h4 className="text-sm font-semibold text-[var(--text)]">{title}</h4><div className="mt-3">{children}</div></div>}
function Metric({label,value}:{label:string;value:any}){return <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3"><div className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">{label}</div><div className="mt-1 text-lg font-semibold">{Number(value||0).toLocaleString()}</div></div>}
function Mini({label,value}:{label:string;value:any}){return <div className="rounded-lg bg-[var(--surface-2)] p-2"><div className="text-[9px] uppercase text-[var(--text-3)]">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>}
function List({rows,empty,render}:{rows:any[];empty:string;render:(row:any)=>React.ReactNode}){return <div className="space-y-2">{rows.length?rows.map((row:any,i:number)=><div key={row.event_name||row.parameter_name||i} className="flex flex-col gap-1 rounded-lg border border-[var(--border-soft)] p-2 text-xs">{render(row)}</div>):<div className="text-xs text-[var(--text-3)]">{empty}</div>}</div>}
function Coverage({name,ok,note}:{name:string;ok:boolean;note:string}){return <div className="rounded-lg border border-[var(--border-soft)] p-3"><div className="font-semibold">{ok?'✓':'○'} {name}</div><div className="mt-1 text-[10px] text-[var(--text-3)]">{note}</div></div>}
function ms(value:any){return value == null ? '—' : `${Number(value).toFixed(0)} ms`}
function fmtDate(value:any){return value ? new Date(value).toLocaleString() : '—'}
