type FlowRow = {
  delivery_mode?: string | null;
  events?: number | string | null;
  sessions?: number | string | null;
  failures?: number | string | null;
  destinations?: number | string | null;
  domains?: string[] | null;
  blocked?: number | string | null;
};

type FlowSummaryGraphProps = {
  rows?: FlowRow[];
  blockedRows?: FlowRow[];
  sample?: boolean;
  compact?: boolean;
};

const sampleRows: FlowRow[] = [
  { delivery_mode: 'client_side', events: 1247, sessions: 582, failures: 18, destinations: 3, domains: ['www.google-analytics.com', 'www.facebook.com', 'analytics.tiktok.com'], blocked: 34 },
  { delivery_mode: 'server_side', events: 1193, sessions: 561, failures: 3, destinations: 1, domains: ['events.acme.com'], blocked: 0 },
];

const sampleEvents = [
  { time: '09:42:18', name: 'purchase', vendor: 'GA4', path: 'client_side', status: '204', latency: '312 ms' },
  { time: '09:42:17', name: 'Purchase', vendor: 'Meta', path: 'client_side', status: '204', latency: '428 ms' },
  { time: '09:42:15', name: 'login', vendor: 'GA4', path: 'server_side', status: '200', latency: '188 ms' },
  { time: '09:42:11', name: 'generate_lead', vendor: 'Ads', path: 'server_side', status: '200', latency: '224 ms' },
];

function number(value: unknown) { return Number(value || 0).toLocaleString(); }
function rowFor(rows: FlowRow[], mode: string) { return rows.find((row) => row.delivery_mode === mode) || {}; }
function domains(row: FlowRow, fallback: string[]) { return row.domains?.filter(Boolean).slice(0, 3).length ? row.domains!.filter(Boolean).slice(0, 3) : fallback; }

export default function FlowSummaryGraph({ rows = [], blockedRows = [], sample = false, compact = false }: FlowSummaryGraphProps) {
  const source = rows.length ? rows : sample ? sampleRows : [];
  const client = rowFor(source, 'client_side');
  const server = rowFor(source, 'server_side');
  const unknown = rowFor(source, 'unknown');
  const clientBlocked = Number(rowFor(blockedRows.length ? blockedRows : source, 'client_side').blocked || client.blocked || 0);
  const serverBlocked = Number(rowFor(blockedRows, 'server_side').blocked || server.blocked || 0);
  const clientDomains = domains(client, ['google-analytics.com', 'facebook.com', 'analytics.tiktok.com']);
  const serverDomains = domains(server, ['events.your-domain.com']);
  const hasEvidence = source.length > 0;

  return <section className={`overflow-hidden rounded-[24px] border border-white/[.08] bg-[#111722] shadow-2xl shadow-black/20 ${compact ? '' : 'shadow-black/20'}`}>
    <div className="flex flex-col gap-3 border-b border-white/[.08] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#b8f56b]">How tracking reached the platform</div><h3 className="mt-1.5 text-xl font-semibold tracking-tight text-white">How did the action travel?</h3><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">With browser-based tracking, the visitor’s browser contacts the platform directly. With server-based tracking, the browser reaches your own tracking address first, which may still work when platform addresses are blocked.</p></div><span className="w-fit rounded-full border border-[#a8f06a]/20 bg-[#a8f06a]/10 px-3 py-1.5 text-xs font-semibold text-[#cfff9d]">24h evidence window</span>
    </div>
    <div className="p-4 sm:p-7">
      <div className="overflow-x-auto rounded-2xl bg-[#07111f] p-3 sm:p-5">
        <svg viewBox="0 0 1000 250" role="img" aria-label="Client-side and server-based event delivery flow" className="min-w-[760px] w-full">
          <defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#8ca1b9" /></marker><marker id="flow-arrow-lime" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#b8f56b" /></marker></defs>
          <text x="28" y="22" fill="#6b7f96" fontSize="11" fontWeight="700" letterSpacing="2">VISITOR BROWSER</text>
          <text x="310" y="22" fill="#6b7f96" fontSize="11" fontWeight="700" letterSpacing="2">TRACKING ROUTE</text>
          <text x="680" y="22" fill="#6b7f96" fontSize="11" fontWeight="700" letterSpacing="2">WHERE IT ARRIVED</text>
          <path d="M162 95 H292" stroke="#8ca1b9" strokeWidth="2" markerEnd="url(#flow-arrow)" />
          <path d="M530 95 H655" stroke="#8ca1b9" strokeWidth="2" markerEnd="url(#flow-arrow)" />
          <path d="M162 182 H292" stroke="#b8f56b" strokeWidth="2" markerEnd="url(#flow-arrow-lime)" />
          <path d="M530 182 H655" stroke="#b8f56b" strokeWidth="2" markerEnd="url(#flow-arrow-lime)" />
          <rect x="25" y="58" width="138" height="72" rx="14" fill="#10243b" stroke="#27415e" /><text x="45" y="85" fill="#dbeafe" fontSize="14" fontWeight="700">Visitor action</text><text x="45" y="106" fill="#7f95ad" fontSize="12">purchase · login</text>
          <rect x="25" y="145" width="138" height="72" rx="14" fill="#10243b" stroke="#27415e" /><text x="45" y="172" fill="#dbeafe" fontSize="14" fontWeight="700">Visitor action</text><text x="45" y="193" fill="#7f95ad" fontSize="12">purchase · login</text>
          <rect x="292" y="58" width="238" height="72" rx="14" fill="#172c42" stroke="#36516e" /><circle cx="316" cy="84" r="6" fill="#fbbf24" /><text x="333" y="89" fill="#f8fafc" fontSize="14" fontWeight="700">Browser-based tracking</text><text x="316" y="110" fill="#94a9c0" fontSize="12">browser → platform</text>
          <rect x="292" y="145" width="238" height="72" rx="14" fill="#182e27" stroke="#466e45" /><circle cx="316" cy="171" r="6" fill="#b8f56b" /><text x="333" y="176" fill="#f8fafc" fontSize="14" fontWeight="700">Server-based tracking</text><text x="316" y="197" fill="#a9c9a1" fontSize="12">browser → your address → platform</text>
          <rect x="655" y="58" width="315" height="72" rx="14" fill="#172436" stroke="#36516e" /><text x="677" y="84" fill="#f8fafc" fontSize="13" fontWeight="700">Platform addresses</text><text x="677" y="106" fill="#94a9c0" fontSize="11">{clientDomains.join(' · ')}</text>
          <rect x="655" y="145" width="315" height="72" rx="14" fill="#182e27" stroke="#466e45" /><text x="677" y="171" fill="#f8fafc" fontSize="13" fontWeight="700">Your tracking address</text><text x="677" y="193" fill="#a9c9a1" fontSize="11">{serverDomains.join(' · ')}</text>
          <text x="180" y="91" fill="#fbbf24" fontSize="11" fontWeight="700">direct</text><text x="180" y="178" fill="#b8f56b" fontSize="11" fontWeight="700">proxied</text>
        </svg>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <PathCard title="Client-side path" tone="amber" row={client} blocked={clientBlocked} domains={clientDomains} description="The visitor’s browser contacts the analytics platform directly. Browser privacy tools may stop the request before the platform receives the action." />
        <PathCard title="Server-based route" tone="lime" row={server} blocked={serverBlocked} domains={serverDomains} description="The visitor’s browser reaches your tracking address first. GAfix keeps this route separate so a blocked browser request is not incorrectly called a failed server-based event." />
      </div>
      {unknown.events || !hasEvidence ? <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[.04] px-4 py-3 text-xs leading-5 text-slate-400">{hasEvidence ? `${number(unknown.events)} action(s) have an unknown destination. Add the website’s tracking address or review the request destination before calling the route browser-based or server-based.` : 'Waiting for request details. GAfix classifies the route from the destination it observed; a website announcement without a matching request remains unclassified.'}</div> : null}
      {sample ? <div className="mt-6 border-t border-white/[.08] pt-5"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#b8f56b]">Example action stream</p><p className="mt-1 text-sm font-semibold text-white">The same kinds of actions can use two routes</p></div><span className="font-mono text-[10px] text-slate-400">EXAMPLE</span></div><div className="space-y-2">{sampleEvents.map((event) => <div key={`${event.time}-${event.name}-${event.path}`} className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-xl bg-white/[.04] px-3 py-2.5 text-xs sm:grid-cols-[72px_1fr_130px_72px_70px]"><span className="font-mono text-[10px] text-slate-400">{event.time}</span><span className="min-w-0 truncate font-semibold text-white">{event.name}<span className="ml-2 font-normal text-slate-400">{event.vendor}</span></span><span className={`hidden rounded-full px-2 py-1 text-center text-[10px] font-bold sm:block ${event.path === 'server_side' ? 'bg-[#a8f06a]/10 text-[#cfff9d]' : 'bg-[#f6b94c]/10 text-[#ffd27a]'}`}>{event.path === 'server_side' ? 'server-based' : 'browser-based'}</span><span className="hidden text-right font-mono text-[10px] text-slate-500 sm:block">{event.status}</span><span className="text-right font-mono text-[10px] text-slate-400">{event.latency}</span></div>)}</div></div> : null}
    </div>
  </section>;
}

function PathCard({ title, tone, row, blocked, domains, description }: { title: string; tone: 'amber' | 'lime'; row: FlowRow; blocked: number; domains: string[]; description: string }) {
  const isServer = tone === 'lime';
  return <div className={`rounded-2xl border p-4 ${isServer ? 'border-[#a8f06a]/20 bg-[#a8f06a]/[.06]' : 'border-[#f6b94c]/25 bg-[#f6b94c]/[.06]'}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${isServer ? 'bg-[#8fc44e]' : 'bg-amber-400'}`} /><h4 className="font-semibold text-white">{title}</h4></div><span className={`font-mono text-lg font-semibold ${isServer ? 'text-[#cfff9d]' : 'text-amber-700'}`}>{number(row.events)}</span></div><p className="mt-2 text-xs leading-5 text-slate-400">{description}</p><div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold"><span className="rounded-full bg-white/[.06] px-2 py-1 text-slate-500">{number(row.sessions)} visits</span><span className="rounded-full bg-white/[.06] px-2 py-1 text-slate-500">{number(row.failures)} problems</span><span className={`rounded-full bg-white/[.06] px-2 py-1 ${blocked ? 'text-[#ff9aae]' : 'text-slate-500'}`}>{number(blocked)} blocked requests</span></div><div className="mt-4 flex flex-wrap gap-1.5">{domains.map((domain) => <span key={domain} className="rounded-md bg-white/[.06] px-2 py-1 font-mono text-[10px] text-slate-500">{domain}</span>)}</div></div>;
}
