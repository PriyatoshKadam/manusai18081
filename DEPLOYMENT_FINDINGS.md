# Latest deployed event-path findings

The customer log uses `dev-app.gafix.ai` as the monitor origin. `https://dev-app.gafix.ai/monitor.js` currently serves the dashboard host's Page Not Found page, not GA4Fix monitor code. The actual telemetry deployment `https://monitoring-0jsu.onrender.com/monitor.js` serves GA4Fix monitor version `11.0`.

The attached network request proves GA4 itself sends `run_audit` to `/metrics/g/collect` with `en=run_audit` and receives HTTP 204. Therefore, absence from GA4Fix is caused by the monitor origin/deployment path or ingestion, not GA4 failing to fire. The customer must use the telemetry deployment (or a custom domain mapped to it) as the monitor origin and recopy the snippet after deployment.

The current duplicate detector was also too dependent on volatile GA4 query parameters and a same-page window. The correction now ignores GA4 browser/session/timing fields when building request signatures and treats login, sign_up, purchase, begin_checkout, generate_lead, and subscribe as repeat-sensitive events across SPA navigations for 120 seconds. The alert route remains same-session only to avoid cross-user false positives.

TagDrishti benchmarked capabilities include an independent head script, direct network/dataLayer/Consent/console/GTM/vendor-SDK layers, per-fire status/latency/revenue evidence, point-in-time consent-denied audits, incident routing, and probable-cause alerts. GA4Fix currently needs the independent telemetry snippet to be used outside GTM for reliable detection when GTM itself is duplicated or broken.
