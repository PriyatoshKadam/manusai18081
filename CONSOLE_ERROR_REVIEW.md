# Console Error Review

## Diagnosis

The attached console output shows one malformed monitoring origin being used in both script and beacon requests:

> `https://https//dev-app.gafix.ai/monitor.js?...`

The malformed value is produced when a stored first-party-domain value already contains a protocol typo such as `https//dev-app.gafix.ai`, while the install page blindly prepends another `https://`. The same malformed origin then appears in the blocked-report request, so both the monitor script and the fallback report are rejected.

The browser also reports Content Security Policy violations for `script-src` and `connect-src`. This is a separate but related customer-site configuration issue: the page CSP does not allow the actual monitoring origin. The application cannot override a CSP header delivered by the customer’s website.

## Code changes applied

The shared hostname normalizer now repairs common copy/paste protocol typos, including `https//host` and `https:/host`, and continues to reject paths, credentials, invalid characters, and malformed hostnames. The install page also normalizes legacy stored values at render time, so existing records no longer generate `https://https//...` URLs. A regression test covers the exact malformed value shown in the console log.

The install instructions now display the exact origin used by the generated snippet and explicitly tell customers to allow it in both `script-src` and `connect-src`. The snippet continues to use encoded URL parameters and reports `script_error` or `script_timeout` through the corrected origin.

## Customer-side action still required

On the monitored website, add the exact monitoring origin to the CSP policy. For the value shown in the log, the policy needs the following entries, assuming that `dev-app.gafix.ai` is the intended monitoring host:

```text
script-src ... https://dev-app.gafix.ai;
connect-src ... https://dev-app.gafix.ai;
```

If `dev-api.gafix.ai` is the actual deployed service and `dev-app.gafix.ai` is a typo, update the GA4Fix site’s first-party-domain setting to the correct host and add that correct origin to both CSP directives instead. The hostname must be configured as a valid DNS/custom-domain target and serve `/monitor.js`, `/api/ingest`, and `/api/blocked`.

## Validation

The updated project passes the full Vitest suite with 7 tests, `npm run build`, `node --check public/monitor.js`, and `git diff --check`. The new regression test confirms that `https//dev-app.gafix.ai` normalizes to `dev-app.gafix.ai`.
