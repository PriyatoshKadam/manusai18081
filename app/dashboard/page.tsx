'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AlertModal from './alert-modal';
import { SeverityChip, timeAgo } from './ui';
import { CommandKpi, DashboardSection, EvidenceRail, EventHeatmap, ScoreRing } from './command-visuals';

export default function OverviewPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      try {
        const qs = `siteId=${encodeURIComponent(siteId)}`;
        const fetchJson = async (path: string, fallback: any) => {
          try {
            const response = await fetch(path, { cache: 'no-store' });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || `${path} failed`);
            return body;
          } catch (cause) {
            if (active) setError(cause instanceof Error ? cause.message : `${path} unavailable`);
            return fallback;
          }
        };
        const [overview, health, duplicates, deliveries] = await Promise.all([
          fetchJson(`/api/events?${qs}`, { stats: {}, events: [], alerts: [], flow: [], blockedFlow: [] }),
          fetchJson(`/api/tag-health?${qs}`, { health: [], anomalies: [], revenue: [], compliance: [], performance: [] }),
          fetchJson(`/api/duplicates?${qs}`, { duplicates: [] }),
          fetchJson(`/api/alert-deliveries?${qs}`, { deliveries: [] }),
        ]);
        if (active) { setData({ ...overview, ...health, ...duplicates, ...deliveries }); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Live monitoring unavailable');
      }
    }
    load();
    const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <EmptyState />;
  if (!data) return <div className="text-sm text-slate-500">Loading live evidence…</div>;

  const stats = data.stats || {};
  const alerts = data.alerts || [];
  const health = data.health || [];
  const duplicates = data.duplicates || [];
  const deliveries = data.deliveries || [];
  const events = data.events || [];
  const avgHealth = health.length ? Math.round(health.reduce((sum: number, row: any) => sum + Number(row.health_score || 0), 0) / health.length) : null;
  const failed = health.reduce((sum: number, row: any) => sum + Number(row.failures || 0), 0);
  const deliveryFailures = deliveries.filter((item: any) => item.status === 'failed').length;
  const repeated = duplicates.filter((item: any) => ['login', 'run_audit'].includes(String(item.event_name || '').toLowerCase()));
  const actions = [...repeated.slice(0, 4), ...alerts.filter((item: any) => !repeated.some((dup: any) => dup.event_name === item.event_name)).slice(0, 4)];
  const totalSessions = events.reduce((sum: number, row: any) => sum + Number(row.sessions || 0), 0);
  const totalFires = events.reduce((sum: number, row: any) => sum + Number(row.cnt || 0), 0);
  const avgEventsPerSession = totalSessions ? (totalFires / totalSessions).toFixed(1) : '—';

  return <div className="fade-in mx-auto max-w-[1500px] space-y-7">
    <section className="relative overflow-hidden rounded-[1.35rem] border border-white/[.08] bg-[#111a28] p-6 shadow-2xl shadow-black/20 lg:p-8">
      <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#657fff]/20 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-[#a8f06a]/10 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_220px] lg:items-center">
        <div><div className="dashboard-eyebrow">Real-user command center · 24h window</div><h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-.04em] text-white lg:text-4xl">See the signal before it becomes a reporting problem.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">GA4Fix correlates what actual visitors did, what the dataLayer pushed, what the browser requested, which domain received it, and whether the event arrived intact.</p><div className="mt-6 flex flex-wrap items-center gap-2"><span className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /> Collector active</span><span className="dashboard-top-control"><strong>{number(totalSessions)}</strong> sessions observed</span><span className="dashboard-top-control"><strong>{number(totalFires)}</strong> fires mapped</span></div></div>
        <ScoreRing value={avgHealth} label="Overall tag health" detail={avgHealth === null ? 'Collecting evidence' : avgHealth >= 95 ? 'Stable real-user signal' : 'Review recommended'} />
      </div>
    </section>

    {error && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">Live refresh issue: {error}</div>}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <CommandKpi label="Events / hour" value={number(stats.events_hour)} note={`${number(stats.events_24h)} observed in 24h`} tone="blue" />
      <CommandKpi label="Fires / session" value={avgEventsPerSession} note="Across observed sessions" tone="violet" />
      <CommandKpi label="Failed fires" value={number(failed)} note="Observed request failures" tone={failed ? 'rose' : 'lime'} />
      <CommandKpi label="Duplicate evidence" value={number(duplicates.length)} note={`${number(repeated.length)} repeat-sensitive`} tone={duplicates.length ? 'amber' : 'lime'} />
      <CommandKpi label="Delivery failures" value={number(deliveryFailures)} note="Alert channels" tone={deliveryFailures ? 'rose' : 'lime'} />
    </div>

    <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Event intelligence" title="What is the browser doing?" description="Volume, session spread, and duplicate pressure from the same real-user evidence store." /><EventHeatmap events={events} /></div>
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Action queue" title="Evidence that deserves attention" description="Prioritized from duplicate, alert, and failure signals." action={<Link href={`/dashboard/duplicates?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">Open lab →</Link>} /><EvidenceRail items={actions} /></div>
    </section>


    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Operator queue" title="Action center" description="Open evidence, not vague health scores." action={<Link href={`/dashboard/health?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">Deep health view →</Link>} />{actions.length ? <div className="divide-y divide-white/[.06]">{actions.map((item: any, index: number) => <button key={`${item.id}-${index}`} onClick={() => setSelectedAlert(item.sourceType === 'alert' ? item : { ...item, severity: 'warning' })} className="flex w-full items-start gap-3 py-3 text-left transition hover:bg-white/[.03]"><SeverityChip severity={item.severity || 'warning'} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-100">{item.message}</div><div className="mt-1 text-xs text-slate-500">{item.event_name || item.vendor || 'tag'} · {item.occurrence_count || 0} observed fires</div></div><span className="whitespace-nowrap text-xs text-slate-500">{timeAgo(item.created_at || item.last_seen)}</span></button>)}</div> : <div className="empty-visual">No prioritized action. Monitoring is collecting evidence.</div>}</div>
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Outbound reliability" title="Delivery health" description="Alert channels should be observable end to end." action={<Link href={`/dashboard/integrations?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">Manage →</Link>} /><div className="space-y-2">{['slack', 'email', 'webhook'].map((channel) => { const last = deliveries.find((item: any) => item.channel === channel); return <div key={channel} className="flex items-center justify-between border-b border-white/[.06] py-3 last:border-0"><span className="text-sm capitalize text-slate-300">{channel}</span>{last ? <span className={`pill ${last.status === 'delivered' ? 'bg-[#a8f06a]/10 text-[#b9f57e]' : last.status === 'failed' ? 'bg-[#ff718d]/10 text-[#ff9aae]' : 'bg-[#f6b94c]/10 text-[#ffd27a]'}`}>{last.status}</span> : <span className="text-xs text-slate-500">No delivery yet</span>}</div>; })}</div><div className="mt-5 rounded-xl border border-[#6d8cff]/15 bg-[#6d8cff]/[.06] p-3 text-xs leading-5 text-slate-400">Failed deliveries retry with backoff and remain visible here. High-priority tag incidents route in real time; lower-priority evidence rolls into the digest.</div></div>
    </section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Live evidence table" title="Live event pulse" description="Every row is an aggregated view over retained occurrence-level evidence." action={<Link href={`/dashboard/ga4?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">Open vendor view →</Link>} /><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="border-b border-white/[.07] text-[10px] uppercase tracking-[.12em] text-slate-500"><tr><th className="p-3 text-left">Event</th><th className="p-3 text-left">Vendor</th><th className="p-3 text-right">Fires</th><th className="p-3 text-right">Sessions</th><th className="p-3 text-right">Failures</th><th className="p-3 text-right">Avg latency</th></tr></thead><tbody className="divide-y divide-white/[.05]">{events.slice(0, 12).map((event: any, i: number) => <tr key={`${event.event_name}-${event.vendor}-${i}`} className="transition hover:bg-white/[.03]"><td className="p-3 font-mono text-slate-200">{event.event_name || '(unnamed)'}</td><td className="p-3 text-xs uppercase text-slate-500">{event.vendor}</td><td className="p-3 text-right font-medium text-slate-200">{number(event.cnt)}</td><td className="p-3 text-right text-slate-400">{number(event.sessions)}</td><td className={`p-3 text-right ${Number(event.failed || 0) ? 'font-medium text-[#ff718d]' : 'text-slate-500'}`}>{number(event.failed)}</td><td className="p-3 text-right text-slate-400">{Number(event.avg_latency_ms || 0) ? `${number(event.avg_latency_ms)} ms` : '—'}</td></tr>)}</tbody></table></div></section>

    <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
  </div>;
}

function number(value: unknown) { return Number(value || 0).toLocaleString(); }
function EmptyState() { return <div className="mx-auto max-w-lg py-20 text-center"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#6d8cff]/10 text-[#8fa8ff]"><span className="text-2xl">✦</span></div><h2 className="text-xl font-semibold text-white">Add your first site to get started</h2><p className="mt-2 text-sm leading-6 text-slate-400">Connect one GTM monitor tag and see every fire, failure, duplicate, consent decision, and delivery path in one command center.</p><Link href="/dashboard/settings" className="mt-6 inline-flex rounded-xl bg-[#a8f06a] px-5 py-3 text-sm font-semibold text-[#09100a] transition hover:bg-[#c5ff91]">Add a site</Link></div>; }
