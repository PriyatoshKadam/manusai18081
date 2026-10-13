'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Site = { id: number; domain: string };
const fetchSites = async () => {
  const response = await fetch('/api/sites', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load websites');
  const body = await response.json();
  return (body.sites || []) as Site[];
};

export default function HomePage() {
  const search = useSearchParams();
  const siteId = Number(search.get('siteId') || 0);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchSites().then(setSites).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load websites')).finally(() => setLoading(false));
  }, []);
  const activeSite = sites.find((s) => s.id === siteId) || sites[0];
  const target = (href: string) => href + (activeSite ? '?siteId=' + activeSite.id : '');

  return <div className="fade-in space-y-7">
    <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <p className="dashboard-eyebrow">Your tracking workspace</p>
        <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--text)]">Welcome to GAfix</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-2)]">Audit the setup, monitor live tracking, and investigate issues from one workspace.</p>
      </div>
      {activeSite ? <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--text-3)]">Selected website</div><div className="mt-1 text-sm font-semibold text-[var(--text)]">{activeSite.domain}</div></div> : null}
    </header>

    {error ? <div role="alert" className="rounded-xl border border-[var(--crit-bd)] bg-[var(--crit-bg)] px-4 py-3 text-sm text-[var(--crit-fg)]">{error}</div> : null}
    {!loading && !sites.length ? <section className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 sm:p-10">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--tint)] text-[var(--accent)]"><Icon kind="globe"/></div>
      <h3 className="mt-5 font-display text-xl font-semibold text-[var(--text)]">Start with your first website</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-2)]">Add a site and install the GAfix monitor script to begin collecting runtime evidence. You can run an audit separately to assess your GA4 and GTM configuration.</p>
      <Link href="/dashboard/settings" className="mt-5 inline-flex rounded-xl bg-[var(--btn-dark)] px-4 py-2.5 text-sm font-semibold text-white">Add website</Link>
    </section> : null}

    <section className="grid gap-4 lg:grid-cols-2">
      <Link href={target('/dashboard/audit')} className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] sm:p-7">
        <div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--tint)] text-[var(--accent)]"><Icon kind="audit"/></div><span className="rounded-full bg-[var(--tint)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">On demand</span></div>
        <h3 className="mt-5 font-display text-xl font-semibold text-[var(--text)]">Run a GA4 + GTM audit</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">Review your tracking configuration, tags, triggers, parameters, conversions, and implementation gaps. Get findings with prioritized recommendations.</p>
        <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">Open Audit Reports <span className="transition-transform group-hover:translate-x-1">→</span></div>
      </Link>
      <Link href={target('/dashboard/monitoring')} className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] sm:p-7">
        <div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--mon-tint)] text-[var(--mon-fg)]"><Icon kind="pulse"/></div><span className="rounded-full bg-[var(--ok-bg)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ok-fg)]">Always on</span></div>
        <h3 className="mt-5 font-display text-xl font-semibold text-[var(--text)]">Open Live Monitoring</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">Watch observed events, parameters, pages, consent signals, ad-blocker evidence, revenue delivery, and platform health. Investigate issues when tracking changes.</p>
        <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--mon-fg)]">View monitoring workspace <span className="transition-transform group-hover:translate-x-1">→</span></div>
      </Link>
    </section>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 className="font-display text-lg font-semibold text-[var(--text)]">Quick access</h3><p className="mt-1 text-sm text-[var(--text-3)]">Jump straight into an operational area.</p></div><Link href={target('/dashboard/settings')} className="text-xs font-semibold text-[var(--accent)]">Manage websites & settings →</Link></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink href={target('/dashboard/alerts')} icon="alerts" title="Alerts" description="Review ongoing issues and evidence."/>
        <QuickLink href={target('/dashboard/gtm')} icon="gtm" title="GTM Diagnostic" description="Inspect your captured GTM setup."/>
        <QuickLink href={target('/dashboard/revenue')} icon="revenue" title="Revenue" description="Review observed purchase telemetry."/>
        <QuickLink href={target('/dashboard/team')} icon="users" title="User Management" description="Review workspace access UI."/>
      </div>
    </section>
  </div>;
}

function QuickLink({ href, icon, title, description }: { href:string; icon:string; title:string; description:string }) {
  return <Link href={href} className="flex gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"><span className="mt-0.5 text-[var(--text-3)]"><Icon kind={icon}/></span><span><span className="block text-sm font-semibold text-[var(--text)]">{title}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-3)]">{description}</span></span></Link>;
}
function Icon({ kind }: { kind:string }) {
  const paths: Record<string, React.ReactNode> = {
    globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18"/></>,
    audit:<><path d="M6 2.75h8L18.5 7.5v13.75H6z"/><path d="M13.5 3v5h5M9 12.5h6M9 16h4"/></>,
    pulse:<path d="M2.5 12.5h4l2.2-6 3.4 12 2.6-8.4 1.6 2.4h5.2"/>,
    alerts:<><path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15z"/><path d="M9.8 18a2.2 2.2 0 0 0 4.4 0"/></>,
    gtm:<><rect x="3" y="3.5" width="7" height="6" rx="1.6"/><rect x="14" y="3.5" width="7" height="6" rx="1.6"/><rect x="8.5" y="14.5" width="7" height="6" rx="1.6"/><path d="M6.5 9.5V12h11V9.5M12 12v2.5"/></>,
    revenue:<><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6"/><path d="M16 7h3v3"/></>,
    users:<><circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 20c.7-3.2 3.1-4.8 5.8-4.8s5.1 1.6 5.8 4.8M16.2 6.2a3 3 0 0 1 0 5.6"/></>,
  };
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] || paths.globe}</svg>;
}
