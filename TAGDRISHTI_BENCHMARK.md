# TagDrishti benchmark

Sources reviewed:

- https://www.tagdrishti.com/
- https://www.tagdrishti.com/features
- https://www.tagdrishti.com/audit
- https://www.tagdrishti.com/how-it-works
- https://www.tagdrishti.com/security

TagDrishti positions the product around real-user monitoring rather than crawler-only audits. Its public feature claims include direct interception of JS hooks, fetch/XHR, sendBeacon, dataLayer monitoring, script-injection detection, and network-pattern classification. It describes monitoring GA4, Meta, and 80+ vendors with each fire, failure, HTTP status, latency, consent state, revenue value, session context, and probable cause attached.

The audit workflow is a separate point-in-time product: a two-pass real-browser scan under default and consent-denied states, covering consent/privacy, PII/data quality, GTM health, GA4 configuration, attribution, ecommerce, server-side tracking, and app tracking. It produces severity-rated evidence and a fix plan.

The installation workflow uses one independent async script in the document head, intentionally outside GTM so the monitor survives a broken or blocked GTM container. Its public workflow lists six browser detection layers: network beacons, dataLayer, Consent Mode v2, console errors, GTM container events, and vendor SDK hooks.

The alerting/product workflow emphasizes real-time incidents, Slack/email/Teams/PagerDuty/webhook routing, per-tag thresholds, anomaly detection, consent drift, revenue impact, and a probable root cause. The security posture claims TLS/HSTS, rate limits, tenant isolation, scoped API keys, audit logging, pseudonymised sessions, and explicit compliance documentation.

Implication for GA4Fix: the current repository already has several of these layers, but the key product gap is evidence-driven observation. A duplicate alert should require two distinct tag/request observations tied to the same logical user action, retain the tag/trigger/source evidence, and surface delivery status and probable cause. Audit scans and continuous real-user monitoring should be represented as separate workflows rather than relying on a single GTM-generated snippet.
