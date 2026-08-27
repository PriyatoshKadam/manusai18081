# Google Ads `http_0` alerts in GAfix

## Short meaning

`http_0` is **not an HTTP status code returned by Google Ads**. In the current GAfix alert engine, it is a synthesized reason used when a fetch response reports status `0`, is not considered successful by the browser, and is not recognized as an opaque response.

Status `0` means GAfix does not have a usable HTTP status code for that observation. It can occur with a browser-level transport failure, a blocked or cancelled request, a CORS/CSP/network problem, or an opaque cross-origin response. An opaque Fetch response is an important exception: the browser hides the response status and body, but the request may still have been sent. GAfix now records opaque status-zero responses as observations without creating an `http_0` delivery-failure alert. A non-opaque status-zero failure can still produce `http_0`. Neither case proves that Google Ads rejected the request or, by itself, proves an ad blocker.

## How the alert is created

The browser monitor observes Google Ads-related requests through its network and resource instrumentation. GAfix then normalizes the vendor, event name, request URL, response status, latency, and failure reason before persistence.

The detection engine applies this logic:

| Condition | GAfix result |
|---|---|
| Status is 400 or higher | `tag_http_failure`; reason is the actual status, such as `http_400` or `http_500`. |
| Failure reason exists but no HTTP error status is available | `tag_transport_failure`; reason is the browser failure text. |
| Fetch status is `0` and the response is non-opaque with no more specific reason | `tag_transport_failure`; synthesized reason is `http_0`. |
| Fetch status is `0` and the response type is `opaque` | Observation is retained with no `http_0` failure alert because the browser intentionally hides the cross-origin response status. |
| Status is 200 or 204 | No HTTP/transport failure alert should be created from that observation. |
| Explicit browser blocker evidence exists | Separate blocker evidence is recorded; this is stronger than a generic `http_0`. |

The alert message is generated from the vendor and event fallback name:

```text
gads <event-or-fallback-name> failed to deliver (http_0).
```

The implementation intentionally explains in the alert root cause that this is a failed analytics transport or HTTP observation and **not automatically an ad blocker**.

## What the alerts in the screenshot mean

| Alert | Meaning |
|---|---|
| `gads form_start failed to deliver (http_0)` | A Google Ads-classified `form_start` observation had no normal response status and no more specific browser failure reason. |
| `gads page_view failed to deliver (http_0)` | The same transport condition occurred for an observation displayed as `page_view`. Check the raw request to confirm whether this was a conversion request or a base/remarketing request. |
| `gads ECvDCMKb15oYENfduaIp failed to deliver (http_0)` | GAfix used a parsed Google Ads identifier or label as the display name because a clearer event name was unavailable. It is still a transport observation, not proof of a Google Ads-side rejection. |
| `gads AW-11078102743 failed to deliver (http_0)` | GAfix used the parsed conversion ID as the display name. The request was observed with status `0` or equivalent missing-response evidence. |
| `gads tag failed to deliver (http_0)` | No more specific event, label, or conversion ID was available for the failed Google Ads observation. |
| `gads gtag.config failed to deliver (http_0)` | A Google tag configuration/initialization request could not be confirmed as receiving a normal response. This is not itself a conversion-label error. |
| `GADS page_view is missing conversion_id, conversion_label` | This is a separate payload-quality alert. GAfix believes the observed request is conversion-like and did not find the required ID and label/send-to fields. It is not the same as `http_0`. |

The `Critical` label is GAfix’s operational priority, not an HTTP severity. Transport alerts normally begin as warnings. They may be escalated when the same issue affects many sessions/pages or when high-impact conversion evidence is involved. A critical `page_view` therefore does not mean Google returned a critical HTTP status.

## How to validate whether `http_0` is real

Open the affected website in Chrome and reproduce the event. In DevTools, open **Network**, enable **Preserve log**, and filter for Google Ads destinations such as `googleadservices.com`, `googleads.g.doubleclick.net`, or other Google Ads request hosts visible in the alert evidence.

Then compare the request timestamp with the GAfix alert timestamp:

| Browser evidence | Correct interpretation |
|---|---|
| Request shows HTTP 200 or 204 | Delivery received a normal success response. A simultaneous `http_0` alert likely refers to a separate attempt, a different transport, or stale/legacy monitor code. |
| Fetch response has status `0` and type `opaque` | The browser hid the response status/body. This is not enough to call the request failed; GAfix should not promote it to an `http_0` alert. |
| `(blocked)`, `ERR_BLOCKED_BY_CLIENT`, `net::ERR_BLOCKED`, or explicit privacy-extension wording | Strong browser-side blocker evidence. This should be shown separately from generic `http_0`. |
| `net::ERR_FAILED`, CORS error, CSP error, DNS failure, timeout, or cancelled request | Transport/resource failure. Investigate the network, CSP, consent, browser privacy settings, and endpoint configuration; do not label it confirmed ad blocking automatically. |
| No Google Ads request appears at all | GAfix cannot prove what happened. It may be a tag trigger/consent issue, early browser blocking, instrumentation gap, or a monitor delivery gap. |
| A request exists but has no visible response because it is a beacon/opaque request | Status `0` can be a browser-observation limitation. Use the request type and console/network evidence before treating it as a failure. |

Also inspect the GAfix event evidence for the event ID, raw/sanitized request URL, `status_code`, `failure_reason`, transport, delivery mode, and timestamp. The decisive field is the browser’s actual Network/Console evidence, not the text `http_0` alone.

## How the missing conversion fields are validated

For Google Ads, GAfix parses conversion identifiers from request parameters and from paths such as `/pagead/conversion/<id>/` or view-through conversion paths. It checks conversion-like requests for:

1. A conversion ID, including a path-derived ID when available.
2. A conversion label, Google conversion label, or compatible `send_to` value.

Remarketing, view-through, and `gtag.config` requests are intended to be excluded from the conversion-label requirement. If a request is actually remarketing but still produces a missing-label alert, the raw URL should be reviewed to determine whether that request pattern needs an additional remarketing exemption.

A missing-parameter alert means the request was observed but did not contain the required field. It does not mean the GTM tag failed to fire.

## What this does and does not prove

`http_0` proves only that GAfix recorded a Google Ads-classified observation without a normal HTTP status or with a browser-level failure representation. It does not prove that:

- Google Ads rejected the request;
- an ad blocker caused the failure;
- the conversion was lost at Google’s servers;
- the GTM tag did not fire; or
- every Google Ads event on the page failed.

For a defensible diagnosis, combine the GAfix record with the browser Network status, Console error text, request URL, consent state, CSP, vendor destination, and whether the same event succeeds through the customer’s first-party/server-side route.
