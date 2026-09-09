'use client';

import Link from 'next/link';
import { Card, Pill } from '../ui';

const BILLING_ROWS: Array<{ product: string; type: string; price: string; tone: 'ok' | 'info' | 'neutral'; status: string; renews: string }> = [
  { product: 'Growth', type: 'Subscription', price: '$199/mo', tone: 'ok', status: 'Active', renews: 'Renews Sep 12, 2026' },
  { product: 'E-Commerce Stack', type: 'Add-on', price: '$599', tone: 'info', status: 'In progress', renews: 'Est. delivery Sep 22' },
  { product: 'Paid Ads Tracking', type: 'Add-on', price: '$449', tone: 'neutral', status: 'Completed', renews: 'Delivered Jun 24' },
];

export default function BillingPage() {
  return (
    <div className="fade-in max-w-6xl">
      <h2 className="font-display text-h2 text-[var(--text)]">Billing</h2>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--text-2)]">Manage your subscription, add-ons, and payment method.</p>

      <Card className="mb-6 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:items-center sm:p-5 lg:grid-cols-[repeat(4,1fr)_auto]">
        <div><div className="text-xs text-[var(--text-3)]">Monthly cost</div><div className="mt-1 font-display text-xl font-semibold text-[var(--text)]">$199</div></div>
        <div><div className="text-xs text-[var(--text-3)]">Next billing date</div><div className="mt-1 font-display text-xl font-semibold text-[var(--text)]">Sep 12, 2026</div></div>
        <div><div className="text-xs text-[var(--text-3)]">In-progress add-ons</div><div className="mt-1 font-display text-xl font-semibold text-[var(--text)]">1</div></div>
        <div><div className="text-xs text-[var(--text-3)]">Card on file</div><div className="mt-1 font-display text-xl font-semibold text-[var(--text)]">•••• 4242</div></div>
        <button type="button" className="h-9 whitespace-nowrap rounded-lg border border-[var(--border)] px-3.5 text-[12.5px] text-[var(--text)] hover:bg-[var(--surface-2)]">Update card</button>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] gap-3 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
          <div>Product</div><div>Type</div><div>Price</div><div>Status</div><div>Renews / expires</div>
        </div>
        {BILLING_ROWS.map((row) => (
          <div key={row.product} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3.5 last:border-0">
            <div className="text-[13.5px] font-semibold text-[var(--text)]">{row.product}</div>
            <div className="text-[13px] text-[var(--text-2)]">{row.type}</div>
            <div className="text-[13px] text-[var(--text)]">{row.price}</div>
            <div><Pill tone={row.tone}>{row.status}</Pill></div>
            <div className="text-xs text-[var(--text-2)]">{row.renews}</div>
          </div>
        ))}
      </Card>

      <p className="mt-5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--text-2)]">
        Need a different plan? <Link href="/dashboard/plans" className="font-semibold text-[var(--accent)]">Compare plans →</Link>
      </p>
    </div>
  );
}
