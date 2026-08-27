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
  if (!data) return <div className="text-ink-400 text-sm">Loading possible repeat tracking…</div>;
  const duplicates = data.duplicates || [];
  const retries = data.retries || [];
  return (
    <div className="fade-in max-w-5xl">
      <div className="mb-6"><h2 className="text-lg font-semibold text-ink-950">Possible repeat tracking</h2><p className="text-sm text-ink-500 mt-1">GAfix only flags a repeat when several pieces of evidence point to the same visitor action. Some actions, such as page views, scrolling, and clicks, are expected to happen more than once.</p></div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6"><h3 className="font-semibold text-blue-950">How to check a possible repeat</h3><ol className="mt-3 grid md:grid-cols-4 gap-3 text-sm text-blue-900"><li><b>1. Same visit:</b> check that both actions happened during one visitor session.</li><li><b>2. Page change:</b> check whether the visitor simply moved to another page.</li><li><b>3. Website action:</b> check whether the website announced the action twice.</li><li><b>4. Sent requests:</b> check whether tracking was sent twice.</li></ol></div>
      <DuplicateEvidenceChart duplicates={duplicates} />
      {duplicates.length === 0 ? <div className="bg-white rounded-xl border border-ink-200 p-12 text-center"><p className="font-medium text-ink-950">No likely repeat tracking found in the last 24 hours</p><p className="text-sm text-ink-500 mt-1">Normal repeats such as scrolling and clicks are not treated as problems by themselves.</p></div> : <div className="space-y-4">{duplicates.map((d: any, i: number) => { const steps = typeof d.fix_steps === 'string' ? safeParseArr(d.fix_steps) : d.fix_steps || []; const raw = typeof d.raw === 'string' ? safeParseObj(d.raw) : d.raw || {}; return <div key={d.id || i} className="bg-white rounded-xl border border-ink-200 p-5"><div className="flex items-start gap-3 mb-3"><span className={`pill ${d.category === 'gtm' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{d.sourceType === 'derived_network_evidence' ? 'Two requests seen' : d.sourceType === 'derived_repeat_evidence' ? 'Repeated action' : d.category === 'gtm' ? 'GTM' : 'Warning'}</span><div className="flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="mono text-base font-semibold text-ink-950">{d.event_name || '(unnamed)'}</span><span className="text-xs text-ink-400 uppercase">{d.vendor}</span></div><p className="text-sm text-ink-700 mt-1">{d.message}</p><div className="text-xs text-ink-500 mt-2">Visitor session: {raw.sessionId || 'not available'} · Website announcements: {d.distinct_pushes || raw.distinctPushes || '—'} · Times seen: {d.occurrence_count || raw.occurrenceCount || '—'} {d.sourceType === 'derived_gtm_fanout' ? '· one website announcement led to several tracking requests' : d.sourceType === 'derived_network_evidence' ? '· based on repeated tracking requests' : d.sourceType === 'derived_repeat_evidence' ? '· based on repeated action observations' : ''}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500"><span><b>First seen:</b> {formatDateTime(d.first_seen || raw.firstSeen || d.created_at)}</span><span><b>Last seen:</b> {formatDateTime(d.last_seen || raw.lastSeen || d.created_at)}</span></div></div></div>{(raw.occurrenceId || raw.eventIds?.length) && <div className="mb-3 grid gap-2 rounded-lg border border-violet-100 bg-violet-50 p-3 text-xs text-violet-900 md:grid-cols-3"><div><span className="font-semibold">Website announcement</span><div className="mt-1 mono">{raw.occurrenceId || 'derived from event evidence'}</div></div><div><span className="font-semibold">Tracking requests</span><div className="mt-1 font-mono">{raw.networkCount || raw.occurrenceCount || raw.eventIds?.length || '—'}</div></div><div><span className="font-semibold">Evidence references</span><div className="mt-1 font-mono">{Array.isArray(raw.eventIds) ? raw.eventIds.join(', ') : '—'}</div></div></div>}
      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 mb-3"><div className="text-xs font-semibold uppercase text-amber-900 mb-1">Why GAfix flagged this</div><p className="text-sm text-amber-900 leading-relaxed">{d.root_cause}</p></div>{steps.length > 0 && <ol className="space-y-2 text-sm text-ink-800">{steps.map((step: string, j: number) => <li key={j} className="flex gap-3"><span className="w-5 h-5 rounded-full bg-ink-100 text-ink-800 flex-shrink-0 flex items-center justify-center text-xs font-semibold">{j + 1}</span><span>{step}</span></li>)}</ol>}</div>; })}</div>}
      {retries.length > 0 && <section className="bg-blue-50 border border-blue-200 rounded-xl p-5 mt-6"><h3 className="font-semibold text-blue-950">A retry, not duplicate tracking</h3><p className="text-sm text-blue-900 mt-1">The first attempt had a problem and a second attempt worked within five seconds. This is shown for investigation but is not counted as duplicate tracking.</p><div className="mt-4 space-y-2">{retries.slice(0, 20).map((retry: any) => <div key={retry.id} className="rounded-lg border border-blue-100 bg-white/70 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="mono font-semibold text-blue-950">{retry.event_name || '(unnamed)'}</span><span className="text-xs text-blue-800">{Math.round(Number(retry.raw?.gapMs || 0))} ms later</span></div><div className="mt-1 text-xs text-blue-900">Visitor session: {retry.raw?.sessionId || 'not available'} · First attempt: {retry.raw?.failedEventId || '—'} · Working attempt: {retry.raw?.successEventId || '—'}</div></div>)}</div></section>}
    </div>
  );
}
function safeParseArr(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function safeParseObj(value: string): any { try { return JSON.parse(value); } catch { return {}; } }
