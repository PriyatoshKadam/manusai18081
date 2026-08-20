'use client';

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString();
}

function shortSession(value: unknown) {
  const text = String(value || 'unknown');
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

function eventLabel(row: any) {
  return row.event_name || row.eventName || '(unnamed)';
}

export function EventSessionChart({ events }: { events: any[] }) {
  const rows = [...events].sort((a, b) => Number(b.cnt || b.total || 0) - Number(a.cnt || a.total || 0)).slice(0, 8);
  const max = Math.max(...rows.map((row) => Number(row.cnt || row.total || 0)), 1);
  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
        <div>
          <h3 className="font-semibold text-ink-950">Events → sessions</h3>
          <p className="mt-1 text-xs text-ink-500">High volume with low session spread is a duplicate-risk signal.</p>
        </div>
        <div className="flex gap-3 text-[10px] uppercase tracking-wider text-ink-400">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" />Events</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-lime-500" />Sessions</span>
        </div>
      </div>
      {rows.length === 0 ? <div className="p-6 text-sm text-ink-400">No event volume has arrived yet.</div> : (
        <div className="space-y-4 p-5">
          {rows.map((row, index) => {
            const count = Number(row.cnt || row.total || 0);
            const sessions = Number(row.sessions || 0);
            const ratio = sessions ? count / sessions : 0;
            return (
              <div key={`${eventLabel(row)}-${index}`} className="grid grid-cols-[minmax(110px,160px)_1fr_72px] items-center gap-3 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink-800 mono">{eventLabel(row)}</div>
                  <div className="mt-1 text-[10px] text-ink-400">{ratio ? `${ratio.toFixed(1)}× per session` : 'No session id'}</div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-blue-50"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>
                  <div className="h-2 overflow-hidden rounded-full bg-lime-50"><div className="h-full rounded-full bg-lime-500 transition-all" style={{ width: `${Math.max(4, (sessions / max) * 100)}%` }} /></div>
                </div>
                <div className="text-right font-mono text-ink-500"><div>{formatNumber(count)}</div><div className="text-lime-700">{formatNumber(sessions)}</div></div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SourceLaneChart({ sources }: { sources: any[] }) {
  const rows = [...sources].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 8);
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-4">
        <h3 className="font-semibold text-ink-950">How events entered the system</h3>
        <p className="mt-1 text-xs text-ink-500">DataLayer, network, GTM, and direct-code evidence for the same event names.</p>
      </div>
      {rows.length === 0 ? <div className="p-6 text-sm text-ink-400">No source evidence yet.</div> : <div className="space-y-3 p-5">{rows.map((row, index) => <div key={`${row.event_name}-${row.source}-${index}`}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate mono text-ink-700">{row.event_name || '(unnamed)'} <span className="text-ink-400">· {row.source || row.observation_kind || 'unknown'}</span></span><span className="font-mono text-ink-500">{formatNumber(row.count)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className={`h-full rounded-full ${row.observation_kind === 'datalayer' ? 'bg-violet-500' : row.observation_kind === 'network' ? 'bg-cyan-500' : 'bg-amber-500'}`} style={{ width: `${Math.max(5, (Number(row.count || 0) / max) * 100)}%` }} /></div></div>)}</div>}
    </section>
  );
}

export function DataLayerProvenance({ rows }: { rows: any[] }) {
  const latest = rows.slice(0, 14);
  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
        <div>
          <h3 className="font-semibold text-ink-950">Event provenance</h3>
          <p className="mt-1 text-xs text-ink-500">Every row answers: which event, which push, which session, and which observation path?</p>
        </div>
        <span className="pill bg-violet-50 text-violet-700">{formatNumber(rows.length)} recent rows</span>
      </div>
      {latest.length === 0 ? <div className="p-6 text-sm text-ink-400">No dataLayer provenance has been recorded yet.</div> : <div className="divide-y divide-ink-100">{latest.map((row, index) => <div key={`${row.event_name}-${row.received_at}-${index}`} className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(140px,1.2fr)_100px_130px_minmax(150px,1fr)] md:items-center"><div className="min-w-0"><div className="truncate font-medium text-ink-800 mono">{row.event_name || '(unnamed)'}</div><div className="mt-1 truncate text-[10px] text-ink-400">{row.page_url || 'page unavailable'}</div></div><div><div className="text-[10px] uppercase tracking-wider text-ink-400">Push</div><div className="mt-1 font-mono text-sm text-violet-700">{row.dl_push_index === null || row.dl_push_index === undefined ? '—' : `#${row.dl_push_index}`}</div></div><div><div className="text-[10px] uppercase tracking-wider text-ink-400">Session</div><div className="mt-1 font-mono text-xs text-ink-600">{shortSession(row.session_id)}</div></div><div className="flex flex-wrap items-center gap-2"><span className={`pill ${row.observation_kind === 'datalayer' ? 'bg-violet-50 text-violet-700' : row.observation_kind === 'network' ? 'bg-cyan-50 text-cyan-700' : 'bg-amber-50 text-amber-700'}`}>{row.observation_kind || 'unknown'}</span><span className="pill bg-ink-100 text-ink-600">{row.source || 'unknown source'}</span>{row.occurrence_id ? <span className="text-[10px] text-ink-400 mono">{String(row.occurrence_id).slice(0, 18)}</span> : null}</div></div>)}</div>}
    </section>
  );
}

export function DuplicateEvidenceChart({ duplicates }: { duplicates: any[] }) {
  const grouped = Object.values(duplicates.reduce((acc: Record<string, any>, row: any) => {
    const name = row.event_name || '(unnamed)';
    const bucket = acc[name] || { name, count: 0, fanout: 0, repeat: 0 };
    bucket.count += Number(row.occurrence_count || row.raw?.occurrenceCount || 1);
    if (row.sourceType === 'derived_gtm_fanout' || row.code === 'gtm_multiple_tags_or_triggers') bucket.fanout += 1;
    else bucket.repeat += 1;
    acc[name] = bucket;
    return acc;
  }, {})).sort((a: any, b: any) => b.count - a.count).slice(0, 8) as any[];
  const max = Math.max(...grouped.map((row) => row.count), 1);
  return (
    <section className="mb-6 rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
        <div>
          <h3 className="font-semibold text-ink-950">Duplicate pressure by event</h3>
          <p className="mt-1 text-xs text-ink-500">Purple marks same-push GTM fan-out; amber marks repeated event or network evidence.</p>
        </div>
        <span className="pill bg-rose-50 text-rose-700">{formatNumber(duplicates.length)} evidence records</span>
      </div>
      {grouped.length === 0 ? <div className="p-6 text-sm text-ink-400">No duplicate evidence to chart.</div> : <div className="space-y-4 p-5">{grouped.map((row) => <div key={row.name} className="grid grid-cols-[130px_1fr_60px] items-center gap-3 text-xs"><div className="truncate mono font-medium text-ink-800">{row.name}</div><div className="space-y-1"><div className="flex h-2 overflow-hidden rounded-full bg-ink-100"><div className="bg-violet-500" style={{ width: `${Math.max(4, (row.fanout / row.count) * (row.count / max) * 100)}%` }} /><div className="bg-amber-400" style={{ width: `${Math.max(4, (row.repeat / row.count) * (row.count / max) * 100)}%` }} /></div><div className="flex gap-3 text-[10px] text-ink-400"><span>{row.fanout} fan-out</span><span>{row.repeat} repeat</span></div></div><div className="text-right font-mono font-medium text-ink-600">{row.count}</div></div>)}</div>}
    </section>
  );
}
