'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { eventDisplayName, plainAlertMessage, plainStatus, vendorDisplayName } from './plain-language';
import { SeverityChip, timeAgo } from './ui';

type MonitoringCommandCenterProps = {
  siteId: string;
  stats: Record<string, any>;
  events: any[];
  alerts: any[];
  health: any[];
  flow: any[];
  blockedFlow: any[];
  duplicates: any[];
};

type SectionKey = 'overview' | 'alerts' | 'sources' | 'consent' | 'gtm';

const sectionLabels: Array<{ key: SectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'sources', label: 'Tracking sources' },
  { key: 'consent', label: 'Consent' },
  { key: 'gtm', label: 'GTM setup' },
];

export default function MonitoringCommandCenter({ siteId, stats, events, alerts, health, flow, blockedFlow, duplicates }: MonitoringCommandCenterProps) {
  const [section, setSection] = useState<SectionKey>('overview');
  const [platform, setPlatform] = useState('All tools');

  const platforms = useMemo(() => ['All tools', ...Array.from(new Set(events.map((event) => vendorDisplayName(event.vendor)).filter(Boolean)))], [events]);
  const filteredEvents = useMemo(() => platform === 'All tools' ? events : events.filter((event) => vendorDisplayName(event.vendor) === platform), [events, platform]);
  const topEvents = filteredEvents.slice(0, 8);
  const maxCount = Math.max(1, ...topEvents.map((event) => Number(event.cnt || 0)));
  const confirmedBlockers = Number(stats.confirmed_blockers_24h || stats.adblock_24h || 0);
  const activeAlerts = Number(stats.active_alerts || alerts.length || 0);
  const scoredHealth = health.filter((row) => row.health_score !== null && row.health_score !== undefined);
  const deliveryRate = scoredHealth.length ? Math.round(scoredHealth.reduce((sum, row) => sum + Number(row.health_score), 0) / scoredHealth.length) : null;
  const destinationRows = flow.map((row) => {
    const blocked = blockedFlow.filter((item) => item.delivery_mode === row.delivery_mode).reduce((sum, item) => sum + Number(item.blocked || 0), 0);
    return { ...row, blocked };
  });

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-white/[.08] bg-[#0f1724] shadow-2xl shadow-black/20">
      <div className="border-b border-white/[.08] bg-[#111a28] p-5 lg:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="dashboard-eyebrow">Monitoring report · Last 24 hours</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white lg:text-3xl">See the signal before it becomes a reporting problem.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">This report combines visitor actions, dataLayer activity, browser requests, destinations, and alert evidence. It does not claim that a vendor processed a request unless GAfix has delivery evidence.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /> Collector active</span>
            <span className="dashboard-top-control">{number(stats.sessions_24h)} sessions observed</span>
            <span className="dashboard-top-control">{number(stats.events_24h)} actions observed</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Monitoring report sections">
          {sectionLabels.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={section === item.key} onClick={() => setSection(item.key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${section === item.key ? 'bg-[#a8f06a] text-[#0b130c]' : 'bg-white/[.04] text-slate-400 hover:bg-white/[.08] hover:text-white'}`}>
              {item.label}
              {item.key === 'alerts' && activeAlerts > 0 ? <span className="ml-2 rounded-full bg-[#ff718d]/15 px-1.5 py-0.5 text-[10px] text-[#ff9aae]">{number(activeAlerts)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 lg:p-7">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Delivery success rate" value={deliveryRate === null ? 'Collecting' : `${deliveryRate}%`} detail="Known delivery outcomes only" tone={deliveryRate === null || deliveryRate >= 95 ? 'lime' : 'amber'} />
          <MiniMetric label="Open issues" value={number(activeAlerts)} detail="Unresolved evidence-based alerts" tone={activeAlerts ? 'rose' : 'lime'} />
          <MiniMetric label="Possible blockers" value={number(confirmedBlockers)} detail="Confirmed browser blocking signals" tone={confirmedBlockers ? 'amber' : 'lime'} />
          <MiniMetric label="Possible repeats" value={number(duplicates.length)} detail="Review before calling them duplicates" tone={duplicates.length ? 'amber' : 'lime'} />
        </div>

        {section === 'overview' ? <OverviewPanel siteId={siteId} topEvents={topEvents} maxCount={maxCount} destinationRows={destinationRows} alerts={alerts} setSection={setSection} /> : null}
        {section === 'alerts' ? <AlertsPanel siteId={siteId} alerts={alerts} /> : null}
        {section === 'sources' ? <SourcesPanel events={filteredEvents} platforms={platforms} platform={platform} setPlatform={setPlatform} /> : null}
        {section === 'consent' ? <ConsentPanel events={events} /> : null}
        {section === 'gtm' ? <GtmPanel siteId={siteId} events={events} /> : null}
      </div>
    </section>
  );
}

function OverviewPanel({ siteId, topEvents, maxCount, destinationRows, alerts, setSection }: { siteId: string; topEvents: any[]; maxCount: number; destinationRows: any[]; alerts: any[]; setSection: (section: SectionKey) => void }) {
  return <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
    <div className="rounded-2xl border border-white/[.07] bg-[#111a28] p-5">
      <PanelHeading eyebrow="Activity" title="What is the website doing?" description="The most frequently observed actions in the selected period." />
      <div className="mt-5 space-y-4">
        {topEvents.length ? topEvents.map((event, index) => <div key={`${event.event_name}-${event.vendor}-${index}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-slate-200"><span className="mr-2 text-[10px] text-slate-600">{String(index + 1).padStart(2, '0')}</span>{eventDisplayName(event.event_name)}</span><span className="shrink-0 text-slate-400">{number(event.cnt)} observed</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#6d8cff] to-[#a8f06a]" style={{ width: `${Math.max(4, (Number(event.cnt || 0) / maxCount) * 100)}%` }} /></div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{vendorDisplayName(event.vendor)}</span><span>{Number(event.failed || 0) ? `${number(event.failed)} problems` : 'No confirmed delivery failures'}</span></div>
        </div>) : <EmptyPanel text="GAfix is waiting for tracking activity." />}
      </div>
    </div>

    <div className="rounded-2xl border border-white/[.07] bg-[#111a28] p-5">
      <PanelHeading eyebrow="Destinations" title="Where did tracking try to go?" description="First-party and third-party destinations are shown separately. A first-party destination is not by itself proof of server-side processing." />
      <div className="mt-5 space-y-3">
        {destinationRows.length ? destinationRows.map((row: any) => <div key={row.delivery_mode} className="rounded-xl border border-white/[.07] bg-white/[.02] p-3.5">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${row.delivery_mode === 'first_party' ? 'bg-[#a8f06a]' : row.delivery_mode === 'third_party' ? 'bg-[#6d8cff]' : 'bg-slate-500'}`} /><span className="text-sm font-medium text-slate-200">{destinationLabel(row.delivery_mode)}</span></div><span className="text-xs text-slate-400">{number(row.events)} actions</span></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>{number(row.sessions)} sessions</span><span>{number(row.destinations)} destinations</span><span>{row.blocked ? `${number(row.blocked)} blocker signals` : 'No blocker signals'}</span></div>
          {Array.isArray(row.domains) && row.domains.length ? <div className="mt-2 truncate text-[11px] text-slate-600">{row.domains.slice(0, 3).join(' · ')}</div> : null}
        </div>) : <EmptyPanel text="Destination flow will appear after GAfix observes network activity." />}
      </div>
    </div>

    <div className="rounded-2xl border border-white/[.07] bg-[#111a28] p-5 xl:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PanelHeading eyebrow="Action queue" title="Evidence that deserves attention" description="Open the evidence before deciding whether a tracking change is needed." /><button type="button" onClick={() => setSection('alerts')} className="shrink-0 text-xs font-semibold text-[#8fa8ff]">Open all alerts →</button></div>
      {alerts.length ? <div className="mt-4 divide-y divide-white/[.06]">{alerts.slice(0, 5).map((alert: any, index: number) => <Link key={`${alert.id}-${index}`} href={`/dashboard/health?siteId=${encodeURIComponent(siteId)}`} className="flex items-start gap-3 py-3 transition hover:bg-white/[.03]"><SeverityChip severity={alert.severity || 'warning'} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-200">{plainAlertMessage(alert)}</div><div className="mt-1 text-xs text-slate-500">{alert.event_name ? eventDisplayName(alert.event_name) : alert.vendor ? vendorDisplayName(alert.vendor) : 'Tracking evidence'} · {timeAgo(alert.last_seen || alert.created_at)}</div></div><span className="text-xs text-slate-600">Open</span></Link>)}</div> : <EmptyPanel text="No open alerts. GAfix is continuing to watch your tracking." />}
    </div>
  </div>;
}

function AlertsPanel({ siteId, alerts }: { siteId: string; alerts: any[] }) {
  return <div className="mt-6 rounded-2xl border border-white/[.07] bg-[#111a28] p-5"><PanelHeading eyebrow="Alerts" title="What needs a decision?" description="Each alert links to the evidence GAfix used. Browser observations can identify a problem without proving vendor-side processing." /><div className="mt-5 divide-y divide-white/[.06]">{alerts.length ? alerts.map((alert: any, index: number) => <Link key={`${alert.id}-${index}`} href={`/dashboard/health?siteId=${encodeURIComponent(siteId)}`} className="flex items-start gap-3 py-4 transition hover:bg-white/[.03]"><SeverityChip severity={alert.severity || 'warning'} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-200">{plainAlertMessage(alert)}</div><div className="mt-1 text-xs text-slate-500">{alert.event_name ? `${eventDisplayName(alert.event_name)} · ` : ''}{alert.vendor ? vendorDisplayName(alert.vendor) : 'Tracking'} · {plainStatus(alert.status || 'open')}</div></div><div className="shrink-0 text-xs text-slate-500">{timeAgo(alert.last_seen || alert.created_at)}</div></Link>) : <EmptyPanel text="No unresolved alerts in this period." />}</div></div>;
}

function SourcesPanel({ events, platforms, platform, setPlatform }: { events: any[]; platforms: string[]; platform: string; setPlatform: (value: string) => void }) {
  return <div className="mt-6 rounded-2xl border border-white/[.07] bg-[#111a28] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PanelHeading eyebrow="Tracking sources" title="Which tools are being observed?" description="Use this view to compare event names, platform identifiers, and delivery evidence." /><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-xs text-slate-200 outline-none"><option className="bg-[#111a28]">All tools</option>{platforms.filter((item) => item !== 'All tools').map((item) => <option key={item} className="bg-[#111a28]">{item}</option>)}</select></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b border-white/[.07] text-[10px] uppercase tracking-[.12em] text-slate-500"><tr><th className="p-3 text-left">Event</th><th className="p-3 text-left">Tool</th><th className="p-3 text-left">Platform ID</th><th className="p-3 text-right">Observed</th><th className="p-3 text-right">Delivered</th><th className="p-3 text-right">Problems</th></tr></thead><tbody className="divide-y divide-white/[.05]">{events.slice(0, 20).map((event: any, index: number) => <tr key={`${event.event_name}-${event.vendor}-${index}`} className="hover:bg-white/[.03]"><td className="p-3 font-mono text-slate-200">{eventDisplayName(event.event_name)}</td><td className="p-3 text-xs text-slate-400">{vendorDisplayName(event.vendor)}</td><td className="p-3 text-xs text-slate-500">{event.platform_id || event.conversion_id || event.conversion_label || 'Not observed'}</td><td className="p-3 text-right text-slate-200">{number(event.cnt)}</td><td className="p-3 text-right text-[#b9f57e]">{number(event.delivered)}</td><td className="p-3 text-right text-slate-400">{Number(event.failed || 0) ? number(event.failed) : 'None'}</td></tr>)}</tbody></table></div></div>;
}

function ConsentPanel({ events }: { events: any[] }) {
  const consentEvents = events.filter((event) => /consent|gcs|storage/i.test(`${event.event_name || ''} ${event.conversion_label || ''}`));
  return <div className="mt-6 rounded-2xl border border-white/[.07] bg-[#111a28] p-5"><PanelHeading eyebrow="Consent" title="What consent evidence is visible?" description="Consent state is context for interpreting delivery. It is not, by itself, proof that a tool failed or that a visitor was non-compliant." /><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-white/[.07] bg-white/[.02] p-4"><div className="text-xs uppercase tracking-[.12em] text-slate-500">Observed consent-related actions</div><div className="mt-2 text-3xl font-semibold text-white">{number(consentEvents.reduce((sum, event) => sum + Number(event.cnt || 0), 0))}</div><div className="mt-1 text-xs text-slate-500">Grouped event observations in the selected period</div></div><div className="rounded-xl border border-[#6d8cff]/15 bg-[#6d8cff]/[.06] p-4 text-sm leading-6 text-slate-400">If analytics storage is denied, GAfix shows that state alongside the event evidence. It does not automatically call the event a delivery failure.</div></div></div>;
}

function GtmPanel({ siteId, events }: { siteId: string; events: any[] }) {
  const mapped = events.filter((event) => event.gtm_tag_names?.length || event.gtm_trigger_names?.length).slice(0, 12);
  return <div className="mt-6 rounded-2xl border border-white/[.07] bg-[#111a28] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PanelHeading eyebrow="GTM setup" title="Which tags and triggers were mapped?" description="GTM inventory is configuration evidence. Runtime delivery evidence remains separate." /><Link href={`/dashboard/gtm?siteId=${encodeURIComponent(siteId)}`} className="text-xs font-semibold text-[#8fa8ff]">Open GTM details →</Link></div><div className="mt-5 space-y-3">{mapped.length ? mapped.map((event: any, index: number) => <div key={`${event.event_name}-${index}`} className="rounded-xl border border-white/[.07] bg-white/[.02] p-3"><div className="flex items-center justify-between gap-3"><span className="font-mono text-sm text-slate-200">{eventDisplayName(event.event_name)}</span><span className="text-xs text-slate-500">{event.gtm_correlation_confidence || 'Evidence mapped'}</span></div><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500"><span>Tag: {Array.isArray(event.gtm_tag_names) && event.gtm_tag_names.length ? event.gtm_tag_names.join(', ') : 'Not mapped'}</span><span>Trigger: {Array.isArray(event.gtm_trigger_names) && event.gtm_trigger_names.length ? event.gtm_trigger_names.join(', ') : 'Not mapped'}</span></div></div>) : <EmptyPanel text="No runtime GTM mapping evidence has been observed yet." />}</div></div>;
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><div className="dashboard-eyebrow">{eyebrow}</div><h3 className="mt-1 text-lg font-semibold tracking-[-.02em] text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>;
}

function MiniMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'lime' | 'amber' | 'rose' }) {
  const accent = tone === 'lime' ? 'text-[#b9f57e]' : tone === 'amber' ? 'text-[#ffd27a]' : 'text-[#ff9aae]';
  return <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-4"><div className="text-[11px] uppercase tracking-[.12em] text-slate-500">{label}</div><div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div><div className="mt-1 text-[11px] text-slate-500">{detail}</div></div>;
}

function EmptyPanel({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-white/[.1] p-5 text-sm text-slate-500">{text}</div>; }
function destinationLabel(value: string) { return value === 'first_party' ? 'First-party destinations' : value === 'third_party' ? 'Third-party tools' : 'Destination not classified'; }
function number(value: unknown) { return Number(value || 0).toLocaleString(); }
