'use client';

import { useEffect } from 'react';

type PageEvent = {
  event_name?: string;
  daily_hits?: number;
  one_day_ago?: number;
  one_week_ago?: number;
  thirty_days_ago?: number;
  hits_30d?: number;
  sessions_30d?: number;
  gtm_tags?: string[];
  gtm_triggers?: string[];
  delivery_issues?: number;
  missing_parameter_events?: number;
  parameter_issues?: number;
  last_seen?: string | null;
};
type PageRow = {
  page_path?: string;
  status?: string;
  daily_hits?: number;
  one_day_ago?: number;
  one_week_ago?: number;
  thirty_days_ago?: number;
  hits_30d?: number;
  sessions_24h?: number;
  last_seen?: string | null;
  issues?: { title?: string; message?: string; severity?: string }[];
  events?: PageEvent[];
};

const fmt = (value: unknown) => Number(value || 0).toLocaleString();
const time = (value: unknown) => {
  if (!value) return '—';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const pctChange = (now: number, previous: number) => {
  if (!previous) return now ? 'New' : '—';
  const change = ((now - previous) / previous) * 100;
  return `${change > 0 ? '+' : ''}${change.toFixed(0)}%`;
};
const trendClass = (now: number, previous: number) => now >= previous ? 'text-green-700' : 'text-amber-700';

function cell(className = '') {
  const td = document.createElement('td');
  td.className = `align-top ${className}`;
  return td;
}
function textNode(value: unknown) { return document.createTextNode(String(value ?? '')); }
function badge(label: string, cls: string) {
  const span = document.createElement('span');
  span.className = `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`;
  span.textContent = label;
  return span;
}

export default function PageGovernanceTableEnhancer({ vendor }: { vendor: string }) {
  useEffect(() => {
    const siteId = new URLSearchParams(window.location.search).get('siteId');
    if (!siteId || !vendor) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const render = async () => {
      try {
        const response = await fetch(`/api/page-governance?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`, { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        const pages: PageRow[] = Array.isArray(payload?.pages) ? payload.pages : [];
        if (!pages.length) return;

        document.querySelectorAll('table').forEach((table) => {
          if (table.getAttribute('data-ga4fix-page-governance') === '1') return;
          const headers = Array.from(table.querySelectorAll('thead th')).map((th) => String(th.textContent || '').trim().toLowerCase());
          const pageIndex = headers.indexOf('page path');
          if (pageIndex < 0 || !headers.includes('sessions') || !headers.includes('event count')) return;

          table.setAttribute('data-ga4fix-page-governance', '1');
          const head = table.querySelector('thead tr');
          if (!head) return;
          head.replaceChildren();
          ['Status', 'Page', 'Events', 'Daily Hits', '1D Ago', '1W Ago', '30D Ago', 'Issues'].forEach((label) => {
            const th = document.createElement('th');
            th.className = 'text-left text-[10px] uppercase tracking-wide text-[var(--text-3)]';
            th.textContent = label;
            head.appendChild(th);
          });

          const tbody = table.querySelector('tbody');
          if (!tbody) return;
          tbody.replaceChildren();

          pages.forEach((page) => {
            const tr = document.createElement('tr');
            tr.className = 'border-t border-[var(--border-soft)] align-top';
            const events = Array.isArray(page.events) ? page.events : [];
            const issues = Array.isArray(page.issues) ? page.issues : [];

            const statusTd = cell('whitespace-nowrap');
            statusTd.appendChild(badge(page.status === 'Healthy' ? 'Healthy' : 'Needs attention', page.status === 'Healthy' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'));
            tr.appendChild(statusTd);

            const pageTd = cell('min-w-[180px]');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'group text-left';
            const path = document.createElement('div');
            path.className = 'font-mono text-[12px] font-semibold text-[var(--text)] group-hover:underline';
            path.textContent = page.page_path || '/';
            const meta = document.createElement('div');
            meta.className = 'mt-1 text-[10px] text-[var(--text-3)]';
            meta.textContent = `${events.length} event${events.length === 1 ? '' : 's'} · ${fmt(page.sessions_24h)} sessions today`;
            button.append(path, meta);
            pageTd.appendChild(button);
            tr.appendChild(pageTd);

            const eventsTd = cell('min-w-[170px]');
            const eventNames = events.slice(0, 5).map((e) => e.event_name || 'Unnamed event');
            eventsTd.appendChild(textNode(eventNames.join(', ') || '—'));
            if (events.length > 5) {
              const more = document.createElement('div');
              more.className = 'mt-1 text-[10px] text-[var(--text-3)]';
              more.textContent = `+${events.length - 5} more`;
              eventsTd.appendChild(more);
            }
            tr.appendChild(eventsTd);

            const metric = (now: number, previous: number) => {
              const td = cell('whitespace-nowrap');
              const value = document.createElement('div');
              value.className = 'text-[12px] font-semibold';
              value.textContent = fmt(now);
              const change = document.createElement('div');
              change.className = `text-[10px] ${trendClass(now, previous)}`;
              change.textContent = pctChange(now, previous);
              td.append(value, change);
              return td;
            };
            tr.appendChild(metric(Number(page.daily_hits || 0), Number(page.one_day_ago || 0)));
            tr.appendChild(metric(Number(page.one_day_ago || 0), Number(page.daily_hits || 0)));
            tr.appendChild(metric(Number(page.one_week_ago || 0), Number(page.one_day_ago || 0)));
            tr.appendChild(metric(Number(page.thirty_days_ago || 0), Number(page.one_week_ago || 0)));

            const issueTd = cell('min-w-[150px]');
            if (!issues.length) issueTd.appendChild(badge('No issues', 'bg-green-100 text-green-700'));
            else {
              const summary = document.createElement('div');
              summary.className = 'font-semibold text-[11px] text-amber-700';
              summary.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
              issueTd.appendChild(summary);
              issues.slice(0, 2).forEach((issue) => {
                const detail = document.createElement('div');
                detail.className = 'mt-1 text-[10px] text-[var(--text-3)]';
                detail.textContent = issue.title || issue.message || 'Tracking issue';
                issueTd.appendChild(detail);
              });
            }
            tr.appendChild(issueTd);
            tbody.appendChild(tr);

            const detailTr = document.createElement('tr');
            detailTr.className = 'hidden border-t border-[var(--border-soft)] bg-[var(--surface-2)]';
            const detailTd = document.createElement('td');
            detailTd.colSpan = 8;
            detailTd.className = 'p-0';
            const panel = document.createElement('div');
            panel.className = 'p-4 space-y-4';
            const heading = document.createElement('div');
            heading.className = 'text-[12px] font-semibold text-[var(--text)]';
            heading.textContent = `${page.page_path || '/'} · Events detected on this page`;
            panel.appendChild(heading);

            if (!events.length) {
              const empty = document.createElement('div');
              empty.className = 'text-[11px] text-[var(--text-3)]';
              empty.textContent = 'No events detected for this page in the selected period.';
              panel.appendChild(empty);
            } else {
              const eventTable = document.createElement('div');
              eventTable.className = 'overflow-x-auto rounded-xl border border-[var(--border-soft)]';
              const inner = document.createElement('table');
              inner.className = 'w-full text-left';
              const innerHead = document.createElement('thead');
              const innerHeadRow = document.createElement('tr');
              ['Event Name', 'Daily Hits', '1D Ago', '1W Ago', '30D Ago', 'GTM Tag', 'Trigger', 'Issues', 'Last Seen'].forEach((label) => {
                const th = document.createElement('th');
                th.className = 'px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-3)]';
                th.textContent = label;
                innerHeadRow.appendChild(th);
              });
              innerHead.appendChild(innerHeadRow);
              inner.appendChild(innerHead);
              const innerBody = document.createElement('tbody');
              events.forEach((event) => {
                const er = document.createElement('tr');
                er.className = 'border-t border-[var(--border-soft)]';
                const add = (value: string, cls = 'text-[11px]') => { const td = document.createElement('td'); td.className = `px-3 py-2 align-top ${cls}`; td.textContent = value || '—'; er.appendChild(td); };
                add(event.event_name || 'Unnamed event', 'px-3 py-2 align-top font-mono text-[11px] font-semibold');
                add(fmt(event.daily_hits)); add(fmt(event.one_day_ago)); add(fmt(event.one_week_ago)); add(fmt(event.thirty_days_ago));
                add(Array.isArray(event.gtm_tags) && event.gtm_tags.length ? event.gtm_tags.join(', ') : '—');
                add(Array.isArray(event.gtm_triggers) && event.gtm_triggers.length ? event.gtm_triggers.join(', ') : '—');
                const issueCount = Number(event.delivery_issues || 0) + Number(event.missing_parameter_events || 0) + Number(event.parameter_issues || 0);
                add(issueCount ? `${issueCount.toLocaleString()} issue${issueCount === 1 ? '' : 's'}` : 'No issues');
                add(time(event.last_seen), 'px-3 py-2 align-top whitespace-nowrap text-[10px] text-[var(--text-2)]');
                innerBody.appendChild(er);
              });
              inner.appendChild(innerBody);
              eventTable.appendChild(inner);
              panel.appendChild(eventTable);
            }

            if (issues.length) {
              const issuePanel = document.createElement('div');
              issuePanel.className = 'rounded-xl border border-[var(--border-soft)] p-3';
              const issueTitle = document.createElement('div');
              issueTitle.className = 'text-[11px] font-semibold';
              issueTitle.textContent = 'Page warnings';
              issuePanel.appendChild(issueTitle);
              issues.forEach((issue) => {
                const line = document.createElement('div');
                line.className = 'mt-2 text-[10px] text-[var(--text-2)]';
                line.textContent = `${issue.title || 'Issue'} — ${issue.message || ''}`;
                issuePanel.appendChild(line);
              });
              panel.appendChild(issuePanel);
            }
            const footer = document.createElement('div');
            footer.className = 'text-[10px] text-[var(--text-3)]';
            footer.textContent = `Last activity: ${time(page.last_seen)} · 30-day event hits: ${fmt(page.hits_30d)}`;
            panel.appendChild(footer);
            detailTd.appendChild(panel);
            detailTr.appendChild(detailTd);
            tbody.appendChild(detailTr);

            button.addEventListener('click', () => {
              detailTr.classList.toggle('hidden');
            });
          });
        });
      } catch {
        // Keep the existing React table if page governance is unavailable.
      }
    };

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void render(), 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    void render();
    return () => { cancelled = true; if (timer) clearTimeout(timer); observer.disconnect(); };
  }, [vendor]);
  return null;
}
