import Link from 'next/link';
import FlowSummaryGraph from './dashboard/flow-summary';

const liveEvents = [
  { time: '09:42:18', vendor: 'GA4', event: 'purchase', status: '204', latency: '312 ms', tone: 'lime', path: 'client-side' },
  { time: '09:42:17', vendor: 'Meta', event: 'Purchase', status: '204', latency: '428 ms', tone: 'blue', path: 'client-side' },
  { time: '09:42:15', vendor: 'GA4', event: 'login', status: '200', latency: '188 ms', tone: 'violet', path: 'server-side' },
  { time: '09:42:11', vendor: 'Ads', event: 'generate_lead', status: '200', latency: '224 ms', tone: 'amber', path: 'server-side' },
];

const capabilityGroups = [
  { eyebrow: 'MONITOR', title: 'See every meaningful fire', text: 'Vendor, event, response, latency, consent, session, revenue, and delivery mode stay attached to the same observation.', accent: 'lime', icon: '↗' },
  { eyebrow: 'DIAGNOSE', title: 'Explain why it happened', text: 'Separate duplicate dataLayer pushes, GTM fan-out, direct-code collisions, transport failures, consent behavior, and browser blocking.', accent: 'blue', icon: '◌' },
  { eyebrow: 'OPERATE', title: 'Route the signal that matters', text: 'Realtime critical incidents go to Slack while quieter evidence becomes a daily report your team can act on.', accent: 'violet', icon: '⌁' },
];

const evidenceRows = [
  ['dataLayer occurrence', 'event-1787210911'],
  ['network observations', '2 calls'],
  ['request status', '204 / 204'],
  ['consent signal', 'gcs G111 · granted'],
  ['probable cause', '2 tags / 1 trigger'],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070b12] text-white selection:bg-[#b8f56b] selection:text-[#07111f]">
      <nav className="sticky top-0 z-50 border-b border-white/[.08] bg-[#070b12]/85 text-white backdrop-blur-2xl">
        <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-lg shadow-black/30"><img src="/gafix-logo.png" alt="GAfix" className="h-full w-full object-contain" /></span>
            <span><span className="block text-lg font-semibold tracking-tight">GAfix<span className="text-[#b8f56b]">.</span></span><span className="block text-[9px] font-bold uppercase tracking-[.22em] text-slate-500">Real-user intelligence</span></span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
            <a href="#product" className="transition hover:text-white">Product</a>
            <a href="#flow" className="transition hover:text-white">Delivery flow</a>
            <a href="#evidence" className="transition hover:text-white">Evidence</a>
            <a href="#workflow" className="transition hover:text-white">Workflow</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white sm:block">Sign in</Link>
            <Link href="/signup" className="rounded-full bg-[#b8f56b] px-5 py-2.5 text-sm font-bold text-[#07111f] shadow-[0_0_28px_rgba(184,245,107,.18)] transition hover:bg-[#d2ff9b] active:scale-[.98]">Start monitoring</Link>
          </div>
        </div>
      </nav>

      <section className="relative isolate border-b border-white/[.08] bg-[#070b12]">
        <div className="gafix-hero-grid absolute inset-0 opacity-70" />
        <div className="absolute -left-32 top-16 h-96 w-96 rounded-full bg-[#6d8cff]/10 blur-3xl" />
        <div className="absolute right-[-12rem] top-24 h-[34rem] w-[34rem] rounded-full bg-[#b8f56b]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-16 px-5 pb-20 pt-16 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b8f56b]/25 bg-[#b8f56b]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-[#d8ffad]"><span className="gafix-pulse-dot h-2 w-2 rounded-full bg-[#b8f56b]" /> Live telemetry command center</div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[.94] tracking-[-.065em] text-white sm:text-6xl lg:text-[78px]">Tracking should tell you what broke <span className="text-[#b8f56b]">before the report does.</span></h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">GAfix watches real browsers, follows every event through the dataLayer and network, and turns delivery failures into evidence your analytics team can trust.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/signup" className="rounded-full bg-[#b8f56b] px-6 py-3.5 text-center text-sm font-bold text-[#07111f] transition hover:bg-[#d2ff9b] active:scale-[.98]">Start with one site <span className="ml-1">→</span></Link><a href="#flow" className="rounded-full border border-white/15 px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/5">Watch the event flow</a></div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span>✓ GTM Connect or manual fallback</span><span>✓ First evidence in seconds</span><span>✓ Consent-aware by design</span></div>
          </div>

          <TelemetryStage />
        </div>
      </section>

      <section id="product" className="border-b border-white/[.08] bg-[#0b111b] px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="dashboard-eyebrow text-[#8fa8ff]">The signal layer for your growth stack</p><h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-.05em] text-white sm:text-5xl">A monitoring product your analyst can actually operate.</h2></div><p className="max-w-xl text-base leading-7 text-slate-400">Every finding needs evidence, a probable cause, an owner-friendly next step, and a clear answer to the question: did this affect real users?</p></div>
          <div className="mt-14 grid gap-4 lg:grid-cols-3">{capabilityGroups.map((item) => <CapabilityCard key={item.title} {...item} />)}</div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><div className="gafix-depth-card rounded-[24px] border border-white/[.08] bg-[#111722] p-6 sm:p-8"><div className="flex items-start justify-between gap-5"><div><p className="dashboard-eyebrow text-[#b18cff]">What is connected right now</p><h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">One evidence model. Multiple diagnostic lenses.</h3></div><span className="rounded-full border border-[#a8f06a]/20 bg-[#a8f06a]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#cfff9d]">Live model</span></div><div className="mt-8 grid gap-3 sm:grid-cols-2"><SignalTile label="Sessions" value="Real-user timelines" tone="lime" /><SignalTile label="Duplicates" value="Fan-out evidence" tone="blue" /><SignalTile label="Ad-block" value="Confirmed vs gap" tone="rose" /><SignalTile label="Consent" value="GCS / GCD context" tone="violet" /></div></div><div className="gafix-depth-card rounded-[24px] border border-white/[.08] bg-[#111722] p-6 sm:p-8"><p className="dashboard-eyebrow text-[#f6b94c]">Built for the moment after a failed event</p><div className="mt-6 space-y-4"><MiniStat label="Critical incidents" value="Realtime" /><MiniStat label="Quieter signals" value="Daily digest" /><MiniStat label="Delivery paths" value="Client + server" /></div></div></div>
        </div>
      </section>

      <section id="flow" className="border-b border-white/[.08] bg-[#080d16] px-5 py-20 lg:px-8 lg:py-28"><div className="mx-auto max-w-7xl"><div className="mb-10 grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end"><div><p className="dashboard-eyebrow text-[#b8f56b]">Make the invisible route visible</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] text-white sm:text-5xl">One event. Two possible paths. Zero guesswork.</h2></div><p className="max-w-xl text-base leading-7 text-slate-400">Follow a purchase, login, or lead from the browser to the destination. GAfix keeps direct platform calls separate from first-party/server-side delivery when explaining browser-blocker impact.</p></div><FlowSummaryGraph sample /></div></section>

      <section id="evidence" className="border-b border-white/[.08] bg-[#0b111b] px-5 py-20 lg:px-8 lg:py-28"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="dashboard-eyebrow text-[#ff9aae]">Evidence, not assumptions</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] text-white sm:text-5xl">The timeline behind every alert.</h2><p className="mt-5 max-w-lg text-base leading-7 text-slate-400">When a conversion looks wrong, GAfix shows the browser event, the network call, the response, the consent signal, the session correlation, and the fix path in one place.</p><div className="mt-8 space-y-4"><ProofRow title="Vendor-aware" text="GA4, Ads, Meta, TikTok, and the broader vendor layer are labeled consistently." tone="lime" /><ProofRow title="Consent-aware" text="GCS/GCD network evidence is interpreted separately from defaults and cookieless measurement." tone="violet" /><ProofRow title="Session-safe" text="Repeated actions are correlated within a browser session without confusing separate visitors." tone="blue" /></div></div><div className="gafix-depth-card relative overflow-hidden rounded-[28px] border border-white/[.09] bg-[#111722] p-5 shadow-2xl shadow-black/30 sm:p-8"><div className="absolute right-[-4rem] top-[-4rem] h-48 w-48 rounded-full bg-[#ff718d]/10 blur-3xl" /><div className="relative flex items-center justify-between border-b border-white/[.08] pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Incident evidence</p><p className="mt-2 text-lg font-semibold text-white">login · GTM fan-out</p></div><span className="rounded-full bg-[#ff718d]/10 px-3 py-1 text-xs font-semibold text-[#ff9aae]">critical</span></div><div className="relative space-y-0 py-5">{evidenceRows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-white/[.06] py-3 text-sm"><span className="text-slate-500">{label}</span><span className="font-mono text-right text-[11px] text-slate-200">{value}</span></div>)}</div><div className="relative rounded-xl border border-[#b8f56b]/20 bg-[#b8f56b]/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#cfff9d]">Recommended fix</p><p className="mt-2 text-sm leading-6 text-slate-200">Open GTM Preview, inspect the login trigger, and keep only one GA4 Event tag on that firing path.</p></div></div></div></section>

      <section id="workflow" className="bg-[#080d16] px-5 py-20 lg:px-8 lg:py-28"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="dashboard-eyebrow text-[#8fa8ff]">A calm setup experience</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] text-white sm:text-5xl">From first install to confident alerting.</h2></div><div className="mt-12 grid gap-4 md:grid-cols-3"><Step n="01" title="Create a site" text="Add your domain and measurement IDs. GAfix creates a private evidence boundary for that site." /><Step n="02" title="Connect GTM" text="Use the recommended OAuth flow to create one monitor tag, review the workspace, and publish deliberately." /><Step n="03" title="Operate by evidence" text="Watch the live pulse, tune alert policy, verify Slack, and use the daily report for quieter signals." /></div><div className="mt-6 rounded-2xl border border-[#a8f06a]/15 bg-[#a8f06a]/[.06] p-5 text-sm text-[#cfff9d]"><strong>One installation rule:</strong> use Connect GTM, or the matching Manual GTM fallback. Never publish both monitor tags.</div></div></section>

      <section className="border-t border-white/[.08] bg-[#070b12] px-5 py-20 text-white lg:px-8 lg:py-28"><div className="gafix-cta-card mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-[30px] border border-white/[.1] bg-[#111722] p-8 sm:p-12 lg:flex-row lg:items-center"><div><p className="dashboard-eyebrow text-[#b8f56b]">The next broken tag is already happening</p><h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-.05em] text-white sm:text-5xl">Stop finding out from the report.</h2><p className="mt-4 max-w-xl text-slate-400">Start with one site, one monitor tag, and an evidence timeline your team can trust.</p></div><Link href="/signup" className="shrink-0 rounded-full bg-[#b8f56b] px-7 py-3.5 text-sm font-bold text-[#07111f] transition hover:bg-[#d2ff9b] active:scale-[.98]">Start monitoring →</Link></div></section>
      <footer className="border-t border-white/[.08] bg-[#070b12] px-5 pb-10 text-sm text-slate-500 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 pt-7 sm:flex-row sm:items-center"><span>© 2026 GAfix · Real-user tag observability</span><div className="flex gap-5"><Link href="/login" className="transition hover:text-white">Sign in</Link><Link href="/signup" className="transition hover:text-white">Start free</Link><a href="https://github.com/PriyatoshKadam/manusai18081" className="transition hover:text-white">Source</a></div></div></footer>
    </main>
  );
}

function TelemetryStage() {
  return (
    <div className="gafix-stage relative mx-auto w-full max-w-[700px] lg:ml-auto">
      <div className="gafix-stage-glow absolute inset-10 rounded-full bg-[#6d8cff]/10 blur-3xl" />
      <div className="gafix-stage-shell relative overflow-hidden rounded-[30px] border border-white/[.12] bg-[#0d1522]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(184,245,107,.12),transparent_32%),radial-gradient(circle_at_90%_80%,rgba(109,140,255,.12),transparent_34%)]" />
        <div className="relative flex items-center justify-between border-b border-white/[.08] pb-4">
          <div>
            <div className="flex items-center gap-2"><span className="gafix-pulse-dot h-2 w-2 rounded-full bg-[#b8f56b]" /><span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#cfff9d]">Live telemetry</span></div>
            <p className="mt-2 text-sm font-semibold text-white">Real browser signal, moving now</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-400">AUTO · 24H</span>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2 sm:gap-3"><StageMetric label="Fires / min" value="1,247" tone="lime" /><StageMetric label="Sessions" value="582" tone="blue" /><StageMetric label="At risk" value="₹18.4k" tone="rose" /></div>
        <EventConveyor />
        <div className="relative mt-4 grid gap-3 sm:grid-cols-[1fr_1.25fr]">
          <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Delivery map</span><span className="text-[10px] text-[#8fa8ff]">2 paths</span></div><MiniFlow /></div>
          <div className="rounded-2xl border border-[#ff718d]/20 bg-[#ff718d]/[.06] p-4">
            <div className="flex items-start gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff718d]/15 text-[#ff9aae]">!</span><div><p className="text-xs font-semibold text-white">Purchase delivery degraded</p><p className="mt-1 text-[11px] leading-5 text-slate-400">HTTP 500 · missing transaction_id · critical route</p></div></div>
            <div className="mt-4 flex items-center justify-between text-[10px]"><span className="text-slate-500">Detection confidence</span><strong className="text-[#ff9aae]">94%</strong></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="gafix-confidence-bar h-full w-[94%] rounded-full bg-[#ff718d]" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventConveyor() {
  return <div className="gafix-conveyor relative mt-5 overflow-hidden rounded-2xl border border-white/[.08] bg-[#080d16]/95 p-3 sm:p-4">
    <div className="mb-4 flex items-center justify-between"><div><span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Event conveyor</span><p className="mt-1 text-xs font-semibold text-white">New signals arrive, move, and become evidence</p></div><span className="font-mono text-[10px] text-[#b8f56b]">● receiving</span></div>
    <div className="gafix-conveyor-head hidden grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-2 pb-2 text-[9px] font-bold uppercase tracking-[.12em] text-slate-600 sm:grid"><span>Browser</span><span>Inspect</span><span>Destination</span><span>Alert bus</span></div>
    <div className="gafix-conveyor-track">
      <div className="gafix-conveyor-route gafix-conveyor-route-one" /><div className="gafix-conveyor-route gafix-conveyor-route-two" /><div className="gafix-conveyor-route gafix-conveyor-route-three" />
      <div className="gafix-conveyor-station gafix-conveyor-station-browser"><span className="gafix-station-dot bg-[#b8f56b]" /><span>browser</span></div><div className="gafix-conveyor-station gafix-conveyor-station-inspect"><span className="gafix-station-dot bg-[#8fa8ff]" /><span>inspect</span></div><div className="gafix-conveyor-station gafix-conveyor-station-destination"><span className="gafix-station-dot bg-[#b18cff]" /><span>destination</span></div><div className="gafix-conveyor-station gafix-conveyor-station-alert"><span className="gafix-station-dot bg-[#ff718d]" /><span>alert</span></div>
      {[...liveEvents, ...liveEvents].map((event, index) => <div key={`${event.time}-${event.event}-${index}`} className={`gafix-conveyor-card ${event.status === '500' ? 'is-alert' : ''}`} style={{ animationDelay: `${index * 2.1}s` }}><span className="font-mono text-[9px] text-slate-600">{event.time}</span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.tone === 'lime' ? 'bg-[#b8f56b]' : event.tone === 'blue' ? 'bg-[#8fa8ff]' : event.tone === 'violet' ? 'bg-[#b18cff]' : 'bg-[#f6b94c]'}`} /><span className="font-semibold text-slate-200">{event.event}</span><span className="text-[9px] text-slate-500">{event.vendor}</span><span className={`ml-auto rounded-full px-1.5 py-1 text-[9px] font-bold ${event.status === '500' ? 'bg-[#ff718d]/15 text-[#ff9aae]' : 'bg-[#b8f56b]/10 text-[#cfff9d]'}`}>{event.status === '500' ? 'alert' : event.status}</span></div>)}
    </div>
    <div className="mt-3 flex items-center justify-between rounded-xl border border-[#ff718d]/20 bg-[#ff718d]/[.06] px-3 py-2"><div className="flex items-center gap-2"><span className="gafix-alert-ping flex h-5 w-5 items-center justify-center rounded-full bg-[#ff718d]/20 text-[10px] font-bold text-[#ff9aae]">!</span><span className="text-[10px] font-semibold text-[#ffb1bf]">Alert detected: purchase delivery degraded</span></div><span className="font-mono text-[9px] text-[#ff9aae]">→ Slack · critical</span></div>
  </div>;
}

function LiveEvent({ event, index }: { event: (typeof liveEvents)[number]; index: number }) {
  return <div className="gafix-event-row flex items-center gap-2 rounded-xl border border-white/[.06] bg-white/[.035] px-2.5 py-2 text-[10px] sm:gap-3 sm:px-3"><span className="font-mono text-slate-600">{event.time}</span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.tone === 'lime' ? 'bg-[#b8f56b]' : event.tone === 'blue' ? 'bg-[#8fa8ff]' : event.tone === 'violet' ? 'bg-[#b18cff]' : 'bg-[#f6b94c]'}`} /><span className="w-10 font-semibold text-slate-400">{event.vendor}</span><span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{event.event}</span><span className={`hidden rounded-full px-2 py-1 font-bold sm:block ${event.path === 'server-side' ? 'bg-[#b8f56b]/10 text-[#cfff9d]' : 'bg-[#f6b94c]/10 text-[#ffd27a]'}`}>{event.path}</span><span className="font-mono text-slate-500">{event.status}</span><span className="hidden w-12 text-right font-mono text-slate-500 sm:block">{event.latency}</span><span className="gafix-row-beacon" style={{ animationDelay: `${index * 0.55}s` }} /></div>;
}

function StageMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  const text = tone === 'lime' ? 'text-[#cfff9d]' : tone === 'rose' ? 'text-[#ff9aae]' : 'text-[#aebcff]';
  return <div className="rounded-2xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-600">{label}</p><p className={`mt-2 text-xl font-semibold tracking-tight ${text}`}>{value}</p></div>;
}

function MiniFlow() {
  return <div className="mt-5 space-y-4"><div className="gafix-flow-line"><div className="gafix-flow-label"><span className="h-2 w-2 rounded-full bg-[#f6b94c]" /> browser → platform</div><div className="gafix-flow-track"><span className="gafix-flow-packet gafix-flow-packet-amber" /></div></div><div className="gafix-flow-line"><div className="gafix-flow-label"><span className="h-2 w-2 rounded-full bg-[#b8f56b]" /> browser → edge → vendor</div><div className="gafix-flow-track"><span className="gafix-flow-packet gafix-flow-packet-lime" /></div></div><div className="mt-5 flex justify-between text-[9px] font-mono text-slate-600"><span>browser</span><span>destination</span></div></div>;
}

function CapabilityCard({ eyebrow, title, text, accent, icon }: { eyebrow: string; title: string; text: string; accent: string; icon: string }) {
  const color = accent === 'lime' ? 'text-[#b8f56b]' : accent === 'blue' ? 'text-[#9db0ff]' : 'text-[#c4acff]';
  const border = accent === 'lime' ? 'hover:border-[#b8f56b]/40' : accent === 'blue' ? 'hover:border-[#6d8cff]/40' : 'hover:border-[#b18cff]/40';
  return <div className={`gafix-hover-lift rounded-[24px] border border-white/[.08] bg-[#111722] p-6 ${border}`}><div className="flex items-center justify-between"><p className={`text-[10px] font-bold uppercase tracking-[.18em] ${color}`}>{eyebrow}</p><span className={`text-xl ${color}`}>{icon}</span></div><h3 className="mt-10 text-xl font-semibold tracking-tight text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{text}</p><div className="mt-7 h-px bg-gradient-to-r from-white/10 to-transparent" /><p className="mt-4 text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">Evidence attached to every observation</p></div>;
}

function SignalTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  const dot = tone === 'lime' ? 'bg-[#b8f56b]' : tone === 'blue' ? 'bg-[#6d8cff]' : tone === 'rose' ? 'bg-[#ff718d]' : 'bg-[#b18cff]';
  return <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${dot}`} /><span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">{label}</span></div><p className="mt-3 text-sm font-semibold text-slate-200">{value}</p></div>;
}

function MiniStat({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-white/[.07] pb-3 last:border-0"><span className="text-sm text-slate-500">{label}</span><span className="font-mono text-xs text-slate-200">{value}</span></div>; }
function ProofRow({ title, text, tone }: { title: string; text: string; tone: string }) { const dot = tone === 'lime' ? 'bg-[#b8f56b] text-[#07111f]' : tone === 'violet' ? 'bg-[#b18cff] text-[#07111f]' : 'bg-[#6d8cff] text-[#07111f]'; return <div className="flex gap-3"><span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dot}`}>✓</span><div><p className="font-semibold text-white">{title}</p><p className="mt-1 text-sm leading-6 text-slate-400">{text}</p></div></div>; }
function Step({ n, title, text }: { n: string; title: string; text: string }) { return <div className="gafix-hover-lift rounded-[24px] border border-white/[.08] bg-[#111722] p-6"><span className="font-mono text-xs font-bold text-[#8fa8ff]">{n}</span><h3 className="mt-10 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{text}</p></div>; }
