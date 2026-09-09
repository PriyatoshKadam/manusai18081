'use client';

import { Card } from '../ui';

export default function AdminPage() {
  return (
    <div className="fade-in max-w-6xl">
      <h2 className="font-display text-h2 text-[var(--text)]">Admin</h2>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--text-2)]">Account-wide configuration for your GAfix organization.</p>
      <Card className="p-10 text-center">
        <div className="font-display text-[17px] font-semibold text-[var(--text)]">Nothing needs your attention</div>
        <div className="mt-1.5 text-[13px] text-[var(--text-3)]">Organization-wide controls — data retention, workspace roles, and API access — will appear here.</div>
      </Card>
    </div>
  );
}
