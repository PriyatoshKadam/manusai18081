'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import VendorView from '../vendor-view';

export default function GA4Page() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [measurementId, setMeasurementId] = useState<string | null>(null);
  useEffect(() => {
    if (!siteId) return;
    fetch('/api/sites').then((r) => r.json()).then((d) => {
      const s = d.sites.find((x: any) => x.id === Number(siteId));
      if (s) setMeasurementId(s.ga4_measurement_id);
    });
  }, [siteId]);
  return <VendorView vendor="ga4" label="Google Analytics 4" id={measurementId} />;
}
