'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import VendorView from '../vendor-view';

export default function BingPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    fetch('/api/sites', { credentials: 'include', cache: 'no-store' })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error('Unable to load site configuration');
        const site = data.sites?.find((item: any) => item.id === Number(siteId));
        if (!cancelled) setId(site?.bing_uet_tag_id || null);
      })
      .catch(() => { if (!cancelled) setId(null); });
    return () => { cancelled = true; };
  }, [siteId]);

  return <VendorView vendor="bing" label="Bing UET" id={id} />;
}
