# GA4Fix

Real-user monitoring for GA4, Google Ads, Meta, TikTok, and 15+ other pixels. Detects broken tags, missing parameters, duplicate events with root-cause analysis, and ad-blocker impact — all inside actul visitor sessions.

## What's in this build

- **Landing page** — full marketing site with hero, features, how-it-works, use cases, pricing
- **Auth** — cookie-based JWT sessions with bcrypt password hashing
- **Dashboard** — sidebar with site switcher, tabs per vendor (GA4, Google Ads, Meta, TikTok), diagnostic pages (Duplicates, Ad-blocker, Consent Mode), install snippet, settings
- **monitor.js client** — patches `dataLayer.push` to track push indices for duplicate root-cause analysis, patches `fetch`/`XHR`/`sendBeacon`/`img.src` to intercept every outbound analytics call, plus an ad-blocker bait check
- **Detection logic** — fixed versions of the reported bugs:
  - Purchase currency now checks all 4 locations (params.currency, ep.currency, ecommerce.currency, items[0].currency)
  - Custom events are classified and alerted on first-seen with registration guidance
  - Duplicate detection groups within a 3-second window and classifies root cause by dataLayer push index and source
- **First-party domain support** — monitor.js loads from its own origin, so if the customer CNAMEs `analytics.customer.com` to your Render URL, all ingest/blocked beacons also go first-party, defeating most ad blockers
- **Middleware** — restricts first-party CNAME hosts to only serve monitor.js + ingest + blocked, and guards `/dashboard/*` with a session check

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
- **Node Version:** 18 or higher (Render auto-detects from `engines` in `package.json`)

### Step 3 — Set environment variables

In Render → Environment, add these (keep your existing `DATABASE_URL`):

| Key | Value |
|---|---|
| `DATABASE_URL` | (already set — leave it) |
| `NEXT_PUBLIC_APP_URL` | `https://monitoring-0jsu.onrender.com` (your service URL) |
| `SESSION_SECRET` | Run `openssl rand -base64 32` and paste it |
| `NODE_ENV` | `production` |
| `SLACK_WEBHOOK_URL` | (optional — for Slack alerts) |

### Step 4 — Trigger a deploy

Click **Manual Deploy → Deploy latest commit**. The build will:

1. Install dependencies
2. Build the Next.js app
3. Run `npm run migrate` which creates all tables from `db/schema.sql` (safe to re-run — uses `CREATE TABLE IF NOT EXISTS`)
4. Start the server

### Step 5 — Create your first account

Once deployed, go to `https://monitoring-0jsu.onrender.com/signup` and create an account. Then:

1. Add a site (Settings tab) with your domain and GTM container ID
2. Go to Install and copy the 5-line snippet
3. Paste it into a Custom HTML tag in GTM, set trigger to All Pages, priority 1000
4. Publish GTM — events start streaming immediately

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

- **Live event streaming** uses Server-Sent Events (`/api/stream`) that polls the DB every 2 seconds and pushes new event/alert IDs. Works on Render because Node processes stay alive.
- **First-party routing** is handled in `middleware.ts` — if the `Host` header doesn't match `NEXT_PUBLIC_APP_URL`'s host, only the beacon endpoints are exposed.
- **Duplicate root-cause** works because monitor.js monkey-patches `window.dataLayer.push` to tag each entry with `__g4f_push_idx`. On the server, we group same-key events in a 3-second window and use `pushIndices.size` and `sources` to classify: multiple dataLayer pushes vs. gtag+GTM conflict vs. multiple GTM tags on one trigger.
- **Ad-blocker detection** has three signals: (1) our monitor.js `onerror` handler, (2) a `setTimeout` fallback that fires the beacon if `__g4f.r` is never set, (3) an in-script "bait" load of the Google adsbygoogle.js script — if it fails or times out, the blocker is confirmed.
