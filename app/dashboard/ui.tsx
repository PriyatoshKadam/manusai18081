'use client';

/** Shared presentation primitives matching the GAfix / Claude Design token system.
 * Tone maps to the semantic pill/dot colors defined in app/globals.css (:root). */
export type Tone = 'ok' | 'warn' | 'crit' | 'high' | 'info' | 'accent' | 'neutral';

const TONE_STYLES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  ok: { bg: 'var(--ok-bg)', fg: 'var(--ok-fg)', dot: 'var(--ok-dot)' },
  warn: { bg: 'var(--warn-bg)', fg: 'var(--warn-fg)', dot: 'var(--warn-dot)' },
  crit: { bg: 'var(--crit-bg)', fg: 'var(--crit-fg)', dot: 'var(--crit-fg)' },
  high: { bg: 'var(--high-bg)', fg: 'var(--high-fg)', dot: 'var(--high-dot)' },
  info: { bg: 'var(--info-bg)', fg: 'var(--info-fg)', dot: 'var(--accent-2)' },
  accent: { bg: 'var(--tint)', fg: 'var(--accent)', dot: 'var(--accent)' },
  neutral: { bg: 'var(--surface-3)', fg: 'var(--text-2)', dot: 'var(--text-3)' },
};

/** Rounded surface card: bg var(--surface) on var(--border), the mockup's base container. */
export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] ${className}`}>
      {children}
    </div>
  );
}

/** Colored status pill with an optional leading dot, using the ok/warn/crit/high/info tokens. */
export function Pill({ tone = 'neutral', dot = true, children, className = '', title }: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string; title?: string }) {
  const t = TONE_STYLES[tone];
  return (
    <span className={`status-pill ${className}`} style={{ background: t.bg, color: t.fg }} title={title}>
      {dot ? <span className="status-dot" style={{ background: t.dot }} /> : null}
      {children}
    </span>
  );
}

/** Big numeric stat in the mockup's --fs-kpi (30px/1.1, bold, sans) style. */
export function KpiStat({ label, value, note, tone = 'accent' }: { label: string; value: React.ReactNode; note?: string; tone?: Tone }) {
  const t = TONE_STYLES[tone];
  return (
    <div className="relative overflow-hidden rounded-[9px] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5">
      <div className="text-[11px] text-[var(--text-3)]">{label}</div>
      <div className="mt-0.5 font-sans text-kpi leading-[1.1] tracking-tight text-[var(--text)]">{value}</div>
      {note ? <div className="mt-0.5 text-[11px]" style={{ color: t.fg }}>{note}</div> : null}
      <div className="absolute inset-x-0 bottom-0 h-[2.5px]" style={{ background: t.dot }} />
    </div>
  );
}

export function SeverityChip({ severity }: { severity: string }) {
  const displaySeverity = severity === 'critical' ? 'Needs attention now' : severity === 'warning' ? 'Worth checking' : 'Information';
  const tone: Tone = severity === 'critical' ? 'crit' : severity === 'warning' ? 'warn' : 'info';
  return <Pill tone={tone}>{displaySeverity}</Pill>;
}

export function timeAgo(t: string | Date) {
  const then = new Date(t).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}


export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
