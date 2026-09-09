'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AlertModal from './alert-modal';
import { Pill, SeverityChip, timeAgo } from './ui';
import { EventSessionChart, SourceLaneChart } from './event-analytics';
import { eventDisplayName as friendlyEventDisplayName, eventTypeDisplay, plainAlertMessage } from './plain-language';

function tagSummary(event: any) {
  const names = Array.isArray(event.gtm_tag_names) ? event.gtm_tag_names.filter(Boolean) : [];
  if (names.length > 1 || event.gtm_correlation_confidence === 'ambiguous') return 'Several possible tag setups';
  if (names.length === 1) return `${names[0]}${event.gtm_correlation_confidence === 'likely_match' ? ' · possible match' : ''}`;
  return event.gtm_correlation_confidence === 'unmatched' || !event.gtm_correlation_confidence ? 'Setup not confirmed' : 'Setup match unavailable';
}
function missingParameterNames(event: any) {
  const values = Array.isArray(event.missing_parameters) ? event.missing_parameters.flatMap((value: any) => Array.isArray(value) ? value : []) : [];
  const labels: Record<string, string> = { id: 'pixel_id', ev: 'event_name', pid: 'partner_id', pids: 'pixel_id', ti: 'uet_tag_id', tag_id: 'uet_tag_id', tid: 'conversion_id' };
  return [...new Set(values.filter(Boolean).map((value: string) => labels[value] || value))];
}
function eventDisplayName(event: any, vendor: string) {
  if (event.event_name) return friendlyEventDisplayName(event.event_name);
  if (vendor === 'meta' || vendor === 'linkedin' || vendor === 'snapchat') return 'Page view';
  if (vendor === 'bing') return 'Page loaded';
  if (vendor === 'gads') return event.conversion_label || event.conversion_id ? `${event.conversion_label || 'Conversion'}${event.conversion_id ? ` · ${event.conversion_id}` : ''}` : 'Conversion';
  return 'Event name not found';
}
function platformIdentifierLabel(vendor: string) {
  if (vendor === 'meta') return 'Pixel ID';
  if (vendor === 'linkedin') return 'Partner ID';
  if (vendor === 'bing') return 'UET Tag ID';
  if (vendor === 'snapchat') return 'Pixel ID';
  return 'Platform ID';
}
function ParameterHealth({ event }: { event: any }) {
  const missing = missingParameterNames(event);
  if (missing.length) return <Pill tone="crit" dot={false} title={`This action is missing: ${missing.join(', ')}`}>Missing: {missing.join(', ')}</Pill>;
  const statuses = Array.isArray(event.parameter_statuses) ? event.parameter_statuses : [];
  if (statuses.includes('complete')) return <Pill tone="ok" dot={false}>Complete</Pill>;
  return <span className="text-xs text-[var(--text-3)]">Not needed for this action</span>;
}
function platformTone(vendor: string) {
  if (vendor === 'ga4') return 'var(--accent)';
  if (vendor === 'gads') return '#4285F4';
  if (vendor === 'meta') return '#1877F2';
  if (vendor === 'bing') return '#0AA3FF';
  if (vendor === 'linkedin') return '#0A66C2';
  if (vendor === 'tiktok') return '#111111';
  if (vendor === 'snapchat') return '#F4D35E';
  return 'var(--accent)';
}

export default function VendorViewPdf({ vendor, label, id }: { vendor: string; label: string; id: string | null }) {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [tab, setTab] = useState<'overview' | 'events' | 'details' | 'pages' | 'consent' | 'adblocks'>('events');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Info' | 'Needs attention' | 'Worth checking' | 'New Event'>('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!siteId) return;
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
    async function load() {
      try {
        const res = await fetch(`/api/events?siteId=${siteId}&vendor=${vendor}`);
        if (res.ok) setData(await res.json());
      } catch {}
    }
  }, [siteId, vendor]);

  if (!siteId) return <div className="text-sm text-[var(--text-3)]">Select a site to view {label} data.</div>;
  if (!data) return <div className="text-sm text-[var(--text-3)]">Loading…</div>;

  const events = data.events || [];
  const alerts = (data.alerts || []).filter((a: any) => !a.vendor || a.vendor === vendor);
  const pages = data.pages || [];
  const consent = data.consent || data.consent_events || [];
  const blocked = data.blocked || data.blocked_events || [];
  const totalEvents = events.reduce((sum: number, e: any) => sum + Number(e.cnt || 0), 0);
  const uniqueNames = events.length;
  const errorCount = alerts.length;
  const parameterRows = events.filter((event: any) => Array.isArray(event.parameter_statuses) && event.parameter_statuses.some((status: string) => ['complete', 'missing'].includes(status)));
  const parameterSamples = parameterRows.reduce((sum: number, event: any) => sum + Number(event.cnt || 0), 0);
  const parameterComplete = parameterRows.reduce((sum: number, event: any) => sum + (Array.isArray(event.missing_parameters) && event.missing_parameters.some((item: any) => Array.isArray(item) && item.length) ? 0 : Number(event.cnt || 0)), 0);
  const parameterHealth = parameterSamples < 30 ? `Collecting (${parameterSamples}/30)` : `${Math.round((parameterComplete / Math.max(1, parameterSamples)) * 1000) / 10}%`;

  const filteredEvents = events.filter((e: any) => {
    const alert = alerts.find((a: any) => a.event_name === e.event_name);
    const status = alert ? (alert.severity === 'critical' ? 'Needs attention' : 'Worth checking') : (e.is_new ? 'New Event' : 'Info');
    const normalized = query.trim().toLowerCase();
    const haystack = `${eventDisplayName(e, vendor)} ${e.event_name || ''} ${e.gtm_tag_names?.join(' ') || ''}`.toLowerCase();
    return (statusFilter === 'All' || status === statusFilter) && (!normalized || haystack.includes(normalized));
  });

  const tabs = [
    { key: 'overview', label: 'Overview', count: null },
    { key: 'events', label: 'Events', count: events.length },
    { key: 'details', label: 'Event details', count: parameterRows.length },
    { key: 'pages', label: 'Pages', count: pages.length },
    { key: 'consent', label: 'Consent', count: consent.length },
    { key: 'adblocks', label: 'Ad blockers', count: blocked.length },
  ] as const;

  return (
    <div className="fade-in mx-auto max-w-[1500px]">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text)]">{label}</h1>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Production · GA4 + GTM · last seen a few minutes ago</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">3 of 6 connections healthy, 1 needs a look.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-2)]">Last 14 days</button>
          <Link href={`/dashboard/install?siteId=${siteId}`} className="rounded-full bg-[#f56f1a] px-3.5 py-1.5 text-xs font-semibold text-white">Manage script</Link>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm"><span className="font-semibold text-[var(--text)]">Destinations</span><span className="text-xs text-[var(--text-3)]">3 active · 1 warning · 3 not connected</span></div>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ['Google Analytics 4', 'Active', vendor === 'ga4' ? alerts.length : 4, 'ga4'],
          ['Google Ads', 'Active', vendor === 'gads' ? alerts.length : 1, 'gads'],
          ['Meta', 'Active', vendor === 'meta' ? alerts.length : 4, 'meta'],
          ['Microsoft Ads', 'Paused', 0, 'bing'],
          ['TikTok', 'Add', 0, 'tiktok'],
          ['LinkedIn', 'Add', 0, 'linkedin'],
          ['Snapchat', 'Add', 0, 'snapchat'],
        ].map(([name, state, issues, destinationVendor]) => (
          <div key={name} className="rounded-xl border bg-[var(--surface)] p-3 shadow-sm" style={{ borderColor: destinationVendor === vendor ? 'var(--mon)' : 'var(--border)' }}>
            <div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold text-[var(--text)]">{name}</span><span className="text-[10px] text-[var(--text-3)]">{state}</span></div>
            <div className="mt-2 text-[10px] text-[var(--text-3)]">{state === 'Add' ? 'Add' : issues ? `${issues} things to check` : 'Nothing to check'}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--border)] px-4 pt-4 lg:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: platformTone(vendor) + '18', color: platformTone(vendor) }}><span className="text-xs font-bold">{vendor === 'ga4' ? 'GA' : label.slice(0, 2)}</span></span>
            <div className="min-w-0"><h2 className="font-display text-lg font-semibold text-[var(--text)]">{label}</h2><p className="text-xs text-[var(--text-3)]">Search for a specific event, like “purchase” or “signup” — optional.</p></div>
            {id ? <span className="mono ml-auto hidden text-[10px] text-[var(--text-3)] md:block">ID: {id}</span> : null}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"><span className="text-xs text-[var(--text-3)]">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Example: name:purchase label: #ecommerce" className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-3)]" /></div>
          <p className="mt-2 text-xs text-[var(--text-3)]">Gain insight into what this destination is receiving, and where the data breaks. <span className="font-medium text-[#d26a2a]">Learn more.</span></p>
          <div className="mt-3 flex overflow-x-auto gap-5">
            {tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`whitespace-nowrap border-b-2 px-1 pb-2.5 text-[11px] font-semibold ${tab === item.key ? 'border-[var(--text)] text-[var(--text)]' : 'border-transparent text-[var(--text-3)]'}`}>{item.label}{item.count !== null ? <span className="ml-1 text-[10px]">({item.count})</span> : null}</button>)}
          </div>
        </div>

        {tab === 'overview' ? <div className="p-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4"><div className="text-[10px] uppercase text-[var(--text-3)]">Health</div><div className="mt-2 text-2xl font-semibold">82%</div></div><div className="rounded-xl border p-4"><div className="text-[10px] uppercase text-[var(--text-3)]">Events</div><div className="mt-2 text-2xl font-semibold">{uniqueNames}</div></div><div className="rounded-xl border p-4"><div className="text-[10px] uppercase text-[var(--text-3)]">Things to check</div><div className="mt-2 text-2xl font-semibold">{errorCount}</div></div></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><EventSessionChart events={events} /><SourceLaneChart sources={data.sources || []} /></div></div> : null}

        {tab === 'events' ? <div className="p-4 lg:p-5"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-3)]">Status</span>{(['All', 'Info', 'Needs attention', 'Worth checking', 'New Event'] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`rounded-full border px-3 py-1 text-[10px] font-medium ${statusFilter === status ? 'border-[#e8b78d] bg-[#fff7ef] text-[#a85b22]' : 'border-[var(--border)] text-[var(--text-2)]'}`}>{status}</button>)}</div><div className="overflow-hidden rounded-xl border border-[var(--border)]"><div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-3"><div className="text-sm font-semibold">Events <span className="font-normal text-[var(--text-3)]">{filteredEvents.length} shown</span></div><div className="mt-0.5 text-[10px] text-[var(--text-3)]">Every action visitors take that gets tracked, like purchases, signups, and clicks.</div></div>{filteredEvents.length === 0 ? <div className="p-10 text-center text-sm text-[var(--text-3)]">No matching {label} activity yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-[var(--surface-2)] text-[9px] uppercase tracking-[.12em] text-[var(--text-3)]"><tr><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Event name</th><th className="px-3 py-2 text-left">Daily hits · day / week / 30d</th><th className="px-3 py-2 text-left">Notes</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{filteredEvents.map((e: any, i: number) => { const alert = alerts.find((a: any) => a.event_name === e.event_name); const isNew = Boolean(e.is_new); const tone = alert?.severity === 'critical' ? 'crit' : alert ? 'warn' : isNew ? 'info' : 'ok'; const statusText = alert?.severity === 'critical' ? 'Needs attention' : alert ? 'Worth checking' : isNew ? 'New Event' : 'Info'; const note = alert ? plainAlertMessage(alert) : e.note || (isNew ? `First seen ${timeAgo(e.first_seen || e.created_at)}` : 'Nothing to flag'); return <tr key={`${e.event_name}-${i}`} className="hover:bg-[var(--surface-2)]"><td className="px-3 py-3"><Pill tone={tone as any} dot={false}>{statusText}</Pill></td><td className="px-3 py-3"><div className="font-mono text-xs text-[var(--text)]">{eventDisplayName(e, vendor)}</div><span className="mt-1 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[9px] text-[var(--text-3)]">{eventTypeDisplay(e.event_type)}</span></td><td className="px-3 py-3"><div className="flex items-center gap-2"><svg viewBox="0 0 96 24" className="h-5 w-20"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={Array.from({ length: 12 }, (_, n) => `${n * 8},${12 + Math.round(Math.sin(n * .9 + i) * 5)}`).join(' ')} /></svg><span className="font-mono text-xs font-semibold">{Number(e.cnt || 0).toLocaleString()}</span><span className="font-mono text-[9px] text-[var(--text-3)]">{Number(e.week || Math.round(Number(e.cnt || 0) * 7)).toLocaleString()} · {Number(e.month || Math.round(Number(e.cnt || 0) * 30)).toLocaleString()}</span></div></td><td className="px-3 py-3 text-xs text-[var(--text-3)]">{note}</td></tr>; })}</tbody></table></div>}</div></div> : null}

        {tab === 'details' ? <div className="p-5"><div className="rounded-xl border overflow-hidden"><div className="border-b bg-[var(--surface-2)] p-3"><h3 className="text-sm font-semibold">Event details <span className="font-normal text-[var(--text-3)]">{parameterRows.length} shown</span></h3></div>{parameterRows.length ? <table className="w-full text-sm"><tbody className="divide-y divide-[var(--border-soft)]">{parameterRows.slice(0, 20).map((event: any, i: number) => { const missing = missingParameterNames(event); const names = Array.isArray(event.parameter_names) && event.parameter_names.length ? event.parameter_names : missing; return names.slice(0, 5).map((name: string, j: number) => <tr key={`${i}-${j}`}><td className="p-3"><Pill tone={missing.includes(name) ? 'crit' : 'ok'} dot={false}>{missing.includes(name) ? 'Needs attention' : 'Info'}</Pill></td><td className="p-3 font-mono">{name}</td><td className="p-3"><div className="h-2 w-40 rounded-full bg-[var(--surface-3)]"><div className={`h-2 rounded-full ${missing.includes(name) ? 'w-1/3 bg-[var(--crit-fg)]' : 'w-full bg-[var(--ok-dot)]'}`} /></div></td><td className="p-3 text-xs text-[var(--text-3)]">{missing.includes(name) ? `Missing for ${eventDisplayName(event, vendor)}` : 'Nothing to flag'}</td></tr>); })}</tbody></table> : <div className="p-8 text-center text-sm text-[var(--text-3)]">No event-detail evidence yet.</div>}</div></div> : null}

        {tab === 'pages' ? <DataTable title="Pages" rows={pages} columns={['page_name', 'events', 'sessions', 'note']} empty="No page-level evidence is available yet." /> : null}
        {tab === 'consent' ? <DataTable title="Consent" rows={consent} columns={['status', 'sessions', 'event_name', 'note']} empty="No consent evidence is available yet." /> : null}
        {tab === 'adblocks' ? <DataTable title="Ad blockers" rows={blocked} columns={['event_name', 'blocked', 'sessions', 'note']} empty="No blocker evidence is available yet." /> : null}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2"><EventSessionChart events={events} /><SourceLaneChart sources={data.sources || []} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4"><Metric label="Actions seen (24h)" value={totalEvents.toLocaleString()} /><Metric label="Different actions" value={String(uniqueNames)} /><Metric label="Things to check" value={String(errorCount)} /><Metric label="Required details" value={parameterHealth} /></div>

      {alerts.length > 0 && <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)]"><div className="border-b border-[var(--border-soft)] p-4"><h3 className="font-display font-semibold text-[var(--text)]">Things to check for {label}</h3></div><div className="divide-y divide-[var(--border-soft)]">{alerts.map((a: any) => <button key={a.id} onClick={() => setSelectedAlert(a)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-[var(--surface-2)]"><SeverityChip severity={a.severity} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-[var(--text)]">{plainAlertMessage(a)}</div>{a.event_name && <div className="mt-0.5 text-xs text-[var(--text-3)]">Action: {friendlyEventDisplayName(a.event_name)} <span className="mono text-[var(--text-3)]">({a.event_name})</span></div>}</div><span className="text-xs text-[var(--text-3)]">{timeAgo(a.created_at)}</span></button>)}</div></section>}
      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-[10px] uppercase tracking-[.08em] text-[var(--text-3)]">{label}</div><div className="mt-1 text-lg font-semibold text-[var(--text)]">{value}</div></div>; }
function DataTable({ title, rows, columns, empty }: { title: string; rows: any[]; columns: string[]; empty: string }) { return <div className="p-5"><div className="rounded-xl border border-[var(--border)] overflow-hidden"><div className="border-b bg-[var(--surface-2)] p-3"><h3 className="text-sm font-semibold">{title} <span className="font-normal text-[var(--text-3)]">{rows.length} shown</span></h3></div>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--surface-2)] text-[9px] uppercase text-[var(--text-3)]"><tr>{columns.map((column) => <th key={column} className="p-3 text-left">{column.replaceAll('_', ' ')}</th>)}</tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{rows.slice(0, 30).map((row, i) => <tr key={i}>{columns.map((column) => <td key={column} className="p-3 text-[var(--text-2)]">{String(row?.[column] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-[var(--text-3)]">{empty}</div>}</div></div>; }
