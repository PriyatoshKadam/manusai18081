'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Site = { id: number; domain: string; api_key?: string; first_party_domain?: string | null };

const platforms = [
  { href: '/dashboard/ga4', label: 'Google Analytics', vendor: 'ga4' },
  { href: '/dashboard/ads', label: 'Google Ads', vendor: 'gads' },
  { href: '/dashboard/meta', label: 'Meta', vendor: 'meta' },
  { href: '/dashboard/bing', label: 'Microsoft Ads', vendor: 'microsoft' },
  { href: '/dashboard/tiktok', label: 'TikTok', vendor: 'tiktok' },
  { href: '/dashboard/linkedin', label: 'LinkedIn', vendor: 'linkedin' },
  { href: '/dashboard/snapchat', label: 'Snapchat', vendor: 'snapchat' },
];

function icon(kind: 'dashboard' | 'alerts' | 'gtm' | 'settings') {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    alerts: <><path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15z"/><path d="M9 18.5h6"/></>,
    gtm: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.9 1.9-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.7v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.9-1.9.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.7h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.9-1.9.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h2.7v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.9 1.9-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V12h-.2a1.7 1.7 0 0 0-1.6 1z"/></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

export default function DashboardShell({ children, email, sites }: { children: React.ReactNode; email: string; sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState<number | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const qId = Number(searchParams.get('siteId') || 0);
    setSiteId(qId && sites.some((site) => site.id === qId) ? qId : sites[0]?.id || null);
  }, [searchParams, sites]);

  const currentSite = sites.find((site) => site.id === siteId);
  const withSite = (href: string) => href + (siteId ? `?siteId=${siteId}` : '');
  const platformActive = pathname.startsWith('/dashboard/') && platforms.some((platform) => pathname === platform.href);

  function switchSite(id: number) {
    setSiteId(id);
    const next = new URL(window.location.href);
    next.searchParams.set('siteId', String(id));
    router.push(next.pathname + next.search);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' as const, active: pathname === '/dashboard' },
    { href: '/dashboard/alerts', label: 'Alerts', icon: 'alerts' as const, active: pathname === '/dashboard/alerts' },
    { href: '/dashboard/gtm', label: 'GTM Diagnostic', icon: 'gtm' as const, active: pathname.startsWith('/dashboard/gtm') },
    { href: '/dashboard/settings', label: 'Settings', icon: 'settings' as const, active: pathname.startsWith('/dashboard/settings') },
  ];

  return <div className="dashboard-shell min-h-screen" data-theme="light">
    <div className="flex">
      <aside className="fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-4 transition-[width] duration-200" style={{ width: open ? 254 : 76 }}>
        <Link href={withSite('/dashboard')} className={`mb-5 flex items-center px-2 ${open ? '' : 'justify-center'}`}>
          <span className="gafix-wordmark whitespace-nowrap"><span className="gafix-wordmark-ga">GA</span><span className="text-[var(--text)]">fix</span></span>
        </Link>
        <div className="mb-4 px-1">
          {sites.length ? <select value={siteId || ''} onChange={(event) => switchSite(Number(event.target.value))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]">{sites.map((site) => <option key={site.id} value={site.id}>{site.domain}</option>)}</select> : <Link href="/dashboard/settings" className="block rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2 text-center text-sm text-[var(--text-3)]">{open ? '+ Add your first site' : '+'}</Link>}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {nav.map((item) => <div key={item.href}>
            <Link href={withSite(item.href)} title={item.label} className="flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors" style={{ background: item.active ? 'var(--mon-tint)' : 'transparent', color: item.active ? 'var(--mon-fg)' : 'var(--text-2)', justifyContent: open ? 'flex-start' : 'center' }}>
              {icon(item.icon)}{open ? <span>{item.label}</span> : null}
            </Link>
          </div>)}
          {open && (pathname === '/dashboard' || platformActive) ? <div className="mt-2 border-t border-[var(--border-soft)] pt-3">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-3)]">Platforms</p>
            <div className="space-y-0.5">{platforms.map((platform) => <Link key={platform.vendor} href={withSite(platform.href)} className="block rounded-lg px-3 py-2 text-[12px] font-medium transition-colors" style={{ color: pathname === platform.href ? 'var(--text)' : 'var(--text-3)', background: pathname === platform.href ? 'var(--surface-3)' : 'transparent' }}>{platform.label}</Link>)}</div>
          </div> : null}
        </nav>
        <button type="button" onClick={() => setOpen((value) => !value)} className="mb-2 flex h-9 items-center gap-2 rounded-lg px-3 text-[var(--text-3)] hover:bg-[var(--surface-2)]" style={{ justifyContent: open ? 'flex-start' : 'center' }} aria-label="Toggle sidebar"><span style={{ transform: `rotate(${open ? 180 : 0}deg)`, display: 'inline-flex' }}>›</span>{open ? <span className="text-xs">Collapse</span> : null}</button>
        <div className={`flex items-center gap-2 border-t border-[var(--border-soft)] pt-3 ${open ? '' : 'justify-center'}`}>
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--mon)] text-sm font-bold text-white">{email.charAt(0).toUpperCase()}</div>
          {open ? <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[var(--text)]">{email}</div><button onClick={logout} className="text-xs text-[var(--text-3)] hover:text-[var(--text)]">Sign out</button></div> : null}
        </div>
      </aside>
      <main className="dashboard-main-grid min-h-screen min-w-0 flex-1 transition-[margin] duration-200" style={{ marginLeft: open ? 254 : 76 }}>
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-6 backdrop-blur lg:px-8">
          <div><p className="dashboard-eyebrow">GAfix monitoring</p><h1 className="mt-0.5 font-display text-[17px] font-semibold tracking-tight text-[var(--text)]">{pageTitle(pathname)}</h1></div>
          {currentSite ? <span className="dashboard-top-control"><span className="status-dot" style={{ background: 'var(--ok-dot)' }} /> <strong>Live</strong> · {currentSite.domain}</span> : null}
        </div>
        <div className="dashboard-gridline min-h-[calc(100vh-64px)] bg-[var(--canvas)] p-5 lg:p-8">{children}</div>
      </main>
    </div>
  </div>;
}

function pageTitle(path: string) {
  if (path === '/dashboard') return 'Dashboard';
  if (path === '/dashboard/alerts') return 'Alerts';
  if (path.startsWith('/dashboard/gtm')) return 'GTM Diagnostic';
  if (path.startsWith('/dashboard/settings')) return 'Settings';
  const platform = platforms.find((item) => item.href === path);
  return platform?.label || 'Dashboard';
}
