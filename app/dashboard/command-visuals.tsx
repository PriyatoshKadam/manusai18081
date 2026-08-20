'use client';

function number(value: unknown) {
  return Number(value || 0).toLocaleString();
}

function pct(value: number, max: number) {
  return `${Math.max(4, Math.min(100, max ? (value / max) * 100 : 4))}%`;
}

export function DashboardSection({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="dashboard-section-head"><div><div className="dashboard-eyebrow">{eyebrow || 'Live evidence'}</div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action ? <div>{action}</div> : null}</div>;
}

export function CommandKpi({ label, value, note, tone = 'blue', trend }: { label: string; value: React.ReactNode; note: string; tone?: 'blue' | 'lime' | 'amber' | 'rose' | 'violet'; trend?: number[] }) {
  const colors: Record<string, string> = { blue: 'kpi-blue', lime: 'kpi-lime', amber: 'kpi-amber', rose: 'kpi-rose', violet: 'kpi-violet' };
  return <div className={`command-kpi ${colors[tone]}`}><div className="command-kpi-top"><span>{label}</span><span className="command-kpi-dot" /></div><div className="command-kpi-value">{value}</div><div className="command-kpi-note">{note}</div>{trend?.length ? <MiniTrend values={trend} tone={tone} /> : <div className="command-kpi-line" />}</div>;
}

export function ScoreRing({ value, label, detail, tone = 'lime' }: { value: number | null; label: string; detail: string; tone?: 'lime' | 'blue' | 'amber' | 'rose' }) {
  const safe = value === null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, Number(value)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const colors = { lime: '#a8f06a', blue: '#6d8cff', amber: '#f6b94c', rose: '#ff718d' };
  return <div className="score-ring-card"><div className="score-ring"><svg viewBox="0 0 108 108" aria-label={`${label}: ${value === null ? 'collecting' : `${safe}%`}`}><circle cx="54" cy="54" r={radius} className="score-ring-track" /><circle cx="54" cy="54" r={radius} className="score-ring-value" style={{ stroke: colors[tone], strokeDasharray: circumference, strokeDashoffset: circumference - (safe / 100) * circumference }} /></svg><div className="score-ring-number">{value === null ? '—' : `${safe}`}<small>{value === null ? '' : '%'}</small></div></div><div className="score-ring-label">{label}</div><div className="score-ring-detail">{detail}</div></div>;
}

export function MiniTrend({ values, tone = 'blue', height = 34 }: { values: number[]; tone?: string; height?: number }) {
  const width = 160;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * width},${height - ((value - min) / Math.max(max - min, 1)) * (height - 4)}`).join(' ');
  const stroke: Record<string, string> = { blue: '#6d8cff', lime: '#a8f06a', amber: '#f6b94c', rose: '#ff718d', violet: '#b18cff' };
  return <svg className="mini-trend" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={stroke[tone] || stroke.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function EventHeatmap({ events }: { events: any[] }) {
  const rows = [...events].sort((a, b) => Number(b.cnt || 0) - Number(a.cnt || 0)).slice(0, 8);
  const max = Math.max(...rows.map((row) => Number(row.cnt || 0)), 1);
  return <div className="event-heatmap">{rows.length ? rows.map((row, index) => { const count = Number(row.cnt || 0); const sessions = Number(row.sessions || 0); return <div key={`${row.event_name}-${index}`} className="event-heat-row"><div className="event-heat-label"><span className="event-heat-rank">0{index + 1}</span><span className="truncate mono">{row.event_name || '(unnamed)'}</span></div><div className="event-heat-track"><div className="event-heat-fill" style={{ width: pct(count, max) }} /><span className="event-heat-session" style={{ left: pct(sessions, max) }} /></div><div className="event-heat-count">{number(count)}</div><div className="event-heat-sessions">{number(sessions)} sessions</div></div>; }) : <div className="empty-visual">No event volume has arrived yet.</div>}</div>;
}

export function EvidenceRail({ items }: { items: any[] }) {
  return <div className="evidence-rail">{items.length ? items.slice(0, 6).map((item, index) => <div className="evidence-rail-item" key={`${item.id || item.event_name}-${index}`}><span className={`evidence-rail-dot ${item.severity === 'critical' ? 'is-critical' : item.sourceType === 'derived_gtm_fanout' ? 'is-violet' : 'is-lime'}`} /><div className="min-w-0 flex-1"><div className="evidence-rail-title">{item.event_name || item.vendor || 'Telemetry signal'}</div><div className="evidence-rail-copy truncate">{item.message || item.root_cause || 'Evidence captured from a real visitor.'}</div></div><span className="evidence-rail-time">{item.occurrence_count || item.count || 1}×</span></div>) : <div className="empty-visual">No active evidence requiring attention.</div>}</div>;
}
