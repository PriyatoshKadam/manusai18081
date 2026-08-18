'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AlertModal from '../alert-modal';
import { SeverityChip, timeAgo } from '../ui';

export default function GtmDiagnosticsPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/gtm?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
        if (response.ok && !cancelled) setData(await response.json());
      } catch {}
    }
    load();
    const timer = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site to inspect GTM.</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading GTM diagnostics…</div>;

  const alerts = data.alerts || [];
  const customEvents = data.customEvents || [];
  const dataLayer = data.dataLayer || [];
  const sources = data.sources || [];

  return (
    <div className="fade-in max-w-6xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-950">GTM diagnostics</h2>
        <p className="text-sm text-ink-500 mt-1">A deterministic review flow for triggers, dataLayer pushes, network requests, and direct-code conflicts.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          ['GTM alerts', alerts.length, alerts.length ? 'text-amber-600' : 'text-green-600'],
          ['Custom events', customEvents.length, 'text-ink-950'],
          ['DataLayer pushes', dataLayer.reduce((sum: number, row: any) => sum + Number(row.pushes || 0), 0), 'text-ink-950'],
          ['Observed sources', new Set(sources.map((row: any) => row.source).filter(Boolean)).size, 'text-ink-950'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-white p-4 rounded-xl border border-ink-200">
            <div className="text-xs text-ink-400 uppercase">{label}</div>
            <div className={`text-2xl font-semibold mt-1 ${color}`}>{Number(value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-950">Recommended investigation flow</h3>
        <ol className="mt-3 grid md:grid-cols-4 gap-3 text-sm text-blue-900">
          <li><b>1. Trigger:</b> confirm one GTM trigger matches the action.</li>
          <li><b>2. Tags:</b> confirm one GA4 Event tag fires from that trigger.</li>
          <li><b>3. DataLayer:</b> compare push count with the user action count.</li>
          <li><b>4. Network:</b> compare requests and check for direct gtag or SDK sends.</li>
        </ol>
      </div>

      <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Custom GA4 events</h3><p className="text-xs text-ink-500 mt-1">Custom names are shown independently from GA4 recommended events. Each row includes total observations and distinct browser sessions.</p></div>
        {customEvents.length === 0 ? <div className="p-6 text-sm text-ink-400">No custom events have been observed in the last 24 hours.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink-50 text-xs text-ink-500 uppercase"><tr><th className="text-left px-4 py-2">Event</th><th className="text-right px-4 py-2">Observations</th><th className="text-right px-4 py-2">Sessions</th></tr></thead><tbody className="divide-y divide-ink-100">{customEvents.map((row: any) => <tr key={row.event_name}><td className="px-4 py-3 mono">{row.event_name}</td><td className="px-4 py-3 text-right">{Number(row.total).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.sessions).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">DataLayer repeat analysis</h3><p className="text-xs text-ink-500 mt-1">Repeated page_view or scroll events are not automatically defects. Investigate only when the same session, action, and payload indicate multiple pushes.</p></div>
        {dataLayer.length === 0 ? <div className="p-6 text-sm text-ink-400">No dataLayer event observations yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink-50 text-xs text-ink-500 uppercase"><tr><th className="text-left px-4 py-2">Event</th><th className="text-right px-4 py-2">Pushes</th><th className="text-right px-4 py-2">Sessions</th><th className="text-right px-4 py-2">Navigations</th><th className="text-right px-4 py-2">Distinct pushes</th></tr></thead><tbody className="divide-y divide-ink-100">{dataLayer.map((row: any) => <tr key={row.event_name}><td className="px-4 py-3 mono">{row.event_name || '(unnamed)'}</td><td className="px-4 py-3 text-right">{Number(row.pushes).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.sessions).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.navigations).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.distinct_pushes).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">GTM-specific alerts</h3></div>
        {alerts.length === 0 ? <div className="p-6 text-sm text-green-700">No GTM trigger, duplicate-push, or direct-implementation conflicts are active.</div> : <div className="divide-y divide-ink-100">{alerts.map((alert: any) => <button key={alert.id} onClick={() => setSelected(alert)} className="w-full text-left p-4 hover:bg-ink-50 flex items-center gap-4"><SeverityChip severity={alert.severity} /><div className="flex-1 min-w-0"><div className="text-sm font-medium text-ink-950">{alert.message}</div><div className="text-xs text-ink-500 mt-1 mono">{alert.code}{alert.event_name ? ` · ${alert.event_name}` : ''}</div></div><span className="text-xs text-ink-400">{timeAgo(alert.created_at)}</span></button>)}</div>}
      </section>

      <AlertModal alert={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
