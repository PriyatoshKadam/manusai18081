'use client';

import { Card, Pill } from '../ui';

const PEOPLE = [
  { name: 'Ayushi Saini', role: 'Owner', sites: 'All sites', active: 'Now' },
  { name: 'Priyatosh Kadam', role: 'Admin', sites: 'shop.example.com', active: '2h ago' },
];

export default function UserManagementPage() {
  return (
    <div className="fade-in max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-h2 text-[var(--text)]">User Management</h2>
          <p className="mt-1 text-[13.5px] text-[var(--text-2)]">People with access to this GAfix workspace.</p>
        </div>
        <button type="button" className="h-9 whitespace-nowrap rounded-full bg-[var(--accent)] px-4 text-[12.5px] font-semibold text-white hover:bg-[var(--accent-hover)]">+ Invite person</button>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1.1fr_1fr_1fr_70px] gap-4 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
          <div>Person</div><div>Role</div><div>Sites</div><div>Last active</div><div />
        </div>
        {PEOPLE.map((person) => (
          <div key={person.name} className="grid grid-cols-[1.6fr_1.1fr_1fr_1fr_70px] items-center gap-4 border-b border-[var(--border-soft)] px-5 py-3.5 last:border-0">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--tint)] text-xs font-bold text-[var(--accent)]">{person.name.charAt(0)}</span>
              <span className="truncate text-[13.5px] font-medium text-[var(--text)]">{person.name}</span>
            </div>
            <div><Pill tone={person.role === 'Owner' ? 'accent' : 'neutral'}>{person.role}</Pill></div>
            <div className="truncate text-[13px] text-[var(--text-2)]">{person.sites}</div>
            <div className="text-[12.5px] text-[var(--text-3)]">{person.active}</div>
            <div className="text-right text-[12px] text-[var(--text-3)]">···</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
