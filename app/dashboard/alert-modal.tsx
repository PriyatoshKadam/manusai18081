'use client';

import { formatDateTime } from './ui';

type AlertDetail = {
  severity: string;
  message: string;
  root_cause?: string;
  fix_steps?: string[];
  vendor?: string;
  event_name?: string;
  page_url?: string;
  code?: string;
  created_at?: string;
  first_seen?: string;
  last_seen?: string;
  occurrence_count?: number;
  distinct_pushes?: number;
  distinct_sessions?: number;
  distinct_pages?: number;
  raw?: Record<string, unknown>;
};

export default function AlertModal({ alert, onClose }: { alert: AlertDetail | null; onClose: () => void }) {
  if (!alert) return null;
  const color = alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'blue';
  const dotBg = color === 'red' ? 'bg-[#ff718d]' : color === 'amber' ? 'bg-[#f6b94c]' : 'bg-[#2f6bff]';
  const chipBg = color === 'red' ? 'bg-[#ff718d]/10 text-[#ff9aae] border border-[#ff718d]/20' : color === 'amber' ? 'bg-[#f6b94c]/10 text-[#ffd27a] border border-[#f6b94c]/20' : 'bg-[#2f6bff]/10 text-[#86a8ff] border border-[#2f6bff]/20';
  const causeBg = color === 'red' ? 'bg-[#ff718d]/[.08] border-[#ff718d]/20' : color === 'amber' ? 'bg-[#f6b94c]/[.08] border-[#f6b94c]/20' : 'bg-[#2f6bff]/[.08] border-[#2f6bff]/20';

  const steps: string[] = Array.isArray(alert.fix_steps) ? alert.fix_steps : (() => {
    try { return typeof alert.fix_steps === 'string' ? JSON.parse(alert.fix_steps) : []; } catch { return []; }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111722] text-slate-100 rounded-2xl w-full max-w-2xl fade-in overflow-hidden border border-white/[.08]" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-white/[.08]">
          <div className="flex items-start gap-3 mb-3">
            <span className={`pill ${chipBg}`}><span className={`dot ${dotBg}`}></span>{alert.severity[0].toUpperCase() + alert.severity.slice(1)}</span>
            <button onClick={onClose} className="ml-auto p-1 text-slate-500 hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <h2 className="text-xl font-bold text-white">{alert.message}</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
            {alert.vendor && <span>Vendor: <span className="mono text-slate-200">{alert.vendor}</span></span>}
            {alert.event_name && <span>Event: <span className="mono text-slate-200">{alert.event_name}</span></span>}
          </div>
          <div className="mt-4 grid gap-2 rounded-xl border border-white/[.08] bg-white/[.035] p-3 text-xs sm:grid-cols-3">
            <div><span className="block uppercase tracking-[.12em] text-slate-500">Triggered</span><strong className="mt-1 block text-slate-100">{formatDateTime(alert.created_at || alert.first_seen || alert.last_seen)}</strong></div>
            <div><span className="block uppercase tracking-[.12em] text-slate-500">Last seen</span><strong className="mt-1 block text-slate-100">{formatDateTime(alert.last_seen || alert.created_at || alert.first_seen)}</strong></div>
            <div><span className="block uppercase tracking-[.12em] text-slate-500">Evidence</span><strong className="mt-1 block text-slate-100">{alert.occurrence_count || 1}×{alert.distinct_pushes ? ` · ${alert.distinct_pushes} push` : ''}</strong></div>
          </div>
          {(alert.distinct_sessions || alert.distinct_pages || (alert.raw && typeof alert.raw === 'object')) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400"><span>Impact: <strong className="text-slate-100">{alert.distinct_sessions || 0} sessions</strong></span><span><strong className="text-slate-100">{alert.distinct_pages || 0} pages</strong></span>{alert.raw && typeof alert.raw === 'object' && 'windowSeconds' in alert.raw && <span>Duplicate window: <strong className="text-slate-100">{String((alert.raw as any).windowSeconds || '—')}s</strong></span>}</div>}
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {alert.root_cause && (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Likely root cause</div>
              <div className={`p-4 rounded-lg border ${causeBg}`}>
                <p className="text-sm text-slate-200 leading-relaxed">{alert.root_cause}</p>
              </div>
            </div>
          )}
          {steps.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500 mb-2">How to fix</div>
              <ol className="space-y-2 text-sm text-slate-200">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-white/[.06] text-slate-200 flex-shrink-0 flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {alert.page_url && (
            <div className="pt-3 border-t border-white/[.08]">
              <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Detected on</div>
              <p className="text-xs mono text-slate-400 bg-white/[.04] p-3 rounded-lg break-all">{alert.page_url}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-white/[.03] border-t border-white/[.08] flex items-center justify-end gap-2">
          <button onClick={onClose} className="border border-white/[.12] px-4 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/[.06]">Close</button>
        </div>
      </div>
    </div>
  );
}
