'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DuplicateEvidenceChart } from '../event-analytics';
import { formatDateTime } from '../ui';

export default function DuplicatesPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    async function load() { try { const response = await fetch(`/api/duplicates?siteId=${encodeURIComponent(siteId)}`, { cache: 'no-store' }); if (response.ok && !cancelled) setData(await response.json()); } catch {} }
    load(); const timer = setInterval(load, 8000); return () => { cancelled = true; clearInterval(timer); };
  }, [siteId]);
  if (!siteId) return <div className="text-ink-400 text-sm">Select a site.</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading duplicate diagnostics…</div>;
  const duplicates = data.duplicates || [];
  return (
    <div className="fade-in max-w-5xl">
      <div className="mb-6"><h2 className="text-lg font-semibold text-ink-950">Duplicate event diagnostics</h2><p className="text-sm text-ink-500 mt-1">A repeat is only actionable when it is tied to the same browser session, action identity, dataLayer payload, or network request signature. Page views, scroll, clicks, and SPA route changes may legitimately repeat.</p></div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6"><h3 className="font-semibold text-blue-950">How to investigate</h3><ol className="mt-3 grid md:grid-cols-4 gap-3 text-sm text-blue-900"><li><b>1. Session:</b> confirm the repeat belongs to one browser session.</li><li><b>2. Navigation:</b> distinguish an SPA route change from the same route.</li><li><b>3. DataLayer:</b> compare push indexes and payloads.</li><li><b>4. Network:</b> compare request signatures and transports.</li></ol></div>
      <DuplicateEvidenceChart duplicates={duplicates} />
      {duplicates.length === 0 ? <div className="bg-white rounded-xl border border-ink-200 p-12 text-center"><p className="font-medium text-ink-950">No actionable duplicates detected in the last 24 hours</p><p className="text-sm text-ink-500 mt-1">Expected repeatable events are not treated as defects by name alone.</p></div> : <div className="space-y-4">{duplicates.map((d: any, i: number) => { const steps = typeof d.fix_steps === 'string' ? safeParseArr(d.fix_steps) : d.fix_steps || []; const raw = typeof d.raw === 'string' ? safeParseObj(d.raw) : d.raw || {}; return <div key={d.id || i} className="bg-white rounded-xl border border-ink-200 p-5"><div className="flex items-start gap-3 mb-3"><span className={`pill ${d.category === 'gtm' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{d.sourceType === 'derived_network_evidence' ? 'Network evidence' : d.sourceType === 'derived_repeat_evidence' ? 'Repeat evidence' : d.category === 'gtm' ? 'GTM' : 'Warning'}</span><div className="flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="mono text-base font-semibold text-ink-950">{d.event_name || '(unnamed)'}</span><span className="text-xs text-ink-400 uppercase">{d.vendor}</span></div><p className="text-sm text-ink-700 mt-1">{d.message}</p><div className="text-xs text-ink-500 mt-2">Session: {raw.sessionId || 'not available'} · Pushes: {d.distinct_pushes || raw.distinctPushes || '—'} · Occurrences: {d.occurrence_count || raw.occurrenceCount || '—'} {d.sourceType === 'derived_gtm_fanout' ? '· same dataLayer occurrence produced multiple network calls' : d.sourceType === 'derived_network_evidence' ? '· derived from repeated normalized requests' : d.sourceType === 'derived_repeat_evidence' ? '· derived from repeated event observations' : ''}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500"><span><b>Triggered:</b> {formatDateTime(d.first_seen || raw.firstSeen || d.created_at)}</span><span><b>Last seen:</b> {formatDateTime(d.last_seen || raw.lastSeen || d.created_at)}</span></div></div></div>{(raw.occurrenceId || raw.eventIds?.length) && <div className="mb-3 grid gap-2 rounded-lg border border-violet-100 bg-violet-50 p-3 text-xs text-violet-900 md:grid-cols-3"><div><span className="font-semibold">DataLayer occurrence</span><div className="mt-1 mono">{raw.occurrenceId || 'derived from event evidence'}</div></div><div><span className="font-semibold">Observed calls</span><div className="mt-1 font-mono">{raw.networkCount || raw.occurrenceCount || raw.eventIds?.length || '—'}</div></div><div><span className="font-semibold">Event evidence IDs</span><div className="mt-1 font-mono">{Array.isArray(raw.eventIds) ? raw.eventIds.join(', ') : '—'}</div></div></div>}
      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 mb-3"><div className="text-xs font-semibold uppercase text-amber-900 mb-1">Evidence-based root cause</div><p className="text-sm text-amber-900 leading-relaxed">{d.root_cause}</p></div>{steps.length > 0 && <ol className="space-y-2 text-sm text-ink-800">{steps.map((step: string, j: number) => <li key={j} className="flex gap-3"><span className="w-5 h-5 rounded-full bg-ink-100 text-ink-800 flex-shrink-0 flex items-center justify-center text-xs font-semibold">{j + 1}</span><span>{step}</span></li>)}</ol>}</div>; })}</div>}
    </div>
  );
}
function safeParseArr(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function safeParseObj(value: string): any { try { return JSON.parse(value); } catch { return {}; } }
