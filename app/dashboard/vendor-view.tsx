'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AlertModal from './alert-modal';
import { SeverityChip, timeAgo } from './ui';

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

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site to view {label} data.</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading…</div>;

  const events = data.events || [];
  const alerts = (data.alerts || []).filter((a: any) => !a.vendor || a.vendor === vendor);
  const totalEvents = events.reduce((sum: number, e: any) => sum + Number(e.cnt || 0), 0);
  const uniqueNames = events.length;
  const errorCount = alerts.length;

  return (
    <div className="fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">{label}</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            {id ? <>ID: <span className="mono">{id}</span> · </> : null}
            <span className="text-green-600">Connected</span>
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-ink-200">
          <div className="text-xs text-ink-400 uppercase">Events (24h)</div>
          <div className="text-2xl font-semibold mt-1">{totalEvents.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-ink-200">
          <div className="text-xs text-ink-400 uppercase">Unique event names</div>
          <div className="text-2xl font-semibold mt-1">{uniqueNames}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-ink-200">
          <div className="text-xs text-ink-400 uppercase">Validation issues</div>
          <div className={`text-2xl font-semibold mt-1 ${errorCount ? 'text-red-600' : 'text-ink-950'}`}>{errorCount}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-200 mb-6">
        <div className="p-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="font-semibold text-ink-950">Event breakdown</h3>
          <div className="text-xs text-ink-400">Sorted by volume</div>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No {label} events received yet. Install the snippet to start.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-500 uppercase bg-ink-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Event name</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-right px-4 py-2 font-medium">Count</th>
                <th className="text-right px-4 py-2 font-medium">Sessions</th>
                <th className="text-right px-4 py-2 font-medium">Latency</th>
                <th className="text-right px-4 py-2 font-medium">Failed</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {events.map((e: any, i: number) => {
                const hasAlert = alerts.find((a: any) => a.event_name === e.event_name);
                return (
                  <tr key={i} className="hover:bg-ink-50">
                    <td className="px-4 py-3 mono">{e.event_name || (vendor === 'gads' && (e.conversion_label || e.conversion_id) ? `${e.conversion_label || 'Conversion'}${e.conversion_id ? ` · ${e.conversion_id}` : ''}` : '(unnamed)')} {vendor === 'gads' && e.event_name && (e.conversion_label || e.conversion_id) ? <span className="block text-[10px] text-ink-400 not-italic">{e.conversion_label || 'Conversion'}{e.conversion_id ? ` · ${e.conversion_id}` : ''}</span> : null}</td>
                    <td className="px-4 py-3 text-ink-500 capitalize">{e.event_type || 'unknown'}</td>
                    <td className="px-4 py-3 text-right font-medium">{Number(e.cnt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-ink-500">{Number(e.sessions || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-ink-500">{Number(e.avg_latency_ms || 0) ? `${Number(e.avg_latency_ms).toLocaleString()} ms` : '—'}</td>
                    <td className={`px-4 py-3 text-right ${Number(e.failed || 0) ? 'text-red-600 font-medium' : 'text-ink-500'}`}>{Number(e.failed || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {hasAlert ? (
                        <span className="pill bg-amber-100 text-amber-800">{hasAlert.code.replace(/_/g, ' ')}</span>
                      ) : (
                        <span className="pill bg-green-100 text-green-800">Healthy</span>
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
        <div className="bg-white rounded-xl border border-ink-200">
          <div className="p-4 border-b border-ink-100">
            <h3 className="font-semibold text-ink-950">Alerts for {label}</h3>
          </div>
          <div className="divide-y divide-ink-100">
            {alerts.map((a: any) => (
              <button
                key={a.id}
                onClick={() => setSelectedAlert(a)}
                className="w-full text-left p-4 hover:bg-ink-50 flex items-center gap-4"
              >
                <SeverityChip severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-950">{a.message}</div>
                  {a.event_name && <div className="text-xs text-ink-500 mt-0.5 mono">{a.event_name}</div>}
                </div>
                <span className="text-xs text-ink-400">{timeAgo(a.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}
