'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Site = { id: number; domain: string; api_key: string; first_party_domain?: string | null };

export default function DashboardShell({
  children, email, sites,
}: { children: React.ReactNode; email: string; sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState<number | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('gafix-theme');
    const next = saved === 'light' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('gafix-theme', theme);
  }, [theme, themeReady]);

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
  const nav = [
    { section: 'Monitoring', items: [
      { href: '/dashboard', label: 'Overview', icon: iconGrid },
      { href: '/dashboard/ga4', label: 'Google Analytics', badge: 'GA', badgeColor: 'bg-orange-500' },
      { href: '/dashboard/ads', label: 'Google Ads', badge: 'Ad', badgeColor: 'bg-blue-500' },
      { href: '/dashboard/meta', label: 'Meta tracking', badge: 'M', badgeColor: 'bg-blue-600' },
      { href: '/dashboard/tiktok', label: 'TikTok tracking', badge: 'TT', badgeColor: 'bg-ink-950' },
      { href: '/dashboard/linkedin', label: 'LinkedIn tracking', badge: 'in', badgeColor: 'bg-sky-700' },
      { href: '/dashboard/bing', label: 'Microsoft Ads tracking', badge: 'B', badgeColor: 'bg-cyan-700' },
      { href: '/dashboard/snapchat', label: 'Snapchat tracking', badge: 'S', badgeColor: 'bg-yellow-500' },
    ]},
    { section: 'Insights', items: [
      { href: '/dashboard/sessions', label: 'Visitor sessions', icon: iconUsers },
      { href: '/dashboard/revenue', label: 'Purchase impact', icon: iconChart },
      { href: '/dashboard/vitals', label: 'Website speed', icon: iconPulse },
    ]},
    { section: 'Diagnostics', items: [
      { href: '/dashboard/audit', label: 'Tracking check', icon: iconShield },
      { href: '/dashboard/health', label: 'Tracking health', icon: iconShield },
      { href: '/dashboard/duplicates', label: 'Possible repeats', icon: iconLayers },
      { href: '/dashboard/gtm', label: 'Tag Manager checks', icon: iconLayers },
      { href: '/dashboard/adblock', label: 'When tracking was blocked', icon: iconShield },
      { href: '/dashboard/consent', label: 'Privacy choices', icon: iconLock },
      { href: '/dashboard/compliance', label: 'Website safety', icon: iconShield },
    ]},
    { section: 'Setup', items: [
      { href: '/dashboard/install', label: 'Install GAfix', icon: iconCode, highlight: true },
      { href: '/dashboard/integrations', label: 'Alerts and data', icon: iconLink },
      { href: '/dashboard/settings', label: 'Settings', icon: iconGear },
    ]},
  ];

  return (
    <div className={`dashboard-shell ${theme === 'dark' ? 'dashboard-dark' : 'dashboard-light'} min-h-screen`} data-theme={theme}>
      <div className="flex">
                  <aside className="w-64 h-screen bg-[#0b111b] border-r border-white/[.07] text-white flex flex-col fixed left-0 top-0 overflow-hidden shadow-2xl shadow-black/20">

          <div className="p-4 border-b border-white/10">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-sm shadow-black/20"><img src="/gafix-logo.png" alt="GAfix" className="h-full w-full object-contain" /></span>
              <span><span className="block font-semibold tracking-tight text-white">GAfix<span className="text-[#ff9d18]">.</span></span><span className="mt-0.5 block text-[9px] uppercase tracking-[.18em] text-slate-500">Real-user intelligence</span></span>
            </Link>
          </div>
          <div className="p-4">
            {sites.length ? (
              <select
                value={siteId || ''}
                onChange={(e) => switchSite(Number(e.target.value))}
                className="w-full border border-white/[.09] rounded-xl px-3 py-2.5 text-sm bg-[#121b29] text-white outline-none focus:border-[#86a8ff]"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.domain}</option>
                ))}
              </select>
            ) : (
              <Link href="/dashboard/settings" className="block w-full text-center border border-dashed border-white/20 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:border-[#2f6bff] hover:text-[#86a8ff]">
                + Add your first site
              </Link>
            )}
          </div>
          <nav className="min-h-0 px-2 py-2 space-y-1 flex-1 overflow-y-auto overscroll-contain">
            {nav.map((sec) => (
              <div key={sec.section}>
                <div className="px-3 py-1 mt-5 text-[10px] font-bold text-slate-600 uppercase tracking-[.18em]">{sec.section}</div>
                {sec.items.map((item: any) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href + (siteId ? `?siteId=${siteId}` : '')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                        active
                          ? 'bg-gradient-to-r from-[#2f6bff]/30 to-transparent text-white font-semibold ring-1 ring-[#86a8ff]/25 shadow-[inset_3px_0_0_#2f6bff]'
                          : item.highlight
                          ? 'text-[#86a8ff] hover:bg-[#2f6bff]/10 font-semibold'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {item.icon ? item.icon() : (
                        <span className={`w-4 h-4 rounded ${item.badgeColor} text-white text-[9px] font-bold flex items-center justify-center`}>{item.badge}</span>
                      )}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="m-3 rounded-xl border border-[#a8f06a]/15 bg-[#a8f06a]/[.05] p-3"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#b9f57e]"><span className="dot bg-[#a8f06a]" /> Collector active</div><div className="mt-1 text-[10px] leading-relaxed text-slate-500">GAfix is watching visitor actions and checking whether tracking gets through.</div></div>
          <div className="p-3 border-t border-white/[.07] flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#2f6bff] text-white font-bold text-sm flex items-center justify-center">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-white">{email}</div>
              <button onClick={logout} className="text-xs text-slate-500 hover:text-white">Sign out</button>
            </div>
          </div>
        </aside>

        <main className="dashboard-main-grid flex-1 min-h-screen min-w-0 ml-64">
          <div className="h-[72px] border-b border-white/[.07] bg-[#0b111b]/90 px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#86a8ff]">GAfix command center</p><h1 className="mt-0.5 font-semibold tracking-tight text-white">{pageTitle(pathname)}</h1></div>
              {currentSite && (
                <><span className="dashboard-top-control"><span className="dot bg-[#a8f06a]" /> <strong>Live</strong> · last 24 hours</span><span className="pill bg-[#a8f06a]/10 text-[#b9f57e]">
                  <span className="dot bg-green-500"></span>Live
                </span></>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'light'} className="dashboard-top-control theme-toggle">
                <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span><strong>{theme === 'dark' ? 'Light' : 'Dark'}</strong>
              </button>
              {currentSite && (
                <span className="dashboard-top-control"><span className="text-slate-500">Site</span><strong className="mono">{currentSite.domain}</strong></span>
              )}
            </div>
          </div>
          <div className="dashboard-gridline min-h-[calc(100vh-72px)] p-5 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function pageTitle(path: string) {
  const titles: Record<string, string> = {
    '/dashboard': 'Overview',
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
    '/dashboard/audit': 'Tracking check',
    '/dashboard/health': 'Tracking health',
    '/dashboard/duplicates': 'Possible repeats',
    '/dashboard/gtm': 'Tag Manager checks',
    '/dashboard/adblock': 'When tracking was blocked',
    '/dashboard/consent': 'Privacy choices',
    '/dashboard/compliance': 'Website safety',
    '/dashboard/install': 'Install GAfix',
    '/dashboard/gtm-connect': 'Connect Tag Manager',
    '/dashboard/integrations': 'Alerts and data',
    '/dashboard/settings': 'Settings',
  };
  return titles[path] || 'Dashboard';
}

// icons
function iconGrid() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>); }
function iconLayers() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>); }
function iconShield() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>); }
function iconLock() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>); }
function iconCode() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>); }
function iconLink() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>); }
function iconUsers() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>); }
function iconChart() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m7 16 4-5 3 3 5-7"/></svg>); }
function iconPulse() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>); }
function iconGear() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>); }
