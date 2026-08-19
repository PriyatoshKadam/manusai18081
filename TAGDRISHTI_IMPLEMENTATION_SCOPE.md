# TagDrishti-style implementation scope

## Goal

Implement the remaining TagDrishti-style capabilities in GA4Fix while explicitly excluding BigQuery and agency multi-client workspace features.

## Included scope

| Capability | Planned implementation area |
|---|---|
| Real-user vendor monitoring | Expand `public/monitor.js` vendor interception and normalized per-fire evidence. |
| Reliable alerts | Durable alert delivery state, Slack/email/webhook routing, incident policies, retry and flood protection. |
| Adaptive health | Rolling baselines, success/failure-rate drift, latency drift, consent drift, and tag-health scores. |
| Revenue protection | Revenue normalization, purchase completeness, revenue-at-risk alerts, and cross-vendor conversion reconciliation. |
| Performance attribution | P75/P95 CWV and resource latency summaries with vendor/tag attribution. |
| Synthetic monitoring | Saved journeys, scheduled checks, browser evidence, and synthetic-vs-real-user comparison. |
| Compliance/security | Script allowlists, unknown-script detection, CSP/SRI evidence, PII scrubbing, consent-region reporting, and checkout-page supply-chain checks. |
| Reporting/exports | CSV/JSON exports, PDF-ready reports, signed webhooks, and per-site operational controls. |
| Customer dashboard | Unified health overview, incidents, tag/vendor health, anomaly timeline, revenue impact, compliance, performance, and setup guidance. |

## Explicit exclusions

BigQuery streaming/warehouse export and agency multi-client workspace features are not part of this implementation. The product remains a single-user, multi-site workspace with site-level data isolation.

## Product principles

1. Every alert must show evidence, confidence, probable cause, and next action.
2. A correlation gap must never be presented as proof of ad blocking.
3. Duplicate findings must be scoped by browser session, navigation, event identity, and request signature.
4. Real-user evidence is the primary signal; synthetic evidence is labeled separately.
5. The customer uses one monitor installation path. GTM Connect is recommended, and manual GTM is the fallback using the same monitor tag.
6. External notification delivery must be durable, retryable, and observable.

## Public benchmark source

Source: https://www.tagdrishti.com/

The public product page describes real-user per-fire monitoring across many vendors, HTTP status and latency evidence, Slack alerts, adaptive rolling baselines, revenue-at-risk and cross-vendor reconciliation, Core Web Vitals attribution, synthetic journeys, consent/compliance controls, script allowlists, CSP/SRI/Magecart evidence, and direct developer installation outside GTM. GA4Fix is implementing the evidence and operations capabilities while retaining the user-selected GTM-first installation workflow. BigQuery export and agency multi-client workspace remain explicitly excluded.
