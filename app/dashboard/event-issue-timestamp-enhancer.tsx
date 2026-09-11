'use client';

import { useEffect } from 'react';

function formatTimestamp(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function EventIssueTimestampEnhancer({ vendor }: { vendor: string }) {
  useEffect(() => {
    const siteId = new URLSearchParams(window.location.search).get('siteId');
    if (!siteId || !vendor) return;
    let cancelled = false;

    const render = async () => {
      try {
        const response = await fetch(`/api/event-governance?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        const governance = Array.isArray(payload?.events) ? payload.events : [];
        const byName = new Map(governance.map((row: any) => [String(row.event_name || '').trim().toLowerCase(), row]));

        document.querySelectorAll('table').forEach((table) => {
          const headers = Array.from(table.querySelectorAll('thead th')).map((th) => String(th.textContent || '').trim().toLowerCase());
          const issueIndex = headers.indexOf('issue');
          const timestampIndex = headers.indexOf('timestamp');
          const eventIndex = headers.indexOf('event name');
          if (issueIndex < 0 || timestampIndex < 0 || eventIndex < 0) return;

          table.querySelectorAll('tbody tr').forEach((row) => {
            const cells = row.querySelectorAll('td');
            const eventCell = cells[eventIndex];
            const issueCell = cells[issueIndex];
            const timestampCell = cells[timestampIndex];
            if (!eventCell || !issueCell || !timestampCell) return;
            const eventName = String(eventCell.querySelector('.font-mono')?.textContent || '').trim().toLowerCase();
            const governanceRow = byName.get(eventName);
            const issues = Array.isArray(governanceRow?.issues) ? governanceRow.issues : [];
            if (!issues.length) return;

            const issueWrap = document.createElement('div');
            issueWrap.className = 'space-y-3';
            const timestampWrap = document.createElement('div');
            timestampWrap.className = 'space-y-3';

            issues.forEach((issue: any, index: number) => {
              const issueBox = document.createElement('div');
              issueBox.className = 'rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5';
              const title = document.createElement('div');
              title.className = 'text-[11px] font-semibold text-[var(--text)]';
              title.textContent = `${index + 1}. ${String(issue.message || issue.code || 'Tracking issue')}`;
              issueBox.appendChild(title);

              if (issue.detail && !(index === 0 && issues.length > 1 && String(issue.detail).includes('2.'))) {
                const detail = document.createElement('div');
                detail.className = 'mt-1 whitespace-pre-wrap text-[10px] text-[var(--text-3)]';
                detail.textContent = String(issue.detail);
                issueBox.appendChild(detail);
              }
              issueWrap.appendChild(issueBox);

              const timeBox = document.createElement('div');
              timeBox.className = 'min-h-[42px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 text-[10px] text-[var(--text-2)]';
              timeBox.textContent = formatTimestamp(issue.timestamp || governanceRow?.last_seen);
              timestampWrap.appendChild(timeBox);
            });

            issueCell.replaceChildren(issueWrap);
            timestampCell.replaceChildren(timestampWrap);
          });
        });
      } catch {
        // The existing table remains intact if governance data cannot be loaded.
      }
    };

    const observer = new MutationObserver(() => { void render(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void render();
    return () => { cancelled = true; observer.disconnect(); };
  }, [vendor]);

  return null;
}
