'use client';

export const dynamic = 'force-dynamic';

export default function ConsentPage() {
  const cmps = [
    { name: 'OneTrust', status: 'Compatible', notes: 'Automatic detection when window.OneTrust is set.' },
    { name: 'Cookiebot', status: 'Compatible', notes: 'Reads window.Cookiebot state on every tag fire.' },
    { name: 'Iubenda', status: 'Compatible', notes: 'Reads _iub state via the consent-manager API.' },
    { name: 'Usercentrics', status: 'Compatible', notes: 'Consumes CMP getUserSession event.' },
    { name: 'Custom / other', status: 'Manual', notes: 'Set window.__g4f_consent = { ad_storage: "granted", ... } before monitor.js loads.' },
  ];
  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">Consent Mode v2</h2>
        <p className="text-sm text-ink-500 mt-0.5">
          GAfix reads your CMP&apos;s state on every tag fire and validates that consent-gated tags respect it.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100">
          <h3 className="font-semibold text-ink-950">Supported CMPs</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-500 uppercase bg-ink-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">CMP</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {cmps.map((c) => (
              <tr key={c.name} className="hover:bg-ink-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">
                  <span className={`pill ${c.status === 'Compatible' ? 'bg-green-100 text-green-800' : 'bg-ink-100 text-ink-700'}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-ink-500">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-5 rounded-xl border border-blue-100 bg-blue-50 text-sm text-blue-900">
        <b>Coming next:</b> Live consent-gated event validation, region-based signal spot checks, and CMP misconfiguration alerts.
      </div>
    </div>
  );
}
