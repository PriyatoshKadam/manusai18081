'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pill, SeverityChip, formatDateTime, timeAgo } from '../ui';
import { eventDisplayName, vendorDisplayName } from '../plain-language';

type Alert = {
  id: number;
  severity: 'critical' | 'warning' | 'info' | string;
  code: string;
  vendor?: string | null;
  event_name?: string | null;
  message: string;
  root_cause?: string | null;
  fix_steps?: unknown;
  page_url?: string | null;
  resolved?: boolean;
  muted?: boolean;
  category?: string | null;
  occurrence_count?: number | null;
  distinct_sessions?: number | null;
  distinct_pages?: number | null;
  confidence?: string | null;
  notification_status?: string | null;
  last_notified_at?: string | null;
  created_at: string;
  last_seen?: string | null;
};

const categories = ['all', 'events', 'parameters', 'pages', 'consent', 'ad_blocker', 'revenue', 'gtm', 'monitor'];
const severities = ['all', 'critical', 'warning', 'info'];
const statuses = ['all', 'ongoing', 'resolved', 'muted'];

export default function AlertsPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [status, setStatus] = useState('ongoing');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ siteId, status, severity, category });
      const [alertRes, deliveryRes] = await Promise.all([
        fetch('/api/alerts?' + qs.toString(), { cache: 'no-store' }),
        fetch('/api/alert-deliveries?siteId=' + encodeURIComponent(siteId), { cache: 'no-store' }),
      ]);
      const alertBody = await alertRes.json().catch(() => ({}));
      const deliveryBody = await deliveryRes.json().catch(() => ({}));
      if (!alertRes.ok) throw new Error(alertBody.error || 'We could not load alerts');
      setAlerts(alertBody.alerts || []);
      setDeliveries(deliveryBody.deliveries || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load alerts');
    } finally {
      setLoading(false);
    }
  }, [siteId, status, severity, category]);

  useEffect(() => { load(); }, [load]);

  async function act(action: string) {
    if (!selected) return;
    setActionBusy(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to update alert');
      setSelected(body.alert || null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update alert');
    } finally {
      setActionBusy(false);
    }
  }

  const counts = useMemo(() => ({
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity !== 'critical' && a.severity !== 'warning').length,
  }), [alerts]);

  if (!siteId) return <div className="text-sm text-[var(--text-3)]">Select a website first.</div>;

  return (
    <div className="fade-in max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="dashboard-eyebrow">Incident inbox</p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--text)]">Alerts</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-2)]">One place for actionable tracking problems. Issues are deduplicated and grouped by severity, platform and evidence.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-2)] shadow-sm hover:bg-[var(--surface-2)]">↻ Re-check</button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Critical" value={counts.critical} tone="crit" note="Needs attention now" />
        <Kpi label="Warnings" value={counts.warning} tone="warn" note="Worth investigating" />
        <Kpi label="Information" value={counts.info} tone="info" note="Context and discovery" />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow)]">
        <div className="flex flex-wrap gap-2">
          {statuses.map((item) => <FilterButton key={item} active={status === item} onClick={() => setStatus(item)}>{labelStatus(item)}</FilterButton>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border-soft)] pt-3">
          {severities.map((item) => <FilterButton key={item} active={severity === item} onClick={() => setSeverity(item)}>{labelSeverity(item)}</FilterButton>)}
          <span className="mx-1 hidden h-6 w-px bg-[var(--border-soft)] md:block" />
          {categories.map((item) => <FilterButton key={item} active={category === item} onClick={() => setCategory(item)}>{labelCategory(item)}</FilterButton>)}
        </div>
      </section>

      {error ? <div className="rounded-xl border border-[var(--crit-bd)] bg-[var(--crit-bg)] px-4 py-3 text-sm text-[var(--crit-fg)]">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="grid grid-cols-[minmax(270px,2.2fr)_110px_135px_145px] gap-4 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--text-3)]">
            <span>Issue</span><span>Severity</span><span>Scope</span><span>Last detected</span>
          </div>
          {loading ? <div className="space-y-2 p-4">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface-2)]" />)}</div>
            : alerts.length ? alerts.map((alert) => (
              <button type="button" key={alert.id} onClick={() => setSelected(alert)} className="grid w-full grid-cols-[minmax(270px,2.2fr)_110px_135px_145px] items-center gap-4 border-b border-[var(--border-soft)] px-5 py-4 text-left transition hover:bg-[var(--surface-2)]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">{friendlyIssue(alert)}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-3)]">
                    <span>{alert.code}</span>{alert.event_name ? <span>· {eventDisplayName(alert.event_name)}</span> : null}
                  </div>
                </div>
                <SeverityChip severity={alert.severity} />
                <div className="text-xs text-[var(--text-2)]"><div>{alert.vendor ? vendorDisplayName(alert.vendor) : 'Monitoring'}</div><div className="mt-0.5 text-[var(--text-3)]">{labelCategory(alert.category || 'monitor')}</div></div>
                <div className="text-xs text-[var(--text-2)]">{formatDateTime(alert.last_seen || alert.created_at)}<div className="mt-0.5 text-[var(--text-3)]">{timeAgo(alert.last_seen || alert.created_at)}</div></div>
              </button>
            ))
            : <div className="grid min-h-[320px] place-items-center p-8 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--ok-bg)] text-lg text-[var(--ok-fg)]">✓</div><h3 className="mt-4 font-semibold text-[var(--text)]">No alerts in this view</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[var(--text-3)]">GAfix is continuing to watch the selected scope. Try a broader filter to inspect resolved or informational issues.</p></div></div>}
        </section>

        <AlertDetail alert={selected} busy={actionBusy} deliveries={deliveries} onAction={act} onClose={() => setSelected(null)} />
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div><h3 className="font-display text-lg font-semibold text-[var(--text)]">Notification delivery</h3><p className="mt-1 text-sm text-[var(--text-2)]">Operational history for Slack, email and webhook notifications.</p></div>
          <span className="text-xs text-[var(--text-3)]">Last 50 attempts</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-4 border-b border-[var(--border-soft)] pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-3)]"><span>Channel</span><span>Status</span><span>Attempts</span><span>Time</span></div>
        {deliveries.length ? deliveries.slice(0, 8).map((item) => <div key={item.id} className="grid grid-cols-4 gap-4 border-b border-[var(--border-soft)] py-3 text-xs last:border-0"><span className="capitalize text-[var(--text-2)]">{item.channel}</span><span><Pill tone={item.status === 'delivered' ? 'ok' : item.status === 'failed' ? 'crit' : 'warn'}>{item.status}</Pill></span><span className="text-[var(--text-3)]">{item.attempt_count || 0}</span><span className="text-[var(--text-2)]">{formatDateTime(item.delivered_at || item.created_at)}</span></div>) : <div className="py-8 text-center text-sm text-[var(--text-3)]">No notification attempts yet.</div>}
      </section>
    </div>
  );
}

function AlertDetail({ alert, busy, deliveries, onAction, onClose }: { alert: Alert | null; busy: boolean; deliveries: any[]; onAction: (action: string) => void; onClose: () => void }) {
  if (!alert) return <aside className="hidden min-h-[420px] rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 xl:block"><div className="grid h-full place-items-center text-center"><div><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--surface)] text-[var(--text-3)] shadow-sm">↗</div><h3 className="mt-4 font-semibold text-[var(--text)]">Select an alert</h3><p className="mt-1 max-w-xs text-sm leading-6 text-[var(--text-3)]">Inspect the evidence chain, scope, lifecycle and notification status without leaving the inbox.</p></div></div></aside>;
  const fixes = Array.isArray(alert.fix_steps) ? alert.fix_steps.map(String) : [];
  const related = deliveries.filter((item) => String(item.event_name || item.code || '') === String(alert.event_name || alert.code || '')).slice(0, 4);

  return <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
    <div className="border-b border-[var(--border-soft)] p-5">
      <div className="flex items-start justify-between gap-3"><div><SeverityChip severity={alert.severity}/><h3 className="mt-3 font-display text-lg font-semibold text-[var(--text)]">{friendlyIssue(alert)}</h3><p className="mt-1 text-xs text-[var(--text-3)]">{formatDateTime(alert.created_at)} · {alert.confidence || 'confirmed'} confidence</p></div><button onClick={onClose} className="rounded-lg px-2 py-1 text-lg text-[var(--text-3)] hover:bg-[var(--surface-2)] xl:hidden" aria-label="Close">×</button></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {alert.resolved ? <Pill tone="ok">Resolved</Pill> : alert.muted ? <Pill tone="neutral">Muted</Pill> : <Pill tone="warn">Ongoing</Pill>}
        {alert.vendor ? <Pill tone="neutral" dot={false}>{vendorDisplayName(alert.vendor)}</Pill> : null}
        {alert.category ? <Pill tone="neutral" dot={false}>{labelCategory(alert.category)}</Pill> : null}
      </div>
    </div>

    <div className="space-y-5 p-5">
      <DetailBlock title="What happened"><p className="text-sm leading-6 text-[var(--text-2)]">{alert.message}</p></DetailBlock>

      <DetailBlock title="Evidence">
        <div className="space-y-2">
          <EvidenceRow label="Occurrences" value={String(alert.occurrence_count ?? 0)} />
          <EvidenceRow label="Distinct sessions" value={String(alert.distinct_sessions ?? 0)} />
          <EvidenceRow label="Distinct pages" value={String(alert.distinct_pages ?? 0)} />
          <EvidenceRow label="Last detected" value={formatDateTime(alert.last_seen || alert.created_at)} />
          <EvidenceRow label="Notification" value={alert.notification_status || 'pending'} />
        </div>
      </DetailBlock>

      {alert.root_cause ? <DetailBlock title="Root cause"><p className="text-sm leading-6 text-[var(--text-2)]">{alert.root_cause}</p></DetailBlock> : null}

      {alert.page_url ? <DetailBlock title="Affected page"><div className="break-all rounded-xl bg-[var(--surface-2)] p-3 font-mono text-[11px] leading-5 text-[var(--text-2)]">{alert.page_url}</div></DetailBlock> : null}

      {fixes.length ? <DetailBlock title="Recommended next steps"><div className="space-y-2">{fixes.map((fix, index) => <div key={index} className="flex gap-2 text-sm leading-5 text-[var(--text-2)]"><span className="font-semibold text-[var(--accent)]">{index + 1}.</span><span>{fix}</span></div>)}</div></DetailBlock> : null}

      {related.length ? <DetailBlock title="Recent notification attempts"><div className="space-y-2">{related.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs"><span className="capitalize text-[var(--text-2)]">{item.channel}</span><span className="text-[var(--text-3)]">{item.status}</span></div>)}</div></DetailBlock> : null}

      <div className="flex flex-wrap gap-2 border-t border-[var(--border-soft)] pt-5">
        {!alert.resolved ? <button disabled={busy} onClick={() => onAction('resolve')} className="rounded-xl bg-[var(--btn-dark)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resolve</button> : <button disabled={busy} onClick={() => onAction('reopen')} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] disabled:opacity-50">Reopen</button>}
        {!alert.muted ? <button disabled={busy} onClick={() => onAction('mute')} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] disabled:opacity-50">Mute</button> : <button disabled={busy} onClick={() => onAction('unmute')} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] disabled:opacity-50">Unmute</button>}
        <button disabled={busy} onClick={() => onAction('acknowledge')} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] disabled:opacity-50">Acknowledge</button>
      </div>
    </div>
  </aside>;
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) { return <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--text-3)]">{title}</div>{children}</div>; }
function EvidenceRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] py-2 text-xs last:border-0"><span className="text-[var(--text-3)]">{label}</span><span className="font-semibold text-[var(--text)]">{value}</span></div>; }
function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition" style={{ background: active ? 'var(--tint)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-3)' }}>{children}</button>; }
function Kpi({ label, value, note, tone }: { label: string; value: number; note: string; tone: 'crit'|'warn'|'info' }) { return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--text-3)]">{label}</span><span className="status-dot" style={{ background: tone === 'crit' ? 'var(--crit-fg)' : tone === 'warn' ? 'var(--warn-dot)' : 'var(--accent-2)' }} /></div><div className="mt-2 font-display text-2xl font-semibold text-[var(--text)]">{value.toLocaleString()}</div><div className="mt-1 text-xs text-[var(--text-3)]">{note}</div></div>; }

function friendlyIssue(alert: Alert) {
  const map: Record<string, string> = {
    missing_event: 'Missing event',
    offline_event: 'Event has gone quiet',
    traffic_drop: 'Traffic dropped',
    traffic_spike: 'Traffic spiked',
    duplicate_event: 'Duplicate event delivery',
    gtm_multiple_tags_or_triggers: 'Multiple GTM deliveries',
    delivery_failure: 'Network delivery failure',
    unexpected_property: 'Unexpected property',
    missing_parameter: 'Required parameter missing',
    type_collision: 'Parameter type conflict',
    consent_violation: 'Tracking before consent',
    consent_timing_issue: 'Consent signal timing issue',
    blocker_affected_purchase: 'Purchase affected by blocker evidence',
    adblock_impact: 'Ad blocker impact',
  };
  return map[alert.code] || alert.message || alert.code;
}
function labelStatus(value: string) { return value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1); }
function labelSeverity(value: string) { return value === 'all' ? 'All severities' : value.charAt(0).toUpperCase() + value.slice(1); }
function labelCategory(value: string) { return value === 'all' ? 'All categories' : value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }
