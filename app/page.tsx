import Link from 'next/link';
import FlowSummaryGraph from './dashboard/flow-summary';

const stream = [
  ['09:42:18', 'GA4', 'purchase', '200', '312 ms', 'ok'],
  ['09:42:17', 'Meta', 'Purchase', '204', '428 ms', 'ok'],
  ['09:42:15', 'GA4', 'login', '204', '188 ms', 'ok'],
  ['09:42:11', 'Google Ads', 'AW-4821 / lead', '—', '—', 'warn'],
  ['09:42:08', 'GA4', 'purchase', '500', '1.2 s', 'fail'],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9fc] text-[#07111f]">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-sm shadow-black/20"><img src="/gafix-logo.png" alt="GAfix" className="h-full w-full object-contain" /></span>
            <span className="text-lg font-semibold tracking-tight">GAfix<span className="text-[#b8f56b]">.</span></span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#product" className="transition hover:text-white">Product</a>
            <a href="#delivery" className="transition hover:text-white">Delivery flow</a>
            <a href="#evidence" className="transition hover:text-white">Evidence</a>
            <a href="#workflow" className="transition hover:text-white">Workflow</a>
            <a href="#security" className="transition hover:text-white">Security</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden text-sm text-slate-300 transition hover:text-white sm:block">Sign in</Link>
            <Link href="/signup" className="rounded-full bg-[#b8f56b] px-5 py-2.5 text-sm font-bold text-[#07111f] transition hover:bg-[#ccff8d] active:scale-[.98]">Start monitoring</Link>
          </div>
        </div>
      </nav>

      <section className="relative bg-[#07111f] text-white">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_20%,rgba(184,245,107,.18),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(98,132,255,.2),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b8f56b]/25 bg-[#b8f56b]/10 px-3 py-1.5 text-xs font-semibold text-[#d8ffad]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#b8f56b]" /> Real-user tag observability
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-[76px]">Know when tracking breaks<span className="text-[#b8f56b]">.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">GAfix watches every meaningful tag fire from real browsers, explains what happened, and routes the incidents that matter before reporting teams discover missing data.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="rounded-full bg-[#b8f56b] px-6 py-3.5 text-center text-sm font-bold text-[#07111f] transition hover:bg-[#d2ff9b] active:scale-[.98]">Start with one site <span className="ml-1">→</span></Link>
              <a href="#workflow" className="rounded-full border border-white/20 px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5">See the workflow</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400"><span>✓ No credit card</span><span>✓ GTM Connect or manual GTM fallback</span><span>✓ First evidence in seconds</span></div>
          </div>

          <div className="relative lg:pl-8">
            <div className="absolute -inset-8 rounded-[40px] bg-[#b8f56b]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[26px] border border-white/15 bg-[#0d1c2f] shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-xs font-semibold text-slate-400">LIVE EVIDENCE</p><p className="mt-1 text-sm font-medium">storefront.acme.com</p></div><span className="rounded-full bg-[#b8f56b]/15 px-2.5 py-1 text-[11px] font-semibold text-[#cfff9d]">● collecting</span></div>
              <div className="grid grid-cols-3 gap-3 p-5"><Metric label="Health" value="94" suffix="/100" tone="lime" /><Metric label="Fires / min" value="1,247" tone="blue" /><Metric label="At risk" value="₹18.4k" tone="red" /></div>
              <div className="px-5 pb-5"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Last observations</p><span className="text-[11px] text-slate-500">updates live</span></div><div className="space-y-2">{stream.map(([time, vendor, event, status, latency, state]) => <StreamRow key={`${time}-${vendor}-${event}`} time={time} vendor={vendor} event={event} status={status} latency={latency} state={state} />)}</div></div>
              <div className="border-t border-white/10 bg-[#091626] px-5 py-4"><div className="flex items-start gap-3"><span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-400/15 text-red-300">!</span><div><p className="text-sm font-semibold">Purchase delivery degraded</p><p className="mt-1 text-xs leading-5 text-slate-400">HTTP 500 · missing transaction_id · critical Slack route</p></div><span className="ml-auto text-[11px] text-slate-500">2s ago</span></div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="delivery" className="border-b border-slate-200 bg-[#f0f5f8]"><div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28"><div className="mb-10 grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#5d7f30]">Make the invisible route visible</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">One event. Two possible paths.</h2></div><p className="max-w-xl text-lg leading-8 text-slate-600">See whether a purchase, login, or lead went directly to a vendor platform—or reached your first-party/server-side endpoint first. GAfix keeps those paths separate when explaining browser-blocker impact.</p></div><FlowSummaryGraph sample /></div></section>

      <section id="product" className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28"><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#5d7f30]">The signal layer for your growth stack</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">A monitoring product your analyst can act on.</h2></div><p className="max-w-xl text-lg leading-8 text-slate-600">A beautiful dashboard is not enough. Every finding needs evidence, a probable cause, an owner-friendly next step, and a clear answer to the question: did this affect real users?</p></div><div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4"><Feature n="01" title="Every fire" text="Status, latency, request signature, consent state, revenue, and browser context attached to each observation." /><Feature n="02" title="Root cause" text="Separate a duplicate dataLayer push, GTM tag fan-out, direct-code collision, transport failure, and consent behavior." /><Feature n="03" title="Right urgency" text="Critical purchase and duplicate incidents in real time. Lower-severity evidence grouped into an operational digest." /><Feature n="04" title="No guesswork" text="Health, anomaly, synthetic, compliance, and integration views share one evidence model instead of competing dashboards." /></div></section>

      <section id="evidence" className="border-y border-slate-200 bg-white"><div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-28"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#5d7f30]">Evidence, not assumptions</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em]">The timeline behind every alert.</h2><p className="mt-5 max-w-lg text-base leading-7 text-slate-600">When a conversion looks wrong, GAfix shows the browser event, the network call, the response, the consent signal, the session correlation, and the fix path in one place.</p><div className="mt-8 space-y-4"><Bullet title="Vendor-aware" text="GA4, Ads, Meta, TikTok, and the broader vendor layer are labeled consistently." /><Bullet title="Consent-aware" text="GCS/GCD network evidence is interpreted separately from defaults and cookieless measurement." /><Bullet title="Session-safe" text="Repeated actions are correlated within a browser session without confusing separate visitors." /></div></div><div className="rounded-[26px] bg-[#07111f] p-5 text-white shadow-xl sm:p-7"><div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs uppercase tracking-[.16em] text-slate-500">Incident evidence</p><p className="mt-2 text-lg font-semibold">login · GTM fan-out</p></div><span className="rounded-full bg-red-400/15 px-3 py-1 text-xs font-semibold text-red-200">critical</span></div><div className="space-y-0 py-5"><EvidenceRow label="dataLayer occurrence" value="event-1787210911" /><EvidenceRow label="network observations" value="2 calls" /><EvidenceRow label="request status" value="204 / 204" /><EvidenceRow label="consent signal" value="gcs G111 · granted" /><EvidenceRow label="probable cause" value="2 tags / 1 trigger" /></div><div className="rounded-xl border border-[#b8f56b]/20 bg-[#b8f56b]/10 p-4"><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#cfff9d]">Recommended fix</p><p className="mt-2 text-sm leading-6 text-slate-200">Open GTM Preview, inspect the login trigger, and keep only one GA4 Event tag on that firing path.</p></div></div></div></section>

      <section id="workflow" className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28"><div className="max-w-2xl"><p className="text-sm font-bold uppercase tracking-[.18em] text-[#5d7f30]">A calm setup experience</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">From first install to confident alerting.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3"><Step n="01" title="Create a site" text="Add your domain and measurement IDs. GAfix creates a private evidence boundary for that site." /><Step n="02" title="Connect GTM" text="Use the recommended OAuth flow to create one monitor tag, review the workspace, and publish deliberately." /><Step n="03" title="Operate by evidence" text="Watch the live pulse, tune alert policy, verify Slack, and use the 24-hour report for the quieter signals." /></div><div className="mt-6 rounded-2xl border border-[#d8e7bc] bg-[#f4fbe9] p-5 text-sm text-[#456020]"><strong>One installation rule:</strong> use Connect GTM, or the matching Manual GTM fallback. Never publish both monitor tags.</div></section>

      <section id="security" className="bg-[#eaf3ff]"><div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1fr] lg:px-8"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#426aa8]">Built for accountable teams</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em]">Fast enough for incidents. Clear enough for audits.</h2></div><div className="grid gap-4 sm:grid-cols-2"><Mini title="Consent Mode v2" text="GCS/GCD evidence, GPC and DNT context, and no false denied-consent claims from a stale default." /><Mini title="Supply-chain signals" text="CSP violations, missing SRI on sensitive paths, unknown resource domains, and allowlist evidence." /><Mini title="Delivery health" text="Slack, email, signed webhooks, retries, and daily digest states visible from Integrations." /><Mini title="Operator exports" text="CSV and JSON evidence exports for events, alerts, revenue, and synthetic runs." /></div></div></section>

      <section className="bg-[#07111f] px-6 py-20 text-white lg:py-28"><div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 rounded-[28px] border border-white/10 bg-white/5 p-8 sm:p-12 lg:flex-row lg:items-center"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#b8f56b]">The next broken tag is already happening</p><h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Stop finding out from the report.</h2><p className="mt-4 max-w-xl text-slate-300">Start with one site, one monitor tag, and an evidence timeline your team can trust.</p></div><Link href="/signup" className="shrink-0 rounded-full bg-[#b8f56b] px-7 py-3.5 text-sm font-bold text-[#07111f] transition hover:bg-[#d2ff9b] active:scale-[.98]">Start monitoring →</Link></div></section>

      <footer className="bg-[#07111f] px-6 pb-10 text-sm text-slate-500"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 border-t border-white/10 pt-7 sm:flex-row sm:items-center lg:px-2"><span>© 2026 GAfix · Real-user tag observability</span><div className="flex gap-5"><Link href="/login" className="hover:text-white">Sign in</Link><Link href="/signup" className="hover:text-white">Start free</Link><a href="https://github.com/PriyatoshKadam/manusai18081" className="hover:text-white">Source</a></div></div></footer>
    </main>
  );
}

function Metric({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone: string }) { const color = tone === 'lime' ? 'text-[#cfff9d]' : tone === 'red' ? 'text-red-300' : 'text-sky-300'; return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase tracking-[.12em] text-slate-500">{label}</p><p className={`mt-2 text-xl font-semibold ${color}`}>{value}<span className="text-xs text-slate-500">{suffix}</span></p></div>; }
function StreamRow({ time, vendor, event, status, latency, state }: { time: string; vendor: string; event: string; status: string; latency: string; state: string }) { const tone = state === 'fail' ? 'text-red-300' : state === 'warn' ? 'text-amber-300' : 'text-[#cfff9d]'; return <div className="grid grid-cols-[54px_72px_1fr_40px_48px] items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-white/5"><span className="font-mono text-[10px] text-slate-600">{time}</span><span className="text-slate-400">{vendor}</span><span className="truncate text-slate-200">{event}</span><span className={tone}>{state === 'fail' ? 'fail' : status}</span><span className="text-right text-[10px] text-slate-500">{latency}</span></div>; }
function Feature({ n, title, text }: { n: string; title: string; text: string }) { return <div className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:border-[#b7d887] hover:shadow-xl hover:shadow-slate-200/60"><span className="font-mono text-xs text-[#769b3e]">{n}</span><h3 className="mt-10 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{text}</p></div>; }
function Bullet({ title, text }: { title: string; text: string }) { return <div className="flex gap-3"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e6f4ca] text-xs font-bold text-[#5d7f30]">✓</span><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></div>; }
function EvidenceRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-white/5 py-3 text-sm"><span className="text-slate-500">{label}</span><span className="font-mono text-xs text-slate-200">{value}</span></div>; }
function Step({ n, title, text }: { n: string; title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="font-mono text-xs font-bold text-[#769b3e]">{n}</span><h3 className="mt-10 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{text}</p></div>; }
function Mini({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl border border-[#cfe0f4] bg-white/70 p-5"><h3 className="font-semibold text-[#112a4a]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>; }
