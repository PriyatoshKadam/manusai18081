# GA4Fix Security Remediation

**Scope:** Repository changes applied to `PriyatoshKadam/manusai18081` on 18 August 2026.

## Remediated controls

| Audit area | Remediation in this release |
|---|---|
| Next.js self-hosted SSRF | Upgraded to Next.js 16.3.1, migrated `middleware.ts` to `proxy.ts`, and rejects all WebSocket upgrade requests because this application does not require them. |
| Authentication and telemetry rate limits | Added bounded in-process sliding-window throttles to login, signup, ingest, and blocked-report endpoints. A distributed edge limiter is still recommended for multi-instance deployments. |
| PostgreSQL TLS | Removed `rejectUnauthorized: false`; production TLS now verifies certificates and supports `PG_CA_CERT` or `PG_CA_CERT_PATH`. |
| Stored XSS | Removed `dangerouslySetInnerHTML` from alert fix-step rendering. |
| Telemetry forgery | Ingest and blocked endpoints validate `Origin`/`Referer` when present against the registered site or first-party domain. Missing headers remain accepted for privacy-browser and beacon compatibility. |
| IP pseudonymization | Replaced unsalted SHA-256 with HMAC-SHA-256 using `IP_HASH_SECRET` or `SESSION_SECRET`. Render generates `IP_HASH_SECRET`. |
| SSE resource exhaustion | Capped streams at three per user/site, added five-second polling, heartbeat frames, cleanup, and a ten-minute maximum lifetime. |
| JWT fallback secret | Removed the public fixed development secret. Local development requires `ALLOW_INSECURE_DEV_AUTH=true` and uses a random process-local secret; production fails closed without `SESSION_SECRET`. |
| Open redirect | Login accepts only single-slash, same-origin relative paths. |
| Security headers | Added CSP, HSTS in production, frame denial, Permissions Policy, Referrer Policy, and MIME sniffing protection. |
| Dependency drift | Added Dependabot and CI checks for tests, production build, and high-severity npm advisories. |

## Telemetry and product corrections

The monitor now records custom GA4 events directly from `dataLayer` and `gtag('event', ...)` instead of waiting only for a standard-event network request. It assigns a browser-session ID, SPA navigation ID, occurrence ID, dataLayer push index, request signature, transport, and GTM container ID. Network observations are correlated to the same logical occurrence so the dashboard does not double-count a dataLayer event and its matching request.

Duplicate detection now compares evidence inside a browser session and page/navigation context. It does not treat repeated `scroll`, `click`, `user_engagement`, or SPA route events as defects by name alone. It produces GTM-specific alert categories for multiple tags/triggers, repeated dataLayer payloads, and GTM-plus-direct implementations. The new GTM dashboard presents the prescribed investigation flow: trigger, tag, dataLayer push, then network and direct-code cross-check.

Ad-block detection now captures monitor load failures, telemetry transport failures, blocked vendor resources, GA4 event timeouts, resource errors, and vendor-specific blocked URLs. The dashboard uses distinct sessions rather than raw beacon totals and exposes blocked event names and vendor families.

The generated install bootstrap has been reduced to a compact loader. It keeps duplicate-install protection, safe parameter encoding, and script-error reporting while moving the full monitor logic to `monitor.js`.

## Deployment requirements

Set `SESSION_SECRET`, `IP_HASH_SECRET`, `DATABASE_URL`, `PG_SSL=true`, `NODE_ENV=production`, and `NEXT_PUBLIC_APP_URL` in the production environment. If the PostgreSQL service uses a private CA, provide `PG_CA_CERT` or `PG_CA_CERT_PATH`. Set `NEXT_PUBLIC_MONITOR_ORIGIN` to the deployment that actually serves `/monitor.js`, `/api/ingest`, and `/api/blocked`; do not point it at a marketing/dashboard host that does not serve those routes.

This release uses Next.js 16.3.1 and requires Node.js 20.9 or newer. The Render manifest pins `NODE_VERSION=20.9.0` and provisions the generated security secrets.

## Validation evidence

`npm test` passes all 9 tests. `npm run build` passes on Next.js 16.3.1. `node --check public/monitor.js`, `node --check db/migrate.js`, `git diff --check`, and `npm audit --audit-level=high` all pass with zero reported vulnerabilities.

## Residual operational considerations

The in-process limiter is effective for a single Render instance but should be moved to a shared Redis or edge limiter when multiple instances are deployed. Origin binding is a forgery-reduction control, not a replacement for key rotation; add an API-key rotation action before treating the public key as a long-lived credential. Technical controls do not by themselves establish legal compliance; privacy notices, retention rules, data-subject workflows, vendor contracts, and a formal data-protection review remain operational responsibilities.

## References

[1]: https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r "Next.js official advisory: Server-side request forgery in applications using WebSocket upgrades"
[2]: https://nvd.nist.gov/vuln/detail/CVE-2026-44578 "NVD: CVE-2026-44578"
