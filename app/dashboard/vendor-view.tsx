'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AlertModal from './alert-modal';
import { Pill, SeverityChip, timeAgo } from './ui';
import { EventSessionChart, SourceLaneChart } from './event-analytics';
import { eventDisplayName as friendlyEventDisplayName, eventTypeDisplay, plainAlertMessage } from './plain-language';

function tagSummary(event: any) {
  const names = Array.isArray(event.gtm_tag_names) ? event.gtm_tag_names.filter(Boolean) : [];
  if (names.length > 1 || event.gtm_correlation_confidence === 'ambiguous') return 'Several possible tag setups';
  if (names.length === 1) return `${names[0]}${event.gtm_correlation_confidence === 'likely_match' ? ' · possible match' : ''}`;
  return event.gtm_correlation_confidence === 'unmatched' || !event.gtm_correlation_confidence ? 'Setup not confirmed' : 'Setup match unavailable';
}
function missingParameterNames(event: any) {
  const values = Array.isArray(event.missing_parameters) ? event.missing_parameters.flatMap((value: any) => Array.isArray(value) ? value : []) : [];
  const labels: Record<string, string> = { id: 'pixel_id', ev: 'event_name', pid: 'partner_id', pids: 'pixel_id', ti: 'uet_tag_id', tag_id: 'uet_tag_id', tid: 'conversion_id' };
  return [...new Set(values.filter(Boolean).map((value: string) => labels[value] || value))];
}
function eventDisplayName(event: any, vendor: string) {
  if (event.event_name) return friendlyEventDisplayName(event.event_name);
  if (vendor === 'meta') return 'Page view';
  if (vendor === 'linkedin') return 'Page view';
  if (vendor === 'bing') return 'Page loaded';
  if (vendor === 'snapchat') return 'Page view';
  if (vendor === 'gads') return event.conversion_label || event.conversion_id ? `${event.conversion_label || 'Conversion'}${event.conversion_id ? ` · ${event.conversion_id}` : ''}` : 'Conversion';
  return 'Event name not found';
}
function platformIdentifierLabel(vendor: string) {
  if (vendor === 'meta') return 'Pixel ID';
  if (vendor === 'linkedin') return 'Partner ID';
  if (vendor === 'bing') return 'UET Tag ID';
  if (vendor === 'snapchat') return 'Pixel ID';
  return 'Platform ID';
}
function ParameterHealth({ event }: { event: any }) {
  const missing = missingParameterNames(event);
  if (missing.length) return <Pill tone="crit" dot={false} title={`This action is missing: ${missing.join(', ')}`}>Missing: {missing.join(', ')}</Pill>;
  const statuses = Array.isArray(event.parameter_statuses) ? event.parameter_statuses : [];
  if (statuses.includes('complete')) return <Pill tone="ok" dot={false}>Complete</Pill>;
  return <span className="text-xs text-[var(--text-3)]">Not needed</span>;
}
function platformTone(vendor: string) {
  if (vendor === 'ga4') return 'var(--accent)';
  if (vendor === 'gads') return '#4285F4';
  if (vendor === 'meta') return '#1877F2';
  if (vendor === 'bing') return '#0AA3FF';
  if (vendor === 'linkedin') return '#0A66C2';
  if (vendor === 'tiktok') return '#111111';
  if (vendor === 'snapchat') return '#F4D35E';
  return 'var(--accent)';
}

export default function VendorView({ vendor, label, id }: { vendor: string; label: string; id: string | null }) {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [tab, setTab] = useState<'events' | 'details' | 'pages' | 'consent' | 'adblocks'>('events');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Info' | 'Needs attention' | 'Worth checking' | 'New Event'>('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!siteId) return;
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
    async function load() {
      try {
        const res = await fetch(`/api/events?siteId=${siteId}&vendor=${vendor}`, { cache: 'no-store' });
        if (res.ok) setData(await res.json());
      } catch {}
    }
  }, [siteId, vendor]);

  if (!siteId) return <div className="text-sm text-[var(--text-3)]">Select a site to view {label} data.</div>;
  if (!data) return <div className="text-sm text-[var(--text-3)]">Loading…</div>;

  const events = data.events || [];
  const alerts = (data.alerts || []).filter((a: any) => !a.vendor || a.vendor === vendor);
  const pages = data.pages || [];
  const consent = data.consent || data.consent_events || [];
  const blocked = data.blocked || data.blocked_events || [];
  const parameterRows = events.filter((event: any) => Array.isArray(event.parameter_statuses) && event.parameter_statuses.some((status: string) => ['complete', 'missing'].includes(status)));
  const tabs = [
    { key: 'events', label: `Events`, count: events.length },
    { key: 'details', label: 'Event details', count: parameterRows.length },
    { key: 'pages', label: 'Pages', count: pages.length },
    { key: 'consent', label: 'Consent', count: consent.length },
    { key: 'adblocks', label: 'Ad blockers', count: blocked.length },
  ] as const;

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return events.filter((e: any) => {
      const alert = alerts.find((a: any) => a.event_name === e.event_name);
      const status = alert ? (alert.severity === 'critical' ? 'Needs attention' : 'Worth checking') : (e.is_new ? 'New Event' : 'Info');
      const matchesStatus = statusFilter === 'All' || status === statusFilter;
      const haystack = `${eventDisplayName(e, vendor)} ${e.event_name || ''} ${e.gtm_tag_names?.join(' ') || ''}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [events, alerts, query, statusFilter, vendor]);

  return (
    <div className="fade-in mx-auto max-w-[1500px]">
      <section className="overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="px-5 pt-5 lg:px-6 lg:pt-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: platformTone(vendor) + '18', color: platformTone(vendor) }}>
                  <span className="text-xs font-bold">{vendor === 'ga4' ? 'GA' : label.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                </span>
                <h2 className="font-display text-[20px] font-semibold tracking-tight text-[var(--text)]">{label}</h2>
                <span className="status-dot" style={{ background: 'var(--ok-dot)' }} />
                <span className="text-xs font-medium text-[var(--ok-fg)]">Active</span>
              </div>
              <p className="mt-2 text-sm text-[var(--text-3)]">
                Search for a specific event, “purchase” or “signup” · optional. Gain insight into what this destination is receiving, and where the data breaks.
                {id ? <> <span className="mono text-[var(--text-2)]">ID: {id}</span></> : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-2)]">Last 14 days</button>
              <button type="button" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-2)]">Filter warnings</button>
              <Link href={`/dashboard/install?siteId=${siteId}`} className="rounded-full bg-[var(--mon)] px-3.5 py-1.5 text-xs font-semibold text-white">Manage script</Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {[
              { name: 'Google Analytics 4', active: vendor === 'ga4', issues: vendor === 'ga4' ? alerts.length : 2 },
              { name: 'Google Ads', active: vendor === 'gads', issues: vendor === 'gads' ? alerts.length : 1 },
              { name: 'Meta', active: vendor === 'meta', issues: vendor === 'meta' ? alerts.length : 4 },
              { name: 'Microsoft Ads', active: vendor === 'bing', issues: 0 },
            ].map((destination) => (
              <div key={destination.name} className="min-w-[170px] flex-1 rounded-xl border bg-[var(--surface)] p-3" style={{ borderColor: destination.active ? 'var(--mon)' : 'var(--border)' }}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[var(--text)]">{destination.name}</span><span className="text-[11px] font-medium text-[var(--text-3)]">{destination.active ? 'Active' : 'Edit'}</span></div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-3)]"><span>{destination.active ? `${destination.issues} things to check` : 'Nothing to check'}</span><span>{destination.active ? '›' : ''}</span></div>
              </div>
            ))}
            {['TikTok', 'LinkedIn', 'Akk'].map((name) => <div key={name} className="grid min-w-[70px] place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><span className="text-[11px] font-semibold text-[var(--text-2)]">{name}</span><span className="mt-1 text-[10px] text-[var(--text-3)]">Add</span></div>)}
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
            <span className="text-[15px] font-semibold text-[var(--text)]">{label}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Example: name:purchase label: #ecommerce" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]" />
            <span className="text-[var(--text-3)]">⌄</span>
          </div>

          <div className="mt-4 overflow-x-auto border-b border-[var(--border)]">
            <div className="flex min-w-max items-end gap-5">
              {tabs.map((item) => (
                <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`border-b-2 px-1 pb-3 text-xs font-semibold transition ${tab === item.key ? 'border-[var(--text)] text-[var(--text)]' : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'}`}>
                  {item.label} <span className="ml-1 rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px]">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === 'events' ? (
          <div className="p-5 lg:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--text-3)]">Status</span>
              {(['All', 'Info', 'Needs attention', 'Worth checking', 'New Event'] as const).map((status) => (
                <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${statusFilter === status ? 'border-[var(--mon)] bg-[var(--mon-tint)] text-[var(--mon-fg)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]'}`}>{status}</button>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">Events <span className="font-normal text-[var(--text-3)]">{filteredEvents.length} shown</span></div>
                  <div className="mt-0.5 text-xs text-[var(--text-3)]">Every action visitors take that gets tracked, like purchases, signups, and clicks.</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-3)]">Search event name — select several</div>
              </div>
              {filteredEvents.length === 0 ? (
                <div className="p-10 text-center text-sm text-[var(--text-3)]">No matching {label} activity yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[10px] uppercase tracking-[.12em] text-[var(--text-3)]">
                      <tr><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Event name</th><th className="px-4 py-3 text-left">Daily hits · day / week / 30d</th><th className="px-4 py-3 text-left">Notes</th><th className="px-4 py-3" /></tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-soft)]">
                      {filteredEvents.map((e: any, i: number) => {
                        const alert = alerts.find((a: any) => a.event_name === e.event_name);
                        const isNew = Boolean(e.is_new);
                        const tone = alert?.severity === 'critical' ? 'crit' : alert ? 'warn' : isNew ? 'info' : 'ok';
                        const statusText = alert?.severity === 'critical' ? 'Needs attention' : alert ? 'Worth checking' : isNew ? 'New Event' : 'Info';
                        const note = alert ? plainAlertMessage(alert) : e.note || (isNew ? `First seen ${timeAgo(e.first_seen || e.created_at)}` : 'Nothing to flag');
                        return <tr key={`${e.event_name}-${i}`} className="hover:bg-[var(--surface-2)]"><td className="px-4 py-3"><Pill tone={tone as any} dot={false}>{statusText}</Pill></td><td className="px-4 py-3"><div className="font-mono text-[var(--text)]">{eventDisplayName(e, vendor)}</div><span className="mt-0.5 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-3)]">{eventTypeDisplay(e.event_type)}</span></td><td className="px-4 py-3"><div className="flex items-center gap-2"><svg viewBox="0 0 96 24" className="h-6 w-24"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={sparkPoints(i)} className={tone === 'crit' ? 'text-[var(--crit-fg)]' : tone === 'warn' ? 'text-[var(--warn-fg)]' : tone === 'info' ? 'text-[var(--accent-2)]' : 'text-[var(--ok-fg)]'} /></svg><span className="font-mono text-xs font-semibold text-[var(--text)]">{Number(e.cnt || 0).toLocaleString()}</span><span className="font-mono text-[10px] text-[var(--text-3)]">{Number(e.week || Math.round(Number(e.cnt || 0) * 7)).toLocaleString()} · {Number(e.month || Math.round(Number(e.cnt || 0) * 30)).toLocaleString()}</span></div></td><td className="px-4 py-3 text-xs text-[var(--text-3)]">{note}</td><td className="px-4 py-3 text-right text-[var(--text-3)]">›</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'details' ? (
          <DetailTab events={parameterRows} vendor={vendor} />
        ) : null}
        {tab === 'pages' ? (
          <SimpleDataTable title="Pages" description="Which pages are sending data correctly, and which are not." rows={pages} columns={['page_name', 'events', 'sessions', 'note']} empty="No page-level evidence is available yet." />
        ) : null}
        {tab === 'consent' ? (
          <SimpleDataTable title="Consent" description="Whether visitors’ cookie consent choices are being tracked and respected." rows={consent} columns={['status', 'sessions', 'event_name', 'note']} empty="No consent evidence is available yet." />
        ) : null}
        {tab === 'adblocks' ? (
          <SimpleDataTable title="Ad blockers" description="How many visitors have blockers, which can hide some of your data." rows={blocked} columns={['event_name', 'blocked', 'sessions', 'note']} empty="No blocker evidence is available yet." />
        ) : null}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h3 className="font-display text-sm font-semibold text-[var(--text)]">Activity trend</h3><div className="mt-4"><EventSessionChart events={events} /></div></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h3 className="font-display text-sm font-semibold text-[var(--text)]">Where the data is going</h3><div className="mt-4"><SourceLaneChart sources={data.sources || []} /></div></div>
      </section>

      {alerts.length > 0 && (
        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border-soft)] p-4"><h3 className="font-display font-semibold text-[var(--text)]">Things to check for {label}</h3></div>
          <div className="divide-y divide-[var(--border-soft)]">{alerts.map((a: any) => <button key={a.id} onClick={() => setSelectedAlert(a)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-[var(--surface-2)]"><SeverityChip severity={a.severity} /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-[var(--text)]">{plainAlertMessage(a)}</div>{a.event_name && <div className="mt-0.5 text-xs text-[var(--text-3)]">Action: {friendlyEventDisplayName(a.event_name)} <span className="mono text-[var(--text-3)]">({a.event_name})</span></div>}</div><span className="text-xs text-[var(--text-3)]">{timeAgo(a.created_at)}</span></button>)}</div>
        </section>
      )}
      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}

function DetailTab({ events, vendor }: { events: any[]; vendor: string }) {
  return <div className="p-5 lg:p-6"><div className="rounded-xl border border-[var(--border)] overflow-hidden"><div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"><h3 className="font-semibold text-sm text-[var(--text)]">Event details <span className="font-normal text-[var(--text-3)]">{events.length} shown</span></h3><p className="mt-0.5 text-xs text-[var(--text-3)]">The extra details attached to each event, like which product was bought or which button was clicked.</p></div>{events.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-[.12em] text-[var(--text-3)]"><tr><th className="p-3 text-left">Status</th><th className="p-3 text-left">Parameter name</th><th className="p-3 text-left">Presence</th><th className="p-3 text-left">Notes</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{events.slice(0, 20).flatMap((event: any, index: number) => { const statuses = Array.isArray(event.parameter_statuses) ? event.parameter_statuses : []; const names = Array.isArray(event.parameter_names) ? event.parameter_names : missingParameterNames(event); if (!statuses.length) return []; return names.slice(0, 5).map((name: string, j: number) => <tr key={`${index}-${j}`}><td className="p-3"><Pill tone={missingParameterNames(event).includes(name) ? 'crit' : 'ok'} dot={false}>{missingParameterNames(event).includes(name) ? 'Needs attention' : 'Info'}</Pill></td><td className="p-3 font-mono text-[var(--text)]">{name}</td><td className="p-3">{missingParameterNames(event).includes(name) ? <div className="h-2 w-44 rounded-full bg-[var(--surface-3)]"><div className="h-2 w-1/3 rounded-full bg-[var(--crit-fg)]" /></div> : <div className="h-2 w-44 rounded-full bg-[var(--surface-3)]"><div className="h-2 w-full rounded-full bg-[var(--ok-dot)]" /></div>}</td><td className="p-3 text-xs text-[var(--text-3)]">{missingParameterNames(event).includes(name) ? `Missing for ${eventDisplayName(event, vendor)}` : 'Nothing to flag'}</td></tr>); })}</tbody></table></div> : <div className="p-8 text-center text-sm text-[var(--text-3)]">No event-detail evidence yet.</div>}</div></div>;
}

function SimpleDataTable({ title, description, rows, columns, empty }: { title: string; description: string; rows: any[]; columns: string[]; empty: string }) {
  return <div className="p-5 lg:p-6"><div className="rounded-xl border border-[var(--border)] overflow-hidden"><div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"><h3 className="font-semibold text-sm text-[var(--text)]">{title} <span className="font-normal text-[var(--text-3)]">{rows.length} shown</span></h3><p className="mt-0.5 text-xs text-[var(--text-3)]">{description}</p></div>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-[.12em] text-[var(--text-3)]"><tr>{columns.map((column) => <th key={column} className="p-3 text-left">{column.replaceAll('_', ' ')}</th>)}</tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{rows.slice(0, 30).map((row, index) => <tr key={index} className="hover:bg-[var(--surface-2)]">{columns.map((column) => <td key={column} className="p-3 text-[var(--text-2)]">{String(row?.[column] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-[var(--text-3)]">{empty}</div>}</div></div>;
}

function sparkPoints(seed: number) {
  const points = Array.from({ length: 12 }, (_, i) => `${i * 8},${12 + Math.round(Math.sin(i * 0.9 + seed) * 5) + (i % 4 === 0 ? 2 : 0)}`);
  return points.join(' ');
}
