'use client';

import { useEffect } from 'react';

type AnyData = Record<string, any>;
const fmt=(v:any)=>Number(v||0).toLocaleString();
const time=(v:any)=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})};
function node(tag:string,cls='',text=''){const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;}
function card(title:string,value:string,note:string){const d=node('div','rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3');d.append(node('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]',title),node('div','mt-1 text-lg font-semibold text-[var(--text)]',value),node('div','mt-1 text-[10px] text-[var(--text-3)]',note));return d;}
function hideLegacy(title:string){const els=Array.from(document.querySelectorAll('h2,h3,h4,div,span,p')).filter(e=>String(e.textContent||'').trim()===title);for(const el of els){let p:HTMLElement|null=el as HTMLElement;for(let i=0;i<5&&p;i++,p=p.parentElement){if(p.querySelectorAll('h2,h3,h4').length<=1&&p.parentElement&&p.parentElement.tagName!=='MAIN'){(p as HTMLElement).style.display='none';break;}}}}

export default function PlatformEvidenceSemanticsEnhancer({vendor}:{vendor:string}){
 useEffect(()=>{
  const siteId=new URLSearchParams(window.location.search).get('siteId');if(!siteId||!vendor)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|null=null;
  const active=(label:string)=>Array.from(document.querySelectorAll('button')).some(b=>String(b.textContent||'').trim().toLowerCase()===label.toLowerCase()&&(b.getAttribute('aria-selected')==='true'||b.getAttribute('data-state')==='active'||b.className.includes('border-b-2')));
  const render=async()=>{
   try{
    const isConsent=active('Consent');const isAd=active('Ad blockers');if(!isConsent&&!isAd)return;
    const endpoint=isConsent?`/api/consent-governance?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`:`/api/platform-adblock-summary?siteId=${encodeURIComponent(siteId)}&vendor=${encodeURIComponent(vendor)}`;
    const r=await fetch(endpoint,{cache:'no-store'});if(!r.ok||cancelled)return;const data:AnyData=await r.json();
    const old=document.querySelector('[data-ga4fix-evidence-semantics="1"]');if(old)old.remove();
    if(isConsent){
      hideLegacy('Events firing outside consent');
      const panel=node('section','mt-5 space-y-4');panel.setAttribute('data-ga4fix-evidence-semantics','1');
      const title=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');title.append(node('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]','Consent governance'),node('div','mt-1 text-sm font-semibold text-[var(--text)]','Consent health & compliance evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]',`${vendor.toUpperCase()} · 30-day observed runtime telemetry`));
      const s=data.summary||{};const grid=node('div','mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5');grid.append(card('CMP detection',s.cmp_detected?'Detected':'Not detected',s.cmp_detected?`${fmt(s.cmp_events)} CMP-related events observed`:'No known CMP event pattern observed'),card('Consent Mode',vendor==='ga4'?'Observed in telemetry':'Platform consent evidence','Consent state is evaluated from captured signals'),card('Choice recorded',Number(s.choice_recorded||0)>0?'Yes':'No',`${fmt(s.choice_recorded)} sessions with an explicit recorded choice`),card('Acceptance rate',`${Number(s.acceptance_rate||0).toFixed(1)}%`, 'Among sessions with a recorded choice'),card('No consent signal',fmt(s.no_signal), 'Sessions with no consent signal anywhere'));title.append(grid);panel.append(title);
      const issues=Array.isArray(data.issues)?data.issues:[];const section=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');section.append(node('div','text-sm font-semibold text-[var(--text)]',`Actual consent issues (${fmt(issues.length)})`),node('div','mt-1 text-[10px] text-[var(--text-3)]','Only evidence-backed violations and consent health warnings appear here. Consent Mode denied pings are not automatically violations.'));
      if(!issues.length)section.append(node('div','mt-3 rounded-lg bg-green-50 p-3 text-[11px] text-green-800','No consent governance issues detected in the observed evidence window.'));
      else for(const [i,x] of issues.entries()){const b=node('div','mt-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3');b.append(node('div','text-[11px] font-semibold',`${i+1}. ${x.title||x.code||'Consent issue'}`),node('div','mt-1 text-[11px] text-[var(--text-2)]',x.message||''),node('div','mt-2 text-[10px] text-[var(--text-3)]',[x.vendor?`Destination: ${x.vendor}`:'',x.event_name?`Event: ${x.event_name}`:'',x.gtm_tag_name?`GTM: ${x.gtm_tag_name}`:'',x.gtm_trigger_name?`Trigger: ${x.gtm_trigger_name}`:'',`Detected: ${time(x.timestamp)}`].filter(Boolean).join(' · ')));section.append(b)}
      panel.append(section);
      const timing=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');const first=data.first_request_examples||[];timing.append(node('div','text-sm font-semibold text-[var(--text)]','Consent timing evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]','A missing signal on the first request is review evidence; it is not by itself proof of a legal consent violation.'));timing.append(node('div','mt-3 text-[11px] '+(first.length?'text-amber-700':'text-green-700'),first.length?`${fmt(first.length)} example(s) where the first tracked request had no consent signal.`:'No missing-consent first requests detected.'));panel.append(timing);
      const target=document.querySelector('main');if(target)target.appendChild(panel);
    }else{
      hideLegacy('Successful vs blocked');hideLegacy('Events affected by blocking');
      const panel=node('section','mt-5 space-y-4');panel.setAttribute('data-ga4fix-evidence-semantics','1');const s=data.totals||{};
      const head=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');head.append(node('div','text-[10px] uppercase tracking-wide text-[var(--text-3)]','Ad blocker governance'),node('div','mt-1 text-sm font-semibold text-[var(--text)]','Observed delivery & blocker evidence'),node('div','mt-1 text-[10px] text-[var(--text-3)]',`${vendor.toUpperCase()} · last 24 hours`));const grid=node('div','mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5');grid.append(card('Observed events',fmt(s.events),'Captured by GA4Fix'),card('Successful deliveries',fmt(s.successful),'Observed delivery outcome = delivered'),card('Failed deliveries',fmt(s.failed),'Observed non-delivered outcomes'),card('Blocked signals',fmt(s.actionable_signals),'Confirmed or likely blocker evidence'),card('Affected event types',fmt(s.affected_events),'Events associated with actionable evidence'));head.append(grid);panel.append(head);
      const trend=node('div','rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4');trend.append(node('div','text-sm font-semibold text-[var(--text)]','14-day delivery and blocker trend'),node('div','mt-1 text-[10px] text-[var(--text-3)]','Successful delivery and blocker evidence are separate measures; a blocker signal does not claim an event was lost.'));const rows=data.trend||[];if(rows.length){const table=document.createElement('table');table.className='mt-3 w-full text-left';const tr=document.createElement('tr');['Date','Observed','Successful','Blocked signals','Confirmed','Likely'].forEach(h=>tr.append(node('th','px-2 py-2 text-[10px] uppercase text-[var(--text-3)]',h)));table.append(tr);for(const x of rows.slice(-14)){const rr=document.createElement('tr');rr.className='border-t border-[var(--border-soft)]';[new Date(x.day).toLocaleDateString(),fmt(x.events),fmt(x.successful),fmt(x.actionable),fmt(x.confirmed),fmt(x.likely)].forEach(v=>rr.append(node('td','px-2 py-2 text-[11px]',v)));table.append(rr)}trend.append(table)}else trend.append(node('div','mt-3 text-[11px] text-[var(--text-3)]','No trend data yet.'));panel.append(trend);
      const note=node('div','rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] text-blue-900','Evidence rule: ERR_BLOCKED_BY_CLIENT and equivalent explicit browser/client signals support confirmed blocking. CORS errors, HTTP errors, timeouts, missing matches, correlation gaps and telemetry gaps are not counted as blocked by themselves. “Blocked signals” is therefore not the same as “lost events.”');panel.append(note);
      const target=document.querySelector('main');if(target)target.appendChild(panel);
    }
   }catch{}
  };
  const observer=new MutationObserver(()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>void render(),120)});observer.observe(document.body,{childList:true,subtree:true});void render();return()=>{cancelled=true;if(timer)clearTimeout(timer);observer.disconnect()};
 },[vendor]);return null;
}
