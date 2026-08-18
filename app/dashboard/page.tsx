'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AlertModal from './alert-modal';
import { SeverityChip, timeAgo } from './ui';

export default function OverviewPage() {
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
        const res = await fetch(`/api/events?siteId=${siteId}`);
        if (res.ok) setData(await res.json());
      } catch {}
    }
  }, [siteId]);

  if (!siteId) {
    return <EmptyState />;
  }

  if (!data) return <div className="text-ink-400 text-sm">Loading…</div>;

  const stats = data.stats || {};
  const alerts = data.alerts || [];

  return (
    <div className="fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Events last hour" value={stats.events_hour || 0} sub={`${stats.events_24h || 0} in 24h`} />
        <StatCard label="Active alerts" value={stats.active_alerts || 0} sub={`${stats.critical_alerts || 0} critical`} valueColor={stats.critical_alerts ? 'text-red-600' : 'text-ink-950'} />
        <StatCard label="Ad-blocker events" value={stats.adblock_24h || 0} sub="Last 24h" />
        <StatCard label="Health" value={stats.critical_alerts > 0 ? '⚠' : '✓'} sub={stats.critical_alerts > 0 ? 'Attention needed' : 'All systems normal'} valueColor={stats.critical_alerts > 0 ? 'text-amber-600' : 'text-green-600'} />
      </div>

      <div className="bg-white rounded-xl border border-ink-200 mb-6">
        <div className="p-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="font-semibold text-ink-950">Recent alerts</h3>
          <span className="text-xs text-ink-400">Auto-refresh every 5s</span>
        </div>
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No active alerts — everything looks healthy.</div>
        ) : (
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
                  <div className="text-xs text-ink-500 mt-0.5">
                    {a.vendor && <span className="mono uppercase">{a.vendor}</span>}
                    {a.event_name && <span> · <span className="mono">{a.event_name}</span></span>}
                    {a.page_url && <span> · {a.page_url}</span>}
                  </div>
                </div>
                <span className="text-xs text-ink-400">{timeAgo(a.created_at)}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b91a0" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            ))}
          </div>
        )}
      </div>

      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}

function StatCard({ label, value, sub, valueColor = 'text-ink-950' }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-ink-200">
      <div className="text-xs text-ink-400 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${valueColor}`}>{value}</div>
      <div className="text-xs text-ink-500 mt-2">{sub}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4553f5" strokeWidth="2">
          <path d="M12 2 15 9 22 10l-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-7z"/>
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-ink-950 mb-2">Add your first site to get started</h2>
      <p className="text-sm text-ink-500 mb-6">Once you add a site, you&apos;ll get a personalized install snippet to paste into GTM. Events start streaming within seconds.</p>
      <Link href="/dashboard/settings" className="inline-block bg-ink-950 text-white px-6 py-2.5 rounded-lg hover:bg-ink-800 text-sm font-medium">
        Add a site
      </Link>
    </div>
  );
}
