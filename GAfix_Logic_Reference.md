# GAfix Logic Reference

**Purpose.** This document explains how the current GAfix implementation observes, normalizes, correlates, validates, stores, aggregates, and presents real-user tag evidence. It is written against the current repository implementation, not against an idealized future product. The central design principle is that GAfix distinguishes **what the browser observed** from **what GAfix infers** from that evidence. A configuration snapshot, a missing request, a failed request, and a confirmed browser block are different facts and must not be presented as interchangeable.[1][2][3]

> **Accuracy contract:** GAfix can prove that its monitor observed a dataLayer push, a function call, a network request, a response/failure, a consent state, or an explicit browser-blocking signal. It cannot always prove which exact GTM tag fired, why a browser blocked a request, or whether two separate business actions were actually the same action unless the implementation supplies sufficient identity evidence.

## 1. End-to-end architecture and data flow

The browser monitor is a compact, asynchronous observer intended to be installed as **one GTM Custom HTML tag** or through the GTM Connect workflow. It does not replace, cancel, or rewrite customer analytics tags. It observes dataLayer activity, selected analytics functions, fetch/XHR/sendBeacon calls, resource/performance signals, selected vendor globals, consent state, Web Vitals, console/CSP diagnostics, and monitor readiness. It batches observations to `/api/ingest` and sends blocker/delivery signals to `/api/blocked`.[1][4]

| Stage | What happens | Important boundary |
|---|---|---|
| Installation | GAfix generates one monitor URL containing the site API key and optional public GTM container ID. | The same monitor is used by GTM Connect and the manual Custom HTML path. Do not install both. |
| Observation | The monitor listens without taking ownership of customer functions. It records dataLayer, function, GTM, network, diagnostic, readiness, consent, and performance evidence. | Observation is best-effort. A request blocked before browser instrumentation may leave only a gap or explicit browser error. |
| Client batching | Events are buffered and sent in bounded batches. | A failed collector call is not a customer analytics failure; it is a monitor-delivery problem. |
| Ingestion authentication | The server validates the site API key, body size, event count, event shape, and supported observation kind. | Unknown or stale keys return `401`; they are never accepted merely to suppress console errors. |
| Normalization | URLs and sensitive parameters are redacted; client identifiers are HMAC-pseudonymized; values and nesting are bounded. | GAfix does not intentionally persist raw passwords, tokens, card data, email-like fields, or similar sensitive keys. |
| Enrichment | Delivery mode, event type, GTM correlation, parameter health, revenue fields, status, latency, and consent are derived. | GTM enrichment is configuration evidence, not direct runtime tag identity. |
| Persistence | Each normalized observation is stored as an occurrence-level event row. | Dashboards aggregate these rows, but duplicate investigations retain occurrence/network relationships. |
| Detection | Compliance evidence, custom-event first-seen handling, transport/consent checks, duplicate scoring, purchase validation, and alert creation run after persistence. | Detection errors are isolated from ingestion so one malformed observation does not discard the complete batch. |
| Presentation | Overview and diagnostics APIs aggregate the retained evidence over 24-hour, 7-day, or 1-hour windows as appropriate. | A dashboard count is usually a count of logical occurrences, sessions, or evidence rows—not necessarily a count of raw HTTP requests. |

### 1.1 Input limits and normalization

The ingestion contract accepts a JSON object with a valid hexadecimal site API key and a non-empty `events` array. The body is limited to 512 KB and 100 events per request. Event names are limited in length and must use the repository’s safe event-name format. Observation kinds are limited to `network`, `datalayer`, `gtm`, `function`, `monitor_ready`, and `diagnostic`.[2]

Telemetry URLs are sanitized by removing credentials, hashes, and common tracking or credential parameters such as API-key-like values, tokens, session identifiers, client identifiers, click IDs, email, and phone fields. Sensitive parameter keys are removed recursively within bounded depth and key counts. The browser client identifier is not stored directly; it is HMAC-hashed with the server-side IP hash secret when configured. These controls reduce the data GAfix retains, but customers should still avoid sending secrets or unnecessary personal data in event parameters.[2]

## 2. Installation and GTM connection logic

GAfix currently presents **one Script installation entry** with two paths. They install the same single monitor script.[5]

| Path | Current behavior | Customer action |
|---|---|---|
| GTM Connect | Customer authorizes Google, selects an account/container, optionally refreshes a configuration snapshot, and asks GAfix to create a monitor tag in a new reviewable workspace. | Review the workspace in GTM, then explicitly publish if desired. |
| Manual GTM Custom HTML | Customer creates one Custom HTML tag, pastes the generated monitor snippet, uses an All Pages trigger, and publishes through GTM. | Do not also place the snippet directly in the site head and do not also use GTM Connect for the same site. |

GTM Connect requires the GAfix owner to configure the OAuth client ID, secret, and callback URL once on the deployed service. Customers do not add backend environment variables or share OAuth credentials. The customer only authorizes the Google account that owns or can access the relevant GTM container. OAuth state validation, offline access, OIDC identity scopes, encrypted refresh-token storage, tenant ownership checks, and explicit publish actions are handled server-side.[6][7]

The generated monitor URL uses a configured monitor origin where possible. A customer first-party subdomain can be used for better delivery resilience and blocker analysis, provided it is configured in the deployment and site settings and allowed by the customer’s CSP under both `script-src` and `connect-src`.[5]

## 3. Event detection: standard, custom, internal, and unnamed

### 3.1 Classification rule

GAfix classifies event type with vendor-aware allowlists rather than guessing from arbitrary names. A GTM-vendor observation is `internal`. An event with no name is `unknown`. For GA4, automatic events and the recommended event set are `standard`; this includes events such as `page_view`, `scroll`, `session_start`, `first_visit`, `form_start`, `form_submit`, `video_progress`, `login`, `sign_up`, `search`, `generate_lead`, `purchase`, and the documented commerce events. Meta, TikTok, LinkedIn, Bing, and Snapchat also have supported standard-event families. Named events outside the applicable vendor set are `custom`.[3]

| Example | Current GAfix type | Reason |
|---|---|---|
| `page_view` | Standard | In the automatic-event allowlist. |
| `scroll` or `video_progress` | Standard and naturally repeatable | It is a normal event that may legitimately occur repeatedly. |
| `login` | Standard for GA4 | It is in the GA4 recommended-event allowlist, while still remaining a high-sensitivity event for identity and duplicate rules. |
| `run_audit` | Custom | It is a business/custom event name. |
| `purchase` | Standard for GA4, transaction-sensitive by detection rules | It receives purchase-specific validation and duplicate logic in addition to taxonomy classification. |
| Meta `Purchase` or Bing `pageLoad` | Standard for the respective vendor | Vendor-specific standard-event names are normalized case-insensitively. |
| `gtm.js`, `gtm.dom`, `gtm.load` | Internal in the GTM observation path | These are lifecycle/configuration signals, not customer business events. |
| An unnamed network request | Unknown or displayed as `(unnamed)` | GAfix does not invent an event name from an unrelated field. Vendor-specific display fallbacks may still make the row understandable. |

This distinction matters for customer interpretation: **“custom” does not mean unsupported or broken.** It means the name is outside the current automatic-event allowlist and should be checked against the intended GTM trigger, parameters, and business meaning. First-seen GA4 custom events are recorded in `custom_events_seen` and can produce an informational `custom_event_detected` alert; that alert is a validation prompt, not a failure.[3]

### 3.2 What counts as an observed event

GAfix can retain multiple observations for the same logical action. A dataLayer push, a wrapped function call, a GTM lifecycle observation, and one or more network requests may all be recorded. Each row carries correlation fields such as session ID, dataLayer push index, logical occurrence ID, network occurrence ID, request signature, page URL, navigation ID, source, transport, status code, latency, and delivery mode.[1][2]

A vendor event may therefore appear in the evidence store even when its name is absent from the dataLayer, because the monitor can identify a vendor network request and parse its URL/query fields. Conversely, a dataLayer event may appear without a network event if a tag did not fire, consent prevented delivery, a transport failed, the request was blocked before it could be observed, or the monitor/collector did not receive the observation.

## 4. DataLayer-to-network correlation

GAfix uses several identifiers rather than one simplistic event counter.

| Evidence field | Meaning |
|---|---|
| `dlPushIndex` | The monitor’s sequence position for a dataLayer push. It helps determine whether two observations came from the same push or separate pushes. |
| `occurrenceId` | The monitor’s logical event occurrence identity. It is used to group dataLayer and related runtime evidence. |
| `networkOccurrenceId` | The identity of an individual observed network occurrence. Different network occurrences can be produced by one logical dataLayer occurrence. |
| `requestSignature` | A normalized request identity used to compare requests while ignoring known volatile parameters. |
| `navigationId` | The page-navigation identity used to avoid treating SPA or multi-page navigation as a duplicate `page_view`. |
| `source` and `transport` | The implementation/transport path, such as GTM, direct code, SDK, fetch, XHR, or beacon when available. |

The relationship GAfix is designed to show is:

> **One user action → one dataLayer occurrence → zero, one, or multiple network calls.**

The important directional rule is that **one network call can never be a duplicate by itself**. A duplicate finding requires at least two comparable observations or a previously stored alert. Two network calls from one dataLayer occurrence are stronger evidence of GTM fan-out than two unrelated calls spread across different navigations or user sessions.[3][8]

## 5. Duplicate-event logic

Duplicate detection has two layers: the real-time detection engine and the duplicate dashboard’s derived evidence queries. The real-time engine is intentionally conservative; the dashboard also surfaces investigation evidence so operators can inspect suspicious repeat patterns without treating every repeat as proven duplication.[3][8]

### 5.1 Events excluded from duplicate findings

`scroll`, `click`, `user_engagement`, and `video_progress` are explicitly treated as naturally repeatable and excluded from duplicate detection. A page view is expected to repeat across different navigations. The engine checks page and navigation identity before considering repeated `page_view` observations.[3][8]

This is essential for SPAs and multi-user traffic. GAfix scopes candidate comparison by **site, vendor, event name, recent time window, and session**, and applies same-page requirements for custom/sensitive events. It does not compare every visitor’s event globally and call the result a duplicate.

### 5.2 Duplicate windows and evidence strength

| Evidence | Current interpretation |
|---|---|
| Same stable `transaction_id` or explicit `event_id` | Strong identity. For transactions and sensitive conversion events, a repeated strong identity is confirmed duplicate evidence. |
| Same dataLayer occurrence and multiple observations | Confirmed fan-out evidence when the observations are comparable and the same session/occurrence is established. Typical cause: multiple GTM tags or triggers responding to one push. |
| Same normalized request signature, distinct network occurrences, same session/page | Confirmed for high-value conversion/sensitive events; probable or confirmed depending on event class for other events. |
| Same normalized request URL on same page/session | Probable evidence for non-navigation events when no stronger identity is present. |
| Same payload on separate dataLayer pushes | Confirmed or probable depending on event class and navigation context. |
| Same event name and parameters within a session but no identity | Not enough for a real-time confirmed duplicate for high-value events. It may still appear as derived repeat evidence on the Duplicate page. |
| Same event across different sessions | Not a duplicate. Different visitors can perform the same action. |

Candidate search windows retain the same base classes—approximately 180 seconds for transaction/sensitive events, 15 seconds for navigation events, 30 seconds when strong identity or request signature exists, and 8 seconds for other events—but now adapt to the site’s recent P75 latency. GAfix multiplies the base by `clamp(P75 / 800ms, 0.5, 3.0)` and records the chosen window and observed gap in duplicate alert evidence. Naturally repeatable events are rejected before scoring.[3]

### 5.3 Duplicate root-cause labels

The root-cause text is selected from the strongest available relationship. It may state that the event was observed through multiple transports, that the same payload was pushed to the dataLayer more than once, that one dataLayer occurrence produced multiple analytics observations, that the same normalized request repeated, or that the same logical identity was delivered more than once. These are evidence-based hypotheses, not guaranteed internal GTM facts.[3]

The alert codes distinguish common causes such as `gtm_multiple_tags_or_triggers`, `gtm_and_direct_implementation`, `duplicate_purchase`, `duplicate_page_view`, and generic `duplicate_event`. Confirmed duplicate alerts are deduplicated for a short period by site, code, vendor, and event name; subsequent evidence increments the alert occurrence count instead of creating an alert storm.[3]

### 5.4 Duplicate dashboard safeguards and its limitation

During this documentation review, a route-level consistency issue was found and corrected: the detection engine emits `gtm_and_direct_implementation`, while the Duplicate API had previously filtered only a legacy misspelled variant. The API now accepts both spellings, so newly emitted and historical alerts remain visible.

The Duplicate page merges unresolved duplicate alerts with three derived evidence sets:

1. **Repeated network signatures:** same GA4 event, session, page, and request signature occurring more than once.
2. **Repeated occurrences:** GA4 network observations for repeat-sensitive events such as `login`, `run_audit`, `sign_up`, `purchase`, `begin_checkout`, `generate_lead`, and `subscribe`, when an occurrence has more than one network row or separate occurrence groups are within 120 seconds.
3. **GTM fan-out:** one session/event/page/occurrence ID with at least two network rows and at least two evidence IDs.

Malformed fan-out rows with fewer than two actual network observations are filtered out. Natural repeats are filtered out. Overlapping rows are deduplicated before the final 100-row result is returned.[8]

The practical limitation is important: the **derived repeat-evidence path can show a suspicious repeat pattern even when the real-time engine did not create a confirmed duplicate alert**. For example, two separate `login` occurrences close together may be displayed for investigation, but that alone does not prove one user action was duplicated. Failed-then-successful requests with the same signature inside five seconds are classified separately as **transport retries** and excluded from fan-out scoring. The strongest login finding is still one logical occurrence producing at least two successful network calls, or repeated requests carrying the same explicit identity.

## 6. Ad-blocker and delivery-blocking logic

GAfix deliberately separates **confirmed blocker evidence**, **likely blocker evidence**, **correlation gaps**, and **telemetry gaps**. This prevents ordinary request failures and missing data from being shown as proof of an ad blocker.[9][10]

### 6.1 Confidence classification

| Confidence | How it is produced | Dashboard meaning |
|---|---|---|
| `confirmed` | Explicit browser/client evidence such as `ERR_BLOCKED_BY_CLIENT`, `net::ERR_BLOCKED`, “blocked by client,” recognized extension/privacy-tool wording, or equivalent explicit block signal. | Actionable blocker evidence. |
| `likely` | Explicit wording that a probe/request/resource was blocked, but without the strongest browser error signature. | Investigate in Network and browser privacy settings. |
| `correlation_gap` | GAfix has related evidence suggesting a delivery/correlation problem, but no explicit browser block proof. | Not proof of an ad blocker. |
| `telemetry_gap` | The monitor/collector could not establish the request or its outcome, or the signal had no explicit blocker wording. | Monitoring-health issue or missing evidence, not proof of an ad blocker. |

The blocked endpoint validates the site API key, checks the registered telemetry origin where an origin is supplied, redacts URLs, pseudonymizes the client IP, applies rate limits and short-window deduplication, classifies delivery mode, and stores the signal. Vendor families are inferred from URL/function text using patterns for GA4, Google Ads, Meta, TikTok, LinkedIn, Snapchat, Pinterest, Reddit, and Bing.[9]

### 6.2 What is not a blocker

A vendor endpoint returning **HTTP 200 or 204 is a successful response**, not a blocked request. A resource error, HTTP error, CORS failure, CSP problem, timeout, or missing correlation record may have many causes. Fetch responses with status `0` require an additional distinction: an opaque cross-origin response can hide the status and body even when the request was sent, so GAfix retains it as an observation without promoting it to an `http_0` delivery failure. Non-opaque status-zero failures and explicit browser failure reasons remain transport evidence. Unless the browser supplies explicit block evidence, GAfix should display the result as transport failure, correlation gap, or telemetry gap—not as a confirmed ad blocker.

The Ad-blocker page counts confirmed blocker events/sessions separately from correlation and telemetry gaps. Its actionable “recent” list contains confirmed/likely evidence; its “Monitor delivery health” or telemetry list contains gap evidence and explicitly warns that those rows are not proof of an ad blocker. Internal lifecycle noise such as GTM, Termly, and `userPrefUpdate` correlation callbacks is excluded from blocker analytics so CMP/GTM housekeeping does not inflate the result.[9][10] Signals without explicit blocker wording are also written to a tenant-scoped **blocker pattern review queue** with bounded vendor/signal/count/timestamp evidence. Recurring candidates are review material, not automatically promoted blocker rules.

### 6.3 Why GAfix cannot detect every blocked request

If a browser extension prevents the request before the monitor can observe a response or an error, GAfix may only see the attempted path, a probe signal, a delivery gap, or no signal at all. A first-party monitor and first-party collector can improve resilience, but they cannot make a browser extension’s decision directly observable in every browser. This is why the product reports confidence rather than claiming universal blocker detection.

## 7. Consent logic

The monitor captures consent state alongside observations when it can read the configured CMP or custom consent object. The current supported guidance includes OneTrust, Cookiebot, Iubenda, Usercentrics, and a manual `window.__g4f_consent` object that must exist before the monitor loads.[11]

For GA4 network requests, GAfix reads the `gcs` value and decodes its two storage bits generically as `G1<ad_storage><analytics_storage>`, where `1` is granted and `0` is denied. Therefore `G100`, `G101`, `G110`, and `G111` all decode deterministically; specifically, `G111` means both `ad_storage` and `analytics_storage` are granted, while `G110` means analytics storage is denied. When analytics storage is denied, GAfix creates an **informational consent alert** explaining that the event was sent under denied analytics storage. The alert explicitly says this is a consent state and **not proof of ad blocking or delivery failure**.[3][24][25]

The correct interpretation is therefore:

| Observation | Interpretation |
|---|---|
| GA4 request with `gcs=G111` | Consent Mode state says both ad storage and analytics storage are granted. |
| GA4 request with HTTP 200/204 and denied storage | A request was delivered under a consent-restricted state; it may be an allowed cookieless/consent-mode request. |
| Denied storage plus browser block error | Two separate findings may exist: consent state and transport/blocker evidence. One does not prove the other. |
| No consent state observed | Coverage gap until the CMP/consent object is visible; not automatically a consent violation. |

The current Consent dashboard page is primarily compatibility guidance and states that live consent-gated validation, regional spot checks, and CMP misconfiguration alerts are future work. Runtime consent evidence is currently visible through event records, transport/consent alerts, Audit, and Tag health rather than through a fully live consent-specific dashboard.[11]

## 8. Client-side versus server-side delivery

GAfix does not trust a browser-supplied `deliveryMode` label as the source of truth. It classifies the destination hostname from the observed request URL.[12]

| Destination | Classification |
|---|---|
| The page host, configured site domain, configured first-party domain, or configured GAfix application origin | `server_side` |
| Known platform hosts such as Google Analytics, Google Ads, Meta, TikTok, LinkedIn, Snapchat, Bing, Pinterest, Reddit, and other listed ad/analytics domains | `client_side` |
| Any other host not matching the above rules | `unknown` |

The Overview/API flow summary groups logical event occurrences, sessions, failures, destination counts, and domains by delivery mode. The blocked-flow summary applies the same mode to actionable blocker signals. A request sent to a customer-controlled server-side tagging endpoint can therefore be distinguished from a direct browser request to `www.google-analytics.com`, `px.ads.linkedin.com`, `bat.bing.com`, or another platform endpoint.

This is **destination intelligence**, not a claim about the entire vendor’s internal processing. An event can be sent to a first-party server-side endpoint and later forwarded to a vendor; GAfix can classify the observed first hop but cannot prove every downstream server-side hop without server logs or vendor-side evidence.

## 9. GTM inventory, tag names, triggers, and confidence

GTM Connect retrieves accounts, containers, workspaces, and a tenant-scoped snapshot of tags, triggers, and variables. The snapshot records that it came from a workspace, captures available live-version metadata, and is marked stale/non-published for confidence purposes. New runtime observations are matched against the most recent snapshot for the observed public container ID; an exact match from stale workspace inventory is downgraded to `likely_match` rather than presented as live proof.[6][7]

> **GTM limitation:** GAfix does not receive a magical browser-side “this exact GTM tag fired” identifier from the network request. It correlates the observed event with the configured inventory. Therefore the UI must show confidence and must not fabricate a tag name when the match is ambiguous or absent.

### 9.1 Matching confidence states

| State | Meaning |
|---|---|
| `configuration_match` | One configured tag is a strong event/platform match, usually using exact event/trigger semantics and compatible identifiers. |
| `likely_match` | The tag is compatible but the available evidence is weaker than a unique exact match. |
| `ambiguous` | Multiple configured tags tie as candidates. GAfix does not display one as the exact tag. |
| `unmatched` | No configured tag satisfies the event-specific matching rules, or no inventory snapshot exists. |

### 9.2 Event-specific matching rules

GA4/custom/Meta/LinkedIn/Bing/Snapchat events require event-specific agreement. An exact configured tag event name or an exact custom trigger event name is needed for named events. A shared vendor ID by itself is not sufficient for a custom event. Base page semantics are the exception: base events such as Meta `pageview`, LinkedIn `pageview`, Bing `pageLoad`, and Snapchat `pageview` can use an exact configured platform ID as supporting evidence.[7]

Google Ads uses conversion-specific evidence. The matcher extracts conversion IDs from configured tag parameters and from request paths such as `/pagead/conversion/<id>/` and `/pagead/viewthroughconversion/<id>/`. It compares conversion IDs, conversion labels, and `send_to` values where present. Remarketing/view-through requests and `gtag.config` initialization are handled as remarketing configuration rather than being failed for not having a conversion label.[7]

When multiple candidates remain tied, the UI shows **Multiple possible tags**. When no unique candidate exists, it shows **Not matched** or the appropriate unavailable state. The trigger name is shown only for a unique matched tag. This prevents the most damaging form of false precision: showing the wrong GTM tag as if it were proven.

## 10. Parameter-health rules

Parameter health is evaluated from normalized event parameters and, where relevant, request URL query/path fields. The result is `complete`, `missing`, or `not_applicable`.[7]

| Vendor/event condition | Required evidence |
|---|---|
| GA4 `purchase` | `currency`, `value`, and `transaction_id` (with supported aliases). |
| Google Ads conversion | Conversion ID plus conversion label/label/`send_to` equivalent. Conversion ID can come from the request path. |
| Google Ads remarketing/view-through/config | No conversion-label requirement; these are not conversion events. |
| Meta | Pixel ID plus event name/event field. |
| LinkedIn | Partner ID (`pid` or supported alias). |
| Bing UET | UET tag ID (`ti` or supported alias). |
| Snapchat | Pixel ID (`pid`, `pids`, or supported alias). |
| Other events/vendors | No vendor-specific required set in the current parameter-health function. |

A missing-parameter alert is a **payload-quality finding**. It means the observed request did not contain the required field; it does not mean the tag failed to fire. For Google Ads, the alert directs the operator to verify conversion ID, label, or `send_to`, while allowing intentionally non-applicable configurations to remain so.[3][7]

## 11. Platform-by-platform behavior

### 11.1 Google Analytics 4

GA4 is recognized from Google Analytics collection URLs and related functions. GA4 event names are taken from the event observation or parsed request fields when available. The GA4 page is the shared vendor view with vendor `ga4`; it shows event type, count, sessions, average latency, failures, parameter status, GTM tag/trigger candidates, and alerts.[1][13]

GA4 purchase events receive additional checks for `currency`, `value`, and `transaction_id`. Missing currency or transaction ID creates critical purchase alerts because the missing identity/amount can impair revenue reporting and reliable purchase deduplication. GA4 `login`, `run_audit`, and other business events are custom under the current classification allowlist, but they are still fully observable and can be matched to exact GTM event/trigger configuration.

### 11.2 Google Ads

Google Ads is recognized from Google Ads/Google Syndication/pagead/conversion request patterns. The display logic prefers an event name, then conversion label, `send_to`, conversion ID, or a generic `conversion`. When an event name is absent, the UI intentionally shows the conversion label and/or ID rather than `unnamed`.[13]

The conversion ID can be parsed from a URL path, including both conversion and view-through conversion paths. Conversion-label validation applies to conversion requests, not remarketing or `gtag.config` initialization. The Google Ads tag matcher uses exact ID/label/send-to evidence and identifies remarketing tag types separately.[7]

### 11.3 Meta/Facebook Pixel

Meta events use pixel ID fields such as `id`, `pixel_id`, or `pixelId`, and event fields such as `ev`, `event`, or `event_name`. If no explicit event name is present, the shared view falls back to `PageView`. Meta base page events can use exact pixel-ID agreement as configuration evidence; custom events require exact event/trigger semantics rather than pixel ID alone.[7][13]

### 11.4 TikTok

The monitor recognizes TikTok analytics/business endpoints and TikTok function patterns, and blocker classification includes TikTok URL/function patterns. The current dashboard has a TikTok wrapper, but the GTM inventory matcher and parameter-health rules do not currently provide the same dedicated TikTok ID/event validation implemented for Meta, LinkedIn, Bing, or Snapchat. TikTok rows therefore rely primarily on generic observed event/network evidence, failures, sessions, latency, and available alerts. This is a current scope limitation, not a claim that TikTok is unobserved.[1][9][13]

### 11.5 LinkedIn Insight Tag

LinkedIn events use `pid`, `partner_id`, or `partnerId` to identify the partner. The current UI defaults an unnamed LinkedIn row to `page_view`. The supplied LinkedIn request shape uses `px.ads.linkedin.com/collect`, a partner ID, and a successful HTTP 200 response; a successful 200 is not a blocker.[13]

Named LinkedIn custom events require exact event/trigger agreement for GTM correlation. Base page semantics can use exact partner-ID agreement. The required parameter-health check is partner ID presence.[7]

### 11.6 Bing UET

Bing UET requests use `ti` or equivalent fields for the UET tag ID and `evt`/event fields for event semantics. The shared view defaults an unnamed event to `pageLoad`. The standard UET sample uses an HTTP 204 response, which is a valid successful beacon response and must not be labeled blocked.[13]

The required parameter-health check is the UET tag ID. Base page-load semantics can use exact ID agreement, while custom event matching requires exact event/trigger evidence.[7]

### 11.7 Snapchat Pixel

Snapchat events use `pid`, `pids`, `pixel_id`, or `pixelId` for pixel identity and `ev`/event fields for event semantics. The shared view defaults an unnamed event to `PAGE_VIEW`. A successful 200 response is delivery evidence, not blocker evidence.[13]

The required parameter-health check is pixel ID. Base page-view semantics can use exact pixel-ID agreement; named events require exact event/trigger matching.[7]

### 11.8 Pinterest, Reddit, and other recognized families

The monitor and blocker classifier recognize additional vendor URL/function patterns including Pinterest, Reddit, Criteo, Clarity, Hotjar, Segment, Mixpanel, and Amplitude. These vendors can appear in generic event/resource/delivery evidence. The current first-class GTM correlation and vendor pages are focused on GA4, Google Ads, Meta, TikTok, LinkedIn, Bing, and Snapchat; unsupported vendors should not be described as having the same ID/parameter diagnostics unless a dedicated rule exists.[1][9][12]

## 12. Alert and notification logic

### 12.1 Alert categories

The detection engine can create alerts for custom-event first seen, missing parameters, transport failures, HTTP failures, GA4 consent-denied state, missing purchase currency, missing purchase transaction ID, and confirmed duplicate evidence. Alerts include severity, category, vendor, event name, message, root cause, fix steps, page URL, raw evidence references, occurrence counts, distinct pushes, confidence, and timestamps.[3]

| Severity | Current examples |
|---|---|
| Critical | Missing purchase currency/transaction ID, purchase duplication, and confirmed high-score sensitive/conversion duplication. |
| Warning | Transport/HTTP failures, missing non-purchase parameters, probable/ordinary confirmed duplicate incidents. |
| Info | First-seen custom event and GA4 analytics-storage-denied consent state. |

Alert creation uses a short dedupe window keyed by site, alert code, vendor, and event. Repeated evidence updates the existing unresolved alert instead of sending an independent alert for every row.[3]

### 12.2 Realtime channels and 24-hour digest

Slack, email, and signed webhook deliveries are queued only when the alert severity is at least the site policy’s `realtime_min_severity` and the channel is enabled. The default realtime threshold is critical. Delivery rows expose pending, retry, delivered, and failed status. Each delivery receives up to five attempts with exponential backoff, and timeouts/failures remain visible in Overview and Integrations.[14]

Lower-priority evidence is summarized by the daily digest. The digest includes total events, duplicate findings, confirmed blocker evidence, correlation/telemetry gaps, transport failures, and the top root causes. The digest is generated once per site/window and sent according to the configured digest hour and enabled channels. Correlation/telemetry gaps are explicitly not counted as confirmed ad blocking.[14]

## 13. Dashboard section logic

### 13.1 Overview / Command Center

Overview refreshes the events, tag-health, duplicates, and alert-delivery APIs every 10 seconds. It combines these responses into a real-user command center.[15]

| Section/KPI | Current calculation or source |
|---|---|
| Overall tag health | Average of event-level `health_score` values returned by Tag health. It is null while evidence is still being collected. |
| Events/hour | `events_hour` from `/api/events`: distinct occurrence keys observed in the last hour. |
| Fires/session | Aggregated fires divided by the backend’s distinct 24-hour session count. It is shown only after the shared 30-session minimum is reached; below that it displays collecting evidence. |
| Failed fires | Sum of event-level failures from Tag health, where HTTP status is at least 400 or a failure reason exists. |
| Detection coverage | Scored persisted events divided by persisted events in 24 hours. It is null/collecting while fewer than 30 persisted events exist, and failed scoring attempts are visible separately. |
| Duplicate evidence | Number of merged duplicate rows returned by the Duplicate API; transport retries are returned separately and excluded. |
| Delivery failures | Failed alert-delivery rows returned by the delivery-status API. |
| Event intelligence / heatmap | Grouped event volume and session spread from `/api/events`. |
| Action queue / Action center | First duplicate and unresolved-alert items, collapsed by normalized event/vendor. The UI preserves the newest/oldest timestamps and shows grouped incident counts. |
| Delivery health | Most recent Slack, email, and webhook delivery state. |
| Live event pulse | Top grouped event rows with vendor, fires, sessions, failures, and average latency. |

The Overview is an operator summary, not a proof engine. Selecting an action opens the underlying evidence/alert so the customer can see the event, timestamps, session, occurrence, network, root cause, and fix steps.

### 13.2 Vendor pages: GA4, Google Ads, Meta, TikTok, LinkedIn, Bing, Snapchat

All first-class vendor pages use the shared Vendor view and refresh every 5 seconds. Each page supplies the vendor key and configured site ID; the shared view supplies event charts, source-lane charts, event breakdown, GTM match/trigger, parameter status, counts, sessions, latency, failures, and vendor alerts.[13]

The “Events (24h)” tile sums grouped event counts, “Unique event names” counts grouped rows, and “Validation issues” counts vendor-matching alerts. The event table’s display name uses vendor-specific fallbacks, so Google Ads can show conversion label/ID and Meta/LinkedIn/Bing/Snapchat can show page defaults rather than generic unnamed rows.

### 13.3 Sessions

The Sessions page is backed by `/api/sessions` and groups events by `session_id` over 24 hours. It shows the last page URL, distinct logical event count, error count, unique event-name count, start time, last-seen time, and duration. Totals include session count, average distinct event count, and sessions containing errors. A session is the monitor’s browser session identifier, not a verified human identity.[16]

### 13.4 Revenue

Revenue is currently a visualization of `revenue_reconciliations` returned through Tag health, not a separate payment processor or accounting engine. The page treats `value_mismatch`, `missing`, and `duplicate` statuses as at risk, computes matched rows as total rows minus mismatch rows, and sums absolute `delta_value` for the displayed reconciliation set. Customers should treat it as telemetry reconciliation evidence, not a source of truth for financial books.[17]

### 13.5 Tag health

Tag health groups retained events by vendor and event name over 24 hours. For each group it calculates fires, successes, failures, average latency, P75 latency, consent-denied count, and last seen. Success rate and health score are intentionally null until the group reaches the shared 30-fire minimum, preventing very small samples from being presented as reliable percentages. Once sufficient evidence exists, the health score is:

```text
health_score = max(0, round(successes / max(1, fires) × 100 - min(30, failures × 2)))
```

The page labels scores of 95 or higher as stable, 80–94 as review recommended, and below 80 as action required. The performance panel and evidence panels additionally show anomalies, revenue reconciliation, open compliance findings, and page-level Web Vitals.[18]

### 13.6 Web Vitals

Web Vitals are real-user observations stored with events. The backend calculates page-level P75 values over seven days for LCP, FCP, INP, TTFB, and CLS. The UI uses these thresholds for status coloring: LCP 2,500/4,000 ms, INP 200/500 ms, FCP 1,800/3,000 ms, TTFB 800/1,800 ms, and CLS 0.10/0.25. The page is a production P75 view, not a lab test; page, device, traffic mix, and sample count matter.[18][19]

### 13.7 Run Audit / Audit section

The Audit endpoint builds a runtime-evidence audit and can persist a snapshot. The current checks are: monitor heartbeat, GA4 events arriving, GA4 transport health, custom-event coverage, consent-state evidence, Web Vitals evidence, ad-block signal coverage, duplicate implementation health, and the open incident queue. The score is the percentage of the nine checks whose finding severity is `pass`.[20]

A failed custom-event check means no custom event has yet been observed in the selected 24-hour window; it does not mean GAfix is incapable of detecting custom events. A failed ad-block coverage check can simply mean the site has not produced a blocker signal. A passed heartbeat means the monitor has reported readiness recently; it does not guarantee every vendor tag fired.

### 13.8 Duplicate Events

The Duplicate page is the evidence laboratory described in Section 5. It displays source type, code, message, root cause, fix steps, occurrence/network counts, timestamps, dataLayer occurrence, session, and event evidence IDs where available. It combines real-time alerts with derived evidence and removes natural-repeat events and malformed fan-out rows.[8]

### 13.9 Ad-blocker Impact

The Ad-blocker page polls the adblock API and calculates its headline confirmed-rate KPI as confirmed blocked sessions divided by total observed sessions only after the shared 30-session minimum is reached. Below that threshold it displays collecting evidence rather than a potentially misleading percentage. It separates actionable confirmed/likely blocker rows from telemetry/correlation gaps and exposes the recurring pattern review queue. The vendor breakdown is based on the vendor families inferred from blocked URLs/signals, not on an independent vendor-side report.[9]

### 13.10 Consent

The current page is a static compatibility guide for CMPs, while runtime evidence is captured in events and surfaced through consent alerts, Audit, and Tag health. Live region-aware consent gating and CMP misconfiguration checks are explicitly not yet implemented in the page itself.[11]

### 13.11 Compliance

Compliance evidence is recorded only for diagnostic events named `script_injected`, `resource_error`, `resource_blocked`, or `csp_violation`. GAfix sanitizes the diagnostic URL, compares it with the monitored site domain, configured first-party domain, and customer allowlist, and creates findings for unknown scripts, CSP violations, or unrecognized supply-chain/resource problems. Known approved scripts are not reported as unknown; CSP violations remain meaningful even when the host is known.[21]

The Compliance page lists findings and lets the customer add a hostname/path-prefix/hash allowlist entry. Allowlisting should be limited to scripts the customer has independently approved; it should not be used to hide unexplained third-party resources.

### 13.12 GTM Diagnostics and GTM Connect

The GTM Connect page provides the OAuth/container/workspace/inventory/install/publish flow. Inventory refresh stores the current tag, trigger, and variable snapshot. Runtime rows show tag names and trigger names only under the confidence rules in Section 9. The page intentionally tells operators that the browser monitor remains the runtime source and inventory is configuration evidence.[6][7]

GTM publishing is a separate explicit action after a new workspace is created. Customers should review the workspace in GTM before publishing and use GTM version history for rollback.

### 13.13 Integrations and Settings

Integrations controls alert policy/channel behavior, Slack testing, signed operational webhooks, exports, and recent delivery records. Slack may come from the site configuration or the deployment-level fallback, but a configured URL is not the same as a delivered alert; delivery status must be checked. Webhooks are validated as safe public HTTPS destinations, may be signed, and are tenant-scoped.[14][22]

Settings/Sites stores the monitored domain, optional first-party domain, vendor IDs, GTM public container ID, and generates the per-site monitor API key. All site APIs verify that the selected site belongs to the authenticated user. Key rotation now preserves the previous key for a bounded 48-hour grace period while the new key is placed in the current snippet; the old key then expires hard. The UI exposes only the old-key expiry timestamp, not the old credential. Customers must update the GTM monitor before expiry.[23]

### 13.14 Synthetic Checks

Synthetic Checks is no longer in the primary sidebar navigation as requested. The route and supporting backend may still exist in the repository, but the current primary customer workflow emphasizes real-user evidence, one monitor installation, vendor diagnostics, duplicates, blockers, consent, compliance, and alert delivery.

## 14. Security and privacy behavior relevant to the logic

Dashboard APIs require a valid JWT session and verify site ownership with `site.user_id = session.uid`. Public ingestion uses a per-site API key and does not accept a stale or unknown key. SQL access uses parameterized queries. GTM refresh tokens are encrypted at rest and are never intended for browser exposure. Webhook secrets are encrypted and used to sign outbound payloads. Outbound webhook destinations are restricted to safe public HTTPS URLs.[6][9][22][23]

The browser monitor is intentionally observational. It should not call `preventDefault`, stop propagation, replace vendor network responses, or throw into the host page’s application flow. Its own reporting failures should be swallowed or isolated so a monitoring outage does not break customer tracking. Persisted detection now records `scored` or `failed` status; failed scoring is placed in a bounded dead-letter table and can be reprocessed by the protected detection job. Customers should still use one copy only, keep the monitor in an appropriate GTM tag, and ensure their CSP permits the monitor origin.

GAfix redacts sensitive parameter keys and URL fields, but privacy compliance remains a shared responsibility. Customers must configure a lawful consent strategy, avoid sending prohibited personal data, limit access to the dashboard, rotate exposed API keys/secrets, and use an approved first-party/collector domain where required by their privacy and security program.

## 15. Known limitations and non-overclaims

| Do not infer | Correct interpretation |
|---|---|
| “The vendor returned an error, so an ad blocker caused it.” | It is a transport/resource failure until explicit browser-block evidence exists; status `0` can also be an opaque browser response. |
| “The vendor returned 200/204, so the event was blocked.” | 200/204 is successful HTTP delivery evidence. |
| “`gcs=G111` means GA4 failed or analytics storage was denied.” | `G111` indicates both storage signals are granted; `G110` is the two-bit state with analytics storage denied. Neither state alone is a blocker verdict. |
| “A GTM inventory candidate is the exact runtime tag.” | It is a configuration match with a confidence state. Exact identity is not guaranteed by a network request alone. |
| “Two login rows always mean one login duplicated.” | Check session, occurrence ID, dataLayer push, network occurrence, request signature, and timing. Separate user actions are possible. |
| “One dataLayer push always creates one request.” | Multiple tags/triggers can create multiple requests from one push; this is the strongest browser-side fan-out evidence. |
| “A repeated scroll/click/user_engagement/video_progress is a duplicate.” | These are naturally repeatable and intentionally excluded. |
| “A missing parameter means the GTM tag did not fire.” | The observed request arrived but lacked a required field. It is a payload-quality issue. |
| “Google Ads remarketing needs a conversion label.” | Remarketing/view-through/config requests are excluded from conversion-label validation. |
| “Unknown or stale API keys should be accepted so the customer sees no 401.” | A 401 protects tenant isolation. Replace historical snippets/tags with the current site snippet. |
| “The server-side mode proves the vendor received the event.” | It identifies the observed destination hop; downstream forwarding requires server/vendor evidence. |

## 16. Recommended investigation workflow

When a customer reports a missing event, first confirm that the current monitor snippet uses the current site API key and the correct monitor origin. Then verify the monitor heartbeat and collector response before diagnosing the vendor tag. Next, inspect the event on the Overview or vendor page and compare its `event_type`, source, observation kind, session, occurrence ID, delivery mode, status, latency, and parameter status.

For a possible duplicate, inspect the Duplicate page and distinguish three cases: separate dataLayer pushes, one dataLayer occurrence with multiple network calls, or repeated normalized network requests. Open GTM Preview for the exact dataLayer event, count firing tags/triggers, check direct `gtag()`/SDK code, and verify whether the application success callback or SPA lifecycle handler ran more than once. Do not use a repeated naturally repeatable event as evidence of duplication.

For a possible blocker, verify the actual Network response/status and browser console wording. Treat `ERR_BLOCKED_BY_CLIENT` and explicit extension/privacy-tool evidence as strong; treat generic failures and missing rows as gaps. Compare direct vendor delivery with first-party/server-side delivery and confirm the customer’s CSP and first-party domain configuration.

For a consent finding, inspect the CMP default/update sequence and the consent state immediately before the event. A denied storage state should be investigated against the customer’s consent policy, but it should not be relabeled as ad blocking. For a missing parameter, inspect the final request payload and the matched GTM tag/trigger configuration; parameter health is about the request that arrived.

## References

[1]: https://github.com/PriyatoshKadam/manusai18081/blob/main/public/monitor.js "GAfix browser monitor"
[2]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/ingest-validation.ts "Telemetry normalization and validation"
[3]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/detection.ts "Event classification, duplicate detection, consent, and alert rules"
[4]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/ingest/route.ts "Telemetry ingestion pipeline"
[5]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/dashboard/install/page.tsx "Unified installation page"
[6]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/gtm.ts "GTM OAuth and installation helpers"
[7]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/gtm-inventory.ts "GTM inventory normalization, matching, and parameter health"
[8]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/duplicates/route.ts "Duplicate evidence aggregation API"
[9]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/blocked/route.ts "Public blocked-signal collector"
[10]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/adblock/route.ts "Authenticated blocker diagnostics API"
[11]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/dashboard/consent/page.tsx "Consent dashboard compatibility guidance"
[12]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/delivery.ts "Client/server delivery classification"
[13]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/dashboard/vendor-view.tsx "Shared vendor diagnostics UI"
[14]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/notifications.ts "Alert delivery and daily digest engine"
[15]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/dashboard/page.tsx "Overview dashboard orchestration"
[16]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/sessions/route.ts "Session aggregation API"
[17]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/dashboard/revenue/page.tsx "Revenue reconciliation UI"
[18]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/tag-health/route.ts "Tag health aggregation API"
[19]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/dashboard/vitals/page.tsx "Web Vitals UI and thresholds"
[20]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/audit/route.ts "Runtime-evidence audit API"
[21]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/compliance.ts "Runtime compliance evidence"
[22]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/webhooks/route.ts "Tenant-scoped webhook management"
[23]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/sites/route.ts "Site configuration and API-key management"
[24]: https://developers.google.com/tag-platform/security/concepts/consent-mode "Google Consent Mode overview"
[25]: https://support.google.com/tagmanager/answer/13802165?hl=en "Google Tag Manager Consent Mode reference"
[26]: https://github.com/PriyatoshKadam/manusai18081/blob/main/lib/metrics.ts "Shared sample-size metrics"
[27]: https://github.com/PriyatoshKadam/manusai18081/blob/main/app/api/jobs/route.ts "Protected operational jobs"
[28]: https://github.com/PriyatoshKadam/manusai18081/blob/main/db/schema.sql "Idempotent operational schema"
