'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import VendorView from '../vendor-view';

export default function AdsPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!siteId) return;
    fetch('/api/sites').then((r) => r.json()).then((d) => {
      const s = d.sites.find((x: any) => x.id === Number(siteId));
      if (s) setId(s.gads_conversion_id);
    });
  }, [siteId]);
  return <VendorView vendor="gads" label="Google Ads" id={id} />;
}
