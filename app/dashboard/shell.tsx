'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

type Site = { id: number; domain: string; api_key: string; first_party_domain?: string | null };

export default function DashboardShell({
  children, email, sites,
}: { children: React.ReactNode; email: string; sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState<number | null>(null);

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
      { href: '/dashboard/ga4', label: 'Google Analytics 4', badge: 'GA', badgeColor: 'bg-orange-500' },
      { href: '/dashboard/ads', label: 'Google Ads', badge: 'Ad', badgeColor: 'bg-blue-500' },
      { href: '/dashboard/meta', label: 'Meta Pixel', badge: 'M', badgeColor: 'bg-blue-600' },
      { href: '/dashboard/tiktok', label: 'TikTok Pixel', badge: 'TT', badgeColor: 'bg-ink-950' },
    ]},
    { section: 'Diagnostics', items: [
      { href: '/dashboard/audit', label: 'Runtime audit', icon: iconShield },
      { href: '/dashboard/health', label: 'Tag health', icon: iconShield },
      { href: '/dashboard/duplicates', label: 'Duplicate events', icon: iconLayers },
      { href: '/dashboard/gtm', label: 'GTM diagnostics', icon: iconLayers },
      { href: '/dashboard/adblock', label: 'Ad-blocker impact', icon: iconShield },
      { href: '/dashboard/consent', label: 'Consent Mode', icon: iconLock },
      { href: '/dashboard/synthetic', label: 'Synthetic checks', icon: iconShield },
      { href: '/dashboard/compliance', label: 'Compliance', icon: iconShield },
    ]},
    { section: 'Setup', items: [
      { href: '/dashboard/install', label: 'Manual GTM install', icon: iconCode },
      { href: '/dashboard/gtm-connect', label: 'Connect GTM', icon: iconLink, highlight: true },
      { href: '/dashboard/integrations', label: 'Integrations & exports', icon: iconLink },
      { href: '/dashboard/settings', label: 'Settings', icon: iconGear },
    ]},
  ];

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="flex">
        <aside className="w-60 min-h-screen bg-white border-r border-ink-200 flex flex-col fixed left-0 top-0">
          <div className="p-4 border-b border-ink-100">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-ink-950 flex items-center justify-center text-white font-bold text-sm">G4</div>
              <span className="font-semibold text-ink-950">GA4Fix</span>
            </Link>
          </div>
          <div className="p-4">
            {sites.length ? (
              <select
                value={siteId || ''}
                onChange={(e) => switchSite(Number(e.target.value))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.domain}</option>
                ))}
              </select>
            ) : (
              <Link href="/dashboard/settings" className="block w-full text-center border border-dashed border-ink-300 rounded-lg px-3 py-2 text-sm text-ink-500 hover:border-brand-500 hover:text-brand-600">
                + Add your first site
              </Link>
            )}
          </div>
          <nav className="px-2 py-2 space-y-1 flex-1 overflow-y-auto">
            {nav.map((sec) => (
              <div key={sec.section}>
                <div className="px-3 py-1 mt-3 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">{sec.section}</div>
                {sec.items.map((item: any) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href + (siteId ? `?siteId=${siteId}` : '')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                        active
                          ? 'bg-ink-100 text-ink-950 font-medium'
                          : item.highlight
                          ? 'text-brand-600 hover:bg-brand-500/10 font-medium'
                          : 'text-ink-700 hover:bg-ink-100'
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
          <div className="p-3 border-t border-ink-100 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-500 text-white font-semibold text-sm flex items-center justify-center">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{email}</div>
              <button onClick={logout} className="text-xs text-ink-400 hover:text-ink-800">Sign out</button>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 ml-60">
          <div className="h-14 border-b border-ink-200 bg-white px-6 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-ink-950">{pageTitle(pathname)}</h1>
              {currentSite && (
                <span className="pill bg-green-100 text-green-800">
                  <span className="dot bg-green-500"></span>Live
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentSite && (
                <span className="text-xs text-ink-500 mono">{currentSite.domain}</span>
              )}
            </div>
          </div>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function pageTitle(path: string) {
  const titles: Record<string, string> = {
    '/dashboard': 'Overview',
    '/dashboard/ga4': 'Google Analytics 4',
    '/dashboard/ads': 'Google Ads',
    '/dashboard/meta': 'Meta Pixel',
    '/dashboard/tiktok': 'TikTok Pixel',
    '/dashboard/audit': 'Runtime audit',
    '/dashboard/health': 'Tag health',
    '/dashboard/duplicates': 'Duplicate events',
    '/dashboard/gtm': 'GTM diagnostics',
    '/dashboard/adblock': 'Ad-blocker impact',
    '/dashboard/consent': 'Consent Mode',
    '/dashboard/synthetic': 'Synthetic checks',
    '/dashboard/compliance': 'Compliance',
    '/dashboard/install': 'Manual GTM install',
    '/dashboard/gtm-connect': 'Connect GTM',
    '/dashboard/integrations': 'Integrations & exports',
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
function iconGear() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>); }
