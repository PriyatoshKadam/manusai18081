'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AlertModal from '../alert-modal';
import { SeverityChip, timeAgo } from '../ui';
import { DataLayerProvenance, EventSessionChart, SourceLaneChart } from '../event-analytics';

export default function GtmDiagnosticsPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [selected, setSelected] = useState<any>(null);

  async function loadInventory() {
    if (!siteId) return;
    setInventoryLoading(true);
    setInventoryError('');
    try {
      const response = await fetch(`/api/gtm/inventory?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Unable to load GTM inventory');
      setInventory(body?.snapshot || null);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to load GTM inventory');
    } finally {
      setInventoryLoading(false);
    }
  }

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/gtm?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
        if (response.ok && !cancelled) setData(await response.json());
      } catch {}
    }
    load();
    loadInventory();
    const timer = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a website to check its Tag Manager setup.</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading Tag Manager checks…</div>;

  const alerts = data.alerts || [];
  const customEvents = data.customEvents || [];
  const dataLayer = data.dataLayer || [];
  const sources = data.sources || [];
  const provenance = data.provenance || [];
  const tags = Array.isArray(inventory?.tags) ? inventory.tags : [];
  const triggers = Array.isArray(inventory?.triggers) ? inventory.triggers : [];
  const variables = Array.isArray(inventory?.variables) ? inventory.variables : [];
  const tagById = new Map(tags.map((tag: any) => [String(tag.tagId), tag]));
  const triggerById = new Map(triggers.map((trigger: any) => [String(trigger.triggerId), trigger]));

  return (
    <div className="fade-in max-w-6xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-950">Tag Manager checks</h2>
        <p className="text-sm text-ink-500 mt-1">GAfix compares website actions, Tag Manager triggers, sent requests, and direct tracking to find setup conflicts.</p>
      </div>

      <section className="bg-white rounded-xl border border-ink-200 p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h3 className="font-semibold text-ink-950">GTM Connection &amp; Script Setup</h3>
            <p className="text-sm text-ink-500 mt-1">Connect the Google account, choose the GTM container and workspace, review the monitor script, and publish only after explicit confirmation.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {inventory ? <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">GTM inventory connected</span> : <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">GTM inventory not connected</span>}
              {inventory?.account_id && <span className="px-2.5 py-1 rounded-full bg-ink-50 text-ink-600 border border-ink-200">Account {inventory.account_id}</span>}
              {inventory?.container_id && <span className="px-2.5 py-1 rounded-full bg-ink-50 text-ink-600 border border-ink-200">Container {inventory.container_id}</span>}
              {inventory?.workspace_id && <span className="px-2.5 py-1 rounded-full bg-ink-50 text-ink-600 border border-ink-200">Workspace {inventory.workspace_id}</span>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={loadInventory} disabled={inventoryLoading} className="px-3 py-2 rounded-lg border border-ink-200 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50">{inventoryLoading ? 'Refreshing…' : 'Refresh GTM data'}</button>
            <Link href={`/dashboard/gtm-connect?siteId=${encodeURIComponent(siteId)}`} className="px-3 py-2 rounded-lg bg-ink-950 text-white text-sm font-medium hover:bg-ink-800">Open GTM setup</Link>
          </div>
        </div>
        {inventoryError && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{inventoryError} <Link className="underline ml-1" href={`/dashboard/gtm-connect?siteId=${encodeURIComponent(siteId)}`}>Connect GTM</Link></div>}
        {!inventory && !inventoryError && <div className="mt-4 rounded-lg bg-ink-50 border border-ink-100 px-3 py-2 text-sm text-ink-500">No saved GTM workspace inventory yet. Open GTM setup to connect an account and select a container/workspace.</div>}
      </section>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          ['Tag Manager alerts', alerts.length, alerts.length ? 'text-amber-600' : 'text-green-600'],
          ['Custom actions', customEvents.length, 'text-ink-950'],
          ['Website announcements', dataLayer.reduce((sum: number, row: any) => sum + Number(row.pushes || 0), 0), 'text-ink-950'],
          ['Ways tracking was observed', new Set(sources.map((row: any) => row.source).filter(Boolean)).size, 'text-ink-950'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-white p-4 rounded-xl border border-ink-200">
            <div className="text-xs text-ink-400 uppercase">{label}</div>
            <div className={`text-2xl font-semibold mt-1 ${color}`}>{Number(value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {inventory && <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div><h3 className="font-semibold text-ink-950">Connected GTM tags &amp; triggers</h3><p className="text-xs text-ink-500 mt-1">Live inventory from the selected GTM workspace. Trigger relationships are shown for each tag.</p></div>
          <span className="text-xs text-ink-400">Fetched {inventory.fetched_at ? timeAgo(inventory.fetched_at) : 'recently'}</span>
        </div>
        <div className="grid md:grid-cols-3 gap-3 p-4 border-b border-ink-100">
          {[['Tags', tags.length], ['Triggers', triggers.length], ['Variables', variables.length]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-ink-50 p-3"><div className="text-xs uppercase text-ink-400">{label}</div><div className="text-xl font-semibold text-ink-950 mt-1">{Number(value).toLocaleString()}</div></div>)}
        </div>
        {tags.length === 0 ? <div className="p-6 text-sm text-ink-400">No tags were returned for this workspace.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink-50 text-xs text-ink-500 uppercase"><tr><th className="text-left px-4 py-2">Tag</th><th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">Firing trigger</th><th className="text-left px-4 py-2">Tag ID</th></tr></thead><tbody className="divide-y divide-ink-100">{tags.map((tag: any) => { const triggerIds = Array.isArray(tag.firingTriggerIds) ? tag.firingTriggerIds : []; return <tr key={String(tag.tagId || tag.name)}><td className="px-4 py-3 font-medium text-ink-950">{tag.name || '(unnamed tag)'}</td><td className="px-4 py-3 text-ink-600">{tag.type || '—'}</td><td className="px-4 py-3">{triggerIds.length ? <div className="flex flex-wrap gap-1">{triggerIds.map((id: any) => <span key={String(id)} className="px-2 py-1 rounded bg-blue-50 text-blue-800 text-xs">{triggerById.get(String(id))?.name || String(id)}</span>)}</div> : <span className="text-ink-400">None</span>}</td><td className="px-4 py-3 mono text-xs text-ink-500">{tag.tagId || '—'}</td></tr>; })}</tbody></table></div>}
        {triggers.length > 0 && <div className="p-4 border-t border-ink-100"><h4 className="text-sm font-semibold text-ink-950 mb-2">Triggers</h4><div className="grid md:grid-cols-2 gap-2">{triggers.map((trigger: any) => <div key={String(trigger.triggerId || trigger.name)} className="rounded-lg border border-ink-100 p-3"><div className="text-sm font-medium text-ink-900">{trigger.name || '(unnamed trigger)'}</div><div className="text-xs text-ink-500 mt-1">{trigger.type || '—'} · {trigger.triggerId || '—'}</div></div>)}</div></div>}
      </section>}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-950">How to check a tracking problem</h3>
        <ol className="mt-3 grid md:grid-cols-4 gap-3 text-sm text-blue-900">
          <li><b>1. Trigger:</b> check that the right Tag Manager rule matches the action.</li>
          <li><b>2. Tags:</b> check which tracking tags respond to that rule.</li>
          <li><b>3. Website announcement:</b> check whether the website announced the action more than once.</li>
          <li><b>4. Sent requests:</b> check whether Tag Manager and direct tracking both sent the action.</li>
        </ol>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <EventSessionChart events={customEvents} />
        <SourceLaneChart sources={sources} />
      </div>

      <DataLayerProvenance rows={provenance} />

      <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Custom tracking actions</h3><p className="text-xs text-ink-500 mt-1">Custom action names are shown separately from Google’s standard actions. Each row shows how often the action appeared and in how many visits.</p></div>
        {customEvents.length === 0 ? <div className="p-6 text-sm text-ink-400">No custom tracking actions were seen in the last 24 hours.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink-50 text-xs text-ink-500 uppercase"><tr><th className="text-left px-4 py-2">Event</th><th className="text-right px-4 py-2">Times seen</th><th className="text-right px-4 py-2">Visits</th></tr></thead><tbody className="divide-y divide-ink-100">{customEvents.map((row: any) => <tr key={row.event_name}><td className="px-4 py-3 mono">{row.event_name}</td><td className="px-4 py-3 text-right">{Number(row.total).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.sessions).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Repeated website announcements</h3><p className="text-xs text-ink-500 mt-1">Repeated page views or scrolls are not automatically problems. Investigate only when the same visit and action show several matching website announcements.</p></div>
        {dataLayer.length === 0 ? <div className="p-6 text-sm text-ink-400">No website-announcement details yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink-50 text-xs text-ink-500 uppercase"><tr><th className="text-left px-4 py-2">Event</th><th className="text-right px-4 py-2">Announcements</th><th className="text-right px-4 py-2">Visits</th><th className="text-right px-4 py-2">Page changes</th><th className="text-right px-4 py-2">Different announcements</th></tr></thead><tbody className="divide-y divide-ink-100">{dataLayer.map((row: any) => <tr key={row.event_name}><td className="px-4 py-3 mono">{row.event_name || '(unnamed)'}</td><td className="px-4 py-3 text-right">{Number(row.pushes).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.sessions).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.navigations).toLocaleString()}</td><td className="px-4 py-3 text-right">{Number(row.distinct_pushes).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100"><h3 className="font-semibold text-ink-950">Tag Manager alerts</h3></div>
        {alerts.length === 0 ? <div className="p-6 text-sm text-green-700">No Tag Manager trigger, repeated-announcement, or direct-tracking conflicts are active.</div> : <div className="divide-y divide-ink-100">{alerts.map((alert: any) => <button key={alert.id} onClick={() => setSelected(alert)} className="w-full text-left p-4 hover:bg-ink-50 flex items-center gap-4"><SeverityChip severity={alert.severity} /><div className="flex-1 min-w-0"><div className="text-sm font-medium text-ink-950">{alert.message}</div><div className="text-xs text-ink-500 mt-1 mono">{alert.code}{alert.event_name ? ` · ${alert.event_name}` : ''}</div></div><span className="text-xs text-ink-400">{timeAgo(alert.created_at)}</span></button>)}</div>}
      </section>

      <AlertModal alert={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
