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
    <section className="rounded-2xl border border-white/[.08] bg-[#111722] overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/[.06] px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-100">Actions and visits</h3>
          <p className="mt-1 text-xs text-slate-400">If an action happens many times during only a few visits, it may need checking.</p>
        </div>
        <div className="flex gap-3 text-[10px] uppercase tracking-wider text-slate-500">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" />Actions</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-lime-500" />Visits</span>
        </div>
      </div>
      {rows.length === 0 ? <div className="p-6 text-sm text-slate-500">No tracking activity has arrived yet.</div> : (
        <div className="space-y-4 p-5">
          {rows.map((row, index) => {
            const count = Number(row.cnt || row.total || 0);
            const sessions = Number(row.sessions || 0);
            const ratio = sessions ? count / sessions : 0;
            return (
              <div key={`${eventLabel(row)}-${index}`} className="grid grid-cols-[minmax(110px,160px)_1fr_72px] items-center gap-3 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-200 mono">{eventLabel(row)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{ratio ? `${ratio.toFixed(1)}× during each visit` : 'Visit not identified'}</div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-blue-500/10"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>
                  <div className="h-2 overflow-hidden rounded-full bg-lime-500/10"><div className="h-full rounded-full bg-lime-500 transition-all" style={{ width: `${Math.max(4, (sessions / max) * 100)}%` }} /></div>
                </div>
                <div className="text-right font-mono text-slate-400"><div>{formatNumber(count)}</div><div className="text-[#b9f57e]">{formatNumber(sessions)}</div></div>
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
    <section className="rounded-2xl border border-white/[.08] bg-[#111722] overflow-hidden">
      <div className="border-b border-white/[.06] px-5 py-4">
        <h3 className="font-semibold text-slate-100">How tracking was observed</h3>
        <p className="mt-1 text-xs text-slate-400">GAfix compares website announcements, sent requests, Tag Manager activity, and direct tracking for the same action.</p>
      </div>
      {rows.length === 0 ? <div className="p-6 text-sm text-slate-500">No tracking source details yet.</div> : <div className="space-y-3 p-5">{rows.map((row, index) => <div key={`${row.event_name}-${row.source}-${index}`}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate mono text-slate-300">{row.event_name || '(unnamed)'} <span className="text-slate-500">· {row.source || row.observation_kind || 'unknown'}</span></span><span className="font-mono text-slate-400">{formatNumber(row.count)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className={`h-full rounded-full ${row.observation_kind === 'datalayer' ? 'bg-violet-500' : row.observation_kind === 'network' ? 'bg-cyan-500' : 'bg-amber-500'}`} style={{ width: `${Math.max(5, (Number(row.count || 0) / max) * 100)}%` }} /></div></div>)}</div>}
    </section>
  );
}

export function DataLayerProvenance({ rows }: { rows: any[] }) {
  const latest = rows.slice(0, 14);
  return (
    <section className="rounded-2xl border border-white/[.08] bg-[#111722] overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/[.06] px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-100">Where each action came from</h3>
          <p className="mt-1 text-xs text-slate-400">Each row shows the action, visit, website announcement, and how GAfix observed it.</p>
        </div>
        <span className="pill bg-violet-500/10 text-[#c4acff]">{formatNumber(rows.length)} recent records</span>
      </div>
      {latest.length === 0 ? <div className="p-6 text-sm text-slate-500">No website-announcement details have been recorded yet.</div> : <div className="divide-y divide-white/[.06]">{latest.map((row, index) => <div key={`${row.event_name}-${row.received_at}-${index}`} className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(140px,1.2fr)_100px_130px_minmax(150px,1fr)] md:items-center"><div className="min-w-0"><div className="truncate font-medium text-slate-200 mono">{row.event_name || '(unnamed)'}</div><div className="mt-1 truncate text-[10px] text-slate-500">{row.page_url || 'page unavailable'}</div></div><div><div className="text-[10px] uppercase tracking-wider text-slate-500">Website announcement</div><div className="mt-1 font-mono text-sm text-[#c4acff]">{row.dl_push_index === null || row.dl_push_index === undefined ? '—' : `#${row.dl_push_index}`}</div></div><div><div className="text-[10px] uppercase tracking-wider text-slate-500">Visit</div><div className="mt-1 font-mono text-xs text-slate-400">{shortSession(row.session_id)}</div></div><div className="flex flex-wrap items-center gap-2"><span className={`pill ${row.observation_kind === 'datalayer' ? 'bg-violet-500/10 text-[#c4acff]' : row.observation_kind === 'network' ? 'bg-cyan-500/10 text-[#7de2ff]' : 'bg-amber-500/10 text-[#ffd27a]'}`}>{row.observation_kind || 'unknown'}</span><span className="pill bg-white/[.06] text-slate-400">{row.source || 'source not identified'}</span>{row.occurrence_id ? <span className="text-[10px] text-slate-500 mono">{String(row.occurrence_id).slice(0, 18)}</span> : null}</div></div>)}</div>}
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
    <section className="mb-6 rounded-2xl border border-white/[.08] bg-[#111722] overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/[.06] px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-100">Possible repeats by action</h3>
          <p className="mt-1 text-xs text-slate-400">Purple means one website announcement led to multiple requests. Amber means the same action or request appeared repeatedly.</p>
        </div>
        <span className="pill bg-rose-500/10 text-[#ff9aae]">{formatNumber(duplicates.length)} evidence records</span>
      </div>
      {grouped.length === 0 ? <div className="p-6 text-sm text-slate-500">No possible repeat tracking to chart.</div> : <div className="space-y-4 p-5">{grouped.map((row) => <div key={row.name} className="grid grid-cols-[130px_1fr_60px] items-center gap-3 text-xs"><div className="truncate mono font-medium text-slate-200">{row.name}</div><div className="space-y-1"><div className="flex h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="bg-violet-500" style={{ width: `${Math.max(4, (row.fanout / row.count) * (row.count / max) * 100)}%` }} /><div className="bg-amber-400" style={{ width: `${Math.max(4, (row.repeat / row.count) * (row.count / max) * 100)}%` }} /></div><div className="flex gap-3 text-[10px] text-slate-500"><span>{row.fanout} one announcement, many requests</span><span>{row.repeat} repeated action</span></div></div><div className="text-right font-mono font-medium text-slate-400">{row.count}</div></div>)}</div>}
    </section>
  );
}
