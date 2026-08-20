# GA4Fix Security Audit and Hardening Report

**Assessment type:** Repository-level application security review with remediation

**Repository:** [PriyatoshKadam/manusai18081](https://github.com/PriyatoshKadam/manusai18081)

**Reviewed stack:** Next.js 16 App Router, React 18, PostgreSQL, `pg`, JWT sessions via `jose`, bcryptjs, GTM OAuth, browser-side telemetry monitor, synthetic HTTP checks, Slack/email/webhook delivery, and Render deployment configuration.

**Assessment date:** 20 August 2026

## Executive security summary

GA4Fix has a reasonably strong baseline for a small SaaS application. The repository uses parameterized PostgreSQL queries, server-side site-ownership checks on the major dashboard APIs, HttpOnly/SameSite session cookies, issuer/audience validation for JWTs, bcrypt password hashing, OAuth state binding for GTM Connect, encrypted refresh-token and webhook-secret storage, bounded telemetry fields, and a production dependency audit with no reported vulnerabilities.

The review nevertheless found several real attack paths. The most important was a **cross-tenant synthetic journey execution flaw**: a user who owned one site could submit a valid site ID and a guessed journey ID belonging to another tenant. The server verified the site but not the journey-to-site relationship before executing the journey. A second major trust-boundary issue existed in server-side outbound delivery: configurable webhooks and synthetic journeys could be used to make requests toward private or metadata addresses, and webhook redirects could bypass a superficial HTTPS check. Telemetry URLs and parameters could also retain sensitive query-string and client-identifier data, and CSV exports could carry spreadsheet formula payloads.

Those issues were remediated in the working tree. The monitor script was additionally hardened to fail open around all observer hooks so a malformed event or instrumentation error cannot prevent the host site’s `dataLayer`, `fetch`, XHR, `sendBeacon`, history, or performance APIs from working. This is especially important because GA4Fix is installed through GTM on customer websites.

> **Current security posture:** materially improved and suitable for another deployment validation cycle, but not yet a complete enterprise security program. The remaining material risks are the public nature of browser collection credentials, CSP `unsafe-inline`, in-memory rate limiting, long-lived stateless JWTs without server-side revocation, and the operational requirement to keep PostgreSQL certificate verification enabled in production.

## Architecture and trust boundaries

The application has four primary trust boundaries. First, the dashboard and API surface accepts authenticated user input and must enforce tenant ownership server-side. Second, the browser monitor runs in an untrusted customer page context; its per-site collection key is necessarily visible to page visitors and must therefore be treated as a public ingestion credential rather than a secret. Third, GTM Connect stores a Google refresh token and can create and publish container changes, making OAuth state validation and tenant binding high-impact controls. Fourth, synthetic journeys and notification webhooks cause the GA4Fix server to make outbound network requests, which creates SSRF and egress-abuse boundaries.

The application’s public telemetry routes are `/monitor.js`, `/api/ingest`, `/api/blocked`, and `/api/health`. Authenticated routes cover sites, events, alerts, exports, compliance, synthetic checks, integrations, GTM operations, and the dashboard stream. The cron route `/api/jobs` is protected by a shared secret and can run work across all tenants.

## Critical and High-risk findings

| ID | Finding | Severity before fix | Current status | Affected location |
|---|---|---:|---|---|
| SEC-01 | Cross-tenant synthetic journey execution / IDOR | **High** | **Fixed** | `app/api/synthetic/route.ts:30-34`; `lib/synthetic.ts:13-16` |
| SEC-02 | Server-side request forgery through configurable outbound destinations | **High** | **Fixed with residual DNS TOCTOU risk** | `lib/notifications.ts:36-40`; `lib/synthetic.ts:22-32`; `app/api/webhooks/route.ts:15` |
| SEC-03 | Production PostgreSQL certificate verification disabled | **High** | **Hardened; deployment gate remains** | `db/postgres-ssl.js:31-39`; `render.yaml:20-25` |

### SEC-01 — Cross-tenant synthetic journey execution / IDOR

**Why it was vulnerable.** The authenticated `POST /api/synthetic` handler checked that the caller owned `body.siteId`, but its `runNow` branch passed only `body.journeyId` into `runSyntheticJourney()`. The runner selected a journey by numeric ID and joined its site without constraining the journey to the selected site or authenticated user.

**Realistic attack scenario.** An authenticated user creates or owns any site, observes or guesses another `synthetic_journeys.id`, and submits `{ "siteId": <their-site>, "journeyId": <victim-journey>, "runNow": true }`. The server then executes the victim’s configured public journey, writes a synthetic run under the victim’s tenant, and can create alerts and outbound notifications for that tenant. The attacker does not need to read the victim’s dashboard to cause unauthorized server-side work.

**Impact.** This violated tenant isolation and could cause unauthorized network requests, cross-tenant evidence creation, alert noise, and resource consumption. It is a direct instance of broken access control and IDOR, consistent with OWASP’s warning that access control must be enforced in trusted server-side code and must bind records to their owner rather than trusting user-supplied identifiers [1].

**Remediation applied.** `runSyntheticJourney()` now accepts an authorization scope and the SQL query requires both `j.site_id = $2` and `s.user_id = $3`. The route passes the authenticated site and user IDs and returns `404` when the journey is outside that scope. Regression coverage was added in `tests/security.test.ts`.

### SEC-02 — Server-side request forgery through configurable outbound destinations

**Why it was vulnerable.** Synthetic journeys perform server-side `fetch()` requests based on customer-configured URLs, and webhook delivery sends alerts to customer-configured URLs. Before hardening, the synthetic allowlist checked host suffixes but did not reject private or metadata IP destinations. Webhook configuration required an HTTPS prefix, while delivery accepted HTTP or HTTPS values from the database and followed redirects by default. A public HTTPS endpoint could therefore redirect the server toward a private service.

**Realistic attack scenario.** An attacker configures a webhook at a public HTTPS URL they control, returns a redirect to an internal address, and waits for a high-priority alert. Alternatively, a malformed or legacy synthetic configuration targets a hostname that resolves to loopback, link-local, RFC1918, or cloud metadata space. The GA4Fix server becomes the network vantage point and may reveal response timing, internal service behavior, or metadata if responses are ever exposed or used in downstream logic.

**Impact.** SSRF can enable internal port discovery, access to metadata services, unauthorized internal requests, or abuse of trusted network placement. OWASP specifically recommends positive destination validation, disabling redirects, and defense against DNS rebinding and time-of-check/time-of-use gaps [2].

**Remediation applied.** Added `lib/outbound.ts`, which rejects non-public IP ranges, localhost, local/internal names, metadata names, and unsafe protocols. Webhook configuration now requires a resolvable public HTTPS endpoint. Delivery uses `redirect: 'manual'`, and synthetic requests apply the public-destination check to the start URL and every step. The remaining residual risk is DNS TOCTOU/rebinding between validation and the actual fetch; a stronger future control would resolve once and bind the HTTP client connection to the validated address or isolate outbound jobs in a dedicated egress worker/network.

### SEC-03 — Production PostgreSQL certificate verification disabled

**Why it was vulnerable.** The previous Render manifest set `PG_SSL_REJECT_UNAUTHORIZED=false`, and the TLS helper allowed `rejectUnauthorized: false` for Render/self-signed compatibility. This encrypts traffic but does not authenticate the database server, leaving a theoretical active network or DNS attacker able to impersonate the PostgreSQL endpoint.

**Impact.** Database credentials, telemetry, user records, OAuth ciphertext, and session-related data could be exposed or modified if the connection were intercepted. Render documents that managed PostgreSQL connections use TLS and recommends using the internal URL where possible; node-postgres documents supplying the provider root certificate for self-signed certificates [3] [4].

**Remediation applied.** The helper now verifies certificates by default, including in production even when `PG_SSL_REJECT_UNAUTHORIZED=false` is present. Insecure verification is allowed only when `ALLOW_INSECURE_DB_TLS=true`, `PG_SSL_REJECT_UNAUTHORIZED=false`, and `NODE_ENV` is not production. `render.yaml` now sets verification to `true`, exposes an optional `PG_CA_CERT` secret, and sets the insecure escape hatch to `false`.

**Deployment requirement.** If Render’s connection requires a provider CA, populate `PG_CA_CERT` before deploying. Do not restore `PG_SSL_REJECT_UNAUTHORIZED=false` in production. The secure behavior intentionally fails closed rather than silently accepting an unauthenticated database certificate.

## Complete findings table

| ID | Vulnerability or control gap | Severity | Affected file/function | Exploitability and impact | Status |
|---|---|---:|---|---|---|
| SEC-04 | Webhook HMAC used encrypted ciphertext instead of the configured secret | Medium | `lib/notifications.ts:54-56` | Receivers could not verify signatures against the secret supplied by the customer; authenticity control was functionally broken. | Fixed by decrypting before signing. |
| SEC-05 | Sensitive URL query strings, credentials, and client IDs persisted in telemetry | Medium | `lib/ingest-validation.ts`; `app/api/blocked/route.ts` | A malicious or accidental URL could store email, token, click IDs, credentials, or client identifiers in event/ad-block records and exports. | Fixed with key removal, URL redaction, and HMAC pseudonymization. |
| SEC-06 | Browser telemetry API key is extractable and no-origin requests are accepted | Medium residual | `public/monitor.js`; `app/api/ingest/route.ts:39-58` | Any visitor can inspect the monitor URL and submit forged telemetry. Missing Origin/Referer is accepted to preserve `sendBeacon` and privacy-browser behavior. This is a collection-abuse/data-poisoning risk, not a tenant-read bypass. | Partially mitigated by origin binding where available, bounded payloads, rate limits, and public-key treatment. Requires quotas and monitoring in production. |
| SEC-07 | Cron control plane uses one shared secret for all tenants and expensive jobs | Medium | `app/api/jobs/route.ts` | A leaked `CRON_SECRET` permits anomaly, synthetic, revenue, delivery, and digest work across all tenants. Abuse can consume database/network capacity and trigger notifications. | Hardened with constant-time comparison, body limit, rate limit, and job allowlist. Shared-secret blast radius remains. |
| SEC-08 | In-memory rate limits and client-controlled forwarded IP | Medium | `lib/rate-limit.ts` | Limits reset on restart and are not shared across Render instances. Trusting the first `x-forwarded-for` value can allow header rotation to bypass limits if the edge does not sanitize it. | Residual. Use a distributed limiter and a platform-verified client IP. |
| SEC-09 | CSP permits `unsafe-inline` scripts and styles | Low-Medium | `proxy.ts:17-22` | If a separate injection bug is introduced, inline script execution increases XSS impact. React escaping currently reduces the immediate exploit surface, but this is weaker defense in depth. | Residual. Move to nonce/hash-based CSP after verifying Next.js runtime requirements. |
| SEC-10 | Stateless JWT lifetime is 30 days with no server-side revocation | Medium | `lib/auth.ts:8,41-48` | A stolen session cookie remains usable until expiry even after logout; logout clears the browser cookie but does not invalidate the token at the server. | Residual. Use short-lived access sessions with rotating refresh sessions or a server-side session/revocation table. |
| SEC-11 | Basic account authentication lacks MFA, password reset, and breach-password screening | Low-Medium | `app/api/auth/signup/route.ts`; `lib/auth.ts` | Credential compromise has no second factor or recovery control. This is a product security gap rather than a direct injection vulnerability. | Residual. Add verified email, MFA/WebAuthn, reset-token lifecycle, and breached-password checks. |
| SEC-12 | Read endpoint previously mutated policy state | Low | `app/api/alert-policy/route.ts:8` | Crawlers, prefetchers, or accidental GET requests could create database rows. This was not a cross-tenant issue but violated safe HTTP semantics and created avoidable state changes. | Fixed by returning defaults without inserting. |
| SEC-13 | CSV formula injection in operator exports | Medium | `app/api/export/route.ts:12` | Event names, page URLs, or alert text beginning with `=`, `+`, `-`, or `@` could be interpreted as formulas when opened in spreadsheet software. | Fixed by prefixing formula-like cells with an apostrophe. |
| SEC-14 | Monitor instrumentation could interfere with host-site APIs on observer exceptions | Medium availability risk | `public/monitor.js:264-340` | An unexpected event shape, browser API behavior, or observer exception could prevent the original `dataLayer`, fetch, XHR, beacon, or performance action from running. | Fixed with fail-open `try/catch` boundaries; syntax and regression tests pass. |
| SEC-15 | Error messages and operational logs may reveal implementation details | Low | Multiple API routes | Most responses are generic, but some integration errors return provider messages and server logs record error text. This is useful operationally but should be scrubbed for secrets and correlation IDs. | Partially mitigated; review logging policy before production scale. |

## Authentication and authorization assessment

Session cookies are HttpOnly and SameSite=Lax, are Secure in production, and are scoped to `/`. JWT verification checks the issuer and audience and rejects missing or short session secrets outside explicitly enabled development mode. Password verification uses bcrypt with a cost factor of 12. Login and signup return generic login failures, and both flows have basic rate limiting.

The principal authorization pattern is sound: most authenticated APIs query `WHERE site_id = $1 AND user_id = $2` or use an equivalent ownership helper. The synthetic `runNow` path was the important exception and is now scoped at the query layer. GTM installation and publish queries also bind installation and site ownership to the authenticated user. No privilege-escalation path or admin-role bypass was identified because the application does not expose a separate administrative role surface.

The main residual authentication concern is session lifecycle. The JWT is valid for 30 days and logout only removes the client cookie. A stolen token cannot be revoked centrally. A production-grade customer-facing SaaS should use shorter-lived access tokens, rotate refresh tokens, and maintain a server-side session or revocation record.

## Injection, XSS, CSRF, SSRF, and browser security assessment

No SQL injection was identified. Query values are passed through PostgreSQL parameters, and the one dynamic update statement is constructed from the normalized field allowlist rather than arbitrary request keys. No shell execution, `eval`, dynamic `Function`, unsafe file path operation, or RCE sink was found. The application has no file-upload feature in the reviewed repository, so upload-content and download-path attacks are not currently applicable.

React’s normal JSX escaping is used for dashboard-rendered data, and no `dangerouslySetInnerHTML` sink was found in the application UI. The monitor tag builder emits a script URL from server-side configuration and a site API key; those values are not inserted into user-provided HTML beyond the generated GTM tag. The public application CSP provides frame denial, base/form restrictions, and HTTPS connections, but `unsafe-inline` remains a defense-in-depth weakness.

SameSite cookies already reduce cross-site POST risk. The added proxy check rejects unsafe application API requests when a supplied Origin or Referer does not match the configured application host. Telemetry endpoints remain deliberately cross-origin and unauthenticated by session because they must run from customer sites; they use collection credentials and origin binding where browser headers are available.

## Secrets, data protection, and cloud configuration

No tracked `.env` files, private keys, Slack webhook values, AWS keys, or common token formats were found in repository history or the current tracked tree. `.env.example` is not a secret and `.gitignore` excludes `.env` files. GTM refresh tokens and webhook secrets are encrypted using AES-256-GCM with a key derived from `SESSION_SECRET`.

The telemetry privacy hardening now removes sensitive parameter keys, strips credentials and sensitive query values from persisted URLs, removes URL fragments, and HMAC-pseudonymizes client identifiers using `IP_HASH_SECRET`. Operators should still rotate any database credentials previously exposed outside the repository, including credentials shown in screenshots, because repository cleanliness does not revoke previously disclosed secrets.

Render deployment should use the internal database URL where possible and restrict external database access using the provider’s network controls. Render’s documentation states that external database access can be restricted by IP allowlist or disabled entirely [4].

## Dependency and framework review

`npm audit --omit=dev --audit-level=high` completed with **0 vulnerabilities**, and the full audit also reported **0 vulnerabilities**. The production build completed successfully with Next.js 16.3.1 and TypeScript validation. The repository has no identified vulnerable dependency path from the audit output. Dependency versions should still be updated on a controlled schedule, especially the framework and runtime, with regression tests rerun after upgrades.

## What was changed

The hardening changes include tenant-scoped synthetic execution, public-destination checks for outbound requests, redirect disabling for webhooks, correct decryption of webhook signing keys, fail-closed production PostgreSQL TLS, constant-time cron authorization, bounded cron requests, job allowlisting, same-origin checks for unsafe application API calls, a 12-character new-password minimum, telemetry URL and parameter redaction, client-ID pseudonymization, CSV formula neutralization, read-only alert-policy GET behavior, GTM production redirect hardening, and fail-open monitor instrumentation.

The browser monitor’s functional contract was preserved. It still observes customer-site analytics and reports telemetry, but every observer path now catches its own failures and invokes the original host API regardless of GA4Fix inspection errors. This avoids blocking or damaging other scripts when the monitor is installed through GTM.

## Prioritized remediation plan

| Priority | Action | Owner | Timing |
|---|---|---|---|
| P0 | Set `PG_SSL_REJECT_UNAUTHORIZED=true` in Render, provide `PG_CA_CERT` if required by the managed certificate chain, and keep `ALLOW_INSECURE_DB_TLS=false`. Verify migration and login after deployment. | Deployment operator | Before production deploy |
| P0 | Rotate any `DATABASE_URL`, `SESSION_SECRET`, GTM client secret, Slack webhook, Resend key, or cron secret exposed in screenshots, logs, tickets, or third-party tools. | Deployment operator | Immediately if exposure occurred |
| P1 | Replace in-memory rate limiting with a shared store or edge limiter, and use the platform-verified client IP rather than trusting the first user-supplied forwarded address. | Engineering | Before multi-instance scale |
| P1 | Reduce JWT access-session lifetime and introduce server-side session records or token revocation. Add session rotation after password changes and OAuth reconnection. | Engineering | Before broad customer rollout |
| P1 | Move webhook and synthetic execution to a dedicated egress worker/network with an allowlisted outbound policy. Bind validated DNS results to the actual connection where feasible. | Engineering/Infrastructure | Before handling sensitive enterprise data |
| P2 | Replace CSP `unsafe-inline` with nonces or hashes compatible with the deployed Next.js runtime. Add CSP reporting and alert on violations. | Engineering | Next security sprint |
| P2 | Add verified email, MFA/WebAuthn, secure password reset, breached-password checks, and login anomaly reporting. | Engineering/Product | Customer security roadmap |
| P2 | Add structured security audit logs for authorization failures, GTM publish actions, credential rotations, webhook changes, and cron executions without recording secrets or raw sensitive payloads. | Engineering | Customer security roadmap |

## Overall assessment

Before remediation, the repository was **not ready to claim strong tenant isolation or secure server-side egress** because of the synthetic IDOR and outbound-request issues. After the applied changes, the application’s principal high-impact authorization and SSRF paths are substantially hardened, the monitor is fail-open for customer-site safety, sensitive telemetry persistence is reduced, and the regression/build/audit gates pass.

The residual risks are operational and architectural rather than an unresolved obvious SQL injection or RCE. The most important release gate is PostgreSQL certificate verification: the application must be deployed with a valid CA configuration rather than reverting to unauthenticated TLS. The next most important improvements are distributed rate limiting, revocable sessions, stronger CSP, and a dedicated egress boundary.

## Validation evidence

The hardened working tree passed `node --check public/monitor.js`, **40/40 Vitest tests**, the Next.js production build, `npm audit --omit=dev --audit-level=high` with **0 vulnerabilities**, and `git diff --check`.

## References

[1]: https://owasp.org/Top10/2021/A01_2021-Broken_Access_Control/ "OWASP Top 10 2021 — Broken Access Control"

[2]: https://owasp.org/Top10/2021/A10_2021-Server_Side_Request_Forgery_%28SSRF%29/ "OWASP Top 10 2021 — Server-Side Request Forgery"

[3]: https://node-postgres.com/features/ssl "node-postgres — SSL/TLS"

[4]: https://render.com/docs/postgresql-creating-connecting "Render — Create and Connect to Render Postgres"
