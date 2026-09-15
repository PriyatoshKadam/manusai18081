'use client';

import { useEffect } from 'react';

type Issue = { code?: string; severity?: string; title?: string; message?: string; vendor?: string; event_name?: string; page_url?: string; gtm_tag_name?: string | null; gtm_trigger_name?: string | null; timestamp?: string | null };
type Data = { summary?: any; destinations?: any[]; issues?: Issue[]; first_request_examples?: any[]; trend?: any[] };

const fmt = (v: unknown) => Number(v || 0).toLocaleString();
const time = (v: unknown) => { if (!v) return '—'; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}); };
const pct = (v: unknown) => `${Number(v || 0).toFixed(1)}%`;
const cls = (severity: string) => severity === 'critical' ? 'bg-red-100 text-red-700' : severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

function el(tag: string, className = '', text = '') { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; }
function card(title: string, value: string, note: string) { const d = el('div','rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3'); d.append(el('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]',title),el('div','mt-1 text-lg font-semibold text-[var(--text)]',value),el('div','mt-1 text-[10px] text-[var(--text-3)]',note)); return d; }

export default function ConsentGovernanceEnhancer({ vendor }: { vendor: string }) {
  useEffect(() => {
    const siteId = new URLSearchParams(window.location.search).get('siteId');
    if (!siteId || !vendor) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const render = async () => {
      try {
        const response = await fetch(`/api/consent-governance?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`,{cache:'no-store'});
        if (!response.ok || cancelled) return;
        const data: Data = await response.json();
        const activeButton = Array.from(document.querySelectorAll('button')).find((b) => /^consent$/i.test(String(b.textContent || '').trim()) && (b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-state') === 'active' || b.className.includes('border-b-2')));
        const headings = Array.from(document.querySelectorAll('h2,h3,h4'));
        const anchor = headings.find((h) => /^consent( overview| health)?$/i.test(String(h.textContent || '').trim())) || headings.find((h) => /consent/i.test(String(h.textContent || '').trim()));
        if (!activeButton && !anchor) return;
        const existing = document.querySelector('[data-ga4fix-consent-governance="1"]');
        if (existing) existing.remove();
        const panel = el('section','mt-5 space-y-4'); panel.setAttribute('data-ga4fix-consent-governance','1');
        const title = el('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');
        title.append(el('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]','Consent governance'),el('div','mt-1 text-sm font-semibold text-[var(--text)]','Consent health & tracking compliance'),el('div','mt-1 text-[10px] text-[var(--text-3)]',`${vendor.toUpperCase()} · 30-day evidence · consent signals are evaluated from observed runtime telemetry`));
        const s = data.summary || {};
        const grid = el('div','mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5');
        grid.append(card('Acceptance rate',pct(s.acceptance_rate),'Recorded choices with at least one storage category granted'),card('Accepted',fmt(s.accepted),'Sessions'),card('Rejected',fmt(s.rejected),'All tracked storage categories denied'),card('No choice',fmt(s.ignored),'Sessions without a recorded choice'),card('Consent signal missing',fmt(s.no_signal),'Sessions with no consent signal anywhere'));
        title.append(grid); panel.append(title);

        const dest = el('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4'); dest.append(el('div','text-sm font-semibold text-[var(--text)]','Destination consent health'));
        const table = document.createElement('table'); table.className='mt-3 w-full text-left'; const thead=document.createElement('thead'); const hr=document.createElement('tr'); ['Status','Destination','Choice Rate','Consent Denied','Violations','Last Seen'].forEach(h=>hr.append(el('th','px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-3)]',h))); thead.append(hr); table.append(thead); const tbody=document.createElement('tbody');
        (Array.isArray(data.destinations)?data.destinations:[]).forEach((r:any)=>{ const tr=document.createElement('tr'); tr.className='border-t border-[var(--border-soft)]'; const st=el('td','px-3 py-2'); st.append(el('span',`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.violations?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`,r.violations?'Needs attention':'Healthy')); tr.append(st); [r.name||r.vendor,pct(r.choice_rate),`analytics: ${fmt(r.analytics_denied)} · ads: ${fmt(r.ad_denied)}`,fmt(r.violations),time(r.last_seen)].forEach((v)=>tr.append(el('td','px-3 py-2 align-top text-[11px]',String(v||'—')))); tbody.append(tr); }); table.append(tbody); dest.append(table); panel.append(dest);

        const issueSection=el('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4'); issueSection.append(el('div','text-sm font-semibold text-[var(--text)]',`Consent issues (${fmt((data.issues||[]).length)})`)); const issues=Array.isArray(data.issues)?data.issues:[];
        if(!issues.length) issueSection.append(el('div','mt-3 text-[11px] text-green-700','No consent governance issues detected in the observed evidence window.'));
        else issues.forEach((issue,index)=>{ const box=el('div','mt-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3'); const top=el('div','flex flex-wrap items-center gap-2'); top.append(el('span',`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls(String(issue.severity||'warning'))}`,String(issue.severity||'warning')),el('span','text-[11px] font-semibold text-[var(--text)]',`${index+1}. ${issue.title||issue.code||'Consent issue'}`)); box.append(top); box.append(el('div','mt-1 text-[11px] text-[var(--text-2)]',issue.message||'')); const meta=[issue.vendor?`Destination: ${issue.vendor}`:'',issue.event_name?`Event: ${issue.event_name}`:'',issue.page_url?`Page: ${issue.page_url}`:'',issue.gtm_tag_name?`GTM: ${issue.gtm_tag_name}`:'',issue.gtm_trigger_name?`Trigger: ${issue.gtm_trigger_name}`:'',`Detected: ${time(issue.timestamp)}`].filter(Boolean); box.append(el('div','mt-2 text-[10px] text-[var(--text-3)]',meta.join(' · '))); issueSection.append(box); }); panel.append(issueSection);

        const first=Array.isArray(data.first_request_examples)?data.first_request_examples:[]; const timing=el('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4'); timing.append(el('div','text-sm font-semibold text-[var(--text)]','Consent timing evidence'),el('div','mt-1 text-[10px] text-[var(--text-3)]','Sessions where the first tracked request had no consent signal. This is evidence for review, not an automatic legal violation.')); if(!first.length) timing.append(el('div','mt-3 text-[11px] text-green-700','No missing-consent first requests detected.')); else { const t=document.createElement('table'); t.className='mt-3 w-full text-left'; const th=document.createElement('thead'); const trh=document.createElement('tr'); ['Event','Destination','Page','GTM','First Request'].forEach(h=>trh.append(el('th','px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-3)]',h))); th.append(trh); t.append(th); const tb=document.createElement('tbody'); first.slice(0,50).forEach((r:any)=>{const tr=document.createElement('tr');tr.className='border-t border-[var(--border-soft)]';[r.event_name||'—',r.vendor||'—',r.page_url||'—',r.gtm_tag_name||'—',time(r.received_at)].forEach(v=>tr.append(el('td','px-3 py-2 text-[10px] align-top',String(v))));tb.append(tr)});t.append(tb);timing.append(t)} panel.append(timing);

        const note=el('div','rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] text-blue-900','Google Consent Mode note: analytics_storage=denied is not treated as an automatic GA4 violation because denied Consent Mode can still permit cookieless measurement. For non-Google advertising destinations, delivered traffic while the relevant ad consent is denied is surfaced as a consent violation.'); panel.append(note);
        const target = anchor?.parentElement?.parentElement || anchor?.parentElement;
        if (target) target.appendChild(panel); else document.querySelector('main')?.appendChild(panel);
      } catch { /* preserve existing consent UI */ }
    };
    const observer=new MutationObserver(()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>void render(),120)}); observer.observe(document.body,{childList:true,subtree:true}); void render(); return()=>{cancelled=true;if(timer)clearTimeout(timer);observer.disconnect()};
  },[vendor]);
  return null;
}
