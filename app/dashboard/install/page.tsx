'use client';

export const dynamic = 'force-dynamic';

import {
  useEffect,
  useState,
} from 'react';

import { useSearchParams } from 'next/navigation';

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

function normalizeOrigin(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  let input = value.trim();

  if (!input) {
    return '';
  }

  /*
   * Remove valid and malformed protocols.
   *
   * Examples:
   *
   * https://example.com
   * https//example.com
   * https:/example.com
   * http://example.com
   * http//example.com
   */
  input = input
    .replace(/^https?:\/{0,2}/i, '')
    .replace(/^\/+/, '');

  if (!input) {
    return '';
  }

  try {
    const parsed =
      new URL(
        `https://${input}`
      );

    /*
     * Only http/https origins are supported.
     */
    if (
      parsed.protocol !==
        'https:' &&
      parsed.protocol !==
        'http:'
    ) {
      return '';
    }

    /*
     * An origin must not contain:
     *
     * /path
     * ?query
     * #hash
     * username
     * password
     */
    if (
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return '';
    }

    return parsed.origin;
  } catch {
    return '';
  }
}

function getMonitorOrigin(
  site: Site
): string {
  /*
   * 1. Environment variable
   *
   * This is the recommended production
   * configuration.
   */
  const deploymentOrigin =
    normalizeOrigin(
      process.env
        .NEXT_PUBLIC_MONITOR_ORIGIN
    );

  /*
   * 2. Explicit application URL
   *
   * Render deployments commonly set this to the telemetry service.
   * It is safer than falling back to a dashboard/customer host.
   */
  const configuredAppOrigin =
    normalizeOrigin(
      process.env.NEXT_PUBLIC_APP_URL
    );

  /*
   * 3. Customer first-party domain
   *
   * Example:
   *
   * analytics.customer.com
   */
  const firstPartyOrigin =
    normalizeOrigin(
      site.first_party_domain
    );

  /*
   * 4. Current GAfix application origin
   *
   * Used as the final fallback.
   */
  const applicationOrigin =
    typeof window !==
    'undefined'
      ? normalizeOrigin(
          window.location.origin
        )
      : '';

  return (
    deploymentOrigin ||
    configuredAppOrigin ||
    firstPartyOrigin ||
    applicationOrigin
  );
}

export default function InstallPage() {
  const search =
    useSearchParams();

  const siteId =
    search.get('siteId');

  const [site, setSite] =
    useState<Site | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [copied, setCopied] =
    useState(false);

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
        const response =
          await fetch(
            '/api/sites',
            {
              credentials:
                'include',
              cache:
                'no-store',
            }
          );

        if (!response.ok) {
          const responseText =
            await response.text();

          throw new Error(
            `Failed to load sites (${response.status}): ${
              responseText ||
              response.statusText
            }`
          );
        }

        const data =
          await response.json();

        if (
          !Array.isArray(
            data?.sites
          )
        ) {
          throw new Error(
            'Invalid response from /api/sites'
          );
        }

        /*
         * PostgreSQL BIGSERIAL IDs can
         * come back as strings.
         */
        const selectedSite =
          data.sites.find(
            (item: Site) =>
              Number(item.id) ===
              Number(siteId)
          );

        if (!selectedSite) {
          throw new Error(
            `Site with ID ${siteId} was not found.`
          );
        }

        if (!cancelled) {
          setSite({
            ...selectedSite,
            id: Number(
              selectedSite.id
            ),
          });
        }
      } catch (err) {
        console.error(
          'Failed to load site:',
          err
        );

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
            onClick={() =>
              window.location.reload()
            }
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
   * Resolve the actual telemetry origin.
   */
  const monitorOrigin =
    getMonitorOrigin(site);

  /*
   * Fail safely instead of generating a
   * broken script URL.
   */
  if (!monitorOrigin) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-900 mb-1">
            Monitor origin is not configured
          </h3>

          <p className="text-sm text-red-700 leading-relaxed">
            GAfix could not determine where
            monitor.js should be loaded from.
            Configure NEXT_PUBLIC_MONITOR_ORIGIN
            in your deployment environment.
          </p>

          <div className="mt-4 bg-white border border-red-200 rounded-lg p-3">
            <code className="text-xs">
              NEXT_PUBLIC_MONITOR_ORIGIN=https://monitoring-0jsu.onrender.com
            </code>
          </div>
        </div>
      </div>
    );
  }

  const apiKey =
    site.api_key;

  /*
   * Build URLs using URL instead of
   * string concatenation.
   *
   * This guarantees that we cannot
   * accidentally generate:
   *
   * https://https//example.com
   */
  const monitorUrl =
    new URL(
      '/monitor.js',
      monitorOrigin
    );

  monitorUrl.searchParams.set(
    'apiKey',
    apiKey
  );
  if (site.gtm_container_id) {
    monitorUrl.searchParams.set(
      'gtmContainerId',
      site.gtm_container_id
    );
  }

  const snippet = `<script src="${monitorUrl.toString()}" async></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        snippet
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error(
        'Failed to copy snippet:',
        err
      );

      try {
        const textarea =
          document.createElement(
            'textarea'
          );

        textarea.value =
          snippet;

        textarea.style.position =
          'fixed';

        textarea.style.opacity =
          '0';

        document.body.appendChild(
          textarea
        );

        textarea.focus();
        textarea.select();

        document.execCommand(
          'copy'
        );

        document.body.removeChild(
          textarea
        );

        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (
        fallbackError
      ) {
        console.error(
          'Clipboard fallback failed:',
          fallbackError
        );
      }
    }
  }

  return (
    <div className="fade-in max-w-3xl">

      {/* Header */}

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">
          Install through Google Tag Manager for {site.domain}
        </h2>

        <p className="text-sm text-ink-500 mt-0.5">
          Choose one installation path: Connect GTM automatically, or add the same Custom HTML tag manually. Do not install both.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">
          Recommended: Connect GTM
        </div>
        <p className="text-sm text-amber-900 leading-relaxed">
          Use <b>Connect GTM</b> to authorize GAfix, create the monitor tag in a reviewable workspace, and publish it safely. If you cannot authorize GTM, use the manual Custom HTML option below. Both options install the same single monitor script; never use both.
        </p>
        <a href={`/dashboard/gtm-connect?siteId=${encodeURIComponent(String(site.id))}`} className="mt-3 inline-block rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800">Connect GTM (recommended)</a>
      </div>

      {/* Monitor origin */}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-1">
          Monitor origin
        </div>

        <code className="text-sm text-blue-950 break-all">
          {monitorOrigin}
        </code>

        <div className="mt-2 text-xs text-blue-800">
          monitor.js will load from this origin,
          and telemetry will be sent to the same
          origin.
        </div>
      </div>

      {/* Snippet */}

      <div className="bg-white rounded-xl border border-ink-200 p-6 mb-6">

        <div className="flex items-center justify-between mb-4">

          <div>
            <h3 className="font-semibold text-ink-950">
              Your snippet
            </h3>

            <p className="text-xs text-ink-500 mt-0.5">
              This is the same tag created by Connect GTM. Add it manually only if you cannot use the automatic connection.
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
            {copied
              ? '✓ Copied!'
              : 'Copy snippet'}
          </button>

        </div>

        <pre className="bg-ink-950 rounded-lg p-4 text-xs text-green-300 mono overflow-x-auto leading-relaxed">
          <code>
            {snippet}
          </code>
        </pre>

      </div>

      {/* GTM instructions */}

      <div className="bg-white rounded-xl border border-ink-200 p-6 mb-6">

        <h3 className="font-semibold text-ink-950 mb-4">
          Manual fallback: add the same tag in Google Tag Manager
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
              Click <b>Tags</b> in the left
              sidebar, then <b>New</b>.
            </>,

            <>
              Choose tag type{' '}
              <b>Custom HTML</b>, then paste the one snippet above into the HTML box. Do not paste it into the website head as well.
            </>,

            <>
              Set the trigger to{' '}
              <b>All Pages</b>. Under Advanced
              Settings, set{' '}
              <b>Tag firing priority</b> to{' '}
              <span className="mono">
                1000
              </span>{' '}
              so it loads before other tags.
            </>,

            <>
              Name the tag{' '}
              <span className="mono">
                GAfix Monitor
              </span>
              , click <b>Save</b>, then use GTM Preview to verify it once before{' '}
              <b>Submit</b> → <b>Publish</b>.
            </>,

            <>
              Return here — events should appear on the Overview tab within seconds. If you use Connect GTM, do not repeat this manual installation.
            </>,
          ].map(
            (step, index) => (
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
            )
          )}

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

          First-party domain
        </h3>

        <p className="text-sm text-blue-900 mb-3">
          For the best ad-blocker detection,
          serve monitor.js and the telemetry
          endpoint from your own subdomain.
        </p>

        <ol className="space-y-2 text-sm text-blue-900 mb-3">

          <li>
            1. Create a CNAME record:{' '}
            <span className="mono bg-white px-2 py-0.5 rounded text-xs">
              analytics.{site.domain}
            </span>
          </li>

          <li>
            2. Point the CNAME to your Render
            monitoring service.
          </li>

          <li>
            3. Add the custom domain in Render.
          </li>

          <li>
            4. Enter the hostname under
            Settings → First-party domain.
          </li>

          <li>
            5. Re-copy the install snippet.
          </li>

        </ol>

        <div className="mt-4 rounded-lg border border-blue-200 bg-white/70 px-3 py-3 text-xs leading-relaxed text-blue-950">

          <b>Current CSP origin:</b>

          <div className="mono mt-1 break-all">
            {monitorOrigin}
          </div>

          <div className="mt-2">
            If the customer has a CSP, this exact
            origin must be allowed in both:
          </div>

          <div className="mono mt-2">
            script-src
          </div>

          <div className="mono">
            connect-src
          </div>

        </div>

        {site.first_party_domain ? (
          <div className="mt-4 text-sm text-green-800 bg-green-100 border border-green-200 rounded-lg px-3 py-2 inline-block">
            ✓ Currently using:{' '}
            <span className="mono">
              {site.first_party_domain}
            </span>
          </div>
        ) : (
          <div className="mt-4 text-sm text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            Not configured — using the GAfix
            monitoring deployment.
          </div>
        )}

      </div>

    </div>
  );
}
