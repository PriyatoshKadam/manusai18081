# GA4Fix

Real-user monitoring for GA4, Google Ads, Meta, TikTok, and 15+ other pixels. Detects broken tags, missing parameters, duplicate events with root-cause analysis, and ad-blocker impact — all inside actul visitor sessions.

## What's in this build

- **Landing page** — full marketing site with hero, features, how-it-works, use cases, pricing
- **Auth** — cookie-based JWT sessions with bcrypt password hashing
- **Dashboard** — sidebar with site switcher, tabs per vendor (GA4, Google Ads, Meta, TikTok), dedicated GTM diagnostics, duplicate evidence, ad-blocker impact, Consent Mode, compact install snippet, and settings
- **monitor.js client** — records custom and standard GA4 events from dataLayer/gtag, correlates logical occurrences with fetch/XHR/sendBeacon/performance requests, tracks SPA navigation and browser sessions, and reports blocked vendor transports
- **Detection logic** — fixed versions of the reported bugs:
  - Purchase currency now checks all 4 locations (params.currency, ep.currency, ecommerce.currency, items[0].currency)
  - Custom events are classified and alerted on first-seen with registration guidance
  - Duplicate detection is session-aware and SPA-aware; it distinguishes navigation repeats, dataLayer duplication, multiple GTM tags/triggers, direct-code conflicts, and repeated network requests
- **First-party domain support** — monitor.js loads from its own origin, so if the customer CNAMEs `analytics.customer.com` to your Render URL, all ingest/blocked beacons also go first-party, defeating most ad blockers
- **Security proxy** — restricts first-party CNAME hosts to telemetry routes, applies security headers, verifies dashboard JWTs, and rejects unsupported WebSocket upgrades

## Deploy to Render (using existing repo)

You already have a Render service pointing at your GitHub repo. Here's how to swap in this new codebase.

### Step 1 — Push this to GitHub

```bash
# In the folder you unzipped
cd ga4fix

git init
git add .
git commit -m "GA4Fix v2 — full rebuild"

# Point at your existing repo (this will replace all files)
git remote add origin https://github.com/PriyatoshKadam/mon14082.git
git branch -M main
git push -u origin main --force
```

If you'd rather use a new repo, create one on GitHub first and use that URL instead. Then in Render, you'll change the connected repo under Settings → Build & Deploy.

### Step 2 — Update your Render service settings

Open your Render service (`monitoring-0jsu`) → Settings, and set these:

- **Build Command:** `npm install && npm run build && npm run migrate`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`
- **Node Version:** 20.9 or higher (required by Next.js 16.3.1; Render auto-detects from `engines` in `package.json`)

### Step 3 — Set environment variables

In Render → Environment, add these (keep your existing `DATABASE_URL`):

| Key | Value |
|---|---|
| `DATABASE_URL` | (already set — leave it) |
| `NEXT_PUBLIC_APP_URL` | `https://monitoring-0jsu.onrender.com` (your service URL) |
| `SESSION_SECRET` | Generate a random secret with `openssl rand -base64 32` |
| `IP_HASH_SECRET` | Generate a separate random secret for keyed IP pseudonymization |
| `PG_SSL` | `true` |
| `PG_SSL_REJECT_UNAUTHORIZED` | `false` for Render Postgres when no CA bundle is available; transport remains encrypted, and providing `PG_CA_CERT`/`PG_CA_CERT_PATH` enables verification |
| `NEXT_PUBLIC_MONITOR_ORIGIN` | The host serving `/monitor.js`, `/api/ingest`, and `/api/blocked` |
| `GTM_CLIENT_ID` | Google Cloud OAuth web-client ID |
| `GTM_CLIENT_SECRET` | Google Cloud OAuth web-client secret; store it only in Render secrets |
| `GTM_REDIRECT_URI` | `https://monitoring-0jsu.onrender.com/api/gtm/callback` |
| `NODE_ENV` | `production` |
| `SLACK_WEBHOOK_URL` | (optional — for Slack alerts) |

### GTM Connect setup

GA4Fix now includes a **Connect GTM** page under Dashboard → Setup. To enable it, create or select a Google Cloud project, enable the Tag Manager API, configure an OAuth consent screen, and create a Web application OAuth client. Register the exact production redirect URI shown above. The consent screen should explain that GA4Fix reads and edits the selected GTM container and can publish a container version after the customer confirms the action. Google’s documented scopes used by this integration are `tagmanager.readonly`, `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, and `tagmanager.publish`.

The migration uses the same PostgreSQL TLS configuration as the application pool. It removes `sslmode` and related SSL parameters from the connection string before passing an explicit `ssl` object to `node-postgres`; this prevents the connection string from silently replacing the CA or verification settings. Render Postgres is detected by hostname, and an existing deployment with `PG_SSL=true` also enters the compatibility mode even if its Blueprint environment variables were not synchronized. If no CA bundle is provided, the deployment uses encrypted TLS with certificate-chain tolerance to accommodate a self-signed certificate. If Render provides a CA bundle for the database, set `PG_CA_CERT` or `PG_CA_CERT_PATH` and remove the override so certificate verification remains enabled.

After the customer clicks **Connect Google account**, GA4Fix lists the accounts and containers available to that Google identity. **Add monitor tag to GTM** creates a new reviewable workspace with a Custom HTML tag and All Pages trigger; it does not change the live container. The separate **Publish container** action creates a version and publishes it only after an in-product confirmation. Customers can open the workspace in GTM and review the version history before publishing.

### Step 4 — Trigger a deploy

Click **Manual Deploy → Deploy latest commit**. The build will:

1. Install dependencies
2. Build the Next.js app
3. Run `npm run migrate` which creates all tables from `db/schema.sql` (safe to re-run — uses `CREATE TABLE IF NOT EXISTS`)
4. Start the server

### Step 5 — Create your first account

Once deployed, go to `https://monitoring-0jsu.onrender.com/signup` and create an account. Then:

1. Add a site in Settings with your domain and GTM container ID.
2. Open Dashboard → Setup → Connect GTM and connect the Google account that has access to the container.
3. Select the account and container, review the generated monitor tag, and click **Add monitor tag to GTM**.
4. Review the new workspace in GTM, then return to GA4Fix and click **Publish container** after confirming the live change.
5. Events start streaming after the published GTM container propagates to visitors.

### Optional — first-party domain for accurate ad-blocker detection

For customers where you want the highest fidelity ad-blocker detection:

1. Customer creates a CNAME: `analytics.customer.com` → `monitoring-0jsu.onrender.com`
2. On Render → Custom Domains, add `analytics.customer.com`
3. In the site's Settings on GA4Fix, enter `analytics.customer.com` as First-party domain
4. Re-copy the install snippet — it now uses the customer's first-party URL
5. Ad blockers can't easily block a subdomain of the customer's own site, so the monitor script and all beacons go through

## Local development

```bash
cp .env.example .env
# Fill in DATABASE_URL — e.g. a local Postgres, or use the Render one
npm install
npm run migrate
npm run dev
```

Open http://localhost:3000

## Architecture notes

- **Live event streaming** uses capped Server-Sent Events (`/api/stream`) with five-second polling, heartbeats, cleanup, and a ten-minute reconnect lifetime.
- **First-party routing** is handled in `proxy.ts` — if the `Host` header does not match `NEXT_PUBLIC_APP_URL`, only telemetry routes are exposed; security headers and JWT validation are applied to dashboard requests.
- **Duplicate root-cause** uses browser session IDs, SPA navigation IDs, occurrence IDs, dataLayer push indexes, request signatures, transports, and GTM/direct source evidence. Repeated scroll, click, user_engagement, and route events are not defects by name alone.
- **Ad-blocker detection** combines monitor/script failures, vendor resource errors, GA4 event timeouts, failed fetch/XHR/sendBeacon transports, blocked URLs, event names, and distinct-session reporting. The dashboard shows signal and vendor coverage rather than a raw beacon total.
