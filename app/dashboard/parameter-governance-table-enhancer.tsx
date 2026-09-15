'use client';

import { useEffect } from 'react';

type Issue = { code?: string; title?: string; message?: string; timestamp?: string | null; severity?: string };
type ParameterRow = { parameter_name?: string; event?: string | null; status?: string; expected_type?: string | null; observed_types?: string[]; presence?: string; events?: string[]; sources?: string[]; hits?: number; hits_24h?: number; coverage?: number; issues?: Issue[]; last_seen?: string | null; tag_name?: string | null; trigger_name?: string | null };

function fmtTimestamp(value: unknown) {
  if (!value) return '—';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function text(value: unknown) { return String(value ?? '').trim().toLowerCase(); }

export default function ParameterGovernanceTableEnhancer({ vendor }: { vendor: string }) {
  useEffect(() => {
    const siteId = new URLSearchParams(window.location.search).get('siteId');
    if (!siteId || !vendor) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const render = async () => {
      try {
        const response = await fetch(`/api/parameter-governance-issues?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        const governed: ParameterRow[] = Array.isArray(payload?.parameters) ? payload.parameters : [];
        if (!governed.length) return;

        const byKey = new Map<string, ParameterRow>();
        governed.forEach((row) => {
          const parameter = text(row.parameter_name);
          const event = text(row.event);
          if (!parameter) return;
          byKey.set(`${event}|${parameter}`, row);
          if (!event && !byKey.has(`|${parameter}`)) byKey.set(`|${parameter}`, row);
        });

        document.querySelectorAll('table').forEach((table) => {
          const headers = Array.from(table.querySelectorAll('thead th')).map((th) => text(th.textContent));
          const parameterIndex = headers.indexOf('parameter');
          const errorsIndex = headers.indexOf('errors');
          const issuesIndex = headers.indexOf('issues');
          const timestampIndex = headers.indexOf('timestamp');
          const eventSourceIndex = headers.indexOf('events / source');
          if (parameterIndex < 0 || (errorsIndex < 0 && issuesIndex < 0) || !headers.includes('coverage')) return;

          const issueColumn = issuesIndex >= 0 ? issuesIndex : errorsIndex;
          if (errorsIndex >= 0) table.querySelectorAll('thead th')[errorsIndex].textContent = 'Issues';
          if (timestampIndex < 0) {
            const th = document.createElement('th');
            th.className = 'text-left text-[10px] uppercase tracking-wide text-[var(--text-3)]';
            th.textContent = 'Timestamp';
            table.querySelector('thead tr')?.appendChild(th);
          }

          table.querySelectorAll('tbody tr').forEach((row) => {
            const cells = row.querySelectorAll('td');
            const parameterCell = cells[parameterIndex];
            if (!parameterCell) return;
            const parameter = text(parameterCell.querySelector('.font-mono')?.textContent || parameterCell.textContent);
            if (!parameter) return;
            const eventText = text(parameterCell.textContent.match(/GTM event:\s*([^\n]+)/i)?.[1] || '');
            const governedRow = byKey.get(`${eventText}|${parameter}`) || byKey.get(`|${parameter}`) || governed.find((r) => text(r.parameter_name) === parameter);
            if (!governedRow) return;

            const issues: Issue[] = Array.isArray(governedRow.issues) ? governedRow.issues : [];
            const issueCell = row.querySelectorAll('td')[issueColumn];
            if (issueCell) {
              const wrap = document.createElement('div');
              wrap.className = 'space-y-2';
              if (!issues.length) {
                const ok = document.createElement('span');
                ok.className = 'text-[11px] text-green-700';
                ok.textContent = 'OK — no parameter issue detected.';
                wrap.appendChild(ok);
              } else {
                issues.forEach((issue, index) => {
                  const box = document.createElement('div');
                  box.className = 'rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5';
                  const title = document.createElement('div');
                  title.className = `text-[11px] font-semibold ${issue.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`;
                  title.textContent = `${index + 1}. ${issue.title || issue.code || 'Parameter issue'}`;
                  box.appendChild(title);
                  if (issue.message) {
                    const detail = document.createElement('div');
                    detail.className = 'mt-1 text-[10px] text-[var(--text-2)]';
                    detail.textContent = issue.message;
                    box.appendChild(detail);
                  }
                  wrap.appendChild(box);
                });
              }
              issueCell.replaceChildren(wrap);
            }

            const cellsNow = row.querySelectorAll('td');
            const existingTimestampIndex = headers.indexOf('timestamp');
            const timestampCell = existingTimestampIndex >= 0 ? cellsNow[existingTimestampIndex] : null;
            const timestampWrap = document.createElement('div');
            timestampWrap.className = 'space-y-2';
            if (issues.length) {
              issues.forEach((issue) => {
                const box = document.createElement('div');
                box.className = 'min-h-[40px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 text-[10px] text-[var(--text-2)]';
                box.textContent = fmtTimestamp(issue.timestamp || governedRow.last_seen);
                timestampWrap.appendChild(box);
              });
            } else {
              const box = document.createElement('div');
              box.className = 'text-[10px] text-[var(--text-3)]';
              box.textContent = fmtTimestamp(governedRow.last_seen);
              timestampWrap.appendChild(box);
            }

            if (timestampCell) {
              timestampCell.replaceChildren(timestampWrap);
            } else {
              const td = document.createElement('td');
              td.className = 'align-top whitespace-nowrap text-[10px] text-[var(--text-2)]';
              td.appendChild(timestampWrap);
              row.appendChild(td);
            }

            if (eventSourceIndex >= 0 && cellsNow[eventSourceIndex]) {
              const sourceCell = cellsNow[eventSourceIndex];
              const sourceParts = [
                ...(Array.isArray(governedRow.events) ? governedRow.events : []),
                ...(governedRow.tag_name ? [governedRow.tag_name] : []),
              ].filter(Boolean);
              sourceCell.textContent = Array.from(new Set(sourceParts)).join(', ') || '—';
            }

            const allCells = row.querySelectorAll('td');
            const typeIndex = headers.indexOf('type');
            const presenceIndex = headers.indexOf('presence');
            const hitsIndex = headers.indexOf('hits');
            const coverageIndex = headers.indexOf('coverage');
            const statusIndex = headers.indexOf('status');
            if (typeIndex >= 0 && allCells[typeIndex]) allCells[typeIndex].textContent = governedRow.expected_type || 'Any';
            if (presenceIndex >= 0 && allCells[presenceIndex]) allCells[presenceIndex].textContent = governedRow.presence || 'optional';
            if (hitsIndex >= 0 && allCells[hitsIndex]) allCells[hitsIndex].textContent = Number(governedRow.hits || 0).toLocaleString();
            if (coverageIndex >= 0 && allCells[coverageIndex]) allCells[coverageIndex].textContent = `${Number(governedRow.coverage ?? 0).toFixed(1)}%`;
            if (statusIndex >= 0 && allCells[statusIndex]) {
              const statusText = governedRow.status || 'OK';
              allCells[statusIndex].querySelector('span')?.replaceChildren(document.createTextNode(statusText));
            }
          });
        });
      } catch {
        // Preserve the React-rendered table if the governance enrichment is unavailable.
      }
    };

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void render(), 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    void render();
    return () => { cancelled = true; if (timer) clearTimeout(timer); observer.disconnect(); };
  }, [vendor]);
  return null;
}
