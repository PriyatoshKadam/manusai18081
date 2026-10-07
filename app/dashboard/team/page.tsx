'use client';

import { useEffect, useState } from 'react';

const roles = [
  { name: 'Owner', tone: 'var(--crit-fg)', summary: 'Full workspace control', permissions: ['Billing & workspace', 'Sites & integrations', 'Alerts & detection', 'Team access', 'API keys'] },
  { name: 'Admin', tone: 'var(--accent)', summary: 'Operational administration', permissions: ['Sites & integrations', 'Alerts & detection', 'Team access', 'Audit history'] },
  { name: 'Analyst', tone: 'var(--gafix-blue)', summary: 'Investigate tracking health', permissions: ['All monitoring views', 'Evidence & diagnostics', 'Acknowledge / resolve alerts', 'Personal alert preferences'] },
  { name: 'Viewer', tone: 'var(--text-3)', summary: 'Read-only monitoring access', permissions: ['Dashboard', 'Platform monitoring', 'Alerts', 'Revenue'] },
];

export default function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [siteCount, setSiteCount] = useState(0);

  useEffect(() => {
    fetch('/api/sites', { cache: 'no-store' }).then((r) => r.json()).then((body) => setSiteCount((body.sites || []).length)).catch(() => {});
  }, []);

  return (
    <div className="fade-in max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="dashboard-eyebrow">Workspace access</p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--text)]">Team</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-2)]">Control who can investigate tracking issues, change monitoring, and manage workspace access.</p>
        </div>
        <button type="button" onClick={() => setShowInvite(true)} className="rounded-xl bg-[var(--btn-dark)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--btn-dark-hover)]">+ Invite member</button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Members" value="1" note="Current workspace owner" />
        <Metric label="Sites" value={String(siteCount)} note="Websites in this workspace" />
        <Metric label="Access model" value="Role based" note="Owner · Admin · Analyst · Viewer" />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
          <div>
            <h3 className="font-semibold text-[var(--text)]">Members</h3>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">Workspace-level access and role assignment.</p>
          </div>
          <span className="status-pill" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)' }}><span className="status-dot" style={{ background: 'var(--ok-dot)' }} />Active</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 bg-[var(--surface-2)] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--text-3)]">
          <span>Member</span><span>Role</span><span>Status</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr] items-center gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--mon)] text-sm font-bold text-white">O</span>
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">Workspace owner</div>
              <div className="text-xs text-[var(--text-3)]">You · primary account</div>
            </div>
          </div>
          <span className="status-pill w-fit" style={{ background: 'var(--tint)', color: 'var(--accent)' }}>Owner</span>
          <span className="text-sm text-[var(--ok-fg)]">Active</span>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">Role permissions</h3>
          <p className="mt-1 text-sm text-[var(--text-2)]">A clear baseline for the access model used across GAfix.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {roles.map((role) => (
            <div key={role.name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
              <div className="h-1.5 w-10 rounded-full" style={{ background: role.tone }} />
              <h4 className="mt-4 font-semibold text-[var(--text)]">{role.name}</h4>
              <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">{role.summary}</p>
              <div className="mt-4 space-y-2.5">
                {role.permissions.map((permission) => <div key={permission} className="flex gap-2 text-xs text-[var(--text-2)]"><span className="mt-0.5 text-[var(--ok-fg)]">✓</span><span>{permission}</span></div>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <h3 className="font-semibold text-[var(--text)]">Site-level access</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-2)]">When you add more people, assign access per monitored website so agency and client teams only see the properties they need.</p>
          <div className="mt-5 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">Recommended model</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {['No access', 'View', 'Investigate', 'Manage'].map((value) => <div key={value} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text-2)]">{value}</div>)}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <h3 className="font-semibold text-[var(--text)]">Audit history</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-2)]">Track access changes, monitoring changes, integration updates, and alert-policy edits in one place.</p>
          <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-4 text-xs text-[var(--text-3)]">Audit log becomes populated as team members and workspace changes are introduced.</div>
        </div>
      </section>

      {showInvite ? <InviteModal onClose={() => setShowInvite(false)} /> : null}
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--text-3)]">{label}</div><div className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div><div className="mt-1 text-xs text-[var(--text-3)]">{note}</div></div>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[2px]">
    <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="dashboard-eyebrow">Team access</p><h3 className="mt-1 font-display text-xl font-semibold text-[var(--text)]">Invite a member</h3><p className="mt-1 text-sm leading-5 text-[var(--text-2)]">Set up the access details now. The invitation delivery flow will use the same role and site model.</p></div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-[var(--text-3)] hover:bg-[var(--surface-3)]" aria-label="Close">×</button>
      </div>
      <div className="mt-5 space-y-4">
        <Field label="Work email" placeholder="name@company.com" />
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">Role</span><select className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"><option>Analyst</option><option>Admin</option><option>Viewer</option></select></label>
        <div><div className="mb-1 text-xs font-semibold text-[var(--text-2)]">Site access</div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-3)]">Site-level selection will appear here once workspace members are enabled.</div></div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
        <button type="button" onClick={onClose} className="rounded-xl bg-[var(--btn-dark)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--btn-dark-hover)]">Save invite draft</button>
      </div>
    </div>
  </div>;
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-[var(--text-2)]">{label}</span><input placeholder={placeholder} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--accent)]" /></label>;
}
