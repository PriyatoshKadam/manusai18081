'use client';

import { useEffect } from 'react';

type Issue = { code?: string; severity?: string; title?: string; message?: string; vendor?: string; event_name?: string; page_url?: string; gtm_tag_name?: string | null; gtm_trigger_name?: string | null; timestamp?: string | null };
type ConsentData = { summary?: any; destinations?: any[]; issues?: Issue[]; first_request_examples?: any[] };
type AdblockData = { totals?: any; trend?: any[]; recent?: any[] };

const fmt=(v:unknown)=>Number(v||0).toLocaleString();
const time=(v:unknown)=>{if(!v)return'—';const d=new Date(String(v));if(Number.isNaN(d.getTime()))return'—';const local=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(d);const utc=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC',timeZoneName:'short'}).format(d);return`${local} · ${utc}`};
const pct=(v:unknown)=>`${Number(v||0).toFixed(1)}%`;
function node(tag:string,cls='',text=''){const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;}
function card(title:string,value:string,note:string){const d=node('div','rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3');d.append(node('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]',title),node('div','mt-1 text-lg font-semibold text-[var(--text)]',value),node('div','mt-1 text-[10px] text-[var(--text-3)]',note));return d;}
function table(headers:string[],rows:string[][]){const t=document.createElement('table');t.className='mt-3 w-full text-left';const h=document.createElement('thead');const hr=document.createElement('tr');headers.forEach(x=>hr.append(node('th','px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-3)]',x)));h.append(hr);t.append(h);const b=document.createElement('tbody');rows.forEach(row=>{const tr=document.createElement('tr');tr.className='border-t border-[var(--border-soft)]';row.forEach(x=>tr.append(node('td','px-3 py-2 align-top text-[10px]',x)));b.append(tr)});t.append(b);return t;}
function findTabButton(label:string){return Array.from(document.querySelectorAll('button')).find(b=>String(b.textContent||'').trim().toLowerCase()===label.toLowerCase());}
function activeTab(label:string){const b=findTabButton(label);if(!b)return false;const style=getComputedStyle(b);return b.getAttribute('aria-selected')==='true'||b.getAttribute('data-state')==='active'||(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent');}
function legacySection(title:string){const headings=Array.from(document.querySelectorAll('h1,h2,h3,h4')).filter(h=>String(h.textContent||'').trim()===title);for(const h of headings){const s=h.closest('section');if(s)return s as HTMLElement;}return null;}
function removeOwn(){document.querySelectorAll('[data-ga4fix-evidence-semantics="2"]').forEach(e=>e.remove());}
function issueKey(x:Issue){return[String(x.event_name||'Unnamed event').toLowerCase(),String(x.vendor||'').toLowerCase(),String(x.gtm_tag_name||'').toLowerCase(),String(x.page_url||'').split('?')[0]].join('|');}

export default function PlatformEvidenceSemanticsEnhancer({vendor}:{vendor:string}){
 useEffect(()=>{
  const siteId=new URLSearchParams(window.location.search).get('siteId');if(!siteId||!vendor)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|null=null;
  const render=async()=>{
   if(cancelled)return;
   const consentActive=activeTab('Consent');const adActive=activeTab('Ad blockers');
   if(!consentActive&&!adActive){removeOwn();return;}
   try{
    const endpoint=consentActive?`/api/consent-governance?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`:`/api/platform-adblock-summary-v2?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`;
    const response=await fetch(endpoint,{cache:'no-store'});if(!response.ok||cancelled)return;const data=await response.json() as ConsentData&AdblockData;
    removeOwn();
    const old=consentActive?legacySection('Events firing outside consent'):legacySection('Successful vs blocked');
    if(!old)return;
    old.style.display='none';
    const panel=node('section','space-y-4');panel.setAttribute('data-ga4fix-evidence-semantics','2');
    if(consentActive){
      const s=data.summary||{};const names=Array.isArray(s.cmp_event_names)?s.cmp_event_names:[];const cmp=names.some((x:string)=>/termly/i.test(x))?'Termly':names.some((x:string)=>/onetrust/i.test(x))?'OneTrust':names.some((x:string)=>/cookiebot/i.test(x))?'Cookiebot':names.length?'Detected':'Not detected';
      const head=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');head.append(node('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]','Consent governance'),node('div','mt-1 text-sm font-semibold text-[var(--text)]','Consent health & compliance evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]',`${vendor.toUpperCase()} · 30-day observed runtime telemetry`));
      const grid=node('div','mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5');grid.append(card('CMP detection',cmp,names.length?`${fmt(s.cmp_events)} CMP-related events observed`:'No known CMP event pattern observed'),card('Consent Mode',Number(s.signalled||0)>0?'Detected':'Not detected',Number(s.signalled||0)>0?'Consent storage signals were observed':'No consent storage signal observed'),card('Choice recorded',Number(s.choice_recorded||0)>0?'Yes':'No',`${fmt(s.choice_recorded)} sessions with an explicit recorded choice`),card('Acceptance rate',pct(s.acceptance_rate),'Among sessions with a recorded choice'),card('No consent signal',fmt(s.no_signal),'Sessions with no consent signal anywhere'));head.append(grid);panel.append(head);
      const groups=new Map<string,Issue&{count:number;first?:string|null}>();for(const x of Array.isArray(data.issues)?data.issues:[]){const k=issueKey(x);const p=groups.get(k);if(p)p.count++;else groups.set(k,{...x,count:1,first:x.timestamp||null});}
      const issues=Array.from(groups.values());const sec=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');sec.append(node('div','text-sm font-semibold text-[var(--text)]',`Actual consent issues (${fmt(issues.length)})`),node('div','mt-1 text-[10px] text-[var(--text-3)]','Repeated telemetry for the same event/destination/page/GTM combination is aggregated into one row. Consent Mode denied pings are not automatically violations.'));
      if(!issues.length)sec.append(node('div','mt-3 rounded-lg bg-green-50 p-3 text-[11px] text-green-800','No evidence-backed consent governance issue detected in the observed window.'));
      else sec.append(table(['Status','Event','Destination','Page','GTM','Issue','Occurrences / Detected'],issues.map(x=>[String(x.severity||'warning').toUpperCase(),String(x.event_name||'—'),String(x.vendor||'—'),String(x.page_url||'—'),String(x.gtm_tag_name||'—'),String(x.title||x.message||x.code||'Consent issue'),`${fmt(x.count)} · ${time(x.first||x.timestamp)}`])));panel.append(sec);
      const first=Array.isArray(data.first_request_examples)?data.first_request_examples:[];const timing=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');timing.append(node('div','text-sm font-semibold text-[var(--text)]','Consent timing evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]','A missing signal on the first request is review evidence; it is not by itself proof of a legal consent violation.'),node('div','mt-3 text-[11px] '+(first.length?'text-amber-700':'text-green-700'),first.length?`${fmt(first.length)} example(s) where the first tracked request had no consent signal.`:'No missing-consent first requests detected.'));panel.append(timing);
      panel.append(node('div','rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] text-blue-900','Google Consent Mode: analytics_storage=denied is not an automatic GA4 violation. Non-Google advertising destinations sending delivered traffic while the relevant ad consent is denied are surfaced as consent violations.'));
    }else{
      const s=data.totals||{};const head=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');head.append(node('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]','Ad blocker governance'),node('div','mt-1 text-sm font-semibold text-[var(--text)]','Observed delivery & blocker evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]',`${vendor.toUpperCase()} · 24-hour delivery metrics · 30-day evidence log`));const grid=node('div','mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5');grid.append(card('Observed events',fmt(s.events),'Captured by GA4Fix'),card('Successful deliveries',fmt(s.successful),'Delivery outcome = delivered'),card('Failed deliveries',fmt(s.failed),'Observed non-delivered outcomes'),card('Blocked signals',fmt(s.actionable_signals),'Confirmed or likely blocker evidence'),card('Affected event types',fmt(s.affected_events),'Events associated with actionable blocker evidence'));head.append(grid);panel.append(head);
      const recent=Array.isArray(data.recent)?data.recent:[];const sec=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');sec.append(node('div','text-sm font-semibold text-[var(--text)]','Blocker detection evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]','Rows are evidence records, not claims that an event was lost. Confidence distinguishes explicit blocker proof from weaker signals.'));
      if(!recent.length)sec.append(node('div','mt-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--text-2)]','No ad-block evidence records were captured in the selected window. This is a no-evidence state, not proof that no blocker exists.'));
      else sec.append(table(['Confidence','Method','Signal','Event','Page','Detected'],recent.slice(0,100).map((x:any)=>[String(x.confidence||'unknown').replace(/_/g,' ').toUpperCase(),String(x.detection_method||'—'),String(x.signal||'—'),String(x.event_name||'—'),String(x.page_url||'—'),time(x.detected_at)])));panel.append(sec);
      const trend=Array.isArray(data.trend)?data.trend:[];const tr=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');tr.append(node('div','text-sm font-semibold text-[var(--text)]','14-day blocker trend'));if(trend.length)tr.append(table(['Date','Observed','Successful','Blocked signals','Confirmed','Likely'],trend.slice(-14).map((x:any)=>[new Date(x.day).toLocaleDateString(),fmt(x.events),fmt(x.successful),fmt(x.actionable),fmt(x.confirmed),fmt(x.likely)])));else tr.append(node('div','mt-3 text-[11px] text-[var(--text-3)]','No trend data yet.'));panel.append(tr);
      panel.append(node('div','rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] text-blue-900','Evidence rule: explicit browser/client blocking signals support confirmed blocking. CORS errors, HTTP errors, timeouts, missing matches, correlation gaps and telemetry gaps are not counted as blocked by themselves. “Blocked signals” is not the same as “lost events.”'));
    }
    old.parentElement?.insertBefore(panel,old);
   }catch{ /* preserve legacy UI on transient API failure */ }
  };
  const observer=new MutationObserver((records)=>{const relevant=records.some(record=>Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(n=>{if(!(n instanceof Element))return true;return !n.matches('[data-ga4fix-evidence-semantics="2"]')&&!n.closest('[data-ga4fix-evidence-semantics="2"]')}));if(!relevant)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>void render(),100)});observer.observe(document.body,{childList:true,subtree:true});void render();return()=>{cancelled=true;if(timer)clearTimeout(timer);observer.disconnect();removeOwn()};
 },[vendor]);
 return null;
}
