'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Site = { id: number; domain: string; first_party_domain?: string | null };
const platforms = [
  { href: '/dashboard/ga4', label: 'Google Analytics 4', vendor: 'ga4', mark: 'GA' },
  { href: '/dashboard/ads', label: 'Google Ads', vendor: 'gads', mark: 'G' },
  { href: '/dashboard/meta', label: 'Meta', vendor: 'meta', mark: 'M' },
  { href: '/dashboard/bing', label: 'Microsoft Ads', vendor: 'bing', mark: 'MS' },
  { href: '/dashboard/tiktok', label: 'TikTok', vendor: 'tiktok', mark: 'TT' },
  { href: '/dashboard/linkedin', label: 'LinkedIn', vendor: 'linkedin', mark: 'in' },
  { href: '/dashboard/snapchat', label: 'Snapchat', vendor: 'snapchat', mark: 'SC' },
];
const primary = [
  { href: '/dashboard', label: 'Dashboard', visual: 'Home', icon: 'home' },
  { href: '/dashboard/monitoring', label: 'Monitoring', visual: 'Monitoring', icon: 'pulse' },
  { href: '/dashboard/audit', label: 'Audit Reports', visual: 'Audit Reports', icon: 'audit' },
  { href: '/dashboard/plans', label: 'Plans', visual: 'Plans', icon: 'grid' },
  { href: '/dashboard/billing', label: 'Billing', visual: 'Billing', icon: 'card' },
  { href: '/dashboard/admin', label: 'Admin', visual: 'Admin', icon: 'settings' },
  { href: '/dashboard/help', label: 'Help Center', visual: 'Help Center', icon: 'help' },
];
const monitoredPrefixes = [
  '/dashboard/monitoring','/dashboard/ga4','/dashboard/ads','/dashboard/meta','/dashboard/bing',
  '/dashboard/tiktok','/dashboard/linkedin','/dashboard/snapchat','/dashboard/revenue',
  '/dashboard/alerts','/dashboard/settings','/dashboard/gtm','/dashboard/team','/dashboard/user-management',
];
const monitorLinks = [
  { href: '/dashboard/monitoring', label: 'Workspace', icon: 'overview' },
  ...platforms.map((p) => ({ href: p.href, label: p.label, icon: p.vendor, mark: p.mark })),
  { href: '/dashboard/revenue', label: 'Revenue', icon: 'revenue' },
  { href: '/dashboard/alerts', label: 'Alerts', icon: 'alerts' },
  { href: '/dashboard/team', label: 'User Management', icon: 'users' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'settings' },
  { href: '/dashboard/gtm', label: 'GTM Diagnostic', icon: 'gtm' },
];

export default function DashboardShell({ children, email, sites }: { children: React.ReactNode; email: string; sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [siteId, setSiteId] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const requested = Number(params.get('siteId') || 0);
    setSiteId(requested && sites.some((s) => s.id === requested) ? requested : sites[0]?.id || null);
  }, [params, sites]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('gafix-theme') === 'dark';
      setDark(stored);
      document.body.dataset.theme = stored ? 'dark' : 'light';
    } catch { document.body.dataset.theme = 'light'; }
  }, []);

  const withSite = (href: string) => {
    const [path, query] = href.split('?');
    const q = new URLSearchParams(query || '');
    if (siteId) q.set('siteId', String(siteId));
    else q.delete('siteId');
    return path + (q.toString() ? '?' + q.toString() : '');
  };
  const switchSite = (id: number) => {
    setSiteId(id);
    const next = new URL(window.location.href);
    next.searchParams.set('siteId', String(id));
    router.push(next.pathname + next.search);
  };
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.body.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('gafix-theme', next ? 'dark' : 'light'); } catch {}
  };
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); };

  const inMonitoring = pathname.startsWith('/dashboard/gtm-connect') || monitoredPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const inAudit = pathname.startsWith('/dashboard/audit');
  const primaryHref = pathname === '/dashboard' ? '/dashboard'
    : inAudit ? '/dashboard/audit'
    : ['/dashboard/plans','/dashboard/billing','/dashboard/admin','/dashboard/help'].find((p) => pathname.startsWith(p)) ||
      (inMonitoring ? '/dashboard/monitoring' : '/dashboard');
  const activeSite = sites.find((s) => s.id === siteId);
  const title = pageTitle(pathname);

  return <div className="dashboard-shell min-h-screen">
    <div className="flex h-screen w-full overflow-hidden bg-[var(--canvas)]">
      <aside className="z-30 flex h-full flex-none flex-col border-r border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-4 transition-[width] duration-200" style={{ width: railOpen ? 216 : 76 }}>
        <Link href={withSite('/dashboard')} aria-label="GAfix Home" className={'mb-7 flex h-8 items-center px-2 ' + (railOpen ? '' : 'justify-center')}>
          <span className="gafix-wordmark whitespace-nowrap"><span className="gafix-wordmark-ga">GA</span><span className="text-[var(--text)]">fix</span></span>
        </Link>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="Primary navigation">
          {primary.map((item) => {
            const active = item.href === primaryHref;
            return <Link key={item.href} href={withSite(item.href)} title={railOpen ? undefined : item.visual} aria-current={active ? 'page' : undefined}
              className="flex h-11 flex-none items-center gap-3 rounded-[11px] px-3 transition-colors"
              style={{ background: active ? 'var(--tint)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-2)', justifyContent: railOpen ? 'flex-start' : 'center' }}>
              <Glyph kind={item.icon}/>{railOpen ? <span className="truncate text-[13px] font-medium">{item.visual}</span> : null}
            </Link>;
          })}
        </nav>
        <div className="my-2 h-px bg-[var(--border-soft)]"/>
        <button onClick={toggleTheme} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} className={'mb-2 flex h-10 items-center gap-3 rounded-[11px] px-3 text-[var(--text-2)] transition hover:bg-[var(--surface-2)] ' + (railOpen ? '' : 'justify-center')}><Glyph kind={dark ? 'sun' : 'moon'}/>{railOpen ? <span className="text-[12px]">{dark ? 'Light theme' : 'Dark theme'}</span> : null}</button>
        <button onClick={() => setRailOpen((v) => !v)} title={railOpen ? 'Collapse navigation' : 'Expand navigation'} className={'mb-3 flex h-9 items-center gap-3 rounded-[10px] px-3 text-[var(--text-3)] transition hover:bg-[var(--surface-2)] ' + (railOpen ? '' : 'justify-center')}><span className="inline-flex transition-transform" style={{ transform: railOpen ? 'rotate(180deg)' : 'none' }}><Glyph kind="chevron"/></span>{railOpen ? <span className="text-[12px]">Collapse</span> : null}</button>
        <div className={'flex items-center gap-2 border-t border-[var(--border-soft)] pt-3 ' + (railOpen ? '' : 'justify-center')}>
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#3F3B52] text-[12px] font-semibold text-white">{(email || 'U').charAt(0).toUpperCase()}</div>
          {railOpen ? <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium text-[var(--text)]" title={email}>{email}</div><button onClick={logout} className="mt-0.5 text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">Sign out</button></div> : null}
        </div>
      </aside>

      {inMonitoring ? <aside className="hidden h-full flex-none flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 lg:flex" style={{ width: panelOpen ? 232 : 68 }}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-3 py-4">
          {panelOpen ? <div><div className="text-[13px] font-semibold text-[var(--text)]">Monitoring</div><div className="mt-0.5 text-[10.5px] text-[var(--text-3)]">Live tracking health</div></div> : null}
          <button onClick={() => setPanelOpen((v) => !v)} title={panelOpen ? 'Collapse monitoring menu' : 'Expand monitoring menu'} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-2)]"><Glyph kind="chevron"/></button>
        </div>
        <div className="border-b border-[var(--border-soft)] p-3">
          {sites.length ? <label className="block">{panelOpen ? <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-3)]">Monitored website</span> : null}
            <select value={siteId || ''} onChange={(e) => switchSite(Number(e.target.value))} title="Switch site" className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]">
              {sites.map((site) => <option key={site.id} value={site.id}>{site.domain}</option>)}
            </select></label> : <Link href={withSite('/dashboard/settings')} className="block rounded-[10px] border border-dashed border-[var(--border-strong)] px-2 py-2.5 text-center text-[11px] font-medium text-[var(--text-3)]">{panelOpen ? '+ Add a website' : '+'}</Link>}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Monitoring navigation">
          {panelOpen ? <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--text-3)]">Workspace</div> : null}
          {monitorLinks.slice(0,1).map((item) => <ContextLink key={item.href} href={withSite(item.href)} label={item.label} active={pathname === item.href} open={panelOpen} icon={item.icon} />)}
          {panelOpen ? <div className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--text-3)]">Destinations</div> : <div className="mx-2 my-2 h-px bg-[var(--border-soft)]"/>}
          {platforms.map((p) => <ContextLink key={p.vendor} href={withSite(p.href)} label={p.label} active={pathname === p.href} open={panelOpen} icon={p.vendor} mark={p.mark}/>)}
          {panelOpen ? <div className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--text-3)]">Manage</div> : <div className="mx-2 my-2 h-px bg-[var(--border-soft)]"/>}
          {monitorLinks.slice(8).map((item) => <ContextLink key={item.href} href={withSite(item.href)} label={item.label} active={pathname === item.href || (item.href === '/dashboard/team' && pathname === '/dashboard/user-management')} open={panelOpen} icon={item.icon}/>)}
        </nav>
      </aside> : null}

      {inAudit ? <aside className="hidden h-full w-[224px] flex-none flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
        <div className="border-b border-[var(--border-soft)] px-4 py-4"><div className="text-[13px] font-semibold text-[var(--text)]">Audit Reports</div><div className="mt-0.5 text-[10.5px] text-[var(--text-3)]">GA4 + GTM assessment</div></div>
        <div className="p-3"><div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="text-[12px] font-semibold text-[var(--text)]">GA4 + GTM Audit</div><div className="mt-1 text-[11px] leading-5 text-[var(--text-3)]">Assess configuration, inspect findings and follow recommendations.</div><Link href={withSite('/dashboard/audit')} className="mt-3 inline-flex text-[11px] font-semibold text-[var(--accent)]">Open audit →</Link></div><Link href={withSite('/dashboard/monitoring')} className="mt-2 flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[12px] text-[var(--text-2)] transition hover:bg-[var(--surface-2)]"><Glyph kind="pulse"/> Live Monitoring</Link></div>
      </aside> : null}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
        <header className="z-20 flex h-16 flex-none items-center gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 lg:px-7">
          <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--accent)]">GAfix · Tracking intelligence</div><h1 className="mt-0.5 truncate font-display text-[16px] font-semibold tracking-tight text-[var(--text)]">{titleFor(pathname)}</h1></div>
          {activeSite ? <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--text-2)] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--ok-dot)]"/><span className="max-w-[180px] truncate font-medium text-[var(--text)]">{activeSite.domain}</span><span className="text-[var(--text-3)]">·</span><span>Live</span></div> : null}
          <button onClick={toggleTheme} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} className="grid h-9 w-9 flex-none place-items-center rounded-full border border-[var(--border)] text-[var(--text-2)] transition hover:bg-[var(--surface-2)]"><Glyph kind={dark ? 'sun' : 'moon'}/></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto"><div className="dashboard-gridline min-h-full px-4 py-6 sm:px-6 lg:px-[30px] lg:py-[26px]"><div className="mx-auto w-full max-w-[1240px]">{children}</div></div></div>
      </main>
    </div>
  </div>;
}

function ContextLink({ href, label, active, open, icon, mark }: { href: string; label: string; active: boolean; open: boolean; icon: string; mark?: string }) {
  return <Link href={href} title={open ? undefined : label} aria-current={active ? 'page' : undefined} className="flex h-10 flex-none items-center gap-2.5 rounded-[10px] px-2.5 transition-colors" style={{ background: active ? 'var(--tint)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-2)', justifyContent: open ? 'flex-start' : 'center' }}>
    <span className="grid h-6 w-6 flex-none place-items-center rounded-[7px] border text-[8.5px] font-bold" style={{ background: active ? 'var(--surface)' : 'var(--surface-2)', borderColor: active ? 'var(--border-strong)' : 'var(--border-soft)', color: active ? 'var(--accent)' : 'var(--text-3)' }}>{mark || <Glyph kind={icon} small/>}</span>
    {open ? <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{label}</span> : null}{open && active ? <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]"/> : null}
  </Link>;
}

function Glyph({ kind, small = false }: { kind: string; small?: boolean }) {
  const size = small ? 14 : 19;
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.75 20v-5.5h4.5V20"/></>,
    pulse: <path d="M2.5 12.5h4l2.2-6 3.4 12 2.6-8.4 1.6 2.4h5.2"/>,
    audit: <><path d="M6 2.75h8L18.5 7.5v13.75H6z"/><path d="M13.5 3v5h5M9 12.5h6M9 16h4"/></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/></>,
    card: <><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.75h19M6 14.5h4"/></>,
    settings: <><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="17" r="2" fill="var(--surface)"/></>,
    help: <><circle cx="12" cy="12" r="9.2"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.7 2.5c-.8.34-1.1.9-1.1 1.7v.3M12 17.1h.01"/></>,
    overview: <><circle cx="12" cy="12" r="8.5"/><path d="M12 12l5-4.4M3.5 12h17"/></>,
    ga4: <><path d="M5 17.5 10 12l3.5 3L20 7"/><path d="M17 7h3v3"/></>,
    gads: <><path d="M7 3 3.5 9.5 11 22l3-5.3L7 3Z"/><path d="M14.5 17 20.5 6l-3.2-3L10 16"/></>,
    meta: <><path d="M4 16c3-10 6-10 8-3s5 7 8-3"/><path d="M4 16c2 4 5 3 7-3s5-7 9 3"/></>,
    bing: <><path d="M7 2.5v9L18 17l-6 4.5-5-3v-4.2l7 2.7"/></>,
    tiktok: <><path d="M14 3v11.5a4.5 4.5 0 1 1-4-4.47"/><path d="M14 3c1.2 3 3 4.5 6 4.7"/></>,
    linkedin: <><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7.5 10v6.5M7.5 7.4h.01M11 16.5V10h3v1c.6-1.1 3.5-1.6 3.5 1.7v3.8"/></>,
    snapchat: <><path d="M12 3.2c-2.6 0-4.2 2-4.2 4.5v3.2c-.8.9-1.9 1.4-3 1.6-.6.1-.6 1 .1 1.2l2.1.7c.4 1.9 1.7 3.1 3.1 3.6M12 3.2c2.6 0 4.2 2 4.2 4.5v3.2c.8.9 1.9 1.4 3 1.6.6.1.6 1-.1 1.2l-2.1.7c-.4 1.9-1.7 3.1-3.1 3.6"/></>,
    revenue: <><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6"/><path d="M16 7h3v3"/></>,
    alerts: <><path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15z"/><path d="M9.8 18a2.2 2.2 0 0 0 4.4 0"/></>,
    users: <><circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 20c.7-3.2 3.1-4.8 5.8-4.8s5.1 1.6 5.8 4.8M16.2 6.2a3 3 0 0 1 0 5.6M17.6 20c-.2-1.4-.6-2.6-1.3-3.6 2.3.2 4 1.7 4.5 3.6"/></>,
    gtm: <><rect x="3" y="3.5" width="7" height="6" rx="1.6"/><rect x="14" y="3.5" width="7" height="6" rx="1.6"/><rect x="8.5" y="14.5" width="7" height="6" rx="1.6"/><path d="M6.5 9.5V12h11V9.5M12 12v2.5"/></>,
    sun: <><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/></>,
    moon: <path d="M20.5 14.8A8.8 8.8 0 1 1 9.2 3.5a7 7 0 0 0 11.3 11.3z"/>,
    chevron: <path d="m9 6 6 6-6 6"/>,
  };
  return <svg {...props} aria-hidden="true">{paths[kind] || paths.overview}</svg>;
}

function titleFor(path: string) {
  if (path === '/dashboard') return 'Home';
  if (path.startsWith('/dashboard/monitoring')) return 'Monitoring workspace';
  if (path.startsWith('/dashboard/audit')) return 'Audit Reports';
  if (path.startsWith('/dashboard/revenue')) return 'Revenue';
  if (path.startsWith('/dashboard/alerts')) return 'Alerts';
  if (path.startsWith('/dashboard/gtm')) return 'GTM Diagnostic';
  if (path.startsWith('/dashboard/settings')) return 'Settings';
  if (path.startsWith('/dashboard/team') || path.startsWith('/dashboard/user-management')) return 'User Management';
  if (path.startsWith('/dashboard/plans')) return 'Plans';
  if (path.startsWith('/dashboard/billing')) return 'Billing';
  if (path.startsWith('/dashboard/admin')) return 'Admin';
  if (path.startsWith('/dashboard/help')) return 'Help Center';
  return platforms.find((p) => p.href === path)?.label || 'GAfix';
}
