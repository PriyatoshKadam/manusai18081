'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type AdblockData = {
  totals?: { blocked_events_24h?: number; blocked_sessions_24h?: number; total_sessions_24h?: number };
  byMethod?: Array<{ detection_method: string; cnt: number }>;
  recent?: Array<{ detection_method: string; page_url: string | null; user_agent: string; detected_at: string }>;
};

export default function AdblockPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<AdblockData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/adblock?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Unable to load ad-block data');
        const next = await res.json();
        if (active) {
          setData(next);
          setError('');
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load ad-block data');
      }
    }
    load();
    const timer = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site.</div>;
  if (error && !data) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading…</div>;

  const totals = data.totals || {};
  const methods = data.byMethod || [];
  const recent = data.recent || [];
  const blockedEvents = Number(totals.blocked_events_24h) || 0;
  const blockedSessions = Number(totals.blocked_sessions_24h) || 0;
  const totalSessions = Number(totals.total_sessions_24h) || 0;
  const rate = totalSessions > 0 ? `${Math.min(100, (blockedSessions / totalSessions) * 100).toFixed(1)}%` : '—';
  const maxMethodCount = methods.reduce((m, x) => Math.max(m, Number(x.cnt) || 0), 1);

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">Ad-blocker impact</h2>
        <p className="text-sm text-ink-500 mt-0.5">
          Sessions detected via first-party fallback beacon and ad-script bait checks. The rate uses distinct hashed sessions, not raw beacon count.
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Live refresh paused: {error}</div>}

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Metric label="Ad-blocker rate" value={rate} detail="Distinct blocked sessions" />
        <Metric label="Blocked sessions (24h)" value={blockedSessions.toLocaleString()} detail={`${blockedEvents.toLocaleString()} detections`} />
        <Metric label="Total sessions (24h)" value={totalSessions.toLocaleString()} detail="Distinct visitors with events" />
        <Metric label="Detection methods" value={methods.length.toLocaleString()} detail="Methods seen in 24h" />
      </div>

      {methods.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-200 p-5 mb-6">
          <h3 className="font-semibold text-ink-950 mb-4">Detection method breakdown</h3>
          <div className="space-y-3">
            {methods.map((method) => {
              const pct = Math.round(((Number(method.cnt) || 0) / maxMethodCount) * 100);
              return (
                <div key={method.detection_method || 'unknown'}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{describeMethod(method.detection_method)}</span>
                    <span className="font-medium">{Number(method.cnt).toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100">
          <h3 className="font-semibold text-ink-950">Recent detections</h3>
          <p className="text-xs text-ink-500 mt-0.5">Last 50 sessions where the monitor was blocked, in whole or in part.</p>
        </div>
        {recent.length === 0 ? <div className="p-8 text-center text-sm text-ink-400">No ad-blocker detections yet.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-500 uppercase bg-ink-50"><tr><th className="text-left px-4 py-2 font-medium">Time</th><th className="text-left px-4 py-2 font-medium">Method</th><th className="text-left px-4 py-2 font-medium">Page</th><th className="text-left px-4 py-2 font-medium">Browser</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {recent.map((item, index) => <tr key={`${item.detected_at}-${index}`} className="hover:bg-ink-50"><td className="px-4 py-2 mono text-xs">{new Date(item.detected_at).toLocaleTimeString()}</td><td className="px-4 py-2"><span className="pill bg-red-100 text-red-800">{describeMethod(item.detection_method)}</span></td><td className="px-4 py-2 mono text-xs truncate max-w-[240px]">{item.page_url || '—'}</td><td className="px-4 py-2 text-ink-500 text-xs truncate max-w-[240px]">{shortUA(item.user_agent)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="bg-white p-4 rounded-xl border border-ink-200"><div className="text-xs text-ink-400 uppercase">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div><div className="text-xs text-ink-500 mt-1">{detail}</div></div>;
}

function describeMethod(method: string) {
  const labels: Record<string, string> = {
    bait_blocked: 'Ad script blocked',
    bait_timeout: 'Ad script timeout',
    script_error: 'Monitor failed to load',
    script_timeout: 'Monitor load timeout',
    timeout: 'Monitor timeout',
    get_beacon: 'Fallback beacon',
    ga4_event_blocked: 'GA4 event blocked',
    google_analytics_script_blocked: 'Google Analytics script blocked',
    google_ads_script_blocked: 'Google Ads script blocked',
    meta_script_blocked: 'Meta script blocked',
    tiktok_script_blocked: 'TikTok script blocked',
  };
  return labels[method] || method || 'Unknown';
}

function shortUA(ua: string) {
  if (!ua) return '';
  const match = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
  return match ? `${match[1]} ${match[2]}` : ua.slice(0, 40);
}
