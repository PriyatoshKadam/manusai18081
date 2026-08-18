'use client';

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
};

export default function AlertModal({ alert, onClose }: { alert: AlertDetail | null; onClose: () => void }) {
  if (!alert) return null;
  const color = alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'blue';
  const dotBg = color === 'red' ? 'bg-red-600' : color === 'amber' ? 'bg-amber-500' : 'bg-blue-600';
  const chipBg = color === 'red' ? 'bg-red-200 text-red-900' : color === 'amber' ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900';
  const causeBg = color === 'red' ? 'bg-red-50 border-red-100' : color === 'amber' ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100';

  const steps: string[] = Array.isArray(alert.fix_steps) ? alert.fix_steps : (() => {
    try { return typeof alert.fix_steps === 'string' ? JSON.parse(alert.fix_steps) : []; } catch { return []; }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl fade-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-ink-100">
          <div className="flex items-start gap-3 mb-3">
            <span className={`pill ${chipBg}`}><span className={`dot ${dotBg}`}></span>{alert.severity[0].toUpperCase() + alert.severity.slice(1)}</span>
            <button onClick={onClose} className="ml-auto p-1 text-ink-400 hover:text-ink-800">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <h2 className="text-xl font-bold text-ink-950">{alert.message}</h2>
          <div className="mt-2 flex gap-4 text-xs text-ink-500">
            {alert.vendor && <span>Vendor: <span className="mono">{alert.vendor}</span></span>}
            {alert.event_name && <span>Event: <span className="mono">{alert.event_name}</span></span>}
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {alert.root_cause && (
            <div>
              <div className="text-xs font-semibold uppercase text-ink-400 mb-2">Likely root cause</div>
              <div className={`p-4 rounded-lg border ${causeBg}`}>
                <p className="text-sm text-ink-900 leading-relaxed">{alert.root_cause}</p>
              </div>
            </div>
          )}
          {steps.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-ink-400 mb-2">How to fix</div>
              <ol className="space-y-2 text-sm text-ink-800">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-ink-100 text-ink-800 flex-shrink-0 flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                    <span className="leading-relaxed" dangerouslySetInnerHTML={{ __html: s }}></span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {alert.page_url && (
            <div className="pt-3 border-t border-ink-100">
              <div className="text-xs font-semibold uppercase text-ink-400 mb-2">Detected on</div>
              <p className="text-xs mono text-ink-500 bg-ink-50 p-3 rounded-lg break-all">{alert.page_url}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-ink-50 border-t border-ink-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="border border-ink-200 px-4 py-2 rounded-lg text-sm hover:bg-white">Close</button>
        </div>
      </div>
    </div>
  );
}
