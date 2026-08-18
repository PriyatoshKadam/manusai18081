# Latest deployed event-path findings

The customer log uses `dev-app.gafix.ai` as the monitor origin. `https://dev-app.gafix.ai/monitor.js` currently serves the dashboard host's Page Not Found page, not GA4Fix monitor code. The actual telemetry deployment `https://monitoring-0jsu.onrender.com/monitor.js` serves GA4Fix monitor version `11.0`.

The attached network request proves GA4 itself sends `run_audit` to `/metrics/g/collect` with `en=run_audit` and receives HTTP 204. Therefore, absence from GA4Fix is caused by the monitor origin/deployment path or ingestion, not GA4 failing to fire. The customer must use the telemetry deployment (or a custom domain mapped to it) as the monitor origin and recopy the snippet after deployment.
