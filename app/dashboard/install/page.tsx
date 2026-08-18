'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizeHostname } from '../../../lib/site-validation';

type Site = {
  id: number | string;
  domain: string;
  gtm_container_id?: string | null;
  ga4_measurement_id?: string | null;
  gads_conversion_id?: string | null;
  meta_pixel_id?: string | null;
  tiktok_pixel_id?: string | null;
  api_key: string;
  first_party_domain?: string | null;
};

export default function InstallPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSite() {
      if (!siteId) {
        setLoading(false);
        setSite(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/sites', {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          const text = await response.text();

          throw new Error(
            `Failed to load sites (${response.status}): ${text || response.statusText}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data?.sites)) {
          throw new Error('Invalid response from /api/sites');
        }

        // PostgreSQL BIGSERIAL IDs can come back as strings.
        // Normalize both values before comparing.
        const selectedSite = data.sites.find(
          (item: Site) => Number(item.id) === Number(siteId)
        );

        if (!selectedSite) {
          throw new Error(`Site with ID ${siteId} was not found.`);
        }

        if (!cancelled) {
          setSite({
            ...selectedSite,
            id: Number(selectedSite.id),
          });
        }
      } catch (err) {
        console.error('Failed to load site:', err);

        if (!cancelled) {
          setSite(null);
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load site information.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSite();

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!siteId) {
    return (
      <div className="text-ink-400 text-sm">
        Select a site to see its install snippet.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-ink-400 text-sm">
        Loading site configuration…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-900 mb-1">
            Unable to load site
          </h3>

          <p className="text-sm text-red-700">
            {error}
          </p>

          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-ink-400 text-sm">
        Site not found.
      </div>
    );
  }

  /*
   * If a first-party domain is configured, use it.
   * Otherwise use the current application origin.
   */
  let configuredOrigin = '';
  try {
    const host = normalizeHostname(site.first_party_domain, 'First-party domain');
    configuredOrigin = host ? `https://${host}` : '';
  } catch {
    // Older records may contain a malformed value; fall back to the app origin.
  }
  let deploymentMonitorOrigin = '';
  try {
    const parsed = new URL(process.env.NEXT_PUBLIC_MONITOR_ORIGIN || '');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') deploymentMonitorOrigin = parsed.origin;
  } catch {
    // The deployment override is optional.
  }
  const base = deploymentMonitorOrigin || configuredOrigin || (typeof window !== 'undefined' ? window.location.origin : '');

  const gtmId = site.gtm_container_id || 'GTM-XXXXXXX';
  const apiKey = site.api_key;

  const snippet = `<script>
(function(k,c,b){var w=window,d=document;if(w.__g4f&&w.__g4f.__bootstrapInstalled)return;w.__g4f=w.__g4f||{};w.__g4f.__bootstrapInstalled=true;w.__g4f.k=k;w.__g4f.c=c;w.__g4f.q=w.__g4f.q||[];function report(m){var u=b+'/api/blocked?k='+encodeURIComponent(k)+'&m='+encodeURIComponent(m);try{if(navigator.sendBeacon){navigator.sendBeacon(u,'')}else{fetch(u,{method:'GET',keepalive:true,credentials:'omit'}).catch(function(){})}}catch(e){}}var s=d.createElement('script');s.async=true;s.defer=true;s.dataset.ga4fixMonitor='true';s.src=b+'/monitor.js?apiKey='+encodeURIComponent(k)+'&gtmContainerId='+encodeURIComponent(c);s.onerror=function(){report('script_error')};d.head.appendChild(s);setTimeout(function(){if(!w.__g4f.ready)report('script_timeout')},5000);
})(${JSON.stringify(apiKey)},${JSON.stringify(gtmId)},${JSON.stringify(base)});
</script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy snippet:', err);

      // Fallback for browsers where clipboard API isn't available.
      try {
        const textarea = document.createElement('textarea');

        textarea.value = snippet;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        document.execCommand('copy');

        document.body.removeChild(textarea);

        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (fallbackError) {
        console.error('Clipboard fallback failed:', fallbackError);
      }
    }
  }

  return (
    <div className="fade-in max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">
          Install snippet for {site.domain}
        </h2>

        <p className="text-sm text-ink-500 mt-0.5">
          One tag. Five lines. Paste into GTM, publish, done. Events start
          streaming within seconds.
        </p>
      </div>

      {/* Snippet */}
      <div className="bg-white rounded-xl border border-ink-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-ink-950">
              Your snippet
            </h3>

            <p className="text-xs text-ink-500 mt-0.5">
              Pre-filled with your API key
              {site.gtm_container_id ? (
                <>
                  {' '}
                  and GTM container{' '}
                  <span className="mono">
                    {site.gtm_container_id}
                  </span>
                </>
              ) : (
                <span className="text-amber-600">
                  {' '}
                  (add your GTM container ID in Settings for full features)
                </span>
              )}
              .
            </p>
          </div>

          <button
            onClick={copy}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-ink-950 text-white hover:bg-ink-800'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy snippet'}
          </button>
        </div>

        <pre className="bg-ink-950 rounded-lg p-4 text-xs text-green-300 mono overflow-x-auto leading-relaxed">
          <code>{snippet}</code>
        </pre>
      </div>

      {/* GTM instructions */}
      <div className="bg-white rounded-xl border border-ink-200 p-6 mb-6">
        <h3 className="font-semibold text-ink-950 mb-4">
          How to install in Google Tag Manager
        </h3>

        <ol className="space-y-4 text-sm text-ink-800">
          {[
            <>
              Go to{' '}
              <a
                href="https://tagmanager.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                tagmanager.google.com
              </a>{' '}
              and open your container.
            </>,

            <>
              Click <b>Tags</b> in the left sidebar, then <b>New</b>.
            </>,

            <>
              Choose tag type <b>Custom HTML</b>, then paste the snippet
              above into the HTML box.
            </>,

            <>
              Set the trigger to <b>All Pages</b>. Under Advanced Settings,
              set <b>Tag firing priority</b> to{' '}
              <span className="mono">1000</span> so it loads before other
              tags.
            </>,

            <>
              Name the tag <span className="mono">GA4Fix Monitor</span>,
              click <b>Save</b>, then <b>Submit</b> → <b>Publish</b> your
              container.
            </>,

            <>
              Return here — events will appear on the Overview tab within
              seconds.
            </>,
          ].map((step, index) => (
            <li
              key={index}
              className="flex gap-3"
            >
              <span className="w-6 h-6 rounded-full bg-ink-100 text-ink-800 flex-shrink-0 flex items-center justify-center text-xs font-semibold">
                {index + 1}
              </span>

              <span className="leading-relaxed">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* First-party domain */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="font-semibold text-blue-950 mb-2 flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6-8 10-8 10z" />
          </svg>

          First-party domain (recommended for accurate ad-blocker detection)
        </h3>

        <p className="text-sm text-blue-900 mb-3">
          Ad blockers block requests to well-known analytics domains —
          including this one. To catch every real visitor, serve monitor.js
          and the ingest endpoint from your own subdomain instead.
        </p>

        <ol className="space-y-2 text-sm text-blue-900 mb-3">
          <li>
            1. Create a CNAME record:{' '}
            <span className="mono bg-white px-2 py-0.5 rounded text-xs">
              analytics.{site.domain}
            </span>{' '}
            →{' '}
            <span className="mono bg-white px-2 py-0.5 rounded text-xs">
              {typeof window !== 'undefined'
                ? new URL(window.location.origin).host
                : 'your-app.onrender.com'}
            </span>
          </li>

          <li>
            2. On Render, add the custom domain{' '}
            <span className="mono bg-white px-2 py-0.5 rounded text-xs">
              analytics.{site.domain}
            </span>{' '}
            to your service.
          </li>

          <li>
            3. Enter it under Settings → First-party domain.
          </li>

          <li>
            4. Re-copy the snippet — it&apos;ll auto-update to use your
            first-party URL.
          </li>
        </ol>

        <div className="mt-4 rounded-lg border border-blue-200 bg-white/70 px-3 py-2 text-xs leading-relaxed text-blue-950">
          <b>Content Security Policy:</b> if your site sends a CSP header, allow <span className="mono">{base}</span> in both <span className="mono">script-src</span> and <span className="mono">connect-src</span>. Use the exact origin shown here, including the correct protocol, and remove malformed values such as <span className="mono">https//host</span>.
        </div>

        {site.first_party_domain ? (
          <div className="text-sm text-green-800 bg-green-100 border border-green-200 rounded-lg px-3 py-2 inline-block">
            ✓ Currently using:{' '}
            <span className="mono">
              {site.first_party_domain}
            </span>
          </div>
        ) : (
          <div className="text-sm text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            Not yet configured — snippet uses default domain
          </div>
        )}
      </div>
    </div>
  );
}
