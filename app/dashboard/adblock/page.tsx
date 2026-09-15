'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Row = Record<string, any>;

export default function AdblockPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/adblock-governance?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('We could not load blocker governance');
        const next = await response.json();
        if (active) { setData(next); setError(''); }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'We could not load blocker governance'); }
    }
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => { active = false; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site.</div>;
  if (error && !data) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading ad-blocker governance…</div>;

  const totals = data.totals || {};
  const vendors: Row[] = data.vendors || [];
  const pages: Row[] = data.pages || [];
  const events: Row[] = data.events || [];
  const methods: Row[] = data.methods || [];
  const trends: Row[] = data.trends || [];
  const candidates: Row[] = data.candidates || [];
  const browsers: Row[] = data.browsers || [];
  const recent: Row[] = data.recent || [];
  const sufficient = totals.data_sufficiency === 'sufficient';
  const maxTrend = Math.max(1, ...trends.map((r) => Number(r.actionable_signals) || 0));
  const maxVendor = Math.max(1, ...vendors.map((r) => Number(r.blocked_sessions) || 0));
  const confirmedRate = totals.total_sessions_24h >= Number(totals.min_sample_size || 30) && totals.total_sessions_24h
    ? `${Number(totals.actionable_rate_pct || 0).toFixed(1)}%` : `Collecting (${Number(totals.total_sessions_24h || 0)}/${Number(totals.min_sample_size || 30)})`;
  const actionableShare = useMemo(() => {
    const total = Number(totals.blocked_signals_24h || 0) + Number(totals.correlation_gaps_24h || 0) + Number(totals.telemetry_gaps_24h || 0);
    return total ? Math.round((Number(totals.blocked_signals_24h || 0) / total) * 100) : 0;
  }, [totals]);

  return (
    <div className="fade-in max-w-7xl">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">Ad blocker & privacy protection</h2>
            <p className="text-sm text-ink-500 mt-1">Measure where tracking is actually being blocked, separate it from correlation and telemetry gaps, and show the affected vendor, page and event.</p>
          </div>
          <span className={`pill ${sufficient ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{sufficient ? 'Sample size sufficient' : 'Building sample'}</span>
        </div>
        {error && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Automatic updates paused: {error}</div>}
      </header>

      <section className="grid md:grid-cols-4 gap-4 mb-6">
        <Metric label="Potentially blocked sessions" value={confirmedRate} detail="Actionable blocker evidence / all monitored sessions" />
        <Metric label="Blocked signals" value={Number(totals.blocked_signals_24h || 0).toLocaleString()} detail={`${Number(totals.confirmed_signals_24h || 0).toLocaleString()} confirmed · ${Number(totals.likely_signals_24h || 0).toLocaleString()} likely · 24h`} />
        <Metric label="Monitoring coverage" value={totals.monitor_coverage_pct == null ? '—' : `${Number(totals.monitor_coverage_pct).toFixed(1)}%`} detail={`${Number(totals.monitor_ready_sessions_24h || 0).toLocaleString()} monitor-ready sessions`} />
        <Metric label="Evidence quality" value={`${actionableShare}% actionable`} detail={`${Number(totals.correlation_gaps_24h || 0)} correlation gaps · ${Number(totals.telemetry_gaps_24h || 0)} telemetry gaps`} />
      </section>

      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6 mb-6">
        <Card title="14-day blocker trend" subtitle="Actionable evidence is separated from correlation and telemetry gaps.">
          {trends.length ? <div className="space-y-2">{trends.map((r) => <div key={String(r.day)} className="grid grid-cols-[82px_1fr_70px] gap-3 items-center text-xs"><span className="mono text-ink-500">{formatDay(r.day)}</span><div className="h-3 rounded bg-ink-100 overflow-hidden"><div className="h-full bg-brand-500 rounded" style={{ width: `${Math.min(100, Number(r.actionable_signals || 0) / maxTrend * 100)}%` }} /></div><span className="text-right font-medium">{Number(r.actionable_signals || 0).toLocaleString()}</span></div>)}</div> : <Empty text="No blocker trend data yet." />}
          <div className="mt-4 grid grid-cols-4 gap-2 text-[11px] text-ink-500"><Legend label="Confirmed" /><Legend label="Likely" /><Legend label="Correlation gap" /><Legend label="Telemetry gap" /></div>
        </Card>
        <Card title="Detection quality" subtitle="Do not treat every missing request as an ad blocker.">
          <div className="space-y-3">
            <QualityRow label="Confirmed browser evidence" value={Number(totals.confirmed_signals_24h || 0)} tone="good" />
            <QualityRow label="Likely blocker evidence" value={Number(totals.likely_signals_24h || 0)} tone="warn" />
            <QualityRow label="Correlation gaps" value={Number(totals.correlation_gaps_24h || 0)} tone="neutral" />
            <QualityRow label="Telemetry gaps" value={Number(totals.telemetry_gaps_24h || 0)} tone="neutral" />
          </div>
          <p className="text-[11px] text-ink-400 mt-4">HTTP errors, CORS failures, timeouts and missing vendor matches remain investigation evidence, not as proof of ad blocking, unless the browser supplies an explicit blocking signal.</p>
        </Card>
      </section>

      <section className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Affected tracking vendors" subtitle="Unique sessions with actionable blocker evidence in the last 30 days.">
          {vendors.length ? <div className="space-y-3">{vendors.map((r) => <div key={String(r.vendor)}><div className="flex justify-between text-sm mb-1"><span className="uppercase mono">{r.vendor}</span><span className="font-medium">{Number(r.blocked_sessions).toLocaleString()} sessions</span></div><div className="h-2 rounded-full bg-ink-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${Math.min(100, Number(r.blocked_sessions || 0) / maxVendor * 100)}%` }} /></div><div className="mt-1 text-[11px] text-ink-400">{Number(r.signals).toLocaleString()} signals · {Number(r.affected_events).toLocaleString()} events · {Number(r.affected_pages).toLocaleString()} pages</div></div>)}</div> : <Empty text="No actionable vendor evidence yet." />}
        </Card>
        <Card title="Detection methods" subtitle="What the browser or monitor told us.">
          {methods.length ? <div className="space-y-2">{methods.slice(0, 10).map((r, i) => <div key={`${r.detection_method}-${r.signal}-${r.confidence}-${i}`} className="rounded-lg border border-ink-100 p-3"><div className="flex justify-between gap-3"><span className="font-medium text-sm">{describeMethod(r.detection_method, r.confidence)}</span><span className="mono text-xs">{Number(r.signals).toLocaleString()}</span></div><div className="text-[11px] text-ink-400 mt-1">{r.signal || '—'} · {Number(r.sessions).toLocaleString()} sessions · {Number(r.urls).toLocaleString()} URLs</div></div>)}</div> : <Empty text="No detection signals yet." />}
        </Card>
      </section>

      <section className="bg-white rounded-xl border border-ink-200 mb-6">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Page impact</h3><p className="text-xs text-ink-500 mt-1">Pages with the highest number of sessions showing actionable blocker evidence.</p></div>
        {pages.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-ink-500 uppercase bg-ink-50"><tr><th className="text-left px-4 py-2">Page</th><th className="text-right px-4 py-2">Blocked sessions</th><th className="text-right px-4 py-2">Sessions</th><th className="text-right px-4 py-2">Rate</th><th className="text-right px-4 py-2">Signals</th></tr></thead><tbody className="divide-y divide-ink-100">{pages.map((r) => <tr key={String(r.page)}><td className="px-4 py-2 mono text-xs max-w-[520px] truncate" title={r.page}>{r.page}</td><td className="px-4 py-2 text-right">{Number(r.blocked_sessions).toLocaleString()}</td><td className="px-4 py-2 text-right">{Number(r.sessions).toLocaleString()}</td><td className="px-4 py-2 text-right font-medium">{r.blocked_rate_pct == null ? '—' : `${Number(r.blocked_rate_pct).toFixed(1)}%`}</td><td className="px-4 py-2 text-right">{Number(r.signals).toLocaleString()}</td></tr>)}</tbody></table></div> : <Empty text="No affected pages yet." />}
      </section>

      <section className="bg-white rounded-xl border border-ink-200 mb-6">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Event impact</h3><p className="text-xs text-ink-500 mt-1">Events associated with actionable blocker evidence. This does not claim the event was definitely lost unless the request itself was explicitly blocked.</p></div>
        {events.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-ink-500 uppercase bg-ink-50"><tr><th className="text-left px-4 py-2">Event</th><th className="text-right px-4 py-2">Blocked sessions</th><th className="text-right px-4 py-2">Observed sessions</th><th className="text-right px-4 py-2">Rate</th><th className="text-right px-4 py-2">Confirmed</th><th className="text-left px-4 py-2">Last seen</th></tr></thead><tbody className="divide-y divide-ink-100">{events.map((r) => <tr key={String(r.event_name)}><td className="px-4 py-2 mono text-xs">{r.event_name}</td><td className="px-4 py-2 text-right">{Number(r.blocked_sessions).toLocaleString()}</td><td className="px-4 py-2 text-right">{Number(r.sessions).toLocaleString()}</td><td className="px-4 py-2 text-right font-medium">{r.blocked_rate_pct == null ? '—' : `${Number(r.blocked_rate_pct).toFixed(1)}%`}</td><td className="px-4 py-2 text-right">{Number(r.confirmed_signals).toLocaleString()}</td><td className="px-4 py-2 mono text-xs">{formatDate(r.last_seen)}</td></tr>)}</tbody></table></div> : <Empty text="No affected events yet." />}
      </section>

      <section className="bg-white rounded-xl border border-ink-200 mb-6">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Recent evidence</h3><p className="text-xs text-ink-500 mt-1">Every row carries its confidence. Correlation and telemetry gaps are intentionally not promoted to blocker findings.</p></div>
        {recent.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-ink-500 uppercase bg-ink-50"><tr><th className="text-left px-4 py-2">Time</th><th className="text-left px-4 py-2">Confidence</th><th className="text-left px-4 py-2">Signal</th><th className="text-left px-4 py-2">Vendor / event</th><th className="text-left px-4 py-2">Blocked request</th><th className="text-left px-4 py-2">Page</th></tr></thead><tbody className="divide-y divide-ink-100">{recent.map((r, i) => <tr key={`${r.detected_at}-${i}`} className="hover:bg-ink-50"><td className="px-4 py-2 mono text-xs whitespace-nowrap">{formatDate(r.detected_at)}</td><td className="px-4 py-2"><span className={`pill ${confidenceClass(r.confidence)}`}>{String(r.confidence || 'unknown')}</span></td><td className="px-4 py-2 text-xs">{describeMethod(r.detection_method, r.confidence)}<div className="text-[10px] text-ink-400 mono">{r.signal || '—'}</div></td><td className="px-4 py-2 mono text-xs">{r.blocked_host || r.detection_method || '—'}{r.event_name ? ` · ${r.event_name}` : ''}</td><td className="px-4 py-2 mono text-xs max-w-[300px] truncate" title={r.blocked_url || ''}>{r.blocked_url || '—'}</td><td className="px-4 py-2 mono text-xs max-w-[260px] truncate" title={r.page_url || ''}>{r.page_url || '—'}</td></tr>)}</tbody></table></div> : <Empty text="No recent evidence." />}
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <Card title="Patterns under review" subtitle="Repeated unknown signals are candidates, not blocker findings.">
          {candidates.length ? <div className="space-y-2">{candidates.slice(0, 15).map((r, i) => <div key={`${r.detection_method}-${r.vendor}-${r.signal}-${i}`} className="rounded-lg border border-ink-100 p-3"><div className="flex justify-between gap-3"><span className="mono text-xs">{r.detection_method} · {r.vendor}</span><span className="text-xs font-medium">{Number(r.sample_count).toLocaleString()}×</span></div><div className="text-sm mt-1">{r.raw_error || r.signal || 'Unknown blocker-shaped signal'}</div><div className="text-[11px] text-ink-400 mt-1">First {formatDate(r.first_seen)} · Last {formatDate(r.last_seen)}</div></div>)}</div> : <Empty text="No unresolved patterns." />}
        </Card>
        <Card title="Browser / privacy-tool footprint" subtitle="Aggregated user-agent evidence; no raw IP addresses are displayed.">
          {browsers.length ? <div className="space-y-2">{browsers.map((r, i) => <div key={`${r.user_agent}-${i}`} className="flex justify-between gap-3 rounded-lg border border-ink-100 p-3"><span className="text-xs truncate max-w-[78%]" title={r.user_agent}>{r.user_agent || 'Unknown browser'}</span><span className="mono text-xs whitespace-nowrap">{Number(r.sessions).toLocaleString()} sessions</span></div>)}</div> : <Empty text="No browser footprint yet." />}
        </Card>
      </section>

      <section className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-4 text-xs text-ink-600">
        <div className="font-semibold text-ink-900 mb-2">Detection model</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Confirmed</b>: explicit browser/client blocking evidence. This is the strongest blocker signal.</li>
          <li><b>Likely</b>: blocker-shaped evidence without a browser-specific proof string.</li>
          <li><b>Correlation gap</b>: an expected vendor event did not match a network request. It is not automatically an ad blocker.</li>
          <li><b>Telemetry gap</b>: GAfix could not establish delivery. It is not automatically an ad blocker.</li>
          <li>HTTP errors, CORS failures, timeouts, consent-denied traffic and normal vendor failures are kept out of the confirmed blocker rate unless explicit blocking evidence exists.</li>
          <li>Rates are suppressed until the site has at least {Number(totals.min_sample_size || 30)} monitored sessions.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="bg-white p-4 rounded-xl border border-ink-200"><div className="text-xs text-ink-400 uppercase">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div><div className="text-xs text-ink-500 mt-1">{detail}</div></div>; }
function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="bg-white rounded-xl border border-ink-200 p-5"><h3 className="font-semibold text-ink-950">{title}</h3><p className="text-xs text-ink-500 mt-1 mb-4">{subtitle}</p>{children}</section>; }
function QualityRow({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'neutral' }) { const cls = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-ink-300'; return <div className="flex items-center justify-between rounded-lg border border-ink-100 p-3"><span className="text-sm">{label}</span><span className={`pill ${tone === 'good' ? 'bg-emerald-100 text-emerald-800' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-ink-100 text-ink-700'}`}><span className={`inline-block w-1.5 h-1.5 rounded-full ${cls} mr-1.5`} />{value.toLocaleString()}</span></div>; }
function Legend({ label }: { label: string }) { return <span>• {label}</span>; }
function Empty({ text }: { text: string }) { return <div className="p-7 text-center text-sm text-ink-400">{text}</div>; }
function formatDay(value: unknown) { if (!value) return '—'; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatDate(value: unknown) { if (!value) return '—'; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function confidenceClass(confidence: string) { return confidence === 'confirmed' ? 'bg-red-100 text-red-800' : confidence === 'likely' ? 'bg-amber-100 text-amber-800' : confidence === 'correlation_gap' || confidence === 'telemetry_gap' ? 'bg-ink-100 text-ink-700' : 'bg-ink-100 text-ink-700'; }
function describeMethod(method: string, confidence?: string) { const labels: Record<string, string> = { ga4_event_unmatched: 'GA4 event could not be correlated', ga4_event_blocked: 'GA4 event blocked/correlation gap', ga4_transport_blocked: 'GA4 transport blocked', ga4_http_failure: 'GA4 HTTP failure', ga4_beacon_rejected: 'GA4 beacon rejected', gads_transport_blocked: 'Google Ads transport blocked', meta_transport_blocked: 'Meta transport blocked', tiktok_transport_blocked: 'TikTok transport blocked', linkedin_transport_blocked: 'LinkedIn transport blocked', snapchat_transport_blocked: 'Snapchat transport blocked', bing_transport_blocked: 'Microsoft Ads transport blocked' }; const label = labels[method] || method || 'Unknown cause'; return confidence === 'correlation_gap' ? `${label} · cause unknown` : confidence === 'telemetry_gap' ? `${label} · monitor unclear` : confidence === 'likely' ? `${label} · likely blocked` : label; }
