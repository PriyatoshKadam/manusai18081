'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import VendorUI from './vendor-ui';

export default function VendorView({ vendor, label, id }: { vendor: string; label: string; id: string | null }) {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!siteId) return;
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
    async function load() {
      try {
        const res = await fetch(`/api/events?siteId=${siteId}&vendor=${vendor}`);
        if (res.ok) setData(await res.json());
      } catch {}
    }
  }, [siteId, vendor]);

  if (!siteId) return <div className="text-sm text-[var(--text-3)]">Select a site to view {label} data.</div>;
  if (!data) return <div className="text-sm text-[var(--text-3)]">Loading…</div>;

  return <VendorUI vendor={vendor} label={label} id={id} siteId={siteId} data={data} />;
}
