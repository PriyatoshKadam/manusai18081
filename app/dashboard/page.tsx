'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AlertModal from './alert-modal';
import { SeverityChip, formatDateTime, timeAgo } from './ui';
import { CommandKpi, DashboardSection, EvidenceRail, EventHeatmap, ScoreRing } from './command-visuals';
import { eventDisplayName, plainAlertMessage, plainStatus, vendorDisplayName } from './plain-language';

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
  const retries = data.retries || [];
  const deliveries = data.deliveries || [];
  const events = data.events || [];
  const scoredHealth = health.filter((row: any) => row.health_score !== null && row.health_score !== undefined);
  const avgHealth = scoredHealth.length ? Math.round(scoredHealth.reduce((sum: number, row: any) => sum + Number(row.health_score), 0) / scoredHealth.length) : null;
  const failed = health.reduce((sum: number, row: any) => sum + Number(row.failures || 0), 0);
  const deliveryFailures = deliveries.filter((item: any) => item.status === 'failed').length;
  const repeated = duplicates.filter((item: any) => ['login', 'run_audit'].includes(String(item.event_name || '').toLowerCase()));
  const actions = collapseActionItems([...duplicates.slice(0, 12), ...alerts.slice(0, 12)]).slice(0, 4);
  const totalSessions = Number(stats.sessions_24h || 0);
  const totalFires = events.reduce((sum: number, row: any) => sum + Number(row.cnt || 0), 0);
  const minSampleSize = 30;
  const avgEventsPerSession = totalSessions >= minSampleSize ? (totalFires / totalSessions).toFixed(1) : '—';
  const detectionCoverage = stats.detection_coverage_pct == null ? 'Collecting' : `${Number(stats.detection_coverage_pct).toFixed(1)}%`;

  return <div className="fade-in mx-auto max-w-[1500px] space-y-7">
    <section className="relative overflow-hidden rounded-[1.35rem] border border-white/[.08] bg-[#111a28] p-6 shadow-2xl shadow-black/20 lg:p-8">
      <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#657fff]/20 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-[#a8f06a]/10 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_220px] lg:items-center">
        <div><div className="dashboard-eyebrow">Live visitor tracking · Last 24 hours</div><h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-.04em] text-white lg:text-4xl">Know when your tracking needs attention.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">GAfix checks what visitors did, whether your tracking fired, where it was sent, and whether it arrived successfully.</p><div className="mt-6 flex flex-wrap items-center gap-2"><span className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /> Tracking is active</span><span className="dashboard-top-control"><strong>{number(totalSessions)}</strong> visitor sessions checked</span><span className="dashboard-top-control"><strong>{number(totalFires)}</strong> tracking actions seen</span></div></div>
        <ScoreRing value={avgHealth} label="Tracking health" detail={avgHealth === null ? 'Still collecting data' : avgHealth >= 95 ? 'Tracking looks healthy' : 'Worth checking'} />
      </div>
    </section>

    {error && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">Some live data could not be refreshed: {error}</div>}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      <CommandKpi label="Tracking actions per hour" value={number(stats.events_hour)} note={`${number(stats.events_24h)} seen in the last 24 hours`} tone="blue" />
      <CommandKpi label="Actions per visitor session" value={avgEventsPerSession} note={totalSessions < minSampleSize ? `Collecting (${totalSessions}/${minSampleSize} sessions)` : 'Across visitor sessions'} tone="violet" />
      <CommandKpi label="Tracking actions with problems" value={number(failed)} note="Could not be confirmed as received" tone={failed ? 'rose' : 'lime'} />
      <CommandKpi label="Possible repeat tracking" value={number(duplicates.length)} note={`${number(repeated.length)} repeat-sensitive events · ${number(retries.length)} automatic retries not counted`} tone={duplicates.length ? 'amber' : 'lime'} />
      <CommandKpi label="Data processing coverage" value={detectionCoverage} note={`${number(stats.detection_failures_24h)} items GAfix could not finish checking`} tone={stats.detection_failures_24h ? 'rose' : 'blue'} />
      <CommandKpi label="Alert delivery problems" value={number(deliveryFailures)} note="Slack, email, and webhook alerts" tone={deliveryFailures ? 'rose' : 'lime'} />
    </div>

    <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Visitor activity" title="What is happening on your website?" description="See which tracking actions happen most often and how many visitor sessions include them." /><EventHeatmap events={events} /></div>
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Needs attention" title="Things worth checking" description="GAfix puts the most important tracking issues first." action={<Link href={`/dashboard/duplicates?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">See possible repeats →</Link>} /><EvidenceRail items={actions} /></div>
    </section>


    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Your action list" title="What to do next" description="Open an issue to see the cause and suggested next steps." action={<Link href={`/dashboard/health?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">See all tracking health →</Link>} />{actions.length ? <div className="divide-y divide-white/[.06]">{actions.map((item: any, index: number) => <button key={`${item.id}-${index}`} onClick={() => setSelectedAlert(item.sourceType === 'alert' ? item : { ...item, severity: 'warning' })} className="flex w-full items-start gap-3 py-3 text-left transition hover:bg-white/[.03]"><SeverityChip severity={item.severity || 'warning'} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-100">{plainAlertMessage(item)}</div><div className="mt-1 text-xs text-slate-500">{item.event_name ? eventDisplayName(item.event_name) : item.vendor ? vendorDisplayName(item.vendor) : 'Tracking'} · {item.occurrence_count || 0} tracking actions seen{item.incidentCount > 1 ? ` · ${item.incidentCount} related issues` : ''}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500"><span>Triggered {formatDateTime(item.created_at || item.first_seen || item.last_seen)}</span>{item.last_seen && item.last_seen !== (item.created_at || item.first_seen) ? <span>Last seen {formatDateTime(item.last_seen)}</span> : null}</div></div><span className="whitespace-nowrap text-xs text-slate-500">{timeAgo(item.last_seen || item.created_at)}</span></button>)}</div> : <div className="empty-visual">Nothing needs your attention right now. GAfix is continuing to watch your tracking.</div>}</div>
      <div className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Alert delivery" title="Are alerts reaching your team?" description="Check whether Slack, email, and webhooks are working." action={<Link href={`/dashboard/integrations?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">Manage alerts →</Link>} /><div className="space-y-2">{['slack', 'email', 'webhook'].map((channel) => { const last = deliveries.find((item: any) => item.channel === channel); return <div key={channel} className="flex items-center justify-between border-b border-white/[.06] py-3 last:border-0"><span className="text-sm capitalize text-slate-300">{channel}</span>{last ? <span className={`pill ${last.status === 'delivered' ? 'bg-[#a8f06a]/10 text-[#b9f57e]' : last.status === 'failed' ? 'bg-[#ff718d]/10 text-[#ff9aae]' : 'bg-[#f6b94c]/10 text-[#ffd27a]'}`}>{plainStatus(last.status)}</span> : <span className="text-xs text-slate-500">No alerts sent yet</span>}</div>; })}</div><div className="mt-5 rounded-xl border border-[#6d8cff]/15 bg-[#6d8cff]/[.06] p-3 text-xs leading-5 text-slate-400">Failed alerts are tried again and remain visible here. Important issues can be sent immediately; lower-priority issues are grouped into the daily summary.</div></div>
    </section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Recent tracking activity" title="Recent tracking actions" description="Each row summarizes what GAfix recently saw on your website." action={<Link href={`/dashboard/ga4?siteId=${siteId}`} className="text-xs font-semibold text-[#8fa8ff]">See tracking details →</Link>} /><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="border-b border-white/[.07] text-[10px] uppercase tracking-[.12em] text-slate-500"><tr><th className="p-3 text-left">Action</th><th className="p-3 text-left">Tracking tool</th><th className="p-3 text-right">Times seen</th><th className="p-3 text-right">Visitor sessions</th><th className="p-3 text-right">Problems</th><th className="p-3 text-right">Average response time</th></tr></thead><tbody className="divide-y divide-white/[.05]">{events.slice(0, 12).map((event: any, i: number) => <tr key={`${event.event_name}-${event.vendor}-${i}`} className="transition hover:bg-white/[.03]"><td className="p-3 font-mono text-slate-200">{eventDisplayName(event.event_name)}</td><td className="p-3 text-xs text-slate-500">{vendorDisplayName(event.vendor)}</td><td className="p-3 text-right font-medium text-slate-200">{number(event.cnt)}</td><td className="p-3 text-right text-slate-400">{number(event.sessions)}</td><td className={`p-3 text-right ${Number(event.failed || 0) ? 'font-medium text-[#ff718d]' : 'text-slate-500'}`}>{Number(event.failed || 0) ? `${number(event.failed)} problem${Number(event.failed) === 1 ? '' : 's'}` : 'None'}</td><td className="p-3 text-right text-slate-400">{Number(event.avg_latency_ms || 0) ? `${number(event.avg_latency_ms)} ms` : 'Not available'}</td></tr>)}</tbody></table></div></section>

    <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
  </div>;
}

function collapseActionItems(items: any[]) {
  const grouped = new Map<string, any>();
  for (const item of items) {
    const key = `${String(item.event_name || item.vendor || 'signal').trim().toLowerCase()}:${String(item.vendor || '').trim().toLowerCase()}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item, incidentCount: 1 });
      continue;
    }
    existing.incidentCount += 1;
    existing.occurrence_count = Math.max(Number(existing.occurrence_count || 0), Number(item.occurrence_count || 0));
    const existingLast = new Date(existing.last_seen || existing.created_at || 0).getTime();
    const itemLast = new Date(item.last_seen || item.created_at || 0).getTime();
    if (itemLast > existingLast) {
      existing.last_seen = item.last_seen || item.created_at;
      existing.created_at = item.created_at || item.last_seen;
      existing.message = item.message || existing.message;
      existing.raw = item.raw || existing.raw;
    }
    const existingFirst = new Date(existing.first_seen || existing.created_at || 0).getTime();
    const itemFirst = new Date(item.first_seen || item.created_at || 0).getTime();
    if (itemFirst && (!existingFirst || itemFirst < existingFirst)) existing.first_seen = item.first_seen || item.created_at;
  }
  return [...grouped.values()].sort((a, b) => new Date(b.last_seen || b.created_at || 0).getTime() - new Date(a.last_seen || a.created_at || 0).getTime());
}
function number(value: unknown) { return Number(value || 0).toLocaleString(); }
function EmptyState() { return <div className="mx-auto max-w-lg py-20 text-center"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#6d8cff]/10 text-[#8fa8ff]"><span className="text-2xl">✦</span></div><h2 className="text-xl font-semibold text-white">Add your first site to get started</h2><p className="mt-2 text-sm leading-6 text-slate-400">Connect one GTM monitor tag and see every fire, failure, duplicate, consent decision, and delivery path in one command center.</p><Link href="/dashboard/settings" className="mt-6 inline-flex rounded-xl bg-[#a8f06a] px-5 py-3 text-sm font-semibold text-[#09100a] transition hover:bg-[#c5ff91]">Add a site</Link></div>; }
