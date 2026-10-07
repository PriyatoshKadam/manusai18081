'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pill } from '../ui';

const tabs = [
  ['general', 'General'],
  ['sites', 'Sites & Monitoring'],
  ['platforms', 'Platforms'],
  ['detection', 'Detection'],
  ['alerts', 'Alerts & Notifications'],
  ['consent', 'Consent & Privacy'],
  ['retention', 'Data Retention'],
  ['api', 'API & Webhooks'],
] as const;

type Site = any;

export default function SettingsPage() {
  const search = useSearchParams();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('general');
  const [sites, setSites] = useState<Site[]>([]);
  const [policySiteId, setPolicySiteId] = useState<number | null>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const requested = search.get('section');
    if (tabs.some(([id]) => id === requested)) setTab(requested as any);
  }, [search]);

  useEffect(() => { loadSites(); }, []);
  useEffect(() => {
    if (!policySiteId) return;
    fetch('/api/alert-policy?siteId=' + policySiteId, { cache: 'no-store' }).then((r) => r.json()).then((body) => setPolicy(normalizePolicy(body.policy))).catch(() => setPolicy(null));
  }, [policySiteId]);

  async function loadSites() {
    try {
      const res = await fetch('/api/sites', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to load sites');
      const next = body.sites || [];
      setSites(next);
      if (!policySiteId && next[0]) setPolicySiteId(Number(next[0].id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load sites');
    }
  }

  function selectTab(next: string) {
    setTab(next as any);
    const url = new URL(window.location.href);
    url.searchParams.set('section', next);
    window.history.replaceState({}, '', url.toString());
  }

  async function savePolicy() {
    if (!policySiteId || !policy) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/alert-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: policySiteId, ...policy }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to save alert policy');
      setPolicy(normalizePolicy(body.policy));
      setMessage('Alert policy saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save alert policy');
    } finally { setBusy(false); }
  }

  async function saveSite(form: FormData, id?: number) {
    setBusy(true); setMessage('');
    try {
      const body: any = {};
      form.forEach((value, key) => { body[key] = String(value).trim() || null; });
      const res = await fetch(id ? '/api/sites/' + id : '/api/sites', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || 'Unable to save website');
      setShowAdd(false); setEditing(null);
      await loadSites();
      setMessage(id ? 'Website updated.' : 'Website added.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save website');
    } finally { setBusy(false); }
  }

  async function deleteSite(id: number) {
    if (!confirm('Delete this website and all monitoring data? This cannot be undone.')) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/sites/' + id, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to delete website');
      await loadSites();
      setMessage('Website deleted.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to delete website');
    } finally { setBusy(false); }
  }

  async function rotateKey(id: number) {
    if (!confirm('Replace the monitoring key? The previous key remains valid for the grace period.')) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/sites/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate_api_key' }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to rotate key');
      await loadSites();
      setMessage('Monitoring key replaced. Update the installation before the previous key expires.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to rotate key');
    } finally { setBusy(false); }
  }

  return (
    <div className="fade-in max-w-7xl">
      <header className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="dashboard-eyebrow">Workspace controls</p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--text)]">Settings</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-2)]">Configure the monitoring environment without changing the evidence rules that keep GAfix conservative.</p>
        </div>
        <Link href="/dashboard/team" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)]">Manage team →</Link>
      </header>

      {message ? <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-2)]">{message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[215px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow)]">
          {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => selectTab(id)} className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition last:mb-0" style={{ background: tab === id ? 'var(--tint)' : 'transparent', color: tab === id ? 'var(--accent)' : 'var(--text-2)' }}><span>{label}</span>{tab === id ? <span>›</span> : null}</button>)}
        </aside>

        <main className="min-w-0">
          {tab === 'general' ? <GeneralPanel /> : null}
          {tab === 'sites' ? <SitesPanel sites={sites} showAdd={showAdd} editing={editing} busy={busy} onAdd={() => setShowAdd(true)} onCancelAdd={() => setShowAdd(false)} onEdit={setEditing} onDelete={deleteSite} onRotate={rotateKey} onSubmit={saveSite} /> : null}
          {tab === 'platforms' ? <PlatformsPanel sites={sites} /> : null}
          {tab === 'detection' ? <DetectionPanel /> : null}
          {tab === 'alerts' ? <AlertsPanel sites={sites} policySiteId={policySiteId} setPolicySiteId={setPolicySiteId} policy={policy} setPolicy={setPolicy} busy={busy} onSave={savePolicy} /> : null}
          {tab === 'consent' ? <ConsentPanel /> : null}
          {tab === 'retention' ? <RetentionPanel /> : null}
          {tab === 'api' ? <ApiPanel sites={sites} /> : null}
        </main>
      </div>
    </div>
  );
}

function GeneralPanel() {
  return <Panel title="General" eyebrow="Workspace" copy="Workspace-wide defaults and presentation preferences."><div className="grid gap-4 md:grid-cols-2"><Setting label="Workspace name" value="GAfix Workspace" /><Setting label="Default timezone" value="Asia/Kolkata" /><Setting label="Default date range" value="Last 24 hours" /><Setting label="Default currency" value="Auto-detect from observed purchase events" /></div><Note>Detection itself stays evidence-based. These controls only change workspace presentation and defaults.</Note></Panel>;
}

function SitesPanel({ sites, showAdd, editing, busy, onAdd, onCancelAdd, onEdit, onDelete, onRotate, onSubmit }: any) {
  return <Panel title="Sites & Monitoring" eyebrow="Websites" copy="Control which domains GAfix watches and the identifiers used to correlate implementations.">
    {!showAdd && !editing ? <div className="mb-5 flex items-center justify-between rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4"><div><div className="text-sm font-semibold text-[var(--text)]">Add another monitored website</div><div className="mt-1 text-xs text-[var(--text-3)]">Each site receives its own monitoring key and configuration scope.</div></div><button onClick={onAdd} className="rounded-xl bg-[var(--btn-dark)] px-4 py-2 text-xs font-semibold text-white">+ Add website</button></div> : null}
    {showAdd ? <SiteForm title="Add website" busy={busy} onCancel={onCancelAdd} onSubmit={(form: FormData) => onSubmit(form)} /> : null}
    <div className="space-y-3">
      {sites.map((site: Site) => editing === Number(site.id) ? <SiteForm key={site.id} title={'Edit ' + site.domain} busy={busy} onCancel={() => onEdit(null)} site={site} onSubmit={(form: FormData) => onSubmit(form, Number(site.id))} /> : <SiteCard key={site.id} site={site} onEdit={() => onEdit(Number(site.id))} onDelete={() => onDelete(Number(site.id))} onRotate={() => onRotate(Number(site.id))} />)}
      {!sites.length ? <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--text-3)]">No websites are being monitored yet.</div> : null}
    </div>
  </Panel>;
}

function SiteCard({ site, onEdit, onDelete, onRotate }: any) {
  const platformFields = [['GA4', site.ga4_measurement_id], ['Google Ads', site.gads_conversion_id], ['Meta', site.meta_pixel_id], ['TikTok', site.tiktok_pixel_id], ['LinkedIn', site.linkedin_partner_id], ['Microsoft Ads', site.bing_uet_tag_id], ['Snapchat', site.snapchat_pixel_id]];
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-[var(--text)]">{site.domain}</h3><Pill tone="ok">Monitoring</Pill></div><p className="mt-1 text-xs text-[var(--text-3)]">Monitoring key is protected and never displayed in this screen.</p></div><div className="flex flex-wrap gap-2"><button onClick={onEdit} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-2)]">Edit</button><button onClick={onRotate} className="rounded-lg border border-[var(--warn-bd)] px-3 py-1.5 text-xs font-semibold text-[var(--warn-fg)]">Replace key</button><button onClick={onDelete} className="rounded-lg border border-[var(--crit-bd)] px-3 py-1.5 text-xs font-semibold text-[var(--crit-fg)]">Delete</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{platformFields.map(([label, value]) => <StatusField key={label} label={label as string} value={value as string} />)}<StatusField label="GTM" value={site.gtm_container_id} /><StatusField label="First-party domain" value={site.first_party_domain} /></div></div>;
}

function SiteForm({ title, site, busy, onCancel, onSubmit }: any) {
  const fields = [['domain','Website address','shop.acme.com'],['gtm_container_id','GTM container','GTM-XXXXXXX'],['ga4_measurement_id','GA4 measurement ID','G-XXXXXXXXXX'],['gads_conversion_id','Google Ads','AW-XXXXXXXXX'],['meta_pixel_id','Meta Pixel','1234567890'],['tiktok_pixel_id','TikTok Pixel','CXXXXXXXX'],['linkedin_partner_id','LinkedIn','2919002'],['bing_uet_tag_id','Microsoft Ads','343007686'],['snapchat_pixel_id','Snapchat Pixel','xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'],['first_party_domain','First-party tracking domain','analytics.shop.acme.com']];
  return <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold text-[var(--text)]">{title}</h3><p className="mt-1 text-xs text-[var(--text-3)]">Identifiers are used as correlation hints; observed telemetry remains the source for actual delivery evidence.</p></div><button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-[var(--text-3)]">×</button></div><div className="mt-5 grid gap-4 md:grid-cols-2">{fields.map(([name,label,placeholder]) => <label key={name} className="block"><span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">{label}{name === 'domain' ? ' *' : ''}</span><input name={name} defaultValue={site?.[name] || ''} placeholder={placeholder} required={name === 'domain'} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" /></label>)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-2)]">Cancel</button><button disabled={busy} className="rounded-xl bg-[var(--btn-dark)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save website'}</button></div></form>;
}

function PlatformsPanel({ sites }: { sites: Site[] }) {
  const site = sites[0];
  const platforms = [['GA4','ga4_measurement_id','/dashboard/ga4'],['Google Ads','gads_conversion_id','/dashboard/ads'],['Meta','meta_pixel_id','/dashboard/meta'],['Microsoft Ads','bing_uet_tag_id','/dashboard/bing'],['TikTok','tiktok_pixel_id','/dashboard/tiktok'],['LinkedIn','linkedin_partner_id','/dashboard/linkedin'],['Snapchat','snapchat_pixel_id','/dashboard/snapchat']];
  return <Panel title="Platforms" eyebrow="Connections" copy="See which platform identifiers are configured for the selected workspace site."><div className="grid gap-3 md:grid-cols-2">{platforms.map(([name,key,href]) => { const value = site?.[key]; return <div key={name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-[var(--text)]">{name}</div><div className="mt-1 font-mono text-[11px] text-[var(--text-3)]">{value || 'Not configured'}</div></div><Pill tone={value ? 'ok' : 'neutral'}>{value ? 'Configured' : 'Not configured'}</Pill></div>{value ? <Link href={href + '?siteId=' + site.id} className="mt-4 inline-flex text-xs font-semibold text-[var(--accent)]">Open monitoring →</Link> : null}</div>; })}</div><Note>Connection metadata does not prove that a platform is healthy. GAfix determines health from observed implementation, execution, network, consent and blocker evidence.</Note></Panel>;
}

function DetectionPanel() {
  const groups = [
    ['Events', ['Missing Event','Offline Event','Traffic Drop / Spike','Duplicate Event','Naming Inconsistency']],
    ['Parameters', ['Required / Optional / Conditional','Empty Parameter','Type Collision','Forbidden Parameter']],
    ['Pages', ['Page Event Coverage','Page Traffic Anomaly','Page Delivery Issue']],
    ['Consent', ['Technical Consent Violation','Consent Timing','Acceptance / Rejection Drift']],
    ['Ad Blocker', ['Confirmed Blocker','Likely Blocker','Correlation Gap','Telemetry Gap']],
    ['Revenue', ['Missing Transaction Identity','Value / Currency Issues','Duplicate Transaction','Delivery Impact']],
  ];
  const [sensitivity, setSensitivity] = useLocalSetting('gafix_detection_sensitivity', 'balanced');
  return <Panel title="Detection" eyebrow="Governance" copy="Tune how aggressively GAfix surfaces issues. The underlying evidence standards remain fixed."><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><div className="text-xs font-semibold text-[var(--text)]">Monitoring sensitivity</div><div className="mt-1 text-xs text-[var(--text-3)]">Conservative requires stronger evidence. Balanced is recommended. Sensitive surfaces earlier candidates.</div><div className="mt-4 grid gap-2 sm:grid-cols-3">{['conservative','balanced','sensitive'].map((value) => <button key={value} onClick={() => setSensitivity(value)} className="rounded-xl border px-3 py-3 text-left text-xs font-semibold capitalize" style={{ borderColor: sensitivity === value ? 'var(--accent)' : 'var(--border)', background: sensitivity === value ? 'var(--tint)' : 'var(--surface)', color: sensitivity === value ? 'var(--accent)' : 'var(--text-2)' }}>{value}{value === 'balanced' ? ' · Recommended' : ''}</button>)}</div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{groups.map(([title, items]) => <div key={title as string} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3><div className="mt-3 space-y-2">{(items as string[]).map((item) => <div key={item} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs"><span className="text-[var(--text-2)]">{item}</span><span className="text-[var(--ok-fg)]">Enabled</span></div>)}</div></div>)}</div><Note>Rates, sample gates, decay windows, consent semantics and evidence hierarchy are controlled by the monitoring engine rather than arbitrary per-user thresholds.</Note></Panel>;
}

function AlertsPanel({ sites, policySiteId, setPolicySiteId, policy, setPolicy, busy, onSave }: any) {
  return <Panel title="Alerts & Notifications" eyebrow="Alert policy" copy="Choose which issues become immediate notifications and how repeated incidents are grouped."><div className="mb-5 flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 md:flex-row md:items-center"><div><div className="text-sm font-semibold text-[var(--text)]">Policy scope</div><div className="mt-1 text-xs text-[var(--text-3)]">Policies are stored per monitored website.</div></div><select value={policySiteId || ''} onChange={(e) => setPolicySiteId(Number(e.target.value))} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">{sites.map((site: Site) => <option key={site.id} value={site.id}>{site.domain}</option>)}</select></div>{policy ? <><div className="grid gap-4 md:grid-cols-2"><ToggleRow label="Monitoring alerts enabled" checked={policy.enabled} onChange={(checked) => setPolicy({ ...policy, enabled: checked })} /><ToggleRow label="Daily digest" checked={policy.digestEnabled} onChange={(checked) => setPolicy({ ...policy, digestEnabled: checked })} /><SelectRow label="Minimum dashboard severity" value={policy.minSeverity} options={['info','warning','critical']} onChange={(value) => setPolicy({ ...policy, minSeverity: value })} /><SelectRow label="Immediate notification severity" value={policy.realtimeMinSeverity} options={['info','warning','critical']} onChange={(value) => setPolicy({ ...policy, realtimeMinSeverity: value })} /></div><div className="mt-5 grid gap-4 md:grid-cols-3"><NumberRow label="Duplicate suppression (seconds)" value={policy.duplicateWindowSeconds} onChange={(value) => setPolicy({ ...policy, duplicateWindowSeconds: value })} /><NumberRow label="Failure-rate threshold" value={policy.failureRateThreshold} step="0.01" onChange={(value) => setPolicy({ ...policy, failureRateThreshold: value })} /><NumberRow label="Latency multiplier" value={policy.latencyMultiplier} step="0.1" onChange={(value) => setPolicy({ ...policy, latencyMultiplier: value })} /><NumberRow label="Consent drift threshold" value={policy.consentDriftThreshold} step="0.01" onChange={(value) => setPolicy({ ...policy, consentDriftThreshold: value })} /><NumberRow label="Flood window (minutes)" value={policy.floodWindowMinutes} onChange={(value) => setPolicy({ ...policy, floodWindowMinutes: value })} /><NumberRow label="Flood limit" value={policy.floodLimit} onChange={(value) => setPolicy({ ...policy, floodLimit: value })} /></div><div className="mt-5 grid gap-3 md:grid-cols-3"><Channel label="Slack" enabled={policy.slackEnabled} /><Channel label="Email" enabled={policy.emailEnabled} /><Channel label="Webhook" enabled={policy.webhookEnabled} /></div><div className="mt-5 flex items-center justify-between gap-4 border-t border-[var(--border-soft)] pt-5"><p className="text-xs text-[var(--text-3)]">Alert thresholds affect notification behavior, not the underlying issue evidence.</p><button disabled={busy} onClick={onSave} className="rounded-xl bg-[var(--btn-dark)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save policy'}</button></div></> : <div className="rounded-xl bg-[var(--surface-2)] p-6 text-sm text-[var(--text-3)]">No policy loaded for this site.</div>}</Panel>;
}

function ConsentPanel() {
  const [consent, setConsent] = useLocalSetting('gafix_consent_controls', 'enabled');
  return <Panel title="Consent & Privacy" eyebrow="Privacy controls" copy="Keep consent monitoring separate from ad-blocker and delivery diagnostics."><div className="space-y-3"><ToggleRow label="Consent monitoring" checked={consent === 'enabled'} onChange={(checked) => setConsent(checked ? 'enabled' : 'disabled')} /><ToggleRow label="Technical consent enforcement checks" checked={true} onChange={() => {}} disabled /><ToggleRow label="Google Consent Mode checks" checked={true} onChange={() => {}} disabled /></div><div className="mt-5 grid gap-4 md:grid-cols-3"><Info label="Consent evidence" value="Accepted / rejected / no choice / unknown" /><Info label="Google consent types" value="ad_storage · analytics_storage · ad_user_data · ad_personalization" /><Info label="Privacy posture" value="No legal-compliance conclusion from telemetry alone" /></div><Note>Consent Mode denied requests are not automatically classified as consent violations. GAfix evaluates timing and enforcement evidence separately.</Note></Panel>;
}

function RetentionPanel() {
  const [raw, setRaw] = useLocalSetting('gafix_retention_raw', '30 days');
  const [issues, setIssues] = useLocalSetting('gafix_retention_issues', '180 days');
  const [alerts, setAlerts] = useLocalSetting('gafix_retention_alerts', '365 days');
  return <Panel title="Data Retention" eyebrow="Data lifecycle" copy="Visual defaults for how long different monitoring records are kept. Apply your product privacy policy before exposing these as customer-editable values."><div className="grid gap-4 md:grid-cols-3"><Retention label="Raw telemetry" value={raw} onChange={setRaw} /><Retention label="Issues & evidence" value={issues} onChange={setIssues} /><Retention label="Alerts & delivery history" value={alerts} onChange={setAlerts} /></div><Note>These controls are currently presentation preferences. Enforcing retention needs a backend retention worker before they should be treated as authoritative.</Note></Panel>;
}

function ApiPanel({ sites }: { sites: Site[] }) {
  const configuredWebhook = sites.some((site) => Boolean(site.slack_webhook_url));
  return <Panel title="API & Webhooks" eyebrow="Developer access" copy="Expose integration readiness without ever displaying secrets in the browser."><div className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="text-sm font-semibold text-[var(--text)]">Monitoring API</div><p className="mt-1 text-xs leading-5 text-[var(--text-3)]">Site monitoring keys are generated server-side and protected from the dashboard.</p><Pill tone="ok" className="mt-4">Configured per site</Pill></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="text-sm font-semibold text-[var(--text)]">Webhook delivery</div><p className="mt-1 text-xs leading-5 text-[var(--text-3)]">Use alert routing to send issue lifecycle events to your webhook destination.</p><Pill tone={configuredWebhook ? 'ok' : 'neutral'} className="mt-4">{configuredWebhook ? 'Configured' : 'Not configured'}</Pill></div></div><div className="mt-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-xs text-[var(--text-3)]">Recommended webhook events: issue.created · issue.updated · issue.resolved · alert.created · alert.delivery_failed · gtm.change_detected.</div></Panel>;
}

function Panel({ title, eyebrow, copy, children }: { title: string; eyebrow: string; copy: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] lg:p-6"><div className="border-b border-[var(--border-soft)] pb-5"><p className="dashboard-eyebrow">{eyebrow}</p><h3 className="mt-1 font-display text-xl font-semibold text-[var(--text)]">{title}</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-2)]">{copy}</p></div><div className="pt-5">{children}</div></section>;
}
function Setting({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-3)]">{label}</div><div className="mt-2 text-sm font-semibold text-[var(--text)]">{value}</div></div>; }
function StatusField({ label, value }: { label: string; value?: string | null }) { return <div className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-3)]">{label}</div><div className="mt-1 truncate font-mono text-[11px] text-[var(--text-2)]">{value || 'Not configured'}</div></div>; }
function Note({ children }: { children: React.ReactNode }) { return <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs leading-5 text-[var(--text-3)]">{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[var(--surface-2)] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-3)]">{label}</div><div className="mt-2 text-xs leading-5 text-[var(--text-2)]">{value}</div></div>; }
function ToggleRow({ label, checked, onChange, disabled=false }: { label: string; checked: boolean; onChange: (value:boolean)=>void; disabled?:boolean }) { return <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"><span className="text-sm font-medium text-[var(--text-2)]">{label}</span><button type="button" disabled={disabled} onClick={() => onChange(!checked)} aria-pressed={checked} className="relative h-6 w-11 rounded-full transition disabled:cursor-default disabled:opacity-70" style={{ background: checked ? 'var(--accent)' : 'var(--surface-3)' }}><span className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition" style={{ left: checked ? '24px' : '4px' }} /></button></label>; }
function SelectRow({ label, value, options, onChange }: { label:string; value:string; options:string[]; onChange:(v:string)=>void }) { return <label className="block"><span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]">{options.map((option)=><option key={option}>{option}</option>)}</select></label>; }
function NumberRow({ label, value, onChange, step='1' }: { label:string; value:number; onChange:(v:number)=>void; step?:string }) { return <label className="block"><span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">{label}</span><input type="number" step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]" /></label>; }
function Channel({ label, enabled }: { label:string; enabled:boolean }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><div className="text-xs font-semibold text-[var(--text)]">{label}</div><div className="mt-2"><Pill tone={enabled ? 'ok' : 'neutral'}>{enabled ? 'Enabled' : 'Off'}</Pill></div></div>; }
function Retention({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) { return <label className="block rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-3)]">{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)]"><option>30 days</option><option>90 days</option><option>180 days</option><option>365 days</option></select></label>; }

function normalizePolicy(value: any) {
  const p = value || {};
  return {
    enabled: p.enabled !== false,
    minSeverity: p.minSeverity || p.min_severity || 'warning',
    realtimeMinSeverity: p.realtimeMinSeverity || p.realtime_min_severity || 'critical',
    digestEnabled: p.digestEnabled ?? p.digest_enabled ?? true,
    digestHour: Number(p.digestHour ?? p.digest_hour ?? 9),
    duplicateWindowSeconds: Number(p.duplicateWindowSeconds ?? p.duplicate_window_seconds ?? 120),
    failureRateThreshold: Number(p.failureRateThreshold ?? p.failure_rate_threshold ?? 0.1),
    latencyMultiplier: Number(p.latencyMultiplier ?? p.latency_multiplier ?? 2),
    consentDriftThreshold: Number(p.consentDriftThreshold ?? p.consent_drift_threshold ?? 0.15),
    floodWindowMinutes: Number(p.floodWindowMinutes ?? p.flood_window_minutes ?? 10),
    floodLimit: Number(p.floodLimit ?? p.flood_limit ?? 5),
    slackEnabled: p.slackEnabled ?? p.slack_enabled ?? true,
    emailEnabled: p.emailEnabled ?? p.email_enabled ?? false,
    webhookEnabled: p.webhookEnabled ?? p.webhook_enabled ?? false,
  };
}

function useLocalSetting(key: string, initial: string) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try { const stored = localStorage.getItem(key); if (stored) setValue(stored); } catch {}
  }, [key]);
  function update(next: string) { setValue(next); try { localStorage.setItem(key, next); } catch {} }
  return [value, update] as const;
}
