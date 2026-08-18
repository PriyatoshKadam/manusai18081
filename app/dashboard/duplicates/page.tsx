'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function DuplicatesPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!siteId) return;
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
    async function load() {
      try {
        const res = await fetch(`/api/duplicates?siteId=${siteId}`);
        if (res.ok) setData(await res.json());
      } catch {}
    }
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site.</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading…</div>;

  const dupes = data.duplicates || [];

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">Duplicate event detection</h2>
        <p className="text-sm text-ink-500 mt-0.5">
          Events firing more than once per pageload, with root-cause hints. Deduplication key:
          {' '}<span className="mono bg-ink-100 px-1.5 py-0.5 rounded text-xs">event_name + client_id + page_url</span> in a 3-second window.
        </p>
      </div>

      {dupes.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-200 p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-lg bg-green-50 flex items-center justify-center text-green-600 mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <p className="font-medium text-ink-950">No duplicates detected in the last 24 hours</p>
          <p className="text-sm text-ink-500 mt-1">Your tags are firing cleanly.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dupes.map((d: any, i: number) => {
            const steps: string[] = typeof d.fix_steps === 'string' ? safeParseArr(d.fix_steps) : (d.fix_steps || []);
            const raw = typeof d.raw === 'string' ? safeParseObj(d.raw) : (d.raw || {});
            return (
              <div key={i} className="bg-white rounded-xl border border-ink-200 p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="pill bg-amber-100 text-amber-800">Warning</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-base font-semibold text-ink-950">{d.event_name}</span>
                      <span className="text-xs text-ink-400 uppercase">{d.vendor}</span>
                    </div>
                    <p className="text-sm text-ink-700 mt-1">
                      Fired <b>{raw.totalFires || d.cnt}× per pageload</b>
                      {raw.distinctPushes > 1 && <> from <b>{raw.distinctPushes} separate dataLayer pushes</b></>}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 mb-3">
                  <div className="text-xs font-semibold uppercase text-amber-900 mb-1">Root cause</div>
                  <p className="text-sm text-amber-900 leading-relaxed">{d.root_cause}</p>
                </div>

                {steps.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase text-ink-400 mb-2">How to fix</div>
                    <ol className="space-y-2 text-sm text-ink-800">
                      {steps.map((s, j) => (
                        <li key={j} className="flex gap-3">
                          <span className="w-5 h-5 rounded-full bg-ink-100 text-ink-800 flex-shrink-0 flex items-center justify-center text-xs font-semibold">{j + 1}</span>
                          <span className="leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function safeParseArr(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
function safeParseObj(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}
