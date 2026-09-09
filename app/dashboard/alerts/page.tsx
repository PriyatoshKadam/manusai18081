'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Pill, SeverityChip, formatDateTime, timeAgo } from '../ui';
import { eventDisplayName, plainAlertMessage, plainStatus, vendorDisplayName } from '../plain-language';

export default function AlertsPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      const [eventsRes, deliveryRes] = await Promise.all([
        fetch(`/api/events?siteId=${encodeURIComponent(siteId as string)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ alerts: [] })),
        fetch(`/api/alert-deliveries?siteId=${encodeURIComponent(siteId as string)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ deliveries: [] })),
      ]);
      if (!active) return;
      setAlerts(eventsRes.alerts || []);
      setDeliveries(deliveryRes.deliveries || []);
    }
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <div className="text-sm text-[var(--text-3)]">Select a website first.</div>;
  if (!alerts) return <div className="text-sm text-[var(--text-3)]">Loading alerts…</div>;

  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warning = alerts.filter((a) => a.severity === 'warning').length;
  const info = alerts.length - critical - warning;

  return (
    <div className="fade-in max-w-6xl">
      <div className="mb-6">
        <h2 className="font-display text-h3 text-[var(--text)]">Alerts</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">Every unresolved tracking issue GAfix has found, grouped by how urgent it is.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 rounded-full bg-[var(--surface-3)] p-1 w-fit">
        <span className="status-pill" style={{ background: 'var(--crit-bg)', color: 'var(--crit-fg)' }}><span className="status-dot" style={{ background: 'var(--crit-fg)' }} />Critical {critical}</span>
        <span className="status-pill" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}><span className="status-dot" style={{ background: 'var(--warn-dot)' }} />Warning {warning}</span>
        <span className="status-pill" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)' }}><span className="status-dot" style={{ background: 'var(--accent-2)' }} />Info {info}</span>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[2.6fr_1fr_1.5fr] gap-4 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
          <div>Alert</div><div>Severity</div><div>Last seen</div>
        </div>
        {alerts.length ? alerts.slice(0, 30).map((alert: any, index: number) => (
          <div key={`${alert.id}-${index}`} className="grid grid-cols-[2.6fr_1fr_1.5fr] items-center gap-4 border-b border-[var(--border-soft)] px-5 py-3.5 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[var(--text)]">{plainAlertMessage(alert)}</div>
              <div className="mt-0.5 text-xs text-[var(--text-3)]">{alert.event_name ? eventDisplayName(alert.event_name) : alert.vendor ? vendorDisplayName(alert.vendor) : 'Tracking'} · {plainStatus(alert.status || 'open')}</div>
            </div>
            <div><SeverityChip severity={alert.severity || 'warning'} /></div>
            <div className="text-xs text-[var(--text-2)]">{formatDateTime(alert.last_seen || alert.created_at)} · {timeAgo(alert.last_seen || alert.created_at)}</div>
          </div>
        )) : <div className="p-8 text-center text-sm text-[var(--text-3)]">No open alerts. GAfix is continuing to watch your tracking.</div>}
      </Card>

      <div className="mt-6">
        <h3 className="font-display font-semibold text-[var(--text)]">Alert delivery</h3>
        <p className="mt-1 text-sm text-[var(--text-2)]">The last few times GAfix tried to notify your team.</p>
        <Card className="mt-3 overflow-hidden">
          {deliveries.length ? deliveries.slice(0, 8).map((item: any) => (
            <div key={item.id} className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3 text-sm last:border-0">
              <span className="capitalize text-[var(--text-2)]">{item.channel} · {item.event_name || item.code}</span>
              <Pill tone={item.status === 'delivered' ? 'ok' : item.status === 'failed' ? 'crit' : 'warn'}>{item.status}</Pill>
            </div>
          )) : <div className="p-6 text-sm text-[var(--text-3)]">No alerts have been sent yet.</div>}
        </Card>
      </div>
    </div>
  );
}
