'use client';

import { Card } from '../ui';

const TOPICS = [
  { title: 'Installing the GAfix tag', body: 'Add one Tag Manager or script tag to start monitoring.' },
  { title: 'Reading a tracking check', body: 'What the score, checkpoints, and severities mean.' },
  { title: 'Connecting alerts', body: 'Set up Slack, email, or a webhook for urgent issues.' },
  { title: 'Understanding possible repeats', body: 'Why the same action can be counted more than once.' },
];

export default function HelpCenterPage() {
  return (
    <div className="fade-in max-w-6xl">
      <h2 className="font-display text-h2 text-[var(--text)]">Help Center</h2>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--text-2)]">Guides for getting the most out of GAfix.</p>

      <div className="grid gap-3.5 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <Card key={topic.title} className="p-5">
            <div className="font-display text-[15px] font-semibold text-[var(--text)]">{topic.title}</div>
            <div className="mt-1.5 text-[13px] text-[var(--text-2)]">{topic.body}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-5 p-6 text-center">
        <div className="font-display text-[15px] font-semibold text-[var(--text)]">Still stuck?</div>
        <div className="mt-1.5 text-[13px] text-[var(--text-3)]">Email support@gafix.ai and we will get back to you within one business day.</div>
      </Card>
    </div>
  );
}
