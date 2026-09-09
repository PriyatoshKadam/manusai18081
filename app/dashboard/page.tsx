'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const platforms = [
  { href: '/dashboard/ga4', vendor: 'ga4', name: 'Google Analytics', short: 'GA4', description: 'Events, parameters, pages, consent and delivery.' },
  { href: '/dashboard/ads', vendor: 'gads', name: 'Google Ads', short: 'Google Ads', description: 'Conversions, tags, delivery and consent.' },
  { href: '/dashboard/meta', vendor: 'meta', name: 'Meta', short: 'Meta', description: 'Pixel events, deduplication and delivery.' },
  { href: '/dashboard/bing', vendor: 'bing', name: 'Microsoft Ads', short: 'Microsoft Ads', description: 'UET events, conversions and delivery.' },
  { href: '/dashboard/tiktok', vendor: 'tiktok', name: 'TikTok', short: 'TikTok', description: 'Events, parameters and delivery health.' },
  { href: '/dashboard/linkedin', vendor: 'linkedin', name: 'LinkedIn', short: 'LinkedIn', description: 'Insight events, parameters and consent.' },
  { href: '/dashboard/snapchat', vendor: 'snapchat', name: 'Snapchat', short: 'Snapchat', description: 'Pixel events, parameters and delivery.' },
];

type Summary = { total_event_hits: number; event_total: number; parameter_number: number; successful_network_events: number; failed_network_events: number };
const fetchJson = (url: string) => fetch(url, { cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error(`Request failed: ${response.status}`); return response.json(); });

export default function DashboardPage() {
  const params = useSearchParams();
  const siteId = Number(params.get('siteId') || 0);
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!siteId) return; let cancelled = false; setLoading(true); Promise.all(platforms.map(async (platform) => { try { const data = await fetchJson(`/api/platform-insights?siteId=${siteId}&vendor=${platform.vendor}`); return [platform.vendor, data.overview as Summary] as const; } catch { return [platform.vendor, null] as const; } })).then((rows) => { if (!cancelled) setSummary(Object.fromEntries(rows.filter((row): row is readonly [string, Summary] => Boolean(row[1])))); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [siteId]);
  const totals = Object.values(summary).reduce((acc, row) => ({ hits: acc.hits + row.total_event_hits, events: acc.events + row.event_total, issues: acc.issues + row.failed_network_events }), { hits: 0, events: 0, issues: 0 });
  return <div className="mx-auto max-w-[1440px] space-y-6"><section><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="dashboard-eyebrow">All platforms</p><h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--text)]">Tracking overview</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-2)]">Open a platform to inspect its events, parameters, pages, consent, ad blockers and AI crawler activity.</p></div><div className="flex gap-2"><Metric label="Event hits" value={totals.hits}/><Metric label="Event types" value={totals.events}/><Metric label="Delivery issues" value={totals.issues}/></div></div></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{platforms.map((platform) => { const row = summary[platform.vendor]; return <Link key={platform.vendor} href={`${platform.href}?siteId=${siteId}`} className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--mon-tint)] text-xs font-bold text-[var(--mon-fg)]">{platform.short.slice(0, 2).toUpperCase()}</span><h3 className="font-semibold text-[var(--text)]">{platform.name}</h3></div><p className="mt-3 text-sm leading-5 text-[var(--text-2)]">{platform.description}</p></div><span className="text-[var(--text-3)] transition group-hover:translate-x-0.5">→</span></div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-[var(--border-soft)] pt-4">{loading && !row ? <><MiniSkeleton/><MiniSkeleton/><MiniSkeleton/></> : <><MiniStat label="Hits" value={row?.total_event_hits ?? 0}/><MiniStat label="Events" value={row?.event_total ?? 0}/><MiniStat label="Issues" value={row?.failed_network_events ?? 0}/></>}</div></Link>; })}</section></div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-3)]">{label}</div><div className="mt-0.5 text-lg font-semibold text-[var(--text)]">{value.toLocaleString()}</div></div>; }
function MiniStat({ label, value }: { label: string; value: number }) { return <div><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-3)]">{label}</div><div className="mt-1 text-sm font-semibold text-[var(--text)]">{value.toLocaleString()}</div></div>; }
function MiniSkeleton() { return <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />; }
