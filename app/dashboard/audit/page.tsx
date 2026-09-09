'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pill, Tone } from '../ui';

const severityTone: Record<string, Tone> = {
  pass: 'ok',
  info: 'info',
  warning: 'warn',
  critical: 'crit',
};

export default function AuditPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!siteId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/audit?siteId=${encodeURIComponent(siteId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'We could not load the tracking check');
      setData(body);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not load the tracking check');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [siteId]);

  async function runAudit() {
    if (!siteId) return;
    setRunning(true);
    setMessage('');
    try {
      const layer = (window as any).dataLayer = (window as any).dataLayer || [];
      layer.push({ event: 'run_audit', audit_type: 'runtime_evidence', site_id: Number(siteId), audit_source: 'ga4fix_dashboard', audit_started_at: Date.now() });
      const response = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: Number(siteId) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'We could not complete the tracking check');
      setData((current: any) => ({ ...(current || {}), live: body.audit, latest: body.run }));
      setMessage('Tracking check saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not complete the tracking check');
    } finally {
      setRunning(false);
    }
  }

  if (!siteId) return <div className="text-ink-400 text-sm">Select a website to check its tracking.</div>;
  if (loading && !data) return <div className="text-ink-400 text-sm">Loading your tracking check…</div>;
  if (!data) return <div className="text-red-600 text-sm">{message || 'No tracking check is available yet.'}</div>;

  const audit = data.live;
  return (
    <div className="fade-in max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-h3 text-ink-950">Tracking check</h2>
          <p className="text-sm text-ink-500 mt-1">A quick check based on what visitors, tracking tools, privacy settings, and your website have recently reported.</p>
        </div>
        <button onClick={runAudit} disabled={running} className="px-4 py-2 rounded-full bg-btn-dark text-btn-dark-fg text-sm font-medium disabled:opacity-50 hover:bg-btn-dark-hover">{running ? 'Checking…' : 'Run and save check'}</button>
      </div>

      {message && <div className="mb-5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">{message}</div>}

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-xl border border-ink-200 p-5"><div className="text-xs uppercase text-ink-400">Tracking check score</div><div className="font-sans text-kpi mt-2 text-ink-950">{audit.score}<span className="text-base text-ink-400">/100</span></div></div>
        <div className="bg-surface rounded-xl border border-ink-200 p-5"><div className="text-xs uppercase text-ink-400">Checks looking good</div><div className="font-sans text-kpi mt-2 text-ink-950">{audit.checksPassed}<span className="text-base text-ink-400">/{audit.checksTotal}</span></div></div>
        <div className="bg-surface rounded-xl border border-ink-200 p-5"><div className="text-xs uppercase text-ink-400">Tracking tools seen</div><div className="font-sans text-kpi mt-2 text-ink-950">{Number(audit.evidence?.vendors || 0)}</div></div>
        <div className="bg-surface rounded-xl border border-ink-200 p-5"><div className="text-xs uppercase text-ink-400">Open items</div><div className="font-sans text-kpi mt-2 text-ink-950">{Number(audit.evidence?.open_alerts || 0)}</div></div>
      </div>

      <div className="bg-surface rounded-xl border border-ink-200 overflow-hidden">
        <div className="p-4 border-b border-ink-100"><h3 className="font-display font-semibold text-ink-950">What we checked and what to do</h3><p className="text-xs text-ink-500 mt-1">We use the most recent monitor activity and the last 24 hours of tracking activity.</p></div>
        <div className="divide-y divide-ink-100">
          {audit.findings.map((finding: any) => (
            <div key={finding.key} className="p-4 grid md:grid-cols-[160px_1fr_1fr] gap-3 items-start">
              <Pill tone={severityTone[finding.severity] || 'info'} className="w-fit">{finding.severity === 'pass' ? 'Looks good' : finding.severity === 'critical' ? 'Needs attention now' : finding.severity === 'warning' ? 'Worth checking' : 'Information'}</Pill>
              <div><div className="font-medium text-ink-950">{finding.title}</div><div className="text-sm text-ink-500 mt-1">{finding.evidence}</div></div>
              <div className="text-sm text-ink-700"><span className="font-medium">Next step:</span> {finding.fix}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 text-xs text-ink-400">This check uses real visitor activity; it does not crawl your website like a test robot. Use the details above with your privacy settings before making compliance decisions.</div>
    </div>
  );
}
