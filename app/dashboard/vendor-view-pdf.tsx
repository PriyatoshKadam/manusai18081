'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Tab = 'overview' | 'events' | 'parameters' | 'pages' | 'consent' | 'adblocks' | 'ai';
type StatusFilter = 'All' | 'Healthy' | 'Needs attention' | 'New event' | 'Blocked';

const platformLabels: Record<string, string> = {
  ga4: 'Google Analytics 4', gads: 'Google Ads', meta: 'Meta', bing: 'Microsoft Ads', tiktok: 'TikTok', linkedin: 'LinkedIn', snapchat: 'Snapchat',
};

const eventLabel = (event: any) => event.event_name || 'Unnamed event';
const eventType = (event: any) => String(event.event_type || '').toLowerCase() === 'custom' ? 'Custom' : 'Standard';
const fmt = (value: any) => Number(value || 0).toLocaleString();

function statusForEvent(event: any, alerts: any[]): StatusFilter {
  const related = alerts.filter((alert) => alert.event_name === event.event_name);
  if (Number(event.blocked || 0) > 0) return 'Blocked';
  if (Number(event.failed || 0) > 0 || related.some((alert) => alert.severity === 'critical')) return 'Needs attention';
  if (related.some((alert) => /new_event|new event/i.test(`${alert.code || ''} ${alert.message || ''}`))) return 'New event';
  return 'Healthy';
}

function triggerForEvent(event: any) {
  if (event.gtm_trigger_names?.length) return `GTM · ${event.gtm_trigger_names[0]}`;
  const name = String(event.event_name || '').toLowerCase();
  if (name.includes('click') || name.includes('cta')) return 'CTA / click';
  if (name.includes('page_view') || name.includes('pageview') || name === 'view_item' || name === 'view') return 'View';
  if (name.includes('custom')) return 'Custom event';
  return 'DataLayer';
}

function noteForEvent(event: any, alerts: any[]) {
  const related = alerts.filter((alert) => alert.event_name === event.event_name);
  if (Number(event.failed || 0) > 0) return `${fmt(event.failed)} failed deliveries.`;
  if (Number(event.blocked || 0) > 0) return `${fmt(event.blocked)} deliveries blocked.`;
  if (Number(event.transport_anomalies || 0) > 0) return `${fmt(event.transport_anomalies)} transport anomalies.`;
  if (related[0]) return related[0].message || related[0].code || 'Issue detected.';
  return 'No issue detected.';
}

function Sparkline({ values }: { values: number[] }) {
  const points = values.length ? values : [0, 0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const path = points.map((value, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${94 - ((value - min) / span) * 84}`).join(' ');
  return <svg width="76" height="28" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Event trend"><polyline points={path} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LineGraph({ points }: { points: Array<{ hour: string; successful: number; blocked: number }> }) {
  const width = 720, height = 210, pad = 22;
  const max = Math.max(...points.flatMap((point) => [point.successful, point.blocked]), 1);
  const coords = (key: 'successful' | 'blocked') => points.map((point, index) => `${pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2)},${height - pad - (point[key] / max) * (height - pad * 2)}`).join(' ');
  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] min-w-[720px] w-full"><line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--border)"/><line x1={pad} x2={pad} y1={pad} y2={height - pad} stroke="var(--border)"/><polyline points={coords('successful')} fill="none" stroke="#16a34a" strokeWidth="3"/><polyline points={coords('blocked')} fill="none" stroke="#f97316" strokeWidth="3"/>{points.filter((_, index) => index % 4 === 0).map((point, index) => <text key={`${point.hour}-${index}`} x={pad + ((points.indexOf(point)) / Math.max(points.length - 1, 1)) * (width - pad * 2)} y={height - 5} fontSize="9" fill="var(--text-3)" textAnchor="middle">{new Date(point.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>)}</svg></div>;
}

export default function VendorView({ vendor, label, id }: { vendor: string; label: string; id: string | null }) {
  const search = useSearchParams();
  const siteId = search.get('siteId') || '';
  const [tab, setTab] = useState<Tab>('overview');
  const [eventStatus, setEventStatus] = useState<StatusFilter>('All');
  const [parameterStatus, setParameterStatus] = useState<'All' | 'Healthy' | 'Needs attention'>('All');
  const [pageStatus, setPageStatus] = useState<'All' | 'Healthy' | 'Needs attention'>('All');
  const [eventFilter, setEventFilter] = useState('All');
  const [parameterFilter, setParameterFilter] = useState('All');
  const [pageFilter, setPageFilter] = useState('All');
  const [adblockEventFilter, setAdblockEventFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [traffic, setTraffic] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/events?siteId=${siteId}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load event data'))),
      fetch(`/api/platform-insights?siteId=${siteId}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load monitoring insights'))),
      fetch(`/api/platform-traffic?siteId=${siteId}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : { trend: [] }),
    ]).then(([events, insights, trafficResponse]) => {
      if (cancelled) return;
      setData({ ...events, insights });
      setTraffic(trafficResponse.trend || []);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load monitoring data'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, vendor]);

  const events = data?.events || [];
  const alerts = (data?.alerts || []).filter((alert: any) => !alert.vendor || alert.vendor === vendor);
  const insights = data?.insights || {};
  const overview = insights.overview || {};
  const parameters = insights.parameters || [];
  const pages = insights.pages || [];
  const consent = insights.consent || {};
  const adblocks = insights.adblocks || {};
  const ai = insights.ai || {};
  const eventNames = useMemo(() => ['All', ...events.map(eventLabel).filter((value: string, index: number, array: string[]) => array.indexOf(value) === index)], [events]);
  const parameterNames = useMemo(() => ['All', ...parameters.map((row: any) => row.parameter_name)], [parameters]);
  const pageNames = useMemo(() => ['All', ...pages.map((row: any) => row.page_path)], [pages]);
  const adblockEventNames = useMemo(() => ['All', ...(adblocks.rows || []).map((row: any) => row.event_name)], [adblocks.rows]);
  const trendsByEvent = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of insights.eventTrends || []) map.set(row.event_name, [...(map.get(row.event_name) || []), Number(row.count || 0)]);
    return map;
  }, [insights.eventTrends]);
  const filteredEvents = events.filter((event: any) => eventFilter === 'All' || eventLabel(event) === eventFilter).filter((event: any) => eventStatus === 'All' || statusForEvent(event, alerts) === eventStatus);
  const filteredParameters = parameters.filter((row: any) => parameterFilter === 'All' || row.parameter_name === parameterFilter).filter((row: any) => parameterStatus === 'All' || (Number(row.coverage) >= 100 ? 'Healthy' : 'Needs attention') === parameterStatus);
  const filteredPages = pages.filter((row: any) => pageFilter === 'All' || row.page_path === pageFilter).filter((row: any) => pageStatus === 'All' || (Number(row.events) > 0 ? 'Healthy' : 'Needs attention') === pageStatus);
  const filteredBlocked = (adblocks.rows || []).filter((row: any) => adblockEventFilter === 'All' || row.event_name === adblockEventFilter);
  const newIssues = alerts.filter((alert: any) => !alert.created_at || new Date(alert.created_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000).length;
  const stillOpen = alerts.filter((alert: any) => !alert.resolved).length;
  const newEventTypes = alerts.filter((alert: any) => /new_event|new event/i.test(`${alert.code || ''} ${alert.message || ''}`)).length;
  const totalEventHits = Number(overview.total_event_hits || data?.stats?.events_24h || 0);
  const activeVendor = platformLabels[vendor] || label;

  if (!siteId) return <EmptyState title="Select a website" text="Choose a website from the dashboard sidebar to view platform monitoring."/>;
  if (loading && !data) return <LoadingState label={`Loading ${activeVendor} monitoring…`}/>;
  if (error && !data) return <EmptyState title="Monitoring data unavailable" text={error}/>;

  return <div className="fade-in mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="dashboard-eyebrow">Platform monitoring</p><div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--mon-tint)] text-xs font-bold text-[var(--mon-fg)]">{activeVendor.slice(0, 2).toUpperCase()}</span><div><h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">{activeVendor}</h2><p className="text-xs text-[var(--text-3)]">{id ? `Destination ${id}` : 'Destination configuration not detected'} · last 24 hours</p></div></div></div><Link href={`/dashboard/alerts?siteId=${siteId}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold text-[var(--text)] hover:border-[var(--border-strong)]">View alerts →</Link></header>
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">{([['overview','Overview'],['events','Events'],['parameters','Parameters'],['pages','Pages'],['consent','Consent'],['adblocks','Ad blockers'],['ai','AI / Bot detector']] as Array<[Tab,string]>).map(([key, name]) => <button key={key} type="button" onClick={() => setTab(key)} className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition" style={{ background: tab === key ? 'var(--mon-tint)' : 'transparent', color: tab === key ? 'var(--mon-fg)' : 'var(--text-2)' }}>{name}</button>)}</nav>
    {tab === 'overview' && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Kpi label="Total event hits" value={fmt(totalEventHits)}/><Kpi label="Event total" value={fmt(overview.event_total || events.length)}/><Kpi label="Parameters number" value={fmt(overview.parameter_number || parameters.length)}/><Kpi label="New issues" value={fmt(newIssues)} tone="warn"/><Kpi label="Still open" value={fmt(stillOpen)} tone={stillOpen ? 'warn' : 'ok'}/><Kpi label="New event type detected" value={fmt(newEventTypes)} tone={newEventTypes ? 'info' : 'ok'}/></div><div className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><Panel title="Platform health" subtitle="Delivery and detection evidence from the last 24 hours"><div className="grid gap-3 sm:grid-cols-3"><HealthMetric label="Successful network events" value={fmt(overview.successful_network_events)}/><HealthMetric label="Failed network events" value={fmt(overview.failed_network_events)} warn={Number(overview.failed_network_events)>0}/><HealthMetric label="Open alerts" value={fmt(stillOpen)} warn={stillOpen>0}/></div></Panel><Panel title="What needs attention" subtitle="Issues are ranked from the existing detection evidence.">{alerts.slice(0, 5).map((alert: any, index: number) => <div key={`${alert.id || index}`} className="flex gap-3 border-b border-[var(--border-soft)] py-3 last:border-0"><span className="mt-1 h-2 w-2 rounded-full" style={{background:alert.severity==='critical'?'#dc2626':'#f59e0b'}}/><div className="min-w-0"><div className="truncate text-xs font-semibold text-[var(--text)]">{alert.event_name || alert.code || 'Tracking issue'}</div><div className="mt-0.5 text-[11px] text-[var(--text-2)]">{alert.message || alert.code || 'Review this alert.'}</div></div></div>)}{!alerts.length?<Empty text="No open platform alerts."/>:null}</Panel></div></section>}
    {tab === 'events' && <section className="space-y-3"><SectionHeader title="Events" subtitle="Every observed event, its trigger, GTM correlation, volume and current notes."><FilterSelect label="Event name" value={eventFilter} values={eventNames} onChange={setEventFilter}/><RadioFilter value={eventStatus} values={['All','Healthy','Needs attention','New event','Blocked']} onChange={(value) => setEventStatus(value as StatusFilter)}/></SectionHeader><Table><thead><tr><Th>Status</Th><Th>Event Name</Th><Th>Trigger</Th><Th>GTM</Th><Th>Event Count</Th><Th>Notes</Th></tr></thead><tbody>{filteredEvents.map((event: any, index: number) => { const status = statusForEvent(event, alerts); const gtmTag = event.gtm_tag_names?.join(', ') || '—'; const gtmTrigger = event.gtm_trigger_names?.join(', ') || '—'; return <tr key={`${event.event_name}-${index}`}><Td><StatusPill status={status}/></Td><Td><div className="font-mono text-xs font-semibold text-[var(--text)]">{eventLabel(event)}</div><span className="mt-1 inline-block rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] text-[var(--text-3)]">{eventType(event)}</span></Td><Td><span className="text-xs">{triggerForEvent(event)}</span></Td><Td><div className="text-[11px] font-medium text-[var(--text)]">{gtmTag}</div><div className="mt-0.5 text-[10px] text-[var(--text-3)]">{gtmTrigger}</div></Td><Td><div className="flex items-center gap-2"><span className="font-semibold">{fmt(event.cnt)}</span><span className="w-[76px] text-[var(--mon-fg)]"><Sparkline values={trendsByEvent.get(String(event.event_name).toLowerCase()) || []}/></span></div></Td><Td><span className="text-[11px] text-[var(--text-2)]">{noteForEvent(event, alerts)}</span></Td></tr>; })}</tbody></Table>{!filteredEvents.length?<Empty text="No events match the current filters."/>:null}</section>}
    {tab === 'parameters' && <section className="space-y-3"><SectionHeader title="Parameters" subtitle="Mandatory parameter coverage across the events where each parameter is expected."><FilterSelect label="Parameter" value={parameterFilter} values={parameterNames} onChange={setParameterFilter}/><RadioFilter value={parameterStatus} values={['All','Healthy','Needs attention']} onChange={(value) => setParameterStatus(value as any)}/></SectionHeader><Table><thead><tr><Th>Status</Th><Th>Parameter Name</Th><Th>Reference Event</Th><Th>Coverage</Th><Th>Notes</Th></tr></thead><tbody>{filteredParameters.map((row: any) => { const healthy = Number(row.coverage) >= 100; const failing = (row.failing_events || []).join(', '); return <tr key={row.parameter_name}><Td><StatusPill status={healthy ? 'Healthy' : 'Needs attention'}/></Td><Td><span className="font-mono text-xs font-semibold">{row.parameter_name}</span></Td><Td><span className="cursor-help border-b border-dashed border-[var(--border-strong)] text-xs font-semibold" title={(row.passing_events || []).join(', ') || 'No passing event observed'}>{fmt(row.reference_event_count)}</span><span className="ml-1 text-[10px] text-[var(--text-3)]">of {fmt(row.mandatory_event_count)}</span></Td><Td><div className="flex items-center gap-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--surface-3)]"><div className="h-full rounded-full" style={{width:`${Math.min(100,Math.max(0,Number(row.coverage)||0))}%`,background:healthy?'#16a34a':'#f59e0b'}}/></div><span className="text-xs font-semibold">{Number(row.coverage || 0).toFixed(1)}%</span></div></Td><Td><span className="text-[11px] text-[var(--text-2)]">{failing ? `${failing}: missing or empty.` : 'Passed in the reference events.'}</span></Td></tr>})}</tbody></Table>{!filteredParameters.length?<Empty text="No parameter coverage evidence has been observed yet."/>:null}</section>}
    {tab === 'pages' && <section className="space-y-3"><SectionHeader title="Pages" subtitle="Page paths with event volume, sessions and observed session duration."><FilterSelect label="Page path" value={pageFilter} values={pageNames} onChange={setPageFilter}/><RadioFilter value={pageStatus} values={['All','Healthy','Needs attention']} onChange={(value) => setPageStatus(value as any)}/></SectionHeader><Table><thead><tr><Th>Status</Th><Th>Page Path</Th><Th>Event Count</Th><Th>Sessions</Th><Th>Session Duration</Th><Th>Notes</Th></tr></thead><tbody>{filteredPages.map((row: any) => <tr key={row.page_path}><Td><StatusPill status={Number(row.events)>0?'Healthy':'Needs attention'}/></Td><Td><span className="font-mono text-xs font-semibold">{row.page_path}</span></Td><Td><span className="text-xs font-semibold">{fmt(row.events)}</span></Td><Td><span className="text-xs">{fmt(row.sessions)}</span></Td><Td><span className="text-xs">{formatDuration(Number(row.session_duration_seconds || 0))}</span></Td><Td><span className="text-[11px] text-[var(--text-2)]">{Number(row.events)>0?'Events observed on this page.':'No event evidence observed.'}</span></Td></tr>)}</tbody></Table>{!filteredPages.length?<Empty text="No page-level event evidence has been observed yet."/>:null}</section>}
    {tab === 'consent' && <section className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><InsightCard title="CMP detection" value={consent.cmp?.name || 'Not detected'} note={consent.cmp?.detected ? `${fmt(consent.cmp.observations)} consent-state observations.` : 'The current telemetry does not identify a CMP provider.'}/><InsightCard title="Consent mode detection" value={consent.consentMode?.detected ? 'Detected' : 'Not detected'} note={consent.consentMode?.detected ? `${fmt(consent.consentMode.sessions)} sessions carried a consent-mode signal.` : 'No consent-mode signal has been observed in the current window.'}/><InsightCard title="Choice recorded" value={consent.choiceRecorded?.percent == null ? 'Collecting evidence' : `${consent.choiceRecorded.percent}% of sessions`} note={consent.choiceRecorded?.percent == null ? 'A precise choice rate is not supported by the current telemetry.' : `${fmt(consent.choiceRecorded.sessions)} sessions have an explicit recorded choice; ${Math.max(0,100-Number(consent.choiceRecorded.percent)).toFixed(1)}% have no explicit choice signal.`}/></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="mb-4"><h3 className="text-sm font-semibold text-[var(--text)]">Events firing outside consent</h3><p className="mt-1 text-xs text-[var(--text-3)]">Google Consent Mode can send cookieless measurement when storage is denied; that is not automatically a violation. Other vendor activity under denied storage is marked for review.</p></div><Table><thead><tr><Th>Status</Th><Th>Event Name</Th><Th>Compliant</Th><Th>Vendor / GTM</Th><Th>Notes</Th></tr></thead><tbody>{(consent.eventsOutsideConsent || []).map((row: any, index: number) => <tr key={`${row.event_name}-${index}`}><Td><StatusPill status={row.compliant?'Healthy':'Needs attention'}/></Td><Td><span className="font-mono text-xs">{row.event_name}</span></Td><Td><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${row.compliant?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{row.compliant?'✓':'×'}</span></Td><Td><div className="text-[11px] font-semibold">{row.vendor}</div><div className="text-[10px] text-[var(--text-3)]">{row.gtm_tag_name || 'No GTM tag matched'}</div></Td><Td><span className="text-[11px] text-[var(--text-2)]">{row.notes}</span></Td></tr>)}</tbody></Table>{!(consent.eventsOutsideConsent || []).length?<Empty text="No vendor events were observed while analytics or ad storage was denied."/>:null}</div></section>}
    {tab === 'adblocks' && <section className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Total Events" value={fmt(adblocks.total)}/><Kpi label="Successful events" value={fmt(adblocks.successful)} tone="ok"/><Kpi label="Blocked events" value={fmt(adblocks.blocked)} tone="warn"/></div><Panel title="Successful vs blocked events" subtitle="Hourly delivery evidence for the selected platform."><div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-4 text-[10px]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-green-600"/>Successful</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500"/>Blocked</span></div><FilterSelect label="Event name" value={adblockEventFilter} values={adblockEventNames} onChange={setAdblockEventFilter}/></div><LineGraph points={traffic}/></Panel><Table><thead><tr><Th>Status</Th><Th>Event Name</Th><Th>Blocked Events</Th><Th>Sessions</Th><Th>Notes</Th></tr></thead><tbody>{filteredBlocked.map((row: any) => <tr key={row.event_name}><Td><StatusPill status="Blocked"/></Td><Td><span className="font-mono text-xs">{row.event_name || 'Unnamed event'}</span></Td><Td><span className="text-xs font-semibold">{fmt(row.blocked)}</span></Td><Td><span className="text-xs">{fmt(row.sessions)}</span></Td><Td><span className="text-[11px] text-[var(--text-2)]">{row.notes}</span></Td></tr>)}</tbody></Table>{!filteredBlocked.length?<Empty text="No confirmed or likely ad-blocker impact was observed for this platform."/>:null}</section>}
    {tab === 'ai' && <section className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Total AI crawler hits" value={fmt(ai.totalHits)} tone="info"/><Kpi label="Unique AI platforms" value={fmt(ai.uniquePlatforms)} tone="info"/><InsightCard title="Coverage" value={ai.totalHits ? 'Observed' : 'No hits'} note="Detection is based on known AI crawler / agent user-agent signatures received by the telemetry endpoint."/></div><div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]"><Panel title="AI platforms" subtitle="Share of observed AI crawler telemetry."><div className="flex items-center gap-6">{ai.platforms?.length ? <div className="grid h-40 w-40 place-items-center rounded-full" style={{background:pieGradient(ai.platforms)}}><div className="grid h-24 w-24 place-items-center rounded-full bg-[var(--surface)] text-center"><span className="text-xl font-semibold">{fmt(ai.totalHits)}</span><span className="text-[9px] text-[var(--text-3)]">hits</span></div></div> : <Empty text="No known AI crawler hits observed."/>}<div className="space-y-2">{(ai.platforms || []).map((platform: any) => <div key={platform.name} className="flex items-center justify-between gap-6 text-xs"><span><b>{platform.name}</b><span className="ml-1 text-[var(--text-3)]">{platform.operator}</span></span><b>{fmt(platform.hits)}</b></div>)}</div></div></Panel><Panel title="Events AI crawled" subtitle="Events observed from known AI crawler user agents."><Table><thead><tr><Th>Status</Th><Th>Event Name</Th><Th>AI Name</Th><Th>Notes</Th></tr></thead><tbody>{(ai.events || []).flatMap((row: any) => (row.event_names?.length ? row.event_names : [row.event_name]).map((name: string) => ({...row,event_name:name}))).map((row: any,index:number)=><tr key={`${row.ai_name}-${row.event_name}-${index}`}><Td><StatusPill status="New event"/></Td><Td><span className="font-mono text-xs">{row.event_name}</span></Td><Td><div className="text-xs font-semibold">{row.ai_name}</div><div className="text-[10px] text-[var(--text-3)]">{row.operator} · {row.purpose}</div></Td><Td><span className="text-[11px] text-[var(--text-2)]">{row.notes}</span></Td></tr>)}</tbody></Table>{!ai.events?.length?<Empty text="No AI crawler event telemetry observed."/>:null}</Panel></div></section>}
  </div>;
}

function Kpi({ label, value, tone = 'info' }: { label: string; value: any; tone?: 'ok' | 'warn' | 'info' }) { const color = tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#f59e0b' : '#4f46e5'; return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ borderTop: `3px solid ${color}` }}><div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--text-3)]">{label}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div></div>; }
function HealthMetric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) { return <div className="rounded-xl bg-[var(--surface-2)] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-3)]">{label}</div><div className="mt-2 text-xl font-semibold" style={{color:warn?'#b45309':'var(--text)'}}>{value}</div></div>; }
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"><div className="mb-4"><h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>{subtitle?<p className="mt-1 text-xs leading-5 text-[var(--text-3)]">{subtitle}</p>:null}</div>{children}</div>; }
function InsightCard({ title, value, note }: { title: string; value: string; note: string }) { return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-3)]">{title}</div><div className="mt-3 text-lg font-semibold text-[var(--text)]">{value}</div><p className="mt-2 text-[11px] leading-5 text-[var(--text-2)]">{note}</p></div>; }
function SectionHeader({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:flex-row md:items-end md:justify-between"><div><h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3><p className="mt-1 text-xs text-[var(--text-3)]">{subtitle}</p></div><div className="flex flex-wrap items-center gap-2">{children}</div></div>; }
function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-[170px] bg-transparent text-[11px] font-semibold text-[var(--text)] outline-none">{values.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function RadioFilter({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) { return <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">{values.map((option) => <label key={option} className="flex items-center gap-1 text-[10px] text-[var(--text-2)]"><input type="radio" checked={value===option} onChange={() => onChange(option)} />{option}</label>)}</div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"><table className="w-full min-w-[900px] border-collapse text-left">{children}</table></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="border-b border-[var(--border)] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-3)]">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="border-b border-[var(--border-soft)] px-4 py-3 align-middle">{children}</td>; }
function StatusPill({ status }: { status: string }) { const config: Record<string, [string,string]> = { Healthy: ['#dcfce7','#166534'], 'Needs attention': ['#fef3c7','#92400e'], 'New event': ['#dbeafe','#1d4ed8'], Blocked: ['#ffedd5','#c2410c'] }; const [background,color] = config[status] || ['var(--surface-3)','var(--text-2)']; return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-bold" style={{background,color}}>{status}</span>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center text-xs text-[var(--text-3)]">{text}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-[var(--text-2)]">{text}</p></div>; }
function LoadingState({ label }: { label: string }) { return <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-2)]">{label}</div>; }
function formatDuration(seconds: number) { if (!seconds) return '—'; const mins = Math.floor(seconds / 60); const secs = Math.round(seconds % 60); return mins ? `${mins}m ${secs}s` : `${secs}s`; }
function pieGradient(platforms: any[]) { const total = platforms.reduce((sum, item) => sum + Number(item.hits || 0), 0) || 1; let cursor = 0; const parts = platforms.map((item, index) => { const start = cursor; cursor += (Number(item.hits || 0) / total) * 100; const hue = (index * 67) % 360; return `hsl(${hue} 70% 55%) ${start}% ${cursor}%`; }); return `conic-gradient(${parts.join(',')})`; }
