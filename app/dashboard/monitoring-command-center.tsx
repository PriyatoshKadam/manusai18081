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
    <section className="overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-5 lg:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="dashboard-eyebrow">Monitoring report · Last 24 hours</div>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--text)] lg:text-[26px]">See the signal before it becomes a reporting problem.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-2)]">This report combines visitor actions, dataLayer activity, browser requests, destinations, and alert evidence. It does not claim that a vendor processed a request unless GAfix has delivery evidence.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="dashboard-top-control"><span className="status-dot" style={{ background: 'var(--ok-dot)' }} /> Collector active</span>
            <span className="dashboard-top-control">{number(stats.sessions_24h)} sessions observed</span>
            <span className="dashboard-top-control">{number(stats.events_24h)} actions observed</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Monitoring report sections">
          {sectionLabels.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={section === item.key}
              onClick={() => setSection(item.key)}
              className="rounded-lg px-3 py-2 text-xs font-semibold transition"
              style={section === item.key
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              {item.label}
              {item.key === 'alerts' && activeAlerts > 0 ? <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: section === item.key ? 'rgba(255,255,255,.25)' : 'var(--crit-bg)', color: section === item.key ? '#fff' : 'var(--crit-fg)' }}>{number(activeAlerts)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 lg:p-7">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Delivery success rate" value={deliveryRate === null ? 'Collecting' : `${deliveryRate}%`} detail="Known delivery outcomes only" tone={deliveryRate === null || deliveryRate >= 95 ? 'ok' : 'warn'} />
          <MiniMetric label="Open issues" value={number(activeAlerts)} detail="Unresolved evidence-based alerts" tone={activeAlerts ? 'crit' : 'ok'} />
          <MiniMetric label="Possible blockers" value={number(confirmedBlockers)} detail="Confirmed browser blocking signals" tone={confirmedBlockers ? 'warn' : 'ok'} />
          <MiniMetric label="Possible repeats" value={number(duplicates.length)} detail="Review before calling them duplicates" tone={duplicates.length ? 'warn' : 'ok'} />
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <PanelHeading eyebrow="Activity" title="What is the website doing?" description="The most frequently observed actions in the selected period." />
      <div className="mt-5 space-y-4">
        {topEvents.length ? topEvents.map((event, index) => <div key={`${event.event_name}-${event.vendor}-${index}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-[var(--text)]"><span className="mr-2 text-[10px] text-[var(--text-3)]">{String(index + 1).padStart(2, '0')}</span>{eventDisplayName(event.event_name)}</span><span className="shrink-0 text-[var(--text-3)]">{number(event.cnt)} observed</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-3)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${Math.max(4, (Number(event.cnt || 0) / maxCount) * 100)}%` }} /></div>
          <div className="mt-1 flex justify-between text-[10px] text-[var(--text-3)]"><span>{vendorDisplayName(event.vendor)}</span><span>{Number(event.failed || 0) ? `${number(event.failed)} problems` : 'No confirmed delivery failures'}</span></div>
        </div>) : <EmptyPanel text="GAfix is waiting for tracking activity." />}
      </div>
    </div>

    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <PanelHeading eyebrow="Destinations" title="Where did tracking try to go?" description="First-party and third-party destinations are shown separately. A first-party destination is not by itself proof of server-side processing." />
      <div className="mt-5 space-y-3">
        {destinationRows.length ? destinationRows.map((row: any) => <div key={row.delivery_mode} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3.5">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: row.delivery_mode === 'first_party' ? 'var(--ok-dot)' : row.delivery_mode === 'third_party' ? 'var(--accent)' : 'var(--text-3)' }} /><span className="text-sm font-medium text-[var(--text)]">{destinationLabel(row.delivery_mode)}</span></div><span className="text-xs text-[var(--text-3)]">{number(row.events)} actions</span></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-3)]"><span>{number(row.sessions)} sessions</span><span>{number(row.destinations)} destinations</span><span>{row.blocked ? `${number(row.blocked)} blocker signals` : 'No blocker signals'}</span></div>
          {Array.isArray(row.domains) && row.domains.length ? <div className="mt-2 truncate text-[11px] text-[var(--text-3)]">{row.domains.slice(0, 3).join(' · ')}</div> : null}
        </div>) : <EmptyPanel text="Destination flow will appear after GAfix observes network activity." />}
      </div>
    </div>

    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 xl:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PanelHeading eyebrow="Action queue" title="Evidence that deserves attention" description="Open the evidence before deciding whether a tracking change is needed." /><button type="button" onClick={() => setSection('alerts')} className="shrink-0 text-xs font-semibold text-[var(--accent)]">Open all alerts →</button></div>
      {alerts.length ? <div className="mt-4 divide-y divide-[var(--border-soft)]">{alerts.slice(0, 5).map((alert: any, index: number) => <Link key={`${alert.id}-${index}`} href={`/dashboard/health?siteId=${encodeURIComponent(siteId)}`} className="flex items-start gap-3 py-3 transition hover:bg-[var(--surface-2)]"><SeverityChip severity={alert.severity || 'warning'} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-[var(--text)]">{plainAlertMessage(alert)}</div><div className="mt-1 text-xs text-[var(--text-3)]">{alert.event_name ? eventDisplayName(alert.event_name) : alert.vendor ? vendorDisplayName(alert.vendor) : 'Tracking evidence'} · {timeAgo(alert.last_seen || alert.created_at)}</div></div><span className="text-xs text-[var(--text-3)]">Open</span></Link>)}</div> : <EmptyPanel text="No open alerts. GAfix is continuing to watch your tracking." />}
    </div>
  </div>;
}

function AlertsPanel({ siteId, alerts }: { siteId: string; alerts: any[] }) {
  return <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><PanelHeading eyebrow="Alerts" title="What needs a decision?" description="Each alert links to the evidence GAfix used. Browser observations can identify a problem without proving vendor-side processing." /><div className="mt-5 divide-y divide-[var(--border-soft)]">{alerts.length ? alerts.map((alert: any, index: number) => <Link key={`${alert.id}-${index}`} href={`/dashboard/health?siteId=${encodeURIComponent(siteId)}`} className="flex items-start gap-3 py-4 transition hover:bg-[var(--surface-2)]"><SeverityChip severity={alert.severity || 'warning'} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-[var(--text)]">{plainAlertMessage(alert)}</div><div className="mt-1 text-xs text-[var(--text-3)]">{alert.event_name ? `${eventDisplayName(alert.event_name)} · ` : ''}{alert.vendor ? vendorDisplayName(alert.vendor) : 'Tracking'} · {plainStatus(alert.status || 'open')}</div></div><div className="shrink-0 text-xs text-[var(--text-3)]">{timeAgo(alert.last_seen || alert.created_at)}</div></Link>) : <EmptyPanel text="No unresolved alerts in this period." />}</div></div>;
}

function SourcesPanel({ events, platforms, platform, setPlatform }: { events: any[]; platforms: string[]; platform: string; setPlatform: (value: string) => void }) {
  return <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PanelHeading eyebrow="Tracking sources" title="Which tools are being observed?" description="Use this view to compare event names, platform identifiers, and delivery evidence." /><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] outline-none">{platforms.map((item) => <option key={item}>{item}</option>)}</select></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-[.12em] text-[var(--text-3)]"><tr><th className="p-3 text-left">Event</th><th className="p-3 text-left">Tool</th><th className="p-3 text-left">Platform ID</th><th className="p-3 text-right">Observed</th><th className="p-3 text-right">Delivered</th><th className="p-3 text-right">Problems</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{events.slice(0, 20).map((event: any, index: number) => <tr key={`${event.event_name}-${event.vendor}-${index}`} className="hover:bg-[var(--surface-2)]"><td className="p-3 font-mono text-[var(--text)]">{eventDisplayName(event.event_name)}</td><td className="p-3 text-xs text-[var(--text-3)]">{vendorDisplayName(event.vendor)}</td><td className="p-3 text-xs text-[var(--text-3)]">{event.platform_id || event.conversion_id || event.conversion_label || 'Not observed'}</td><td className="p-3 text-right text-[var(--text)]">{number(event.cnt)}</td><td className="p-3 text-right text-[var(--ok-fg)]">{number(event.delivered)}</td><td className="p-3 text-right text-[var(--text-3)]">{Number(event.failed || 0) ? number(event.failed) : 'None'}</td></tr>)}</tbody></table></div></div>;
}

function ConsentPanel({ events }: { events: any[] }) {
  const consentEvents = events.filter((event) => /consent|gcs|storage/i.test(`${event.event_name || ''} ${event.conversion_label || ''}`));
  return <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><PanelHeading eyebrow="Consent" title="What consent evidence is visible?" description="Consent state is context for interpreting delivery. It is not, by itself, proof that a tool failed or that a visitor was non-compliant." /><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-4"><div className="text-xs uppercase tracking-[.12em] text-[var(--text-3)]">Observed consent-related actions</div><div className="mt-2 text-3xl font-semibold text-[var(--text)]">{number(consentEvents.reduce((sum, event) => sum + Number(event.cnt || 0), 0))}</div><div className="mt-1 text-xs text-[var(--text-3)]">Grouped event observations in the selected period</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--tint)] p-4 text-sm leading-6 text-[var(--text-2)]">If analytics storage is denied, GAfix shows that state alongside the event evidence. It does not automatically call the event a delivery failure.</div></div></div>;
}

function GtmPanel({ siteId, events }: { siteId: string; events: any[] }) {
  const mapped = events.filter((event) => event.gtm_tag_names?.length || event.gtm_trigger_names?.length).slice(0, 12);
  return <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PanelHeading eyebrow="GTM setup" title="Which tags and triggers were mapped?" description="GTM inventory is configuration evidence. Runtime delivery evidence remains separate." /><Link href={`/dashboard/gtm?siteId=${encodeURIComponent(siteId)}`} className="text-xs font-semibold text-[var(--accent)]">Open GTM details →</Link></div><div className="mt-5 space-y-3">{mapped.length ? mapped.map((event: any, index: number) => <div key={`${event.event_name}-${index}`} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3"><div className="flex items-center justify-between gap-3"><span className="font-mono text-sm text-[var(--text)]">{eventDisplayName(event.event_name)}</span><span className="text-xs text-[var(--text-3)]">{event.gtm_correlation_confidence || 'Evidence mapped'}</span></div><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--text-3)]"><span>Tag: {Array.isArray(event.gtm_tag_names) && event.gtm_tag_names.length ? event.gtm_tag_names.join(', ') : 'Not mapped'}</span><span>Trigger: {Array.isArray(event.gtm_trigger_names) && event.gtm_trigger_names.length ? event.gtm_trigger_names.join(', ') : 'Not mapped'}</span></div></div>) : <EmptyPanel text="No runtime GTM mapping evidence has been observed yet." />}</div></div>;
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><div className="dashboard-eyebrow">{eyebrow}</div><h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-[var(--text)]">{title}</h3><p className="mt-1 text-xs leading-5 text-[var(--text-3)]">{description}</p></div>;
}

function MiniMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'ok' | 'warn' | 'crit' }) {
  const accent = tone === 'ok' ? 'var(--ok-fg)' : tone === 'warn' ? 'var(--warn-fg)' : 'var(--crit-fg)';
  return <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-4"><div className="text-[11px] uppercase tracking-[.12em] text-[var(--text-3)]">{label}</div><div className="mt-2 text-2xl font-semibold" style={{ color: accent }}>{value}</div><div className="mt-1 text-[11px] text-[var(--text-3)]">{detail}</div></div>;
}

function EmptyPanel({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-5 text-sm text-[var(--text-3)]">{text}</div>; }
function destinationLabel(value: string) { return value === 'first_party' ? 'First-party destinations' : value === 'third_party' ? 'Third-party tools' : 'Destination not classified'; }
function number(value: unknown) { return Number(value || 0).toLocaleString(); }
