'use client';

export function SeverityChip({ severity }: { severity: string }) {
  const cls = severity === 'critical'
    ? 'bg-red-200 text-red-900'
    : severity === 'warning'
    ? 'bg-amber-200 text-amber-900'
    : 'bg-blue-200 text-blue-900';
  const dot = severity === 'critical' ? 'bg-red-600' : severity === 'warning' ? 'bg-amber-500' : 'bg-blue-600';
  return (
    <span className={`pill ${cls}`}>
      <span className={`dot ${dot}`}></span>
      {severity[0].toUpperCase() + severity.slice(1)}
    </span>
  );
}

export function timeAgo(t: string | Date) {
  const then = new Date(t).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
