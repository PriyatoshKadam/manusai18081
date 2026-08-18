(function () {
  'use strict';

  /*
   * =========================================================
   * GA4FIX MONITOR v6
   * =========================================================
   *
   * Captures:
   *   - dataLayer
   *   - gtag
   *   - fetch
   *   - XMLHttpRequest
   *   - sendBeacon
   *   - image pixels
   *
   * Detects:
   *   - GA4
   *   - Google Ads
   *   - Meta
   *   - TikTok
   *   - LinkedIn
   *   - Snapchat
   *   - Pinterest
   *   - Reddit
   *   - Twitter/X
   *   - Microsoft Clarity
   *   - Mixpanel
   *   - Amplitude
   *   - Segment
   *   - HubSpot
   *   - Klaviyo
   *   - Intercom
   *
   * Important:
   *
   * GA4 event names are NOT hardcoded.
   *
   * Therefore:
   *
   *   purchase
   *   run_audit
   *   generate_report
   *   foo_bar
   *
   * are all valid event candidates.
   *
   * GA4 is identified from:
   *
   *   - official GA4 endpoints
   *   - first-party GA4 proxy endpoints
   *   - measurement ID
   *   - GA4 collect path
   *
   * =========================================================
   */

  var currentScript =
    document.currentScript ||
    document.querySelector(
      'script[src*="monitor.js"]'
    );

  if (!currentScript) {
    return;
  }

  var scriptUrl =
    currentScript.src || '';

  var scriptParams;

  try {
    scriptParams =
      new URL(scriptUrl).searchParams;
  } catch (e) {
    return;
  }

  var API_KEY =
    scriptParams.get('apiKey') || '';

  var GTM_ID =
    scriptParams.get('gtmContainerId') || '';

  if (!API_KEY) {
    return;
  }

  var ORIGIN;

  try {
    ORIGIN =
      new URL(scriptUrl).origin;
  } catch (e) {
    return;
  }

  var INGEST =
    ORIGIN + '/api/ingest';

  var BLOCKED =
    ORIGIN + '/api/blocked';

  /*
   * ---------------------------------------------------------
   * Global state
   * ---------------------------------------------------------
   */

  var g =
    window.__g4f ||
    {};

  g.k = API_KEY;
  g.c = GTM_ID;
  g.q = g.q || [];
  g.installed = true;

  window.__g4f = g;

  if (g.__monitor_v6_installed) {
    return;
  }

  g.__monitor_v6_installed = true;

  g.r = false;
  g.ready = false;
  g.version = '6.0';

  /*
   * ---------------------------------------------------------
   * State
   * ---------------------------------------------------------
   */

  var dataLayer =
    window.dataLayer ||
    [];

  window.dataLayer =
    dataLayer;

  var dlPushIndex = 0;

  var recentDataLayerEvents = [];

  var pendingEvents = [];

  var observedGA4Events = {};

  var observedGA4 = false;

  var blockedReported = {};

  var MAX_RECENT_EVENTS = 100;

  var NETWORK_MATCH_WINDOW = 5000;

  var BLOCKED_WAIT_MS = 3500;

  /*
   * ---------------------------------------------------------
   * Utility
   * ---------------------------------------------------------
   */

  function now() {
    return Date.now();
  }

  function normalize(value) {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    try {
      return String(value)
        .trim()
        .toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function safePageUrl() {
    try {
      return window.location.href;
    } catch (e) {
      return '';
    }
  }

  function safeUrl(url) {
    try {
      return new URL(
        url,
        window.location.href
      );
    } catch (e) {
      return null;
    }
  }

  function extractQueryParams(url) {
    var result = {};

    try {
      var parsed =
        safeUrl(url);

      if (!parsed) {
        return result;
      }

      parsed.searchParams.forEach(
        function (value, key) {
          result[key] = value;
        }
      );
    } catch (e) {}

    return result;
  }

  function mergeParams(
    first,
    second
  ) {
    var result = {};

    Object.keys(
      first || {}
    ).forEach(
      function (key) {
        result[key] =
          first[key];
      }
    );

    Object.keys(
      second || {}
    ).forEach(
      function (key) {
        result[key] =
          second[key];
      }
    );

    return result;
  }

  function parseBody(body) {
    var result = {};

    if (!body) {
      return result;
    }

    try {
      if (
        typeof body ===
        'string'
      ) {
        var text =
          body.trim();

        if (!text) {
          return result;
        }

        /*
         * JSON
         */

        if (
          text.charAt(0) ===
          '{'
        ) {
          try {
            var json =
              JSON.parse(text);

            if (
              json &&
              typeof json ===
              'object'
            ) {
              return json;
            }
          } catch (e) {}
        }

        /*
         * Query string
         */

        try {
          var params =
            new URLSearchParams(
              text
            );

          params.forEach(
            function (
              value,
              key
            ) {
              result[key] =
                value;
            }
          );

          return result;
        } catch (e) {}
      }

      /*
       * URLSearchParams
       */

      if (
        typeof URLSearchParams !==
          'undefined' &&
        body instanceof
          URLSearchParams
      ) {
        body.forEach(
          function (
            value,
            key
          ) {
            result[key] =
              value;
          }
        );

        return result;
      }

      /*
       * FormData
       */

      if (
        typeof FormData !==
          'undefined' &&
        body instanceof
          FormData
      ) {
        body.forEach(
          function (
            value,
            key
          ) {
            result[key] =
              String(value);
          }
        );

        return result;
      }
    } catch (e) {}

    return result;
  }

  /*
   * ---------------------------------------------------------
   * Vendor definitions
   * ---------------------------------------------------------
   */

  var VENDORS = [
    {
      name: 'ga4',

      patterns: [
        /*
         * Official GA4
         */
        /google-analytics\.com\/g\/collect/i,
        /google-analytics\.com\/mp\/collect/i,
        /analytics\.google\.com\/g\/collect/i,
        /analytics\.google\.com\/mp\/collect/i,

        /*
         * First-party GA4 proxy
         *
         * Examples:
         *
         * /metrics/g/collect
         * /metrics/mp/collect
         * /analytics/g/collect
         * /g/collect
         */
        /\/(?:metrics\/)?g\/collect(?:\?|$)/i,
        /\/(?:metrics\/)?mp\/collect(?:\?|$)/i,
        /\/analytics\/g\/collect(?:\?|$)/i,
        /\/analytics\/mp\/collect(?:\?|$)/i
      ]
    },

    {
      name: 'gads',

      patterns: [
        /googleadservices\.com\/pagead\/conversion/i,
        /googleadservices\.com\/pagead\/1p-conversion/i,
        /googlesyndication\.com\/pagead/i,
        /googleadservices\.com\/pagead\/viewthroughconversion/i
      ]
    },

    {
      name: 'meta',

      patterns: [
        /facebook\.com\/tr/i,
        /facebook\.net\/tr/i
      ]
    },

    {
      name: 'tiktok',

      patterns: [
        /analytics\.tiktok\.com/i,
        /business-api\.tiktok\.com/i,
        /tiktok\.com\/api/i
      ]
    },

    {
      name: 'linkedin',

      patterns: [
        /px\.ads\.linkedin\.com/i,
        /snap\.licdn\.com/i
      ]
    },

    {
      name: 'snapchat',

      patterns: [
        /tr\.snapchat\.com/i,
        /sc-static\.net/i
      ]
    },

    {
      name: 'pinterest',

      patterns: [
        /ct\.pinterest\.com/i,
        /pintrk/i
      ]
    },

    {
      name: 'reddit',

      patterns: [
        /events\.redditmedia\.com/i,
        /www\.redditstatic\.com/i
      ]
    },

    {
      name: 'twitter',

      patterns: [
        /analytics\.twitter\.com/i,
        /t\.co\/i\/adsct/i
      ]
    },

    {
      name: 'clarity',

      patterns: [
        /clarity\.ms/i
      ]
    },

    {
      name: 'mixpanel',

      patterns: [
        /api\.mixpanel\.com/i
      ]
    },

    {
      name: 'amplitude',

      patterns: [
        /api2\.amplitude\.com/i,
        /api\.amplitude\.com/i
      ]
    },

    {
      name: 'segment',

      patterns: [
        /api\.segment\.io/i,
        /cdn\.segment\.com/i
      ]
    },

    {
      name: 'hubspot',

      patterns: [
        /hubspot\.com/i,
        /hubspot\.net/i
      ]
    },

    {
      name: 'klaviyo',

      patterns: [
        /klaviyo\.com/i,
        /klaviyo\.js/i
      ]
    },

    {
      name: 'intercom',

      patterns: [
        /intercom\.io/i,
        /intercom\.com/i
      ]
    }
  ];

  /*
   * ---------------------------------------------------------
   * GA4 identification
   * ---------------------------------------------------------
   *
   * This is intentionally NOT based on
   * a hardcoded event-name list.
   */

  function isGA4Request(
    url,
    params
  ) {
    if (!params) {
      params = {};
    }

    var parsed =
      safeUrl(url);

    if (!parsed) {
      return false;
    }

    var hostname =
      parsed.hostname || '';

    var pathname =
      parsed.pathname || '';

    var officialEndpoint =
      /(^|\.)google-analytics\.com$/i.test(
        hostname
      ) ||
      /(^|\.)analytics\.google\.com$/i.test(
        hostname
      );

    var collectEndpoint =
      /\/(?:metrics\/)?(?:g|mp)\/collect$/i.test(
        pathname
      ) ||
      /\/analytics\/(?:g|mp)\/collect$/i.test(
        pathname
      );

    var measurementId =
      String(
        params.tid ||
        params.measurement_id ||
        ''
      );

    var hasMeasurementId =
      /^G-[A-Z0-9]+$/i.test(
        measurementId
      );

    var eventName =
      params.en ||
      params.event_name ||
      params.event ||
      null;

    /*
     * Official GA4 endpoint.
     */

    if (
      officialEndpoint &&
      (
        hasMeasurementId ||
        !!eventName
      )
    ) {
      return true;
    }

    /*
     * First-party GA4 proxy.
     *
     * This is what your HAR uses:
     *
     * /metrics/g/collect
     *
     * tid=G-...
     * en=...
     */

    if (
      collectEndpoint &&
      hasMeasurementId &&
      !!eventName
    ) {
      return true;
    }

    /*
     * If this is clearly a GA4 collect
     * request and has a measurement ID,
     * accept it even if the path is a
     * custom first-party path.
     *
     * Example:
     *
     * /custom-analytics
     *
     * ?tid=G-XXX&en=purchase
     */

    if (
      hasMeasurementId &&
      !!eventName
    ) {
      return true;
    }

    return false;
  }

  /*
   * ---------------------------------------------------------
   * Vendor detection
   * ---------------------------------------------------------
   */

  function detectVendor(
    url,
    params
  ) {
    /*
     * GA4 gets special handling
     * before generic patterns.
     */

    if (
      isGA4Request(
        url,
        params
      )
    ) {
      return 'ga4';
    }

    var text =
      String(url || '');

    for (
      var i = 0;
      i < VENDORS.length;
      i++
    ) {
      var vendor =
        VENDORS[i];

      if (
        vendor.name ===
        'ga4'
      ) {
        continue;
      }

      for (
        var j = 0;
        j <
        vendor.patterns.length;
        j++
      ) {
        if (
          vendor.patterns[j].test(
            text
          )
        ) {
          return vendor.name;
        }
      }
    }

    /*
     * Google Ads fallback.
     */

    if (
      params &&
      (
        params.gclid ||
        params.gclsrc ||
        params.google_conversion_id
      )
    ) {
      return 'gads';
    }

    return null;
  }

  /*
   * ---------------------------------------------------------
   * Event name extraction
   * ---------------------------------------------------------
   */

  function extractEventName(
    vendor,
    params
  ) {
    if (!params) {
      return null;
    }

    if (
      vendor ===
      'ga4'
    ) {
      return (
        params.en ||
        params.event_name ||
        params.event ||
        null
      );
    }

    if (
      vendor ===
      'meta'
    ) {
      return (
        params.ev ||
        params.event ||
        params.event_name ||
        null
      );
    }

    if (
      vendor ===
      'tiktok'
    ) {
      return (
        params.event ||
        params.event_name ||
        params.ev ||
        null
      );
    }

    if (
      vendor ===
      'snapchat'
    ) {
      return (
        params.event ||
        params.event_name ||
        params.ev ||
        params.event_type ||
        null
      );
    }

    if (
      vendor ===
      'pinterest'
    ) {
      return (
        params.event ||
        params.event_name ||
        params.ev ||
        null
      );
    }

    if (
      vendor ===
      'reddit'
    ) {
      return (
        params.event ||
        params.event_name ||
        params.ev ||
        null
      );
    }

    if (
      vendor ===
      'linkedin'
    ) {
      return (
        params.event ||
        params.event_name ||
        params.conversion_name ||
        params.conversionName ||
        null
      );
    }

    return (
      params.event ||
      params.event_name ||
      params.eventName ||
      params.ev ||
      params.en ||
      params.action ||
      null
    );
  }

  /*
   * ---------------------------------------------------------
   * GA4 parsing
   * ---------------------------------------------------------
   */

  function parseGA4(
    url,
    body
  ) {
    var queryParams =
      extractQueryParams(
        url
      );

    var bodyParams =
      parseBody(body);

    var params =
      mergeParams(
        queryParams,
        bodyParams
      );

    return {
      eventName:
        extractEventName(
          'ga4',
          params
        ),

      clientId:
        params.cid ||
        params.client_id ||
        null,

      measurementId:
        params.tid ||
        params.measurement_id ||
        null,

      transactionId:
        params.transaction_id ||
        params.transactionId ||
        params['ep.transaction_id'] ||
        null,

      params:
        params
    };
  }

  /*
   * ---------------------------------------------------------
   * Generic parsing
   * ---------------------------------------------------------
   */

  function parseGeneric(
    vendor,
    url,
    body
  ) {
    var queryParams =
      extractQueryParams(
        url
      );

    var bodyParams =
      parseBody(body);

    var params =
      mergeParams(
        queryParams,
        bodyParams
      );

    return {
      eventName:
        extractEventName(
          vendor,
          params
        ),

      clientId:
        params.cid ||
        params.client_id ||
        params.id ||
        null,

      measurementId:
        null,

      transactionId:
        params.transaction_id ||
        params.transactionId ||
        null,

      params:
        params
    };
  }

  /*
   * ---------------------------------------------------------
   * DataLayer extraction
   * ---------------------------------------------------------
   */

  function extractDataLayerEvent(
    item
  ) {
    if (!item) {
      return null;
    }

    var eventName =
      item.event ||
      item.event_name ||
      item.eventName ||
      null;

    var params =
      item;

    /*
     * gtag('event', 'purchase', {...})
     */

    if (
      typeof item.length ===
      'number'
    ) {
      try {
        if (
          item[0] ===
          'event'
        ) {
          eventName =
            item[1];

          params =
            item[2] ||
            {};
        }
      } catch (e) {}
    }

    if (!eventName) {
      return null;
    }

    return {
      eventName:
        String(eventName),

      params:
        params &&
        typeof params ===
        'object'
          ? params
          : {}
    };
  }

  /*
   * ---------------------------------------------------------
   * Remember dataLayer events
   * ---------------------------------------------------------
   */

  function rememberDataLayerEvent(
    item
  ) {
    var parsed =
      extractDataLayerEvent(
        item
      );

    if (!parsed) {
      return null;
    }

    dlPushIndex++;

    var event = {
      eventName:
        normalize(
          parsed.eventName
        ),

      originalEventName:
        String(
          parsed.eventName
        ),

      params:
        parsed.params || {},

      pushIndex:
        dlPushIndex,

      timestamp:
        now()
    };

    recentDataLayerEvents.push(
      event
    );

    if (
      recentDataLayerEvents.length >
      MAX_RECENT_EVENTS
    ) {
      recentDataLayerEvents.shift();
    }

    /*
     * Every named dataLayer event
     * becomes a candidate.
     *
     * We DO NOT say it was GA4.
     *
     * We wait for network correlation.
     */

    pendingEvents.push({
      eventName:
        event.eventName,

      pushIndex:
        event.pushIndex,

      timestamp:
        event.timestamp,

      item:
        item,

      params:
        event.params
    });

    /*
     * Keep queue small.
     */

    if (
      pendingEvents.length >
      MAX_RECENT_EVENTS
    ) {
      pendingEvents.shift();
    }

    return event;
  }

  /*
   * ---------------------------------------------------------
   * Find matching dataLayer event
   * ---------------------------------------------------------
   */

  function findMatchingDataLayerEvent(
    eventName,
    timestamp
  ) {
    if (!eventName) {
      return null;
    }

    var target =
      normalize(
        eventName
      );

    var best =
      null;

    var bestDistance =
      Infinity;

    for (
      var i =
        pendingEvents.length - 1;
      i >= 0;
      i--
    ) {
      var candidate =
        pendingEvents[i];

      if (
        !candidate ||
        candidate.eventName !==
        target
      ) {
        continue;
      }

      var distance =
        Math.abs(
          timestamp -
          candidate.timestamp
        );

      if (
        distance >
        NETWORK_MATCH_WINDOW
      ) {
        continue;
      }

      if (
        distance <
        bestDistance
      ) {
        best =
          candidate;

        bestDistance =
          distance;
      }
    }

    return best;
  }

  /*
   * ---------------------------------------------------------
   * Remove matched event
   * ---------------------------------------------------------
   */

  function removePendingEvent(
    candidate
  ) {
    if (!candidate) {
      return;
    }

    var index =
      pendingEvents.indexOf(
        candidate
      );

    if (
      index !== -1
    ) {
      pendingEvents.splice(
        index,
        1
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * GA4 network received
   * ---------------------------------------------------------
   */

  function markGA4EventReceived(
    eventName
  ) {
    var normalized =
      normalize(
        eventName
      );

    if (!normalized) {
      return;
    }

    observedGA4 =
      true;

    observedGA4Events[
      normalized
    ] = true;

    /*
     * Remove all matching
     * pending GA4 candidates
     * within the correlation window.
     */

    for (
      var i =
        pendingEvents.length - 1;
      i >= 0;
      i--
    ) {
      var candidate =
        pendingEvents[i];

      if (
        candidate &&
        candidate.eventName ===
        normalized
      ) {
        var age =
          Math.abs(
            now() -
            candidate.timestamp
          );

        if (
          age <=
          NETWORK_MATCH_WINDOW
        ) {
          pendingEvents.splice(
            i,
            1
          );
        }
      }
    }
  }

  /*
   * ---------------------------------------------------------
   * GA4 blocked detection
   * ---------------------------------------------------------
   *
   * We don't immediately call every
   * dataLayer event a GA4 event.
   *
   * Instead:
   *
   * 1. Observe GA4 on the page.
   * 2. See a dataLayer event.
   * 3. Wait for a GA4 request with
   *    the same event name.
   * 4. If no request appears:
   *    report possible GA4 blocking.
   *
   * This allows custom events such as
   * run_audit to be detected.
   */

  function scheduleBlockedCheck(
    candidate
  ) {
    if (!candidate) {
      return;
    }

    setTimeout(
      function () {
        try {
          var age =
            now() -
            candidate.timestamp;

          if (
            age <
            BLOCKED_WAIT_MS
          ) {
            return;
          }

          /*
           * If another matching GA4
           * request was seen, don't
           * report.
           */

          if (
            observedGA4Events[
              candidate.eventName
            ]
          ) {
            return;
          }

          /*
           * If there has never been a
           * GA4 request on this page,
           * don't claim GA4 blocking
           * from a completely generic
           * dataLayer event.
           *
           * We need evidence that GA4
           * exists on the page.
           *
           * Standard events remain
           * eligible because they are
           * strongly associated with GA4.
           */

          var standard =
            isStandardGA4Event(
              candidate.eventName
            );

          if (
            !observedGA4 &&
            !standard
          ) {
            return;
          }

          var key =
            candidate.eventName +
            ':' +
            candidate.pushIndex;

          if (
            blockedReported[key]
          ) {
            return;
          }

          blockedReported[key] =
            true;

          reportPlatformBlocked(
            'ga4_event_blocked',
            {
              eventName:
                candidate.originalEventName,

              dlPushIndex:
                candidate.pushIndex,

              reason:
                observedGA4
                  ? 'dataLayer_event_without_matching_ga4_request'
                  : 'standard_ga4_event_without_network_request'
            }
          );
        } catch (e) {}
      },
      BLOCKED_WAIT_MS
    );
  }

  /*
   * Standard events are useful as a
   * bootstrap signal before the first
   * network request.
   */

  var STANDARD_GA4_EVENTS = {
    page_view: true,
    session_start: true,
    first_visit: true,
    user_engagement: true,
    scroll: true,
    click: true,
    file_download: true,
    view_search_results: true,

    login: true,
    sign_up: true,

    purchase: true,
    refund: true,

    add_to_cart: true,
    add_to_wishlist: true,
    begin_checkout: true,
    add_payment_info: true,

    generate_lead: true,
    search: true,

    select_item: true,
    select_promotion: true,

    view_item: true,
    view_item_list: true,

    remove_from_cart: true,

    video_start: true,
    video_progress: true,
    video_complete: true
  };

  function isStandardGA4Event(
    eventName
  ) {
    return !!STANDARD_GA4_EVENTS[
      normalize(eventName)
    ];
  }

  /*
   * ---------------------------------------------------------
   * Process dataLayer event
   * ---------------------------------------------------------
   */

  function processDataLayerItem(
    item
  ) {
    try {
      var candidate =
        rememberDataLayerEvent(
          item
        );

      if (!candidate) {
        return;
      }

      scheduleBlockedCheck(
        candidate
      );
    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Existing dataLayer
   * ---------------------------------------------------------
   */

  try {
    for (
      var i = 0;
      i < dataLayer.length;
      i++
    ) {
      processDataLayerItem(
        dataLayer[i]
      );
    }
  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Patch dataLayer.push
   * ---------------------------------------------------------
   */

  var originalDataLayerPush =
    dataLayer.push;

  dataLayer.push =
    function () {
      for (
        var i = 0;
        i < arguments.length;
        i++
      ) {
        processDataLayerItem(
          arguments[i]
        );
      }

      return originalDataLayerPush.apply(
        this,
        arguments
      );
    };

  /*
   * ---------------------------------------------------------
   * gtag interception
   * ---------------------------------------------------------
   */

  var originalGtag =
    window.gtag;

  if (
    typeof originalGtag ===
    'function'
  ) {
    window.gtag =
      function () {
        try {
          if (
            arguments[0] ===
            'event'
          ) {
            processDataLayerItem(
              arguments
            );
          }
        } catch (e) {}

        return originalGtag.apply(
          this,
          arguments
        );
      };
  }

  /*
   * ---------------------------------------------------------
   * Queue
   * ---------------------------------------------------------
   */

  var queue =
    g.q;

  var flushTimer =
    null;

  function send(
    payload
  ) {
    queue.push(
      payload
    );

    if (
      flushTimer
    ) {
      return;
    }

    flushTimer =
      setTimeout(
        flush,
        300
      );
  }

  /*
   * ---------------------------------------------------------
   * Flush
   * ---------------------------------------------------------
   */

  function flush() {
    flushTimer =
      null;

    if (
      !queue.length
    ) {
      return;
    }

    var batch =
      queue.splice(
        0,
        queue.length
      );

    var body =
      JSON.stringify({
        apiKey:
          API_KEY,

        gtmContainerId:
          GTM_ID,

        events:
          batch
      });

    /*
     * Primary transport.
     */

    try {
      fetch(
        INGEST,
        {
          method:
            'POST',

          body:
            body,

          keepalive:
            true,

          headers: {
            'Content-Type':
              'application/json'
          },

          credentials:
            'omit'
        }
      ).catch(
        function () {}
      );

      return;
    } catch (e) {}

    /*
     * Fallback.
     */

    try {
      if (
        navigator.sendBeacon
      ) {
        var blob =
          new Blob(
            [body],
            {
              type:
                'application/json'
            }
          );

        navigator.sendBeacon(
          INGEST,
          blob
        );
      }
    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Source detection
   * ---------------------------------------------------------
   */

  function detectSource(
    method,
    matchedDataLayer
  ) {
    if (
      matchedDataLayer
    ) {
      return 'gtm';
    }

    if (
      method ===
      'beacon'
    ) {
      return 'beacon';
    }

    if (
      method ===
      'image'
    ) {
      return 'pixel';
    }

    if (
      method ===
      'fetch'
    ) {
      return 'fetch';
    }

    if (
      method ===
      'xhr'
    ) {
      return 'xhr';
    }

    return 'direct';
  }

  /*
   * ---------------------------------------------------------
   * Network event recorder
   * ---------------------------------------------------------
   */

  function record(
    url,
    method,
    body
  ) {
    try {
      if (!url) {
        return;
      }

      var absolute =
        safeUrl(url);

      if (!absolute) {
        return;
      }

      var absoluteUrl =
        absolute.href;

      /*
       * Don't record our own
       * monitoring traffic.
       */

      if (
        absoluteUrl.indexOf(
          INGEST
        ) === 0 ||
        absoluteUrl.indexOf(
          BLOCKED
        ) === 0
      ) {
        return;
      }

      var queryParams =
        extractQueryParams(
          absoluteUrl
        );

      var bodyParams =
        parseBody(body);

      var params =
        mergeParams(
          queryParams,
          bodyParams
        );

      var vendor =
        detectVendor(
          absoluteUrl,
          params
        );

      if (!vendor) {
        return;
      }

      var parsed;

      if (
        vendor ===
        'ga4'
      ) {
        parsed =
          parseGA4(
            absoluteUrl,
            body
          );
      } else {
        parsed =
          parseGeneric(
            vendor,
            absoluteUrl,
            body
          );
      }

      var eventName =
        parsed.eventName ||
        null;

      var matchedDataLayer =
        findMatchingDataLayerEvent(
          eventName,
          now()
        );

      /*
       * GA4 request observed.
       */

      if (
        vendor ===
        'ga4' &&
        eventName
      ) {
        markGA4EventReceived(
          eventName
        );
      }

      /*
       * If network event doesn't
       * contain an event name, use
       * matching dataLayer event only
       * as supplemental information.
       */

      if (
        !eventName &&
        matchedDataLayer
      ) {
        eventName =
          matchedDataLayer.originalEventName;
      }

      /*
       * Do NOT remove dataLayer
       * candidate until after the
       * network event has been
       * successfully identified.
       */

      if (
        matchedDataLayer
      ) {
        removePendingEvent(
          matchedDataLayer
        );
      }

      send({
        vendor:
          vendor,

        eventName:
          eventName,

        clientId:
          parsed.clientId ||
          null,

        measurementId:
          parsed.measurementId ||
          params.tid ||
          null,

        transactionId:
          parsed.transactionId ||
          params.transaction_id ||
          params.transactionId ||
          null,

        params:
          parsed.params ||
          params ||
          {},

        pageUrl:
          safePageUrl(),

        rawUrl:
          absoluteUrl,

        method:
          method,

        dlPushIndex:
          matchedDataLayer
            ? matchedDataLayer.pushIndex
            : null,

        source:
          detectSource(
            method,
            matchedDataLayer
          ),

        dataLayerMatched:
          !!matchedDataLayer,

        ts:
          now()
      });
    } catch (e) {
      /*
       * Never break the customer site.
       */
    }
  }

  /*
   * ---------------------------------------------------------
   * FETCH
   * ---------------------------------------------------------
   */

  var originalFetch =
    window.fetch;

  if (
    typeof originalFetch ===
    'function'
  ) {
    window.fetch =
      function (
        input,
        init
      ) {
        try {
          var url =
            typeof input ===
            'string'
              ? input
              : input &&
                input.url;

          var body =
            init &&
            init.body
              ? init.body
              : null;

          if (url) {
            record(
              url,
              'fetch',
              body
            );
          }
        } catch (e) {}

        return originalFetch.apply(
          this,
          arguments
        );
      };
  }

  /*
   * ---------------------------------------------------------
   * XHR
   * ---------------------------------------------------------
   */

  var originalOpen =
    XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open =
    function (
      method,
      url
    ) {
      try {
        this.__g4f_method =
          method;

        this.__g4f_url =
          url;
      } catch (e) {}

      return originalOpen.apply(
        this,
        arguments
      );
    };

  var originalSend =
    XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.send =
    function (
      body
    ) {
      try {
        if (
          this.__g4f_url
        ) {
          record(
            this.__g4f_url,
            'xhr',
            body
          );
        }
      } catch (e) {}

      return originalSend.apply(
        this,
        arguments
      );
    };

  /*
   * ---------------------------------------------------------
   * sendBeacon
   * ---------------------------------------------------------
   */

  if (
    navigator.sendBeacon
  ) {
    var originalBeacon =
      navigator.sendBeacon.bind(
        navigator
      );

    navigator.sendBeacon =
      function (
        url,
        data
      ) {
        try {
          var absolute =
            safeUrl(url);

          /*
           * Never intercept our
           * own telemetry.
           */

          if (
            absolute &&
            absolute.origin ===
            ORIGIN
          ) {
            return originalBeacon(
              url,
              data
            );
          }

          var body =
            typeof data ===
            'string'
              ? data
              : null;

          record(
            url,
            'beacon',
            body
          );
        } catch (e) {}

        return originalBeacon(
          url,
          data
        );
      };
  }

  /*
   * ---------------------------------------------------------
   * Image pixels
   * ---------------------------------------------------------
   */

  try {
    var imageDescriptor =
      Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        'src'
      );

    if (
      imageDescriptor &&
      imageDescriptor.set
    ) {
      Object.defineProperty(
        HTMLImageElement.prototype,
        'src',
        {
          configurable:
            true,

          get:
            imageDescriptor.get,

          set:
            function (url) {
              try {
                record(
                  url,
                  'image',
                  null
                );
              } catch (e) {}

              return imageDescriptor.set.call(
                this,
                url
              );
            }
        }
      );
    }
  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Platform blocked reporting
   * ---------------------------------------------------------
   */

  function reportPlatformBlocked(
    method,
    details
  ) {
    try {
      var eventName =
        details &&
        details.eventName
          ? String(
              details.eventName
            )
          : '';

      var key =
        method +
        ':' +
        eventName;

      /*
       * Only dedupe the same
       * platform/event combination.
       *
       * Different events must still
       * be reported.
       */

      if (
        blockedReported[
          key
        ]
      ) {
        return;
      }

      blockedReported[
        key
      ] = true;

      var url =
        BLOCKED +
        '?k=' +
        encodeURIComponent(
          API_KEY
        ) +
        '&m=' +
        encodeURIComponent(
          method
        );

      if (
        eventName
      ) {
        url +=
          '&e=' +
          encodeURIComponent(
            eventName
          );
      }

      if (
        details &&
        details.reason
      ) {
        url +=
          '&r=' +
          encodeURIComponent(
            details.reason
          );
      }

      if (
        details &&
        details.dlPushIndex !==
        undefined
      ) {
        url +=
          '&d=' +
          encodeURIComponent(
            String(
              details.dlPushIndex
            )
          );
      }

      /*
       * Use beacon when possible.
       */

      if (
        navigator.sendBeacon
      ) {
        navigator.sendBeacon(
          url,
          ''
        );

        return;
      }

      fetch(
        url,
        {
          method:
            'GET',

          credentials:
            'omit',

          keepalive:
            true
        }
      ).catch(
        function () {}
      );
    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Resource errors
   * ---------------------------------------------------------
   */

  window.addEventListener(
    'error',
    function (event) {
      try {
        var target =
          event.target;

        if (!target) {
          return;
        }

        var src =
          target.src ||
          target.href ||
          '';

        if (!src) {
          return;
        }

        /*
         * Google Analytics
         */

        if (
          /googletagmanager\.com\/gtag\/js/i.test(
            src
          ) ||
          /google-analytics\.com\/analytics\.js/i.test(
            src
          ) ||
          /googletagmanager\.com\/gtm\.js/i.test(
            src
          )
        ) {
          reportPlatformBlocked(
            'google_analytics_script_blocked'
          );

          return;
        }

        /*
         * Google Ads
         */

        if (
          /googlesyndication\.com/i.test(
            src
          ) ||
          /googleadservices\.com/i.test(
            src
          )
        ) {
          reportPlatformBlocked(
            'google_ads_script_blocked'
          );

          return;
        }

        /*
         * Meta
         */

        if (
          /connect\.facebook\.net/i.test(
            src
          )
        ) {
          reportPlatformBlocked(
            'meta_script_blocked'
          );

          return;
        }

        /*
         * TikTok
         */

        if (
          /analytics\.tiktok\.com/i.test(
            src
          )
        ) {
          reportPlatformBlocked(
            'tiktok_script_blocked'
          );

          return;
        }

        /*
         * LinkedIn
         */

        if (
          /snap\.licdn\.com/i.test(
            src
          )
        ) {
          reportPlatformBlocked(
            'linkedin_script_blocked'
          );

          return;
        }
      } catch (e) {}
    },
    true
  );

  /*
   * ---------------------------------------------------------
   * Generic ad blocker bait
   * ---------------------------------------------------------
   */

  function checkAdBlocker() {
    try {
      if (
        !document.body
      ) {
        return;
      }

      var bait =
        document.createElement(
          'div'
        );

      bait.className =
        'adsbox ad-banner adsbygoogle';

      bait.style.position =
        'absolute';

      bait.style.left =
        '-9999px';

      bait.style.width =
        '1px';

      bait.style.height =
        '1px';

      bait.style.display =
        'block';

      document.body.appendChild(
        bait
      );

      setTimeout(
        function () {
          try {
            var blocked =
              bait.offsetHeight ===
              0 ||
              bait.offsetWidth ===
              0;

            if (
              blocked
            ) {
              reportPlatformBlocked(
                'bait_blocked'
              );
            }

            if (
              bait.parentNode
            ) {
              bait.parentNode.removeChild(
                bait
              );
            }
          } catch (e) {}
        },
        300
      );
    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Initialize ad blocker check
   * ---------------------------------------------------------
   */

  try {
    if (
      document.body
    ) {
      setTimeout(
        checkAdBlocker,
        1500
      );
    } else {
      window.addEventListener(
        'DOMContentLoaded',
        function () {
          setTimeout(
            checkAdBlocker,
            1500
          );
        }
      );
    }
  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Flush on exit
   * ---------------------------------------------------------
   */

  window.addEventListener(
    'pagehide',
    flush
  );

  window.addEventListener(
    'beforeunload',
    flush
  );

  /*
   * ---------------------------------------------------------
   * Public state
   * ---------------------------------------------------------
   */

  g.apiKey =
    API_KEY;

  g.gtmContainerId =
    GTM_ID;

  g.version =
    '6.0';

  g.ready =
    true;

  g.r =
    true;

})();
