'use client';

import { Card } from '../ui';

const PLANS = [
  { name: 'Starter', price: '$99', per: '/mo', popular: false, cta: 'Start Starter', features: ['10 fix credits / month', 'Weekly monitoring', 'Email support'] },
  { name: 'Growth', price: '$199', per: '/mo', popular: true, cta: 'Start Growth', features: ['30 fix credits / month', 'Daily monitoring', 'Priority email + chat'] },
  { name: 'Advanced', price: '$399', per: '/mo', popular: false, cta: 'Start Advanced', features: ['Unlimited fix credits', 'Real-time monitoring', 'Dedicated specialist'] },
  { name: 'Enterprise', price: 'Custom', per: '', popular: false, cta: 'Talk to sales', features: ['Custom credits & SLA', 'White-glove monitoring', 'Dedicated team'] },
];

export default function PlansPage() {
  return (
    <div className="fade-in max-w-6xl">
      <h2 className="font-display text-h2 text-[var(--text)]">Choose a plan</h2>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--text-2)]">1 GA4 property per plan. Cancel anytime.</p>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="relative rounded-[14px] border bg-[var(--surface)] p-5"
            style={{ borderColor: plan.popular ? 'var(--accent)' : 'var(--border)' }}
          >
            {plan.popular ? (
              <span className="absolute -top-[11px] left-5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white">Most popular</span>
            ) : null}
            <div className="font-display text-[17px] font-semibold text-[var(--text)]">{plan.name}</div>
            <div className="my-3.5 font-display text-[28px] font-semibold text-[var(--text)]">
              {plan.price}
              <span className="text-[13px] font-normal text-[var(--text-3)]">{plan.per}</span>
            </div>
            <div className="space-y-2">
              {plan.features.map((f) => (
                <div key={f} className="flex items-start gap-2 text-[13px] text-[var(--text-2)]">
                  <span className="font-bold text-[var(--accent)]">✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 flex h-10 w-full items-center justify-center rounded-full bg-[var(--btn-dark)] text-[13px] font-semibold text-[var(--btn-dark-fg)] transition hover:bg-[var(--btn-dark-hover)]"
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--text-2)]">
        Every plan includes real-user tag monitoring, alerting, and a tracking check. Upgrade or downgrade at any time from Billing.
      </p>
    </div>
  );
}
