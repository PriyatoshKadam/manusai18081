'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AlertModal from './alert-modal';
import { SeverityChip, timeAgo } from './ui';
import { EventSessionChart, SourceLaneChart } from './event-analytics';

function tagSummary(event: any) {
  const names = Array.isArray(event.gtm_tag_names) ? event.gtm_tag_names.filter(Boolean) : [];
  if (names.length > 1 || event.gtm_correlation_confidence === 'ambiguous') return 'Multiple possible tags';
  if (names.length === 1) return `${names[0]}${event.gtm_correlation_confidence === 'likely_match' ? ' · likely' : ''}`;
  return event.gtm_correlation_confidence === 'unmatched' || !event.gtm_correlation_confidence ? 'Not matched' : 'Configuration match unavailable';
}
function missingParameterNames(event: any) {
  const values = Array.isArray(event.missing_parameters) ? event.missing_parameters.flatMap((value: any) => Array.isArray(value) ? value : []) : [];
  const labels: Record<string, string> = { id: 'pixel_id', ev: 'event_name', pid: 'partner_id', tid: 'conversion_id' };
  return [...new Set(values.filter(Boolean).map((value: string) => labels[value] || value))];
}
function eventDisplayName(event: any, vendor: string) {
  if (event.event_name) return event.event_name;
  if (vendor === 'meta') return 'PageView';
  if (vendor === 'linkedin') return 'page_view';
  if (vendor === 'gads') return event.conversion_label || event.conversion_id ? `${event.conversion_label || 'Conversion'}${event.conversion_id ? ` · ${event.conversion_id}` : ''}` : 'conversion';
  return '(unnamed)';
}
function platformIdentifierLabel(vendor: string) {
  if (vendor === 'meta') return 'Pixel ID';
  if (vendor === 'linkedin') return 'Partner ID';
  return 'Platform ID';
}
function ParameterHealth({ event }: { event: any }) {
  const missing = missingParameterNames(event);
  if (missing.length) return <span className="pill bg-[#ff718d]/10 text-[#ff9aae]" title={`Missing: ${missing.join(', ')}`}>Missing: {missing.join(', ')}</span>;
  const statuses = Array.isArray(event.parameter_statuses) ? event.parameter_statuses : [];
  if (statuses.includes('complete')) return <span className="pill bg-[#a8f06a]/10 text-[#b9f57e]">Complete</span>;
  return <span className="text-xs text-slate-500">Not applicable</span>;
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

  if (!siteId) return <div className="text-slate-500 text-sm">Select a site to view {label} data.</div>;
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const events = data.events || [];
  const alerts = (data.alerts || []).filter((a: any) => !a.vendor || a.vendor === vendor);
  const totalEvents = events.reduce((sum: number, e: any) => sum + Number(e.cnt || 0), 0);
  const uniqueNames = events.length;
  const errorCount = alerts.length;

  return (
    <div className="fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{label}</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {id ? <>ID: <span className="mono">{id}</span> · </> : null}
            <span className="text-[#a8f06a]">Connected</span>
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111722] p-4 rounded-xl border border-white/[.08]">
          <div className="text-xs text-slate-500 uppercase">Events (24h)</div>
          <div className="text-2xl font-semibold mt-1">{totalEvents.toLocaleString()}</div>
        </div>
        <div className="bg-[#111722] p-4 rounded-xl border border-white/[.08]">
          <div className="text-xs text-slate-500 uppercase">Unique event names</div>
          <div className="text-2xl font-semibold mt-1">{uniqueNames}</div>
        </div>
        <div className="bg-[#111722] p-4 rounded-xl border border-white/[.08]">
          <div className="text-xs text-slate-500 uppercase">Validation issues</div>
          <div className={`text-2xl font-semibold mt-1 ${errorCount ? 'text-[#ff718d]' : 'text-slate-100'}`}>{errorCount}</div>
        </div>
      </div>

      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        <EventSessionChart events={events} />
        <SourceLaneChart sources={data.sources || []} />
      </div>

      <div className="bg-[#111722] rounded-xl border border-white/[.08] mb-6">
        <div className="p-4 border-b border-white/[.06] flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">Event breakdown</h3>
          <div className="text-xs text-slate-500">Sorted by volume</div>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No {label} events received yet. Install the snippet to start.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase bg-white/[.04]">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Event name</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">GTM tag</th>
                <th className="text-left px-4 py-2 font-medium">Parameters</th>
                <th className="text-right px-4 py-2 font-medium">Count</th>
                <th className="text-right px-4 py-2 font-medium">Sessions</th>
                <th className="text-right px-4 py-2 font-medium">Latency</th>
                <th className="text-right px-4 py-2 font-medium">Failed</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.06]">
              {events.map((e: any, i: number) => {
                const hasAlert = alerts.find((a: any) => a.event_name === e.event_name);
                return (
                  <tr key={i} className="hover:bg-white/[.04]">
                    <td className="px-4 py-3 mono">{eventDisplayName(e, vendor)} {vendor === 'gads' && e.event_name && (e.conversion_label || e.conversion_id) ? <span className="block text-[10px] text-slate-500 not-italic">{e.conversion_label || 'Conversion'}{e.conversion_id ? ` · ${e.conversion_id}` : ''}</span> : null}{(vendor === 'meta' || vendor === 'linkedin') && e.platform_id ? <span className="block text-[10px] text-slate-500 not-italic">{platformIdentifierLabel(vendor)}: {e.platform_id}</span> : null}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{e.event_type || 'unknown'}</td>
                    <td className="px-4 py-3"><div className="max-w-[190px] truncate" title={tagSummary(e)}>{tagSummary(e)}</div>{e.gtm_trigger_names?.length ? <div className="text-[10px] text-slate-500 truncate max-w-[190px]" title={e.gtm_trigger_names.join(', ')}>Trigger: {e.gtm_trigger_names.join(', ')}</div> : null}</td>
                    <td className="px-4 py-3"><ParameterHealth event={e} /></td>
                    <td className="px-4 py-3 text-right font-medium">{Number(e.cnt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{Number(e.sessions || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{Number(e.avg_latency_ms || 0) ? `${Number(e.avg_latency_ms).toLocaleString()} ms` : '—'}</td>
                    <td className={`px-4 py-3 text-right ${Number(e.failed || 0) ? 'text-[#ff718d] font-medium' : 'text-slate-400'}`}>{Number(e.failed || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {hasAlert ? (
                        <span className="pill bg-[#f6b94c]/10 text-[#ffd27a]">{hasAlert.code.replace(/_/g, ' ')}</span>
                      ) : (
                        <span className="pill bg-[#a8f06a]/10 text-[#b9f57e]">Healthy</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="bg-[#111722] rounded-xl border border-white/[.08]">
          <div className="p-4 border-b border-white/[.06]">
            <h3 className="font-semibold text-slate-100">Alerts for {label}</h3>
          </div>
          <div className="divide-y divide-white/[.06]">
            {alerts.map((a: any) => (
              <button
                key={a.id}
                onClick={() => setSelectedAlert(a)}
                className="w-full text-left p-4 hover:bg-white/[.04] flex items-center gap-4"
              >
                <SeverityChip severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100">{a.message}</div>
                  {a.event_name && <div className="text-xs text-slate-400 mt-0.5 mono">{a.event_name}</div>}
                </div>
                <span className="text-xs text-slate-500">{timeAgo(a.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}
