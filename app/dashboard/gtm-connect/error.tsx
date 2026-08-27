'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function GtmConnectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('GTM Connect page error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center">
      <section className="w-full rounded-2xl border border-[#f6b94c]/20 bg-[#111722] p-8 text-center shadow-2xl shadow-black/20">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f6b94c]/10 text-2xl text-[#ffd27a]">!</div>
        <div className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-[#ffd27a]">GTM connection interrupted</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">The GTM setup page could not finish loading.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">Your monitored site and existing analytics tags are not changed by this page error. Retry the page, then refresh the Google connection or use the manual Script installation path if the provider session has expired.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-[#a8f06a] px-5 py-3 text-sm font-semibold text-[#09100a] hover:bg-[#c5ff91]">Try again</button>
          <Link href="/dashboard/install" className="rounded-xl border border-white/[.12] px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/[.06]">Open Script installation</Link>
        </div>
        <p className="mt-5 text-xs text-slate-500">If retrying continues to fail, check the Render deployment logs for the GTM API response or database migration status. Do not paste OAuth secrets or API keys into support messages.</p>
      </section>
    </div>
  );
}
