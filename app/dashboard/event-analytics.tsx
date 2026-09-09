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
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
        <div>
          <h3 className="font-display font-semibold text-[var(--text)]">Actions and visits</h3>
          <p className="mt-1 text-xs text-[var(--text-3)]">If an action happens many times during only a few visits, it may need checking.</p>
        </div>
        <div className="flex gap-3 text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />Actions</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: 'var(--ok-dot)' }} />Visits</span>
        </div>
      </div>
      {rows.length === 0 ? <div className="p-6 text-sm text-[var(--text-3)]">No tracking activity has arrived yet.</div> : (
        <div className="space-y-4 p-5">
          {rows.map((row, index) => {
            const count = Number(row.cnt || row.total || 0);
            const sessions = Number(row.sessions || 0);
            const ratio = sessions ? count / sessions : 0;
            return (
              <div key={`${eventLabel(row)}-${index}`} className="grid grid-cols-[minmax(110px,160px)_1fr_72px] items-center gap-3 text-xs">
                <div className="min-w-0">
                  <div className="mono truncate font-medium text-[var(--text)]">{eventLabel(row)}</div>
                  <div className="mt-1 text-[10px] text-[var(--text-3)]">{ratio ? `${ratio.toFixed(1)}× during each visit` : 'Visit not identified'}</div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--tint)]"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, (count / max) * 100)}%`, background: 'var(--accent)' }} /></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--ok-bg)]"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, (sessions / max) * 100)}%`, background: 'var(--ok-dot)' }} /></div>
                </div>
                <div className="text-right font-mono text-[var(--text-3)]"><div>{formatNumber(count)}</div><div className="text-[var(--ok-fg)]">{formatNumber(sessions)}</div></div>
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
  const laneColor = (kind: string) => kind === 'datalayer' ? 'var(--accent-2)' : kind === 'network' ? '#0891B2' : 'var(--warn-dot)';
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border-soft)] px-5 py-4">
        <h3 className="font-display font-semibold text-[var(--text)]">How tracking was observed</h3>
        <p className="mt-1 text-xs text-[var(--text-3)]">GAfix compares website announcements, sent requests, Tag Manager activity, and direct tracking for the same action.</p>
      </div>
      {rows.length === 0 ? <div className="p-6 text-sm text-[var(--text-3)]">No tracking source details yet.</div> : <div className="space-y-3 p-5">{rows.map((row, index) => <div key={`${row.event_name}-${row.source}-${index}`}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="mono truncate text-[var(--text-2)]">{row.event_name || '(unnamed)'} <span className="text-[var(--text-3)]">· {row.source || row.observation_kind || 'unknown'}</span></span><span className="font-mono text-[var(--text-3)]">{formatNumber(row.count)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]"><div className="h-full rounded-full" style={{ width: `${Math.max(5, (Number(row.count || 0) / max) * 100)}%`, background: laneColor(row.observation_kind) }} /></div></div>)}</div>}
    </section>
  );
}

export function DataLayerProvenance({ rows }: { rows: any[] }) {
  const latest = rows.slice(0, 14);
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
        <div>
          <h3 className="font-display font-semibold text-[var(--text)]">Where each action came from</h3>
          <p className="mt-1 text-xs text-[var(--text-3)]">Each row shows the action, visit, website announcement, and how GAfix observed it.</p>
        </div>
        <span className="pill" style={{ background: 'var(--tint)', color: 'var(--accent-2)' }}>{formatNumber(rows.length)} recent records</span>
      </div>
      {latest.length === 0 ? <div className="p-6 text-sm text-[var(--text-3)]">No website-announcement details have been recorded yet.</div> : <div className="divide-y divide-[var(--border-soft)]">{latest.map((row, index) => <div key={`${row.event_name}-${row.received_at}-${index}`} className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(140px,1.2fr)_100px_130px_minmax(150px,1fr)] md:items-center"><div className="min-w-0"><div className="mono truncate font-medium text-[var(--text)]">{row.event_name || '(unnamed)'}</div><div className="mt-1 truncate text-[10px] text-[var(--text-3)]">{row.page_url || 'page unavailable'}</div></div><div><div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Website announcement</div><div className="mt-1 font-mono text-sm text-[var(--accent-2)]">{row.dl_push_index === null || row.dl_push_index === undefined ? '—' : `#${row.dl_push_index}`}</div></div><div><div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Visit</div><div className="mt-1 font-mono text-xs text-[var(--text-3)]">{shortSession(row.session_id)}</div></div><div className="flex flex-wrap items-center gap-2"><span className="pill" style={{ background: row.observation_kind === 'datalayer' ? 'var(--tint)' : row.observation_kind === 'network' ? '#ECFEFF' : 'var(--warn-bg)', color: row.observation_kind === 'datalayer' ? 'var(--accent-2)' : row.observation_kind === 'network' ? '#0E7490' : 'var(--warn-fg)' }}>{row.observation_kind || 'unknown'}</span><span className="pill" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>{row.source || 'source not identified'}</span>{row.occurrence_id ? <span className="mono text-[10px] text-[var(--text-3)]">{String(row.occurrence_id).slice(0, 18)}</span> : null}</div></div>)}</div>}
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
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
        <div>
          <h3 className="font-display font-semibold text-[var(--text)]">Possible repeats by action</h3>
          <p className="mt-1 text-xs text-[var(--text-3)]">Purple means one website announcement led to multiple requests. Amber means the same action or request appeared repeatedly.</p>
        </div>
        <span className="pill" style={{ background: 'var(--crit-bg)', color: 'var(--crit-fg)' }}>{formatNumber(duplicates.length)} evidence records</span>
      </div>
      {grouped.length === 0 ? <div className="p-6 text-sm text-[var(--text-3)]">No possible repeat tracking to chart.</div> : <div className="space-y-4 p-5">{grouped.map((row) => <div key={row.name} className="grid grid-cols-[130px_1fr_60px] items-center gap-3 text-xs"><div className="mono truncate font-medium text-[var(--text)]">{row.name}</div><div className="space-y-1"><div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-3)]"><div style={{ width: `${Math.max(4, (row.fanout / row.count) * (row.count / max) * 100)}%`, background: 'var(--accent-2)' }} /><div style={{ width: `${Math.max(4, (row.repeat / row.count) * (row.count / max) * 100)}%`, background: 'var(--warn-dot)' }} /></div><div className="flex gap-3 text-[10px] text-[var(--text-3)]"><span>{row.fanout} one announcement, many requests</span><span>{row.repeat} repeated action</span></div></div><div className="text-right font-mono font-medium text-[var(--text-3)]">{row.count}</div></div>)}</div>}
    </section>
  );
}
