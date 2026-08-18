import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-ink-200 bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-ink-950 flex items-center justify-center text-white font-bold text-sm">G4</div>
            <span className="font-semibold text-ink-950">GA4Fix</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-ink-600">
            <a href="#features" className="hover:text-ink-950">Features</a>
            <a href="#how" className="hover:text-ink-950">How it works</a>
            <a href="#usecases" className="hover:text-ink-950">Use cases</a>
            <a href="#pricing" className="hover:text-ink-950">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-ink-600 hover:text-ink-950">Log in</Link>
            <Link href="/signup" className="text-sm bg-ink-950 text-white px-4 py-2 rounded-lg hover:bg-ink-800">Start free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60"></div>
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 pill bg-brand-500/10 text-brand-700 mb-6">
            <span className="dot bg-brand-600"></span>
            Now with root-cause analysis for duplicate events
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-ink-950 leading-[1.05] mb-6">
            Catch broken tags<br/>before your CEO does.
          </h1>
          <p className="text-lg md:text-xl text-ink-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Real-user monitoring for GA4, Google Ads, Meta, TikTok and 15+ other pixels. Paste one line of code and know within seconds when a tag misfires, an event duplicates, or an ad blocker eats your revenue.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link href="/signup" className="bg-ink-950 text-white px-6 py-3 rounded-lg hover:bg-ink-800 font-medium">Start monitoring free</Link>
            <a href="#how" className="border border-ink-200 px-6 py-3 rounded-lg hover:bg-ink-50 font-medium text-ink-800">See how it works →</a>
          </div>
          <p className="text-xs text-ink-400">Free forever for 1 site · No credit card · Setup in 60 seconds</p>
        </div>

        {/* Product preview */}
        <div className="relative max-w-5xl mx-auto px-6 pb-24">
          <div className="rounded-2xl border border-ink-200 bg-white shadow-[0_20px_60px_-20px_rgba(10,11,13,0.15)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 bg-ink-50">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <div className="ml-3 text-xs text-ink-400 mono">app.ga4fix.com/dashboard</div>
            </div>
            <div className="p-6 bg-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Events / min" value="1,247" delta="+12% vs avg" deltaClass="text-green-600" />
                <StatCard label="Missing param" value="3" delta="purchase.currency" deltaClass="text-red-600" valueClass="text-red-600" />
                <StatCard label="Duplicate events" value="12" delta="page_view" deltaClass="text-amber-600" valueClass="text-amber-600" />
                <StatCard label="Ad-blocker rate" value="18%" delta="of sessions" deltaClass="text-ink-500" />
              </div>
              <div className="space-y-2">
                <AlertRow severity="Critical" color="red" msg={<><b>Purchase</b> event fired without <span className="mono text-xs bg-white px-1 rounded">currency</span> parameter</>} time="2m ago" />
                <AlertRow severity="Warning" color="amber" msg={<><b>page_view</b> fired 3× per pageload — dataLayer pushed twice</>} time="5m ago" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="text-sm font-medium text-brand-600 mb-2">Why GA4Fix</div>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-950">Stop losing revenue to silent tag failures</h2>
          <p className="text-ink-500 mt-3 max-w-2xl mx-auto">Google won&apos;t tell you when a tag breaks. Your analyst finds out three weeks later during month-end. GA4Fix tells you in under 2 seconds.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Feature title="Real-user detection" desc="Catches issues in actual visitor sessions — not synthetic checks that miss consent-gated tags." bg="bg-red-50" fg="text-red-600" iconD="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <Feature title="Root-cause hints" desc={`Doesn\u2019t just say "duplicate event" — tells you the dataLayer was pushed twice, or the tag has no trigger filter.`} bg="bg-amber-50" fg="text-amber-600" iconD="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <Feature title="Ad-blocker aware" desc="Fallback beacon on your own first-party domain still reports even when the ad blocker eats the main script." bg="bg-green-50" fg="text-green-600" iconD="M9 12l2 2 4-4" />
          <Feature title="5-line install" desc="One custom HTML tag in GTM. No Node, no CDN config, no dependencies. Paste and done." bg="bg-blue-50" fg="text-blue-600" iconD="M12 2v4M12 18v4M4.93 4.93l2.83 2.83" />
          <Feature title="Per-destination view" desc="Separate tabs for GA4, Google Ads, Meta, TikTok — each with vendor-specific validations." bg="bg-purple-50" fg="text-purple-600" iconD="M3 3v18h18" />
          <Feature title="Plain-English alerts" desc="&quot;Your purchase event is missing currency. This will break Google Ads ROAS reporting.&quot; Not &quot;MISSING_PARAM_ERR_403&quot;." bg="bg-pink-50" fg="text-pink-600" iconD="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-ink-50 border-y border-ink-100">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <div className="text-sm font-medium text-brand-600 mb-2">How it works</div>
            <h2 className="text-3xl md:text-4xl font-bold text-ink-950">From install to first alert in 60 seconds</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Step n={1} title="Add your site" desc="Sign up, add your domain, and paste your GTM container ID and GA4 measurement ID so we can validate against them.">
              <div className="rounded-lg bg-ink-50 p-3 mono text-xs text-ink-600">shop.acme.com<br/>GTM-KWDMK2K9<br/>G-XXXXXXXXXX</div>
            </Step>
            <Step n={2} title="Paste one snippet" desc="Copy 5 lines of code into a Custom HTML tag in GTM. Fires on All Pages. Done.">
              <div className="rounded-lg bg-ink-950 p-3 mono text-[10px] text-green-300 leading-relaxed overflow-hidden">&lt;script&gt;(function(k,c){'{'}...{'}'})...&lt;/script&gt;</div>
            </Step>
            <Step n={3} title="Watch it live" desc="Events start streaming into your dashboard within seconds. Slack + email alerts fire when anything looks off.">
              <div className="flex items-center gap-2 text-sm">
                <span className="dot bg-green-500"></span>
                <span className="text-ink-800">Live · 47 events streaming</span>
              </div>
            </Step>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="usecases" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="text-sm font-medium text-brand-600 mb-2">Who uses it</div>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-950">Built for the people who own the tags</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <UseCase title="For analytics teams" desc="Know within 2 seconds when a developer's release breaks tracking. Correlate every alert with the GTM version that shipped." bullets={['GTM change → alert timeline', 'Consent Mode v2 verification', 'Missing-param validation per event']} />
          <UseCase title="For paid media teams" desc="Stop discovering broken conversions during Monday morning ROAS reviews. Get pinged the moment Google Ads or Meta stops firing." bullets={['Revenue-at-risk calculation per alert', 'Enhanced conversions parameter checks', 'Ad blocker impact by destination']} />
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-ink-950 mb-4">Ready to see what&apos;s actually firing?</h2>
        <p className="text-ink-500 mb-8">Free for your first site. No credit card. 60 seconds to install.</p>
        <Link href="/signup" className="inline-block bg-ink-950 text-white px-8 py-3.5 rounded-lg hover:bg-ink-800 font-medium">Start monitoring free →</Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-200 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-ink-950 flex items-center justify-center text-white font-bold text-xs">G4</div>
            <span className="text-sm text-ink-500">© 2026 GA4Fix</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-ink-500">
            <a href="#" className="hover:text-ink-950">Docs</a>
            <a href="#" className="hover:text-ink-950">Privacy</a>
            <a href="#" className="hover:text-ink-950">Terms</a>
            <a href="#" className="hover:text-ink-950">Status</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatCard({ label, value, delta, deltaClass = '', valueClass = '' }: any) {
  return (
    <div className="p-4 rounded-lg bg-ink-50">
      <div className="text-xs text-ink-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueClass}`}>{value}</div>
      <div className={`text-xs mt-1 ${deltaClass}`}>{delta}</div>
    </div>
  );
}

function AlertRow({ severity, color, msg, time }: any) {
  const bg = color === 'red' ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50';
  const chip = color === 'red' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900';
  const dotColor = color === 'red' ? 'bg-red-600' : 'bg-amber-600';
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${bg}`}>
      <span className={`pill ${chip}`}><span className={`dot ${dotColor}`}></span>{severity}</span>
      <span className="text-sm text-ink-800">{msg}</span>
      <span className="ml-auto text-xs text-ink-400">{time}</span>
    </div>
  );
}

function Feature({ title, desc, bg, fg, iconD }: any) {
  return (
    <div className="p-6 rounded-xl border border-ink-200 hover:border-ink-300 transition">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center ${fg} mb-4`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={iconD} /></svg>
      </div>
      <h3 className="font-semibold text-ink-950 mb-2">{title}</h3>
      <p className="text-sm text-ink-500">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc, children }: any) {
  return (
    <div className="bg-white rounded-xl border border-ink-200 p-6">
      <div className="w-8 h-8 rounded-full bg-ink-950 text-white flex items-center justify-center font-semibold text-sm mb-4">{n}</div>
      <h3 className="font-semibold text-ink-950 mb-2">{title}</h3>
      <p className="text-sm text-ink-500 mb-4">{desc}</p>
      {children}
    </div>
  );
}

function UseCase({ title, desc, bullets }: any) {
  return (
    <div className="p-8 rounded-xl border border-ink-200">
      <h3 className="font-semibold text-lg text-ink-950 mb-2">{title}</h3>
      <p className="text-sm text-ink-500 mb-4">{desc}</p>
      <ul className="space-y-2 text-sm text-ink-700">
        {bullets.map((b: string) => (
          <li key={b} className="flex gap-2"><span className="text-green-600">✓</span> {b}</li>
        ))}
      </ul>
    </div>
  );
}
