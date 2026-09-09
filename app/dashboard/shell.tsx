'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Site = { id: number; domain: string; api_key?: string; first_party_domain?: string | null };
type NavItem = { key: string; label: string; href: string; icon: () => JSX.Element; children?: { href: string; label: string }[] };

export default function DashboardShell({
  children, email, sites,
}: { children: React.ReactNode; email: string; sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('gafix-rail-open');
      if (saved !== null) setOpen(saved === '1');
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem('gafix-rail-open', open ? '1' : '0'); } catch {}
  }, [open, ready]);

  useEffect(() => {
    const qId = Number(searchParams.get('siteId') || 0);
    if (qId && sites.find((s) => s.id === qId)) setSiteId(qId);
    else if (sites.length) setSiteId(sites[0].id);
    else setSiteId(null);
  }, [searchParams, sites]);

  function switchSite(id: number) {
    setSiteId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('siteId', String(id));
    router.push(url.pathname + url.search);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  const currentSite = sites.find((s) => s.id === siteId);
  const withSite = (href: string) => href + (siteId ? `?siteId=${siteId}` : '');

  const nav: NavItem[] = [
    { key: 'home', label: 'Home', href: '/dashboard', icon: iconHome },
    {
      key: 'monitoring', label: 'Monitoring', href: '/dashboard', icon: iconMonitoring,
      children: [
        { href: '/dashboard/ga4', label: 'Google Analytics' },
        { href: '/dashboard/ads', label: 'Google Ads' },
        { href: '/dashboard/meta', label: 'Meta' },
        { href: '/dashboard/tiktok', label: 'TikTok' },
        { href: '/dashboard/linkedin', label: 'LinkedIn' },
        { href: '/dashboard/bing', label: 'Microsoft Ads' },
        { href: '/dashboard/snapchat', label: 'Snapchat' },
        { href: '/dashboard/sessions', label: 'Visitor sessions' },
        { href: '/dashboard/revenue', label: 'Purchase impact' },
        { href: '/dashboard/vitals', label: 'Website speed' },
      ],
    },
    {
      key: 'audits', label: 'Audit Reports', href: '/dashboard/audit', icon: iconAudit,
      children: [
        { href: '/dashboard/audit', label: 'Tracking check' },
        { href: '/dashboard/health', label: 'Tracking health' },
        { href: '/dashboard/duplicates', label: 'Possible repeats' },
        { href: '/dashboard/gtm', label: 'Tag setup check' },
        { href: '/dashboard/adblock', label: 'When tracking was blocked' },
        { href: '/dashboard/consent', label: 'Privacy choices' },
        { href: '/dashboard/compliance', label: 'Website safety' },
      ],
    },
    { key: 'alerts', label: 'Alerts', href: '/dashboard/alerts', icon: iconAlerts },
    { key: 'billing', label: 'Billing', href: '/dashboard/billing', icon: iconBilling },
    { key: 'plans', label: 'Plans', href: '/dashboard/plans', icon: iconPlans },
    {
      key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: iconSettings,
      children: [
        { href: '/dashboard/settings', label: 'Websites' },
        { href: '/dashboard/install', label: 'Install GAfix' },
        { href: '/dashboard/integrations', label: 'Alerts and data' },
      ],
    },
    { key: 'admin', label: 'Admin', href: '/dashboard/admin', icon: iconAdmin },
    { key: 'users', label: 'User Management', href: '/dashboard/user-management', icon: iconUsers },
    { key: 'help', label: 'Help Center', href: '/dashboard/help', icon: iconHelp },
  ];

  const isActive = (item: NavItem) =>
    pathname === item.href || (item.children ? item.children.some((c) => pathname === c.href) : false);

  return (
    <div className="dashboard-shell min-h-screen" data-theme="light">
      <div className="flex">
        <aside
          className="fixed left-0 top-0 z-20 flex h-screen flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-3.5 transition-[width] duration-200"
          style={{ width: open ? 248 : 76 }}
        >
          <Link href="/" className={`mb-4 flex items-center gap-2 px-1 ${open ? '' : 'justify-center'}`}>
            <span className="gafix-wordmark whitespace-nowrap">
              <span className="gafix-wordmark-ga">GA</span>
              <span className="text-[var(--text)]">fix</span>
            </span>
          </Link>

          <div className="mb-2 px-0.5">
            {sites.length ? (
              open ? (
                <select
                  value={siteId || ''}
                  onChange={(e) => switchSite(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.domain}</option>
                  ))}
                </select>
              ) : (
                <div title={currentSite?.domain || 'Site'} className="mx-auto grid h-9 w-9 place-items-center rounded-[9px] border border-[var(--border-soft)] bg-[var(--surface-2)] text-[10px] font-bold text-[var(--text-2)]">
                  {(currentSite?.domain || 'S').charAt(0).toUpperCase()}
                </div>
              )
            ) : (
              <Link href="/dashboard/settings" className={`block rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-center text-sm text-[var(--text-3)] hover:border-[var(--accent)] hover:text-[var(--accent)] ${open ? '' : 'px-1 text-xs'}`}>
                {open ? '+ Add your first site' : '+'}
              </Link>
            )}
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain py-1">
            {nav.map((item, index) => {
              const active = isActive(item);
              return (
                <div key={item.key}>
                  {index === 6 ? <div className="my-2 h-px w-full bg-[var(--border)]" /> : null}
                  <Link
                    href={withSite(item.href)}
                    title={item.label}
                    className="flex h-11 items-center gap-[11px] rounded-rail px-3 text-[13.5px] font-medium transition-colors duration-150"
                    style={{
                      background: active ? 'var(--tint)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-2)',
                      justifyContent: open ? 'flex-start' : 'center',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {item.icon()}
                    {open ? <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span> : null}
                  </Link>
                  {open && item.children && active ? (
                    <div className="ml-[19px] mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border)] pl-3">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={withSite(child.href)}
                          className="truncate rounded-lg px-2 py-1.5 text-[12.5px] transition-colors"
                          style={{
                            color: pathname === child.href ? 'var(--text)' : 'var(--text-3)',
                            fontWeight: pathname === child.href ? 600 : 500,
                            background: pathname === child.href ? 'var(--surface-3)' : 'transparent',
                          }}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div
            onClick={() => setOpen(!open)}
            className="mb-1 flex h-[38px] cursor-pointer items-center gap-[11px] rounded-[10px] px-3 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            style={{ justifyContent: open ? 'flex-start' : 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform 200ms ease' }}><path d="M9 6l6 6-6 6" /></svg>
            {open ? <span className="whitespace-nowrap text-[12.5px]">Collapse</span> : null}
          </div>

          <div className={`flex items-center gap-2 border-t border-[var(--border-soft)] pt-3 ${open ? '' : 'justify-center'}`}>
            <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
              {email.charAt(0).toUpperCase()}
            </div>
            {open ? (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--text)]">{email}</div>
                <button onClick={logout} className="text-xs text-[var(--text-3)] hover:text-[var(--text)]">Sign out</button>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="dashboard-main-grid min-h-screen min-w-0 flex-1 transition-[margin] duration-200" style={{ marginLeft: open ? 248 : 76 }}>
          <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-6 backdrop-blur lg:px-8">
            <div className="flex items-center gap-3">
              <div>
                <p className="dashboard-eyebrow">GAfix command center</p>
                <h1 className="mt-0.5 font-display text-[17px] font-semibold tracking-tight text-[var(--text)]">{pageTitle(pathname)}</h1>
              </div>
              {currentSite && (
                <span className="dashboard-top-control"><span className="status-dot" style={{ background: 'var(--ok-dot)' }} /> <strong>Live</strong> · last 24 hours</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentSite && (
                <span className="dashboard-top-control"><span className="text-[var(--text-3)]">Site</span><strong className="mono">{currentSite.domain}</strong></span>
              )}
            </div>
          </div>
          <div className="dashboard-gridline min-h-[calc(100vh-64px)] bg-[var(--canvas)] p-5 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function pageTitle(path: string) {
  const titles: Record<string, string> = {
    '/dashboard': 'Home',
    '/dashboard/ga4': 'Google Analytics',
    '/dashboard/ads': 'Google Ads',
    '/dashboard/meta': 'Meta tracking',
    '/dashboard/tiktok': 'TikTok tracking',
    '/dashboard/linkedin': 'LinkedIn tracking',
    '/dashboard/bing': 'Microsoft Ads tracking',
    '/dashboard/snapchat': 'Snapchat tracking',
    '/dashboard/sessions': 'Visitor sessions',
    '/dashboard/revenue': 'Purchase impact',
    '/dashboard/vitals': 'Website speed',
    '/dashboard/audit': 'Audit Reports',
    '/dashboard/health': 'Tracking health',
    '/dashboard/duplicates': 'Possible repeats',
    '/dashboard/gtm': 'Tag setup check',
    '/dashboard/adblock': 'When tracking was blocked',
    '/dashboard/consent': 'Privacy choices',
    '/dashboard/compliance': 'Website safety',
    '/dashboard/install': 'Install GAfix',
    '/dashboard/gtm-connect': 'Connect Tag Manager',
    '/dashboard/integrations': 'Alerts and data',
    '/dashboard/settings': 'Settings',
    '/dashboard/alerts': 'Alerts',
    '/dashboard/billing': 'Billing',
    '/dashboard/plans': 'Plans',
    '/dashboard/admin': 'Admin',
    '/dashboard/user-management': 'User Management',
    '/dashboard/help': 'Help Center',
  };
  return titles[path] || 'Dashboard';
}

// icons — outline style, stroke-width 1.8, round caps (matching the mockup's rail icon set)
function iconHome() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.75 20v-5.5h4.5V20" /></svg>); }
function iconMonitoring() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M2.5 12.5h4l2.2-6 3.4 12 2.6-8.4 1.6 2.4h5.2" /></svg>); }
function iconAudit() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M6 2.75h8L18.5 7.5v13.75H6z" /><path d="M13.5 3v5h5" /><path d="M9 12.5h6M9 16h4" /></svg>); }
function iconAlerts() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15z" /><path d="M9.8 18a2.2 2.2 0 0 0 4.4 0" /></svg>); }
function iconBilling() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="flex-none"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.75h19" /><path d="M6 14.5h4" /></svg>); }
function iconPlans() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="flex-none"><rect x="3.25" y="3.25" width="7" height="7" rx="1.6" /><rect x="13.75" y="3.25" width="7" height="7" rx="1.6" /><rect x="3.25" y="13.75" width="7" height="7" rx="1.6" /><rect x="13.75" y="13.75" width="7" height="7" rx="1.6" /></svg>); }
function iconSettings() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>); }
function iconAdmin() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><circle cx="12" cy="12" r="2.9" /><path d="M19.1 14.6a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-1.78-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.05a1.6 1.6 0 0 0 .32-1.78 1.6 1.6 0 0 0-1.46-.97H2.2a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.05.06a1.6 1.6 0 0 0 1.78.32h.08a1.6 1.6 0 0 0 .97-1.46V2.3a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.78-.32l.05-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.05a1.6 1.6 0 0 0-.32 1.78v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97z" /></svg>); }
function iconUsers() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><circle cx="9" cy="8.5" r="3.2" /><path d="M3.2 20c.7-3.2 3.1-4.8 5.8-4.8s5.1 1.6 5.8 4.8" /><path d="M16.2 6.2a3 3 0 0 1 0 5.6M17.6 20c-.2-1.4-.6-2.6-1.3-3.6 2.3.2 4 1.7 4.5 3.6z" /></svg>); }
function iconHelp() { return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><circle cx="12" cy="12" r="9.2" /><path d="M9.4 9.3a2.7 2.7 0 1 1 3.7 2.5c-.8.34-1.1.9-1.1 1.7v.3" /><path d="M12 17.1h.01" /></svg>); }
