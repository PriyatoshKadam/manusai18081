# GA4Fix Baseline Audit

## Repository baseline

- Repository: https://github.com/PriyatoshKadam/mon1708
- Stack: Next.js 14.2.5, React 18.3.1, PostgreSQL via `pg`, JWT sessions with `jose`, bcryptjs, Recharts, Tailwind CSS.
- Source tree contains a public landing page, authentication pages, dashboard pages, CRUD APIs for sites, telemetry APIs for ingest/blocked events, a streaming endpoint, SQL schema/migration script, and a large `public/monitor.js` client script.
- `npm install --no-audit --no-fund` completed successfully.
- Baseline `npm run build` completed successfully, but npm reported that Next.js 14.2.5 has a known security vulnerability and that the Recharts 2.x branch is inactive.

## Browser baseline

- Landing page renders successfully at `http://localhost:3000/`.
- Marketing content is visually polished and communicates the product clearly, with working signup/login CTAs.
- Product copy claims duplicate root-cause analysis, missing-parameter validation, Slack/email alerts, and first-party fallback monitoring. These claims must be checked against the implementation.

## Initial risk hypotheses

1. Telemetry ingestion accepts arbitrary payload sizes and unbounded event arrays, which can cause database and CPU abuse.
2. CORS handlers reflect any origin while allowing credentials, which is unsafe and unnecessary for API-key-based beacon endpoints.
3. The blocked endpoint duplicates GET/POST logic and emits inconsistent vendor classifications.
4. The monitor patches browser globals without idempotent guards for all patched APIs and may miss `Request` bodies or Blob payloads.
5. Duplicate detection currently queries only URL/event/client fields and does not use dataLayer push index or source to classify root cause despite the README claim.
6. Authentication falls back to a hard-coded development secret when `SESSION_SECRET` is absent, and session decoding does not verify a valid numeric user id or current user.
7. Dashboard ad-block metrics likely have backend/frontend naming and denominator mismatches.
8. Site CRUD and user-facing forms need stronger validation, domain normalization, and error-state handling.

## Next review focus

Audit the dashboard/API contract, install snippet, middleware, ad-block reporting, duplicate detection, and the customer monitor before making prioritized changes.

## Final browser smoke checks

- The patched build renders the landing page successfully at `http://localhost:3000/` with the existing marketing navigation and calls to action intact.
- The signup page renders successfully with labeled name, email, and password fields, a clear create-account action, and a login escape route.
- After restarting from the patched build, `/api/health` returned HTTP 200 JSON and unauthenticated `/api/sites` returned HTTP 401 JSON as expected.
- A stale local Next.js process initially produced false 500 smoke-test results; it was terminated, the server was restarted cleanly, and the endpoints passed.
