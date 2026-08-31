'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CommandKpi, DashboardSection, ScoreRing } from '../command-visuals';

function format(value: unknown) { return Number(value || 0).toLocaleString(); }
function vitalTone(value: number, good: number, warn: number) { return value <= good ? 'text-[#a8f06a]' : value <= warn ? 'text-[#f6b94c]' : 'text-[#ff718d]'; }

export default function HealthPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/tag-health?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'We could not load tracking health');
        if (active) { setData(body); setError(''); }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'We could not load tracking health'); }
    }
    load(); const timer = setInterval(load, 15000); return () => { active = false; clearInterval(timer); };
  }, [siteId]);
  if (!siteId) return <div className="text-sm text-slate-500">Select a site.</div>;
  if (!data && !error) return <div className="text-sm text-slate-500">Loading tracking health…</div>;
  if (error && !data) return <div className="rounded-xl border border-[#ff718d]/20 bg-[#ff718d]/10 p-4 text-sm text-[#ff9aae]">{error}</div>;

  const health = data?.health || [];
  const anomalies = data?.anomalies || [];
  const revenue = data?.revenue || [];
  const compliance = data?.compliance || [];
  const performance = data?.performance || [];
  const scoredHealth = health.filter((row: any) => row.health_score !== null && row.health_score !== undefined);
  const avgHealth = scoredHealth.length ? Math.round(scoredHealth.reduce((sum: number, row: any) => sum + Number(row.health_score), 0) / scoredHealth.length) : null;
  const totalFires = health.reduce((sum: number, row: any) => sum + Number(row.fires || 0), 0);
  const totalFailures = health.reduce((sum: number, row: any) => sum + Number(row.failures || 0), 0);
  const totalDeliveryOutcomes = health.reduce((sum: number, row: any) => sum + Number(row.sample_size || 0), 0);
  const p75Lcp = performance.length ? Math.round(performance.reduce((sum: number, row: any) => sum + Number(row.p75_lcp || 0), 0) / performance.length) : 0;
  const p75Inp = performance.length ? Math.round(performance.reduce((sum: number, row: any) => sum + Number(row.p75_inp || 0), 0) / performance.length) : 0;
  const vital = performance[0] || {};
  const maxFires = Math.max(...health.map((row: any) => Number(row.fires || 0)), 1);

  return <div className="fade-in mx-auto max-w-[1500px] space-y-7">
    <div className="dashboard-section-head"><div><div className="dashboard-eyebrow">Tracking health · Last 24 hours</div><h2>How your tracking is doing</h2><p>Delivery success rates use confirmed network outcomes. Transport anomalies, privacy signals, response time, and unusual changes are shown separately so they are not mistaken for delivery failures.</p></div><div className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /><strong>Updating automatically</strong> · 15s</div></div>
    {error && <div className="rounded-xl border border-[#f6b94c]/20 bg-[#f6b94c]/10 p-3 text-sm text-[#ffd27a]">Updating automatically paused: {error}</div>}

    <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
      <div className="relative overflow-hidden rounded-2xl border border-white/[.08] bg-[#111722] p-5"><div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#a8f06a]/10 blur-2xl" /><div className="relative flex items-center gap-5"><ScoreRing value={avgHealth} label="Delivery success rate" detail={health.length ? `${health.length} tracked signals` : 'Collecting'} /><div><div className="text-[10px] uppercase tracking-[.16em] text-slate-500">Quick summary</div><div className="mt-2 text-lg font-semibold text-white">{avgHealth === null ? 'Waiting for visitor activity' : avgHealth >= 95 ? 'Tracking looks healthy' : avgHealth >= 80 ? 'Worth checking' : 'Needs attention'}</div><p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-400">This rate uses confirmed network outcomes from real visitors. It does not treat a dataLayer push, a browser transport anomaly, or a privacy choice as vendor delivery confirmation.</p></div></div></div>
      <CommandKpi label="Tracking actions seen" value={format(totalFires)} note={`${health.length} different tracking actions`} tone="blue" />
      <CommandKpi label="Confirmed delivery problems" value={format(totalFailures)} note={totalDeliveryOutcomes ? `${Math.round((totalFailures / totalDeliveryOutcomes) * 1000) / 10}% of confirmed results` : 'Still collecting enough results'} tone={totalFailures ? 'rose' : 'lime'} />
      <CommandKpi label="Unusual changes" value={format(anomalies.length)} note="Worth checking" tone={anomalies.length ? 'amber' : 'lime'} />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Tracking quality" title="Which tracking actions need attention?" description="The busiest actions appear first. Health is calculated from network delivery attempts; a dataLayer push alone is not counted as a successful delivery." /><div className="space-y-4">{health.length ? health.slice(0, 10).map((row: any, index: number) => { const fires = Number(row.fires || 0); const score = row.health_score == null ? null : Number(row.health_score); return <div key={`${row.vendor}-${row.event_name}-${index}`} className="grid grid-cols-[minmax(150px,1fr)_1.4fr_54px_70px] items-center gap-3 text-xs"><div className="min-w-0"><div className="truncate font-mono font-medium text-slate-200">{row.event_name || 'unnamed'}</div><div className="mt-1 uppercase text-[10px] tracking-wider text-slate-500">{row.vendor}</div></div><div className="h-2 overflow-hidden rounded-full bg-[#202b3b]"><div className={`h-full rounded-full ${score == null ? 'bg-[#6d8cff]' : score >= 95 ? 'bg-[#a8f06a]' : score >= 80 ? 'bg-[#f6b94c]' : 'bg-[#ff718d]'}`} style={{ width: `${Math.max(3, (fires / maxFires) * 100)}%` }} /></div><div className={`text-right font-semibold ${score == null ? 'text-[#8fa8ff]' : score >= 95 ? 'text-[#a8f06a]' : score >= 80 ? 'text-[#f6b94c]' : 'text-[#ff718d]'}`}>{score == null ? `Still collecting confirmed results (${Number(row.sample_size || 0)}/${row.min_sample_size || 30})` : score}</div><div className="text-right text-slate-500">{format(fires)}</div></div>; }) : <div className="empty-visual">No visitor tracking data yet.</div>}</div></div>
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Website speed · Typical visitor experience" title="How fast did the website feel?" description="Based on real visitors, not a lab test." /><div className="grid grid-cols-2 gap-3">{[['LCP', vital.p75_lcp, 2500, 4000, 'ms'], ['INP', vital.p75_inp, 200, 500, 'ms'], ['FCP', vital.p75_fcp, 1800, 3000, 'ms'], ['TTFB', vital.p75_ttfb, 800, 1800, 'ms']].map(([label, value, good, warn, unit]) => <div key={String(label)} className="rounded-xl border border-white/[.06] bg-[#0c121c] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-3 text-xl font-semibold ${value == null ? 'text-[#8fa8ff]' : vitalTone(Number(value), Number(good), Number(warn))}`}>{value == null ? 'Collecting' : Number(value).toLocaleString()}<small className="ml-1 text-[10px] text-slate-500">{unit}</small></div><div className="mt-2 h-1.5 rounded-full bg-[#202b3b]"><div className={`h-full rounded-full ${value == null ? 'bg-[#6d8cff]' : Number(value) <= Number(good) ? 'bg-[#a8f06a]' : Number(value) <= Number(warn) ? 'bg-[#f6b94c]' : 'bg-[#ff718d]'}`} style={{ width: value == null ? '0%' : `${Math.max(4, Math.min(100, (Number(value) / Number(warn)) * 100))}%` }} /></div></div>)}</div><div className="mt-5 rounded-xl border border-[#6d8cff]/15 bg-[#6d8cff]/[.06] p-3 text-xs leading-5 text-slate-400">This shows the experience of most visitors. Check the page and visitor mix before making changes.</div></div>
    </section>

    <section className="grid gap-5 lg:grid-cols-3"><EvidencePanel title="Changes worth checking" eyebrow="Unusual changes" items={anomalies} empty="No unusual changes found. Tracking looks similar to its normal pattern." tone="amber" /><EvidencePanel title="Purchase records" eyebrow="Purchase tracking" items={revenue} empty="No purchase tracking differences found." tone="lime" /><EvidencePanel title="Safety checks" eyebrow="Website safety" items={compliance} empty="No website safety issues found." tone="rose" /></section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Detailed tracking details" title="Tracking health details" description="Use this table when you need the details behind each tracking action." /><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-b border-white/[.07] text-[10px] uppercase tracking-[.12em] text-slate-500"><tr><th className="p-3 text-left">Tracking tool</th><th className="p-3 text-left">Action</th><th className="p-3 text-right">Health</th><th className="p-3 text-right">Actions seen</th><th className="p-3 text-right">Network attempts</th><th className="p-3 text-right">Problems</th><th className="p-3 text-right">Typical response time</th><th className="p-3 text-right">Privacy choices not allowed</th></tr></thead><tbody className="divide-y divide-white/[.05]">{health.map((row: any, index: number) => <tr key={`${row.vendor}-${row.event_name}-${index}`} className="transition hover:bg-white/[.03]"><td className="p-3 uppercase text-xs text-slate-500">{row.vendor}</td><td className="p-3 font-mono text-slate-200">{row.event_name || '—'}</td><td className={`p-3 text-right font-semibold ${row.health_score == null ? 'text-[#8fa8ff]' : Number(row.health_score) < 80 ? 'text-[#ff718d]' : Number(row.health_score) < 95 ? 'text-[#f6b94c]' : 'text-[#a8f06a]'}`}>{row.health_score == null ? `Still collecting confirmed results (${Number(row.sample_size || 0)}/${row.min_sample_size || 30})` : row.health_score}</td><td className="p-3 text-right text-slate-300">{format(row.fires)}</td><td className="p-3 text-right text-slate-300">{format(row.delivery_attempts)}</td><td className="p-3 text-right text-slate-400">{format(row.failures)}</td><td className="p-3 text-right text-slate-400">{format(row.p75_latency_ms)} ms</td><td className="p-3 text-right text-slate-400">{format(row.consent_denied)}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function EvidencePanel({ title, eyebrow, items, empty, tone }: { title: string; eyebrow: string; items: any[]; empty: string; tone: 'amber' | 'lime' | 'rose' }) {
  const color = tone === 'amber' ? 'text-[#f6b94c]' : tone === 'rose' ? 'text-[#ff718d]' : 'text-[#a8f06a]';
  return <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5"><div className="dashboard-eyebrow">{eyebrow}</div><h3 className="mt-2 font-semibold text-white">{title}</h3>{items.length ? <div className="mt-4 space-y-3">{items.slice(0, 5).map((item: any, index: number) => <div key={item.id || index} className="border-b border-white/[.06] pb-3 last:border-0"><div className="flex items-center justify-between gap-3"><span className="truncate font-medium text-slate-200">{item.event_name || item.transaction_id || item.category || 'Finding'}</span><span className={`pill bg-white/[.05] ${color}`}>{item.severity || item.status || 'evidence'}</span></div><div className="mt-1 truncate text-xs text-slate-500">{item.message || item.resource_url || `Delta: ${item.delta_value || 0} ${item.currency || ''}`}</div></div>)}</div> : <div className="mt-4 empty-visual min-h-[120px] text-center">{empty}</div>}</div>;
}
