'use client';

export function SeverityChip({ severity }: { severity: string }) {
  const cls = severity === 'critical'
    ? 'bg-[#ff718d]/10 text-[#ff9aae] border border-[#ff718d]/20'
    : severity === 'warning'
    ? 'bg-[#f6b94c]/10 text-[#ffd27a] border border-[#f6b94c]/20'
    : 'bg-[#2f6bff]/10 text-[#86a8ff] border border-[#2f6bff]/20';
  const dot = severity === 'critical' ? 'bg-[#ff718d]' : severity === 'warning' ? 'bg-[#f6b94c]' : 'bg-[#2f6bff]';
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
