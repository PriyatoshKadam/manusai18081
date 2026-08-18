# GA4Fix Customer-Readiness Audit

**Author:** Manus AI  
**Repository reviewed:** [PriyatoshKadam/mon1708](https://github.com/PriyatoshKadam/mon1708)  
**Audit date:** 17 August 2026

## Executive assessment

The application had a strong product concept and a polished marketing surface, but it was not yet ready for dependable customer traffic. The principal risks were concentrated at the telemetry boundary: requests were effectively unbounded, CORS reflected arbitrary origins while advertising credential support, the blocked-reporting paths duplicated inconsistent logic, and the installation timeout did not accurately represent monitor readiness. Authentication and site configuration also needed stronger production safeguards, while duplicate detection did not fully match the root-cause claims in the README.

The working copy has now been hardened across the ingestion pipeline, authentication layer, site-management APIs, monitoring client, ad-block dashboard, host middleware, dependency set, and automated tests. The production build completes successfully, the client monitor passes a syntax check, the regression suite passes, and the public landing and signup pages render successfully in a browser.

## Changes implemented

| Area | Previous risk | Customer-ready change |
|---|---|---|
| Telemetry ingestion | Arbitrary JSON size and event count; loosely shaped data could be stored. | Added bounded request parsing, a 512 KB body limit, a 100-event batch limit, field length limits, event-name validation, safe recursive parameter cleanup, and support for both legacy 48-character and new 64-character API keys. |
| CORS and beacons | Origin was reflected and credentials were enabled unnecessarily. | Standardized the public beacon contract to `Access-Control-Allow-Origin: *` without credential support, with no-store and MIME-sniffing protections. |
| Blocked reporting | GET and POST implementations diverged, and install failures omitted the detection method. | Unified both methods, normalized method names and vendor mapping, bounded page/user-agent data, hashed the client IP, and returned stable JSON errors. |
| Install snippet | Script timeout could be reported incorrectly; values were embedded without robust encoding; duplicate bootstrap was not guarded. | Added encoded values, a bootstrap guard, explicit `script_error` and `script_timeout` reporting, `sendBeacon`/fetch fallback behavior, and a truthful monitor readiness flag. |
| Duplicate detection | Detection did not use push/source evidence for root-cause guidance and could create noisy repeated alerts. | Added identity-aware matching, URL-fragment normalization, dataLayer/transport root-cause classification, and alert deduplication within a configurable time window. |
| Event quality | Product claims for purchase validation and custom-event guidance were not fully implemented. | Added purchase-currency checks across `params.currency`, `ep.currency`, `ecommerce.currency`, and `items[0].currency`; added first-seen custom-event records and guidance alerts. |
| Authentication | Production could fall back to a hard-coded secret; JWT claims were weakly validated; logout cookie flags did not match login. | Production now requires `SESSION_SECRET` with at least 32 characters, JWT issuer/audience and numeric-user validation were added, bcrypt cost was raised, and cookie deletion uses matching security attributes. |
| Site settings | Raw values were persisted with minimal validation and mutations always reported success. | Added hostname normalization, vendor-ID validation, Slack webhook validation, duplicate-domain protection, safe JSON parsing, strict site-ID parsing, and correct 404/409 responses. |
| Dashboard reporting | Ad-block totals and rate calculations mixed raw detections with sessions, and labels did not match emitted methods. | Added explicit blocked-event, distinct blocked-session, and total-session metrics; corrected rate calculation and method labels; added refresh error states. |
| Host isolation | Any `.onrender.com` host was treated as primary and unknown hosts could reach more than telemetry routes. | Primary-host detection now uses the configured app host or local development hosts; non-primary hosts receive only exact telemetry routes. |
| Dependency and release hygiene | Baseline build used Next.js 14.2.5 and emitted a security warning; no automated test command existed. | Updated Next.js to 14.2.35, added Vitest, added seven regression tests, and added `.env.example` and `.gitignore` deployment hygiene. |

## Validation evidence

| Check | Result |
|---|---|
| `npm install --no-audit --no-fund` | Passed. |
| `npm test` | Passed: 1 test file, 7 tests. |
| `npm run build` | Passed with Next.js 14.2.35; compilation, lint/type checking, page generation, and route collection completed. |
| `node --check public/monitor.js` | Passed. |
| `git diff --check` | Passed with no whitespace errors. |
| `GET /` | Returned HTTP 200 and rendered the landing page in Chromium. |
| `GET /api/health` | Returned HTTP 200 JSON. |
| Unauthenticated `GET /api/sites` | Returned HTTP 401 JSON. |
| Invalid ingest payload | Returned controlled HTTP 401 JSON with CORS headers. |
| Invalid blocked-report payload | Returned controlled HTTP 401 JSON with CORS headers. |
| Signup page | Rendered with labeled fields and working navigation links. |

## Deployment requirements

Before production deployment, set `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SESSION_SECRET`, and `NODE_ENV=production`. The secret must be a randomly generated value of at least 32 characters; the included `.env.example` shows the expected shape. Run `npm run migrate` before the first start, then use `npm run build` and `npm start` as the deployment commands. Existing customer API keys of 48 hexadecimal characters remain accepted; newly generated keys use 64 hexadecimal characters.

The application still requires a real PostgreSQL service and a production-level operational policy for rate limiting, backups, alert delivery, and retention. Those concerns depend on the hosting and database environment and should be configured before onboarding high-volume customers. The current change bounds payload cost and reduces abuse exposure, but it does not replace an edge or gateway rate limiter.

## Release recommendation

The patched code is suitable for a controlled customer pilot after applying the environment and database requirements above. For a broader launch, run a staging deployment with representative GTM, gtag, consent-mode, ad-blocker, and first-party CNAME scenarios. In particular, verify that the customer’s CNAME is added as a custom domain at the host, that the generated snippet uses the intended first-party hostname, and that the database migration has completed before the first monitored session.

## References

[1]: https://github.com/PriyatoshKadam/mon1708 "GA4Fix source repository"

[2]: https://nextjs.org/blog/security-update-2025-12-11 "Next.js security update"
