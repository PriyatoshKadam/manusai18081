'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CommandKpi, DashboardSection } from '../command-visuals';

function n(value: unknown) { return Number(value || 0).toLocaleString(); }
function money(value: unknown, currency: unknown) { return Number.isFinite(Number(value)) && currency && currency !== 'MIXED' ? `${String(currency)} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'; }
function platformLabel(v: unknown) { const map: Record<string, string> = { ga4: 'GA4', gads: 'Google Ads', meta: 'Meta', bing: 'Microsoft Ads', tiktok: 'TikTok', linkedin: 'LinkedIn', snapchat: 'Snapchat' }; return map[String(v || '')] || String(v || 'Unknown'); }
function fmt(value: unknown) { if (!value) return '—'; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

export default function RevenuePage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      try { const response = await fetch(`/api/revenue?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' }); if (response.ok && active) setData(await response.json()); } catch {}
    }
    void load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <div className="text-sm text-slate-500">Select a site.</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading observed revenue…</div>;
  const s = data.summary || {};
  const records = Array.isArray(data.records) ? data.records : [];
  const platforms = Array.isArray(data.platforms) ? data.platforms : [];
  const trend = Array.isArray(data.trend) ? data.trend : [];
  const issueCounts = s.issue_counts || {};
  const matchRate = s.purchase_events ? Math.round((Number(s.healthy_purchases || 0) / Number(s.purchase_events)) * 100) : 0;

  return <div className="fade-in mx-auto max-w-[1500px] space-y-7">
    <div className="dashboard-section-head"><div><div className="dashboard-eyebrow">Revenue tracking · Last 30 days</div><h2>Observed revenue health</h2><p>Revenue is calculated only from purchase events captured by the GA4Fix monitoring script. It is not a GA4 Admin or payment-provider reconciliation.</p></div><div className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /><strong>Event telemetry</strong> · live</div></div>

    <div className="grid gap-3 md:grid-cols-5">
      <CommandKpi label="Observed revenue" value={money(s.observed_value, s.currency)} note="From captured purchase events" tone="blue" />
      <CommandKpi label="Purchase events" value={n(s.purchase_events)} note="Unique transaction/occurrence records" tone="blue" />
      <CommandKpi label="Average order value" value={money(s.average_order_value, s.currency)} note="Observed revenue ÷ purchase records" tone="lime" />
      <CommandKpi label="Needs review" value={n(s.purchases_to_review)} note={`${n(matchRate)}% of records currently healthy`} tone={s.purchases_to_review ? 'rose' : 'lime'} />
      <CommandKpi label="Duplicate observations" value={n(s.duplicate_observations)} note="Repeated purchase telemetry" tone={s.duplicate_observations ? 'amber' : 'lime'} />
    </div>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Revenue quality" title="Purchase data quality" description="Issues are inferred from the purchase events GA4Fix actually received." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Missing value', issueCounts['Missing purchase value']], ['Invalid value', issueCounts['Invalid purchase value']], ['Missing currency', issueCounts['Missing currency']], ['Conflicting values', issueCounts['Conflicting purchase values']], ['Delivery failures', issueCounts['Purchase delivery failure observed']]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/[.06] bg-[#0c121c] p-4"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-2 text-2xl font-semibold ${Number(value) ? 'text-[#ff9aae]' : 'text-[#b9f57e]'}`}>{n(value)}</div></div>)}</div></section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Observed trend" title="Revenue over time" description="Daily purchase events and revenue observed by the monitoring script." />{trend.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-white/[.06] text-[10px] uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Purchases</th><th className="px-3 py-3">Observed revenue</th></tr></thead><tbody>{trend.map((row: any) => <tr key={String(row.day)} className="border-b border-white/[.04]"><td className="px-3 py-3 text-slate-300">{String(row.day)}</td><td className="px-3 py-3 font-mono text-slate-200">{n(row.purchases)}</td><td className="px-3 py-3 font-mono text-slate-200">{money(row.observed_value, s.currency)}</td></tr>)}</tbody></table></div> : <div className="empty-visual">No purchase events observed yet.</div>}</section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Destination evidence" title="Purchase delivery by platform" description="This is delivery telemetry, not a comparison against platform-reported revenue." />{platforms.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{platforms.map((row: any) => <div key={String(row.vendor)} className="rounded-xl border border-white/[.06] bg-[#0c121c] p-4"><div className="font-medium text-slate-200">{platformLabel(row.vendor)}</div><div className="mt-3 flex justify-between text-xs"><span className="text-slate-500">Purchase records</span><span className="font-mono">{n(row.purchase_records)}</span></div><div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Delivered</span><span className="font-mono text-[#b9f57e]">{n(row.delivered)}</span></div><div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Failed</span><span className="font-mono text-[#ff9aae]">{n(row.failed)}</span></div></div>)}</div> : <div className="empty-visual">No platform delivery evidence is available yet.</div>}</section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Purchase records" title="Captured purchase events" description="One row represents a transaction when a transaction ID is available, otherwise an observed purchase occurrence." />{records.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead><tr className="border-b border-white/[.06] text-[10px] uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Status</th><th className="px-3 py-3">Transaction</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Page</th><th className="px-3 py-3">GTM</th><th className="px-3 py-3">Platforms</th><th className="px-3 py-3">Issue</th><th className="px-3 py-3">Timestamp</th></tr></thead><tbody>{records.map((row: any) => <tr key={String(row.occurrence_key)} className="border-b border-white/[.04] align-top"><td className="px-3 py-3"><span className={`pill ${row.status === 'healthy' ? 'bg-[#a8f06a]/10 text-[#b9f57e]' : 'bg-[#ff718d]/10 text-[#ff9aae]'}`}>{row.status === 'healthy' ? 'Healthy' : 'Review'}</span></td><td className="px-3 py-3 font-mono text-slate-200">{row.transaction_id || 'No transaction ID'}</td><td className="px-3 py-3 font-mono text-slate-200">{money(row.value, row.currency)}</td><td className="px-3 py-3 text-slate-400">{Array.isArray(row.pages) && row.pages.length ? row.pages.join(', ') : '—'}</td><td className="px-3 py-3 text-slate-400">{Array.isArray(row.gtm_tags) && row.gtm_tags.length ? row.gtm_tags.join(', ') : '—'}{Array.isArray(row.gtm_triggers) && row.gtm_triggers.length ? <div className="mt-1 text-[10px] text-slate-600">{row.gtm_triggers.join(', ')}</div> : null}</td><td className="px-3 py-3 text-slate-400">{Array.isArray(row.vendors) && row.vendors.length ? row.vendors.map(platformLabel).join(', ') : '—'}</td><td className="px-3 py-3"><div className="space-y-1">{Array.isArray(row.issues) && row.issues.length ? row.issues.map((issue: string) => <div key={issue} className="rounded-md bg-[#ff718d]/[.06] px-2 py-1 text-[#ff9aae]">{issue}</div>) : <span className="text-slate-500">None</span>}</div></td><td className="px-3 py-3 text-slate-400">{fmt(row.last_seen)}</td></tr>)}</tbody></table></div> : <div className="empty-visual">No purchase tracking records yet. GA4Fix will show them after a purchase event is captured.</div>}</section>

    <div className="rounded-xl border border-[#6d8cff]/15 bg-[#6d8cff]/[.06] p-4 text-xs leading-5 text-slate-400"><strong className="text-slate-200">Data-source note:</strong> {String(data.source_description || 'Revenue metrics are calculated from GA4Fix event telemetry only.')}</div>
  </div>;
}
