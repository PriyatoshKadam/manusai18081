'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Site = { id: number | string; domain: string; api_key: string };
type Container = { accountId: string; containerId: string; name: string; publicId: string | null; usageContext: string[]; domainName: string[] };
type Account = { accountId: string; name: string; containers: Container[] };
type Installation = { installationId: number | string; status: string; workspace?: { accountId: string; containerId: string; workspaceId: string; name: string | null; url: string | null }; tag?: { tagId: string; name: string | null }; trigger?: { triggerId: string; name: string | null }; publishRequired?: boolean };
type Workspace = { workspaceId: string; name: string; description: string | null; updateTime: string | null };

export default function GtmConnectPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId') || '';
  const status = search.get('gtm');
  const oauthReason = search.get('gtm_reason');
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(siteId);
  const [connected, setConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [containerId, setContainerId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [inventory, setInventory] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const site = sites.find((item) => String(item.id) === String(selectedSiteId)) || sites[0];
  const selectedAccount = accounts.find((item) => item.accountId === accountId);
  const selectedContainer = selectedAccount?.containers.find((item) => item.containerId === containerId);
  const preview = useMemo(() => {
    const configuredOrigin = process.env.NEXT_PUBLIC_MONITOR_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '';
    const origin = (configuredOrigin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
    if (!site) return 'Add a website in GAfix before creating the monitor tag preview.';
    if (!origin) return 'The GAfix owner must configure the monitor address before the tag preview can be shown.';
    const url = new URL('/monitor.js', origin);
    url.searchParams.set('apiKey', site.api_key);
    if (selectedContainer?.publicId) url.searchParams.set('gtmContainerId', selectedContainer.publicId);
    return `<script src="${url.toString()}" async></script>`;
  }, [site, selectedContainer]);

  async function loadContainers() {
    setLoadingContainers(true);
    setError(null);
    try {
      const response = await fetch('/api/gtm/containers', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'We could not load your Tag Manager containers');
      setConnected(Boolean(data.connected));
      setGoogleEmail(data.googleEmail || null);
      setAccounts(data.accounts || []);
      if (!accountId && data.accounts?.[0]) setAccountId(data.accounts[0].accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load your Tag Manager containers');
    } finally {
      setLoadingContainers(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sites', { credentials: 'include', cache: 'no-store' }).then((response) => response.json().then((data) => ({ response, data }))).then(({ response, data }) => { if (!response.ok) throw new Error(data?.error || 'We could not load your monitored websites'); if (!cancelled) { setSites(data.sites || []); setSelectedSiteId((current) => current || String(data.sites?.[0]?.id || '')); } }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'We could not load your monitored websites'); });
    loadContainers();
    if (status === 'connected') setNotice('Google Tag Manager is connected. Choose a container to continue.');
    if (status === 'not_configured') setError('Google Tag Manager connection is not enabled on this deployment yet. The GAfix owner must configure Google access once; customers do not need to change server settings.');
    if (status === 'denied') setError('Google authorization was cancelled.');
    if (status === 'invalid_state') setError('The Google connection session expired. Please try again.');
    if (status === 'error') setError(oauthReason === 'missing_config' ? 'The deployed service is missing GTM_CLIENT_ID, GTM_CLIENT_SECRET, or GTM_REDIRECT_URI. Add all three to Render and redeploy.' : oauthReason === 'redirect_uri_mismatch' ? 'Google rejected the callback URL. Make sure Google Cloud and Render both use https://monitoring-0jsu.onrender.com/api/gtm/callback exactly.' : oauthReason === 'invalid_client' ? 'Google rejected the OAuth client credentials. Verify that GTM_CLIENT_ID and GTM_CLIENT_SECRET belong to the same Google Cloud Web application, then redeploy Render.' : oauthReason === 'invalid_grant' ? 'Google authorization has expired or been revoked. Remove GAfix from Google account permissions and connect again.' : oauthReason === 'refresh_token' ? 'Google did not provide a refresh token. Remove GAfix from Google account permissions and connect again with consent enabled.' : oauthReason === 'denied' ? 'Google denied the authorization request. Confirm the account is an allowed test user and approve the requested GTM permissions.' : oauthReason === 'google_account' ? 'Google authorization succeeded, but GAfix could not read the Google account profile. Check the OAuth scopes and retry.' : oauthReason === 'database' ? 'Google authorization succeeded, but GAfix could not save the connection. Check the database migration and Render database logs.' : 'Google authorization could not be completed. Verify the deployed OAuth settings and try again.');
    return () => { cancelled = true; };
    // The initial load intentionally runs once for this dashboard page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    setContainerId('');
    setWorkspaceId('');
    setWorkspaces([]);
  }, [accountId]);

  useEffect(() => {
    if (!connected || !accountId || !containerId) return;
    let cancelled = false;
    setLoadingWorkspaces(true);
    fetch(`/api/gtm/workspaces?accountId=${encodeURIComponent(accountId)}&containerId=${encodeURIComponent(containerId)}`, { credentials: 'include', cache: 'no-store' })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => { if (cancelled) return; if (!response.ok) throw new Error(data?.error || 'We could not load the available workspaces'); setWorkspaces(data.workspaces || []); setWorkspaceId((current) => current || data.workspaces?.[0]?.workspaceId || ''); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'We could not load the available workspaces'); })
      .finally(() => { if (!cancelled) setLoadingWorkspaces(false); });
    return () => { cancelled = true; };
  }, [accountId, containerId, connected]);

  async function refreshInventory() {
    if (!site || !accountId || !containerId || !workspaceId) return;
    setLoadingInventory(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/gtm/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ siteId: site.id, accountId, containerId, containerPublicId: selectedContainer?.publicId || '', workspaceId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'We could not refresh the Tag Manager setup details');
      setInventory(data.snapshot);
      setNotice('Tag Manager setup details refreshed. Future visitor activity can show a tag name when the observed action matches one unique setup item.');
    } catch (err) { setError(err instanceof Error ? err.message : 'We could not refresh the Tag Manager setup details'); } finally { setLoadingInventory(false); }
  }

  async function installTag() {
    if (!site || !accountId || !containerId) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/gtm/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ siteId: site.id, accountId, containerId, gtmPublicId: selectedContainer?.publicId || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'We could not prepare the GAfix monitor tag');
      setInstallation(data); setWorkspaceId(data.workspace?.workspaceId || workspaceId); setNotice('The GAfix monitor tag is ready in a new Tag Manager workspace. Review it first, then publish when you are ready.');
    } catch (err) { setError(err instanceof Error ? err.message : 'We could not prepare the GAfix monitor tag'); } finally { setLoading(false); }
  }

  async function publishContainer() {
    if (!installation) return;
    const confirmed = window.confirm('Publish the GAfix monitor workspace to this Tag Manager container? This changes the live container and activates monitoring on the selected website.');
    if (!confirmed) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/gtm/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ installationId: installation.installationId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'We could not publish the container');
      setInstallation((current) => current ? { ...current, status: 'published', publishRequired: false } : current);
      setNotice('Published successfully. Google Tag Manager may take a short time to show the monitor to visitors.');
    } catch (err) { setError(err instanceof Error ? err.message : 'We could not publish the container'); } finally { setLoading(false); }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Setup</div>
        <h2 className="text-2xl font-semibold text-ink-950 mt-1">Connect Google Tag Manager</h2>
        <p className="text-sm text-ink-500 mt-2 max-w-3xl">Let GAfix prepare one monitor tag and one page-view rule in a workspace you can review. Publishing is always a separate action that you confirm.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">{notice}</div>}

      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div><h3 className="font-semibold text-ink-950">1. Connect Google Tag Manager</h3><p className="text-sm text-ink-500 mt-1">GAfix is configured with one secure Google connection by the product owner. You only approve your own Google account here; you do not add server settings or share passwords.</p></div>
          <a href="/api/gtm/connect" className="shrink-0 rounded-lg bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800">{connected ? 'Reconnect Google' : 'Connect your Google account'}</a>
        </div>
        {connected && <div className="text-sm text-green-700">Connected as <strong>{googleEmail || 'Google account'}</strong>.</div>}
        <div className="rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-600">Google handles the permission request. The GAfix owner keeps the connection settings on the server; you should never enter those private settings into Tag Manager or share them in the browser.</div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold text-ink-950">2. Choose a container</h3><p className="text-sm text-ink-500 mt-1">Choose the container that already runs on the selected website.</p></div><button onClick={loadContainers} disabled={loadingContainers || !connected} className="text-sm text-brand-600 hover:text-brand-800 disabled:text-ink-300">{loadingContainers ? 'Loading…' : 'Refresh containers'}</button></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-ink-700">Website to monitor<select value={String(site?.id || '')} onChange={(event) => setSelectedSiteId(event.target.value)} disabled={!sites.length} className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"><option value="">{sites.length ? 'Select a website' : 'No sites available'}</option>{sites.map((item) => <option key={item.id} value={item.id}>{item.domain}</option>)}</select></label>
          <label className="text-sm text-ink-700">Google account<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={!connected || loadingContainers} className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"><option value="">Select an account</option>{accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name} ({account.accountId})</option>)}</select></label>
          <label className="text-sm text-ink-700 md:col-span-2">Tag Manager container<select value={containerId} onChange={(event) => setContainerId(event.target.value)} disabled={!selectedAccount} className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"><option value="">Select a container</option>{selectedAccount?.containers.map((container) => <option key={container.containerId} value={container.containerId}>{container.name}{container.publicId ? ` · ${container.publicId}` : ''}</option>)}</select></label>
        </div>
        {selectedContainer && <div className="rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-600">Selected <strong>{selectedContainer.name}</strong>{selectedContainer.publicId ? ` (${selectedContainer.publicId})` : ''}. Usage: {selectedContainer.usageContext.join(', ') || 'web'}.</div>}
      </section>

      {selectedContainer && <section className="card p-5 space-y-4"><div><h3 className="font-semibold text-ink-950">3. Read the Tag Manager setup</h3><p className="text-sm text-ink-500 mt-1">Choose a workspace so GAfix can read its tag, rule, and variable details. GAfix saves a dated copy for comparison; visitor activity remains the source of what actually happened in the browser.</p></div><label className="text-sm text-ink-700">Workspace<select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} disabled={loadingWorkspaces} className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"><option value="">{loadingWorkspaces ? 'Loading workspaces…' : 'Select a workspace'}</option>{workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}</select></label><button onClick={refreshInventory} disabled={!workspaceId || loadingInventory} className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-ink-200 disabled:text-ink-300">{loadingInventory ? 'Refreshing inventory…' : 'Refresh setup details'}</button>{inventory && <div className="grid gap-3 sm:grid-cols-3 text-sm"><div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-400">Tags</div><div className="font-medium text-ink-800 mt-1">{Array.isArray(inventory.tags) ? inventory.tags.length : 0}</div></div><div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-400">Triggers</div><div className="font-medium text-ink-800 mt-1">{Array.isArray(inventory.triggers) ? inventory.triggers.length : 0}</div></div><div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-400">Fetched</div><div className="font-medium text-ink-800 mt-1">{inventory.fetched_at ? new Date(inventory.fetched_at).toLocaleString() : 'Just now'}</div></div></div>}<p className="text-xs text-ink-400">A tag name is shown only when the visitor action matches one unique configured tag. If the match is unclear, GAfix says so instead of guessing.</p></section>}

      <section className="card p-5 space-y-4">
        <div><h3 className="font-semibold text-ink-950">4. Review the monitor tag</h3><p className="text-sm text-ink-500 mt-1">GAfix creates one small Custom HTML tag that runs on all pages. It observes visitor requests, website announcements, privacy choices, website speed, browser errors, and clear blocking evidence.</p></div>
        <pre className="overflow-x-auto rounded-lg bg-ink-950 p-4 text-xs text-green-200">{preview}</pre>
        {!site && <p className="text-xs text-amber-700">Create a site under GAfix Sites first, then return here to install its monitor.</p>}
        <button onClick={installTag} disabled={!site || !connected || !accountId || !containerId || loading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300">{loading && !installation ? 'Creating workspace…' : 'Add monitor tag to Tag Manager'}</button>
        <p className="text-xs text-ink-400">This creates a new workspace for review and does not change the live container.</p>
      </section>

      {installation && <section className="card border-brand-200 p-5 space-y-4">
        <div><h3 className="font-semibold text-ink-950">5. Publish when ready</h3><p className="text-sm text-ink-500 mt-1">Review the workspace in Google Tag Manager before publishing. Publishing creates a version and sends it to the live container.</p></div>
        <div className="grid gap-3 sm:grid-cols-3 text-sm"><div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-400">Workspace</div><div className="font-medium text-ink-800 mt-1">{installation.workspace?.name || installation.workspace?.workspaceId}</div></div><div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-400">Tag</div><div className="font-medium text-ink-800 mt-1">{installation.tag?.name || 'GAfix monitor'}</div></div><div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-400">Status</div><div className="font-medium text-ink-800 mt-1">{installation.status === 'published' ? 'Published' : 'Ready to publish'}</div></div></div>
        {installation.workspace?.url && <a href={installation.workspace.url} target="_blank" rel="noreferrer" className="inline-block text-sm text-brand-600 hover:text-brand-800">Open this workspace in Google Tag Manager</a>}
        {installation.status !== 'published' && <button onClick={publishContainer} disabled={loading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-ink-300">{loading ? 'Publishing…' : 'Publish to live site'}</button>}
        <p className="text-xs text-ink-400">Publishing changes the live container. If needed, use Google Tag Manager’s version history to undo it.</p>
      </section>}
    </div>
  );
}
