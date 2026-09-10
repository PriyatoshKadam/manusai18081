'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CommandKpi, DashboardSection } from '../command-visuals';

function n(value: unknown) { return Number(value || 0).toLocaleString(); }
function list(value: unknown): string[] { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function isPurchase(eventName: unknown) { return /^(purchase|transaction|order_complete|ecommerce_purchase)$/i.test(String(eventName || '')); }
function platformLabel(vendor: unknown) { const map: Record<string, string> = { ga4: 'GA4', gads: 'Google Ads', meta: 'Meta', bing: 'Microsoft Ads', tiktok: 'TikTok', linkedin: 'LinkedIn', snapchat: 'Snapchat' }; return map[String(vendor || '')] || String(vendor || 'Unknown'); }

export default function RevenuePage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [blockers, setBlockers] = useState<any>(null);

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      try {
        const [healthResponse, blockerResponse] = await Promise.all([
          fetch(`/api/tag-health?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' }),
          fetch(`/api/adblock?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' }),
        ]);
        if (!active) return;
        if (healthResponse.ok) setData(await healthResponse.json());
        if (blockerResponse.ok) setBlockers(await blockerResponse.json());
      } catch {}
    }
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [siteId]);

  if (!siteId) return <div className="text-sm text-slate-500">Select a site.</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading revenue tracking…</div>;

  const revenue = data.revenue || [];
  const purchaseRouting = Array.isArray(data.routing_policy?.events?.purchase) ? data.routing_policy.events.purchase : [];
  const mismatch = revenue.filter((row: any) => ['value_mismatch', 'missing_vendor', 'currency_mismatch', 'invalid_value', 'missing', 'duplicate'].includes(row.status));
  const deltaCurrencies = [...new Set(revenue.filter((row: any) => row.delta_value !== null && row.delta_value !== undefined && row.currency && row.currency !== 'MIXED').map((row: any) => row.currency))];
  const totalDelta = deltaCurrencies.length === 1 ? revenue.reduce((sum: number, row: any) => sum + Math.abs(Number(row.delta_value || 0)), 0) : null;
  const matched = revenue.filter((row: any) => row.status === 'matched').length;

  const recentBlockers = Array.isArray(blockers?.recent) ? blockers.recent.filter((row: any) => isPurchase(row.event_name)) : [];
  const confirmedPurchaseBlockers = useMemo(() => {
    const byTransaction = new Map<string, Set<string>>();
    for (const row of recentBlockers) {
      const key = String(row.session_id || row.page_url || row.detected_at || 'purchase');
      const set = byTransaction.get(key) || new Set<string>();
      const vendors = list(row.blocked_vendors);
      for (const vendor of vendors) set.add(vendor);
      if (row.vendor) set.add(String(row.vendor));
      byTransaction.set(key, set);
    }
    return byTransaction;
  }, [recentBlockers]);

  const blockedPlatformCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const byVendor = Array.isArray(blockers?.byVendor) ? blockers.byVendor : [];
    for (const row of byVendor) counts.set(String(row.vendor), Number(row.cnt || 0));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [blockers?.byVendor]);

  const blockerTotal = recentBlockers.length;

  return <div className="fade-in mx-auto max-w-[1500px] space-y-7">
    <div className="dashboard-section-head"><div><div className="dashboard-eyebrow">Revenue tracking · Last 24 hours</div><h2>See where tracking could affect revenue</h2><p>Compare purchase tracking across configured destinations, then separate confirmed blocker evidence from ordinary delivery or configuration issues.</p></div><div className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /><strong>Last 24h</strong> · visitor tracking</div></div>
    <div className="grid gap-3 md:grid-cols-5"><CommandKpi label="Purchases seen" value={n(revenue.length)} note="Purchase records GAfix found" tone="blue" /><CommandKpi label="Matching records" value={n(matched)} note="Purchase details agree" tone="lime" /><CommandKpi label="Purchases to review" value={n(mismatch.length)} note="Missing tools, invalid, or different details" tone={mismatch.length ? 'rose' : 'lime'} /><CommandKpi label="Value difference" value={totalDelta === null ? '—' : n(totalDelta)} note={deltaCurrencies.length > 1 ? 'Different currencies cannot be added safely' : deltaCurrencies.length === 1 ? `${deltaCurrencies[0]} difference found` : 'No safe comparison'} tone={totalDelta ? 'amber' : 'lime'} /><CommandKpi label="Purchase blocker evidence" value={n(blockerTotal)} note="Recent purchase events with confirmed blocker records" tone={blockerTotal ? 'rose' : 'lime'} /></div>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Platform delivery" title="Where purchase tracking is at risk" description="Shows configured/observed revenue destinations separately from confirmed ad-blocker evidence. A blocker record is evidence of tracking impairment, not proof of lost revenue." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[.06] bg-[#0c121c] p-4"><div className="text-xs font-semibold text-slate-200">Confirmed blocker evidence by platform</div>{blockedPlatformCounts.length ? <div className="mt-3 space-y-2">{blockedPlatformCounts.slice(0, 8).map(([vendor, count]) => <div key={vendor} className="flex items-center justify-between rounded-lg border border-white/[.05] px-3 py-2 text-xs"><span className="text-slate-300">{platformLabel(vendor)}</span><span className="font-mono text-[#ff9aae]">{n(count)} blocked signals</span></div>)}</div> : <div className="mt-3 text-xs text-slate-500">No confirmed purchase blocker evidence in the recent window.</div>}</div>
        <div className="rounded-xl border border-white/[.06] bg-[#0c121c] p-4"><div className="text-xs font-semibold text-slate-200">Purchase delivery coverage</div>{purchaseRouting.length ? <div className="mt-3 flex flex-wrap gap-2">{purchaseRouting.map((vendor: string) => <span key={vendor} className="pill bg-white/[.05] text-slate-300">{platformLabel(vendor)}</span>)}</div> : <div className="mt-3 text-xs text-slate-500">No purchase-routing list is configured. Missing-destination findings stay evidence-based and will not assume a platform should receive the purchase.</div>}</div>
      </div>
    </section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Purchase tracking check" title="How reliable the purchase data looks" description="This compares tracking records; it is not a replacement for your payment or accounting system." /><div className="mb-4 rounded-xl border border-[#6d8cff]/15 bg-[#6d8cff]/[.06] p-3 text-xs leading-5 text-slate-400">{purchaseRouting.length ? <>Expected purchase tools: <strong className="text-slate-200">{purchaseRouting.map((vendor: string) => platformLabel(vendor)).join(', ')}</strong>. Missing-tool findings use this list.</> : <>No purchase-routing list is set. GAfix shows observed tools only and will not call another tool missing.</>}</div><div className="mx-auto mt-4 grid h-56 w-56 place-items-center rounded-full border-[18px] border-[#202b3b]" style={{ background: `conic-gradient(#a8f06a ${revenue.length ? (matched / revenue.length) * 360 : 0}deg, #ff718d 0deg)` }}><div className="grid h-36 w-36 place-items-center rounded-full bg-[#111722] text-center"><div><div className="text-3xl font-semibold text-white">{revenue.length ? Math.round((matched / revenue.length) * 100) : 0}%</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">records match</div></div></div></div><div className="mt-5 flex justify-center gap-4 text-xs"><span className="text-[#a8f06a]">● matches</span><span className="text-[#ff718d]">● needs review</span></div></section>

    <section className="rounded-2xl border border-white/[.08] bg-[#111722] p-5 lg:p-6"><DashboardSection eyebrow="Purchase details" title="Purchase tracking records" description="Review missing revenue data, destination mismatches, and recent blocker evidence." />{revenue.length ? <div className="space-y-3">{revenue.slice(0, 20).map((row: any, index: number) => { const missingVendors = list(row.missing_vendors); const observedVendors = list(row.vendor_presence); const blockerKey = String(row.session_id || row.page_url || row.last_seen || ''); const blockedVendors = blockerKey && confirmedPurchaseBlockers.get(blockerKey) ? Array.from(confirmedPurchaseBlockers.get(blockerKey) || []) : []; const fallbackBlocked = recentBlockers.filter((b: any) => String(b.page_url || '') === String(row.page_url || '') && String(b.event_name || '').toLowerCase().includes('purchase')).flatMap((b: any) => list(b.blocked_vendors)); const blocked = [...new Set([...blockedVendors, ...fallbackBlocked])]; return <div key={row.transaction_id || index} className="rounded-xl border border-white/[.06] bg-[#0c121c] p-3 text-xs"><div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_140px_minmax(140px,1fr)]"><div><div className="font-mono font-medium text-slate-200">{row.transaction_id || 'Order reference not found'}</div><div className="mt-1 text-slate-500">{row.currency === 'MIXED' ? 'Different currencies reported' : row.currency || 'Currency not found'} · {row.status || 'unknown'}</div></div><div><div className="text-[10px] uppercase tracking-wider text-slate-600">Revenue destinations</div><div className="mt-1 text-slate-400">{observedVendors.length ? observedVendors.map(platformLabel).join(', ') : 'No platform identity observed'}</div>{missingVendors.length ? <div className="mt-1 text-[#ff9aae]">Missing: {missingVendors.map(platformLabel).join(', ')}</div> : null}</div><div><div className="text-[10px] uppercase tracking-wider text-slate-600">Blocker evidence</div>{blocked.length ? <div className="mt-1 text-[#ff9aae]">Confirmed: {blocked.map(platformLabel).join(', ')}</div> : <div className="mt-1 text-slate-500">None linked to this purchase record</div>}</div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={`pill ${row.status !== 'matched' ? 'bg-[#ff718d]/10 text-[#ff9aae]' : 'bg-[#a8f06a]/10 text-[#b9f57e]'}`}>{row.status === 'value_mismatch' ? 'Value is different' : row.status === 'missing_vendor' ? 'Missing from routing list' : row.status === 'currency_mismatch' ? 'Currencies differ' : row.status === 'invalid_value' ? 'Value is not valid' : row.status === 'missing' ? 'Details missing' : row.status === 'duplicate' ? 'Possible repeat' : row.status === 'single_vendor' ? 'One tool observed' : row.status === 'observed_unconfigured' ? 'Observed only' : 'Looks matched'}</span><span className="font-mono text-slate-400">{row.delta_value === null || row.delta_value === undefined ? 'No safe comparison' : `${row.currency || ''} ${row.delta_value}`}</span></div></div> })}</div> : <div className="empty-visual">No purchase tracking records yet. GAfix will show them after a purchase is tracked.</div>}</section>
  </div>;
}
