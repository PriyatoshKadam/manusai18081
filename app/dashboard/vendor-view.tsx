'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  if (vendor === 'meta') return 'Page view';
  if (vendor === 'linkedin') return 'Page view';
  if (vendor === 'bing') return 'Page loaded';
  if (vendor === 'snapchat') return 'Page view';
  if (vendor === 'gads')   return event.conversion_label || event.conversion_id ? `${event.conversion_label || 'Conversion'}${event.conversion_id ? ` · ${event.conversion_id}` : ''}` : 'Conversion';
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

export default function VendorView({ vendor, label, id }: { vendor: string; label: string; id: string | null }) {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);

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
  const totalEvents = events.reduce((sum: number, e: any) => sum + Number(e.cnt || 0), 0);
  const uniqueNames = events.length;
  const errorCount = alerts.length;
  const parameterRows = events.filter((event: any) => Array.isArray(event.parameter_statuses) && event.parameter_statuses.some((status: string) => ['complete', 'missing'].includes(status)));
  const parameterSamples = parameterRows.reduce((sum: number, event: any) => sum + Number(event.cnt || 0), 0);
  const parameterComplete = parameterRows.reduce((sum: number, event: any) => sum + (Array.isArray(event.missing_parameters) && event.missing_parameters.some((item: any) => Array.isArray(item) && item.length) ? 0 : Number(event.cnt || 0)), 0);
  const parameterHealth = parameterSamples < 30 ? `Collecting (${parameterSamples}/30)` : `${Math.round((parameterComplete / Math.max(1, parameterSamples)) * 1000) / 10}%`;

  return (
    <div className="fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text)]">{label}</h2>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            {id ? <>ID: <span className="mono">{id}</span> · </> : null}
            <span className="text-[var(--ok-fg)]">Tracking is active</span>
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs uppercase text-[var(--text-3)]">Actions seen (24h)</div><div className="mt-1 font-sans text-kpi leading-[1.1] text-[var(--text)]">{totalEvents.toLocaleString()}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs uppercase text-[var(--text-3)]">Different actions</div><div className="mt-1 font-sans text-kpi leading-[1.1] text-[var(--text)]">{uniqueNames}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs uppercase text-[var(--text-3)]">Things to check</div><div className={`mt-1 font-sans text-kpi leading-[1.1] ${errorCount ? 'text-[var(--crit-fg)]' : 'text-[var(--text)]'}`}>{errorCount}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs uppercase text-[var(--text-3)]">Required details</div><div className={`mt-1 font-sans text-kpi leading-[1.1] ${parameterSamples < 30 ? 'text-[var(--accent)]' : parameterComplete === parameterSamples ? 'text-[var(--ok-fg)]' : 'text-[var(--warn-fg)]'}`}>{parameterHealth}</div><div className="mt-1 text-xs text-[var(--text-3)]">Based on tracking actions seen</div></div>
      </div>

      <div className="mb-6 grid gap-5 xl:grid-cols-2"><EventSessionChart events={events} /><SourceLaneChart sources={data.sources || []} /></div>

      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] p-4"><h3 className="font-display font-semibold text-[var(--text)]">Actions we saw</h3><div className="text-xs text-[var(--text-3)]">Most frequent first</div></div>
        {events.length === 0 ? <div className="p-8 text-center text-sm text-[var(--text-3)]">No {label} activity yet. Add the GAfix tag to start seeing it here.</div> : <table className="w-full text-sm"><thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-3)]"><tr><th className="px-4 py-2 text-left font-medium">Action</th><th className="px-4 py-2 text-left font-medium">Kind of action</th><th className="px-4 py-2 text-left font-medium">Tag setup</th><th className="px-4 py-2 text-left font-medium">Required details</th><th className="px-4 py-2 text-right font-medium">Times seen</th><th className="px-4 py-2 text-right font-medium">Visitor sessions</th><th className="px-4 py-2 text-right font-medium">Response time</th><th className="px-4 py-2 text-right font-medium">Problems</th><th className="px-4 py-2 text-left font-medium">How it looks</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{events.map((e: any, i: number) => { const hasAlert = alerts.find((a: any) => a.event_name === e.event_name); return <tr key={i} className="hover:bg-[var(--surface-2)]"><td className="px-4 py-3 mono text-[var(--text)]">{eventDisplayName(e, vendor)} {vendor === 'gads' && e.event_name && (e.conversion_label || e.conversion_id) ? <span className="block text-[10px] text-[var(--text-3)] not-italic">{e.conversion_label || 'Conversion'}{e.conversion_id ? ` · ${e.conversion_id}` : ''}</span> : null}{(['meta', 'linkedin', 'bing', 'snapchat'].includes(vendor)) && e.platform_id ? <span className="block text-[10px] text-[var(--text-3)] not-italic">{platformIdentifierLabel(vendor)}: {e.platform_id}</span> : null}</td><td className="px-4 py-3 text-[var(--text-3)] capitalize">{eventTypeDisplay(e.event_type)}</td><td className="px-4 py-3"><div className="max-w-[190px] truncate text-[var(--text)]" title={tagSummary(e)}>{tagSummary(e)}</div>{e.gtm_trigger_names?.length ? <div className="max-w-[190px] truncate text-[10px] text-[var(--text-3)]" title={e.gtm_trigger_names.join(', ')}>Runs when: {e.gtm_trigger_names.join(', ')}</div> : null}</td><td className="px-4 py-3"><ParameterHealth event={e} /></td><td className="px-4 py-3 text-right font-medium text-[var(--text)]">{Number(e.cnt).toLocaleString()}</td><td className="px-4 py-3 text-right text-[var(--text-3)]">{Number(e.sessions || 0).toLocaleString()}</td><td className="px-4 py-3 text-right text-[var(--text-3)]">{Number(e.avg_latency_ms || 0) ? `${Number(e.avg_latency_ms).toLocaleString()} ms` : 'Not available'}</td><td className={`px-4 py-3 text-right ${Number(e.failed || 0) ? 'font-medium text-[var(--crit-fg)]' : 'text-[var(--text-3)]'}`}>{Number(e.failed || 0) ? `${Number(e.failed || 0).toLocaleString()} problem${Number(e.failed || 0) === 1 ? '' : 's'}` : 'None'}</td><td className="px-4 py-3">{hasAlert ? <Pill tone="warn" dot={false}>Needs attention</Pill> : <Pill tone="ok" dot={false}>Looks good</Pill>}</td></tr>; })}</tbody></table>}
      </div>

      {alerts.length > 0 && <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="border-b border-[var(--border-soft)] p-4"><h3 className="font-display font-semibold text-[var(--text)]">Things to check for {label}</h3></div><div className="divide-y divide-[var(--border-soft)]">{alerts.map((a: any) => <button key={a.id} onClick={() => setSelectedAlert(a)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-[var(--surface-2)]"><SeverityChip severity={a.severity} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-[var(--text)]">{plainAlertMessage(a)}</div>{a.event_name && <div className="mt-0.5 text-xs text-[var(--text-3)]">Action: {friendlyEventDisplayName(a.event_name)} <span className="mono text-[var(--text-3)]">({a.event_name})</span></div>}</div><span className="text-xs text-[var(--text-3)]">{timeAgo(a.created_at)}</span></button>)}</div></div>}
      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}
