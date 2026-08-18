(function () {
  'use strict';

  /*
   * =========================================================
   * GA4FIX MONITOR v10
   * =========================================================
   *
   * Complete browser-side analytics monitor.
   *
   * Key fixes in v10:
   *  - Detects first-party GA4 proxy URLs such as /metrics/g/collect.
   *  - Detects GA4 requests created by a Service Worker by reading
   *    PerformanceResourceTiming entries.
   *  - Does NOT deduplicate events by event name.
   *  - Each run_audit / purchase / custom event occurrence gets its
   *    own occurrenceId.
   *  - Prevents one gtag() call from being counted twice when the
   *    same Arguments object subsequently enters dataLayer.
   *  - Every GA4 network request is reported, including duplicate
   *    requests for the same event.
   *  - Keeps ALL GA4 request parameters, including cu, ep.currency,
   *    epn.value, ep.purchase_type, etc.
   *  - Blocked-event reports contain the exact event name.
   *
   * IMPORTANT:
   * A page script cannot directly intercept the internal fetch/XHR
   * performed by a Service Worker. PerformanceResourceTiming is
   * therefore also monitored. This is required for first-party
   * GA4 proxy/service-worker implementations.
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
      new URL(
        scriptUrl
      ).searchParams;
  } catch (e) {
    return;
  }

  var API_KEY =
    scriptParams.get(
      'apiKey'
    ) || '';

  var GTM_ID =
    scriptParams.get(
      'gtmContainerId'
    ) || '';

  if (!API_KEY) {
    return;
  }

  var ORIGIN;

  try {
    ORIGIN =
      new URL(
        scriptUrl
      ).origin;
  } catch (e) {
    return;
  }

  var INGEST =
    ORIGIN +
    '/api/ingest';

  var BLOCKED =
    ORIGIN +
    '/api/blocked';

  /*
   * ---------------------------------------------------------
   * Global monitor object
   * ---------------------------------------------------------
   */

  var g =
    window.__g4f ||
    {};

  g.k =
    API_KEY;

  g.c =
    GTM_ID;

  g.q =
    g.q || [];

  g.installed =
    true;

  g.version =
    '10.0';

  window.__g4f =
    g;

  /*
   * Prevent duplicate installation.
   */

  if (
    g.__monitor_v10_installed
  ) {
    return;
  }

  g.__monitor_v10_installed =
    true;

  g.ready =
    false;

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

  /*
   * Every dataLayer / gtag event gets
   * a unique sequential occurrence.
   */

  var eventOccurrenceCounter =
    0;

  /*
   * dataLayer push counter.
   */

  var dlPushIndex =
    0;

  /*
   * Recent events.
   */

  var recentDataLayerEvents =
    [];

  /*
   * Events waiting for a matching
   * GA4 network request.
   */

  var pendingEvents =
    [];

  /*
   * GA4 requests that arrived before
   * the corresponding event.
   */

  var pendingNetworkGA4 =
    [];

  /*
   * Requests discovered through
   * PerformanceResourceTiming.
   */

  var observedPerformanceEntries =
    {};

  /*
   * GA4 configuration.
   */

  var ga4Configured =
    false;

  var ga4MeasurementIds =
    {};

  /*
   * Whether any GA4 request has
   * been observed.
   */

  var observedGA4 =
    false;

  /*
   * Informational event counts.
   *
   * These are NOT used for deduplication.
   */

  var observedGA4EventCounts =
    {};

  /*
   * Prevent duplicate blocked reports.
   */

  var blockedReported =
    {};

  /*
   * Prevent duplicate network reports
   * for the same PerformanceResourceTiming
   * entry.
   */

  var networkReported =
    {};

  /*
   * Prevent duplicate processing of
   * the same gtag Arguments object.
   */

  var processedGtagObjects =
    [];

  var MAX_RECENT_EVENTS =
    500;

  var MAX_PENDING_EVENTS =
    500;

  var MAX_PENDING_NETWORK =
    500;

  var MAX_PROCESSED_GTAG =
    500;

  /*
   * Network/dataLayer matching window.
   */

  var NETWORK_MATCH_WINDOW =
    5000;

  /*
   * Time after which an event without
   * a matching network request is
   * considered blocked.
   */

  var BLOCKED_WAIT_MS =
    3500;

  /*
   * PerformanceObserver fallback
   * polling interval.
   */

  var PERFORMANCE_SCAN_MS =
    1000;

  /*
   * ---------------------------------------------------------
   * Utility
   * ---------------------------------------------------------
   */

  function now() {
    return Date.now();
  }

  function normalize(
    value
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    try {
      return String(
        value
      )
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

  function safeUrl(
    url
  ) {
    try {
      return new URL(
        url,
        window.location.href
      );
    } catch (e) {
      return null;
    }
  }

  function isOwnMonitoringRequest(
    url
  ) {
    try {
      var parsed =
        safeUrl(
          url
        );

      if (!parsed) {
        return false;
      }

      var href =
        parsed.href;

      return (
        href.indexOf(
          INGEST
        ) === 0 ||
        href.indexOf(
          BLOCKED
        ) === 0
      );
    } catch (e) {
      return false;
    }
  }

  function hasArrayItem(
    array,
    item
  ) {
    for (
      var i = 0;
      i < array.length;
      i++
    ) {
      if (
        array[i] ===
        item
      ) {
        return true;
      }
    }

    return false;
  }

  function rememberProcessedGtagObject(
    object
  ) {
    if (!object) {
      return;
    }

    processedGtagObjects.push(
      object
    );

    if (
      processedGtagObjects.length >
      MAX_PROCESSED_GTAG
    ) {
      processedGtagObjects.shift();
    }
  }

  function wasGtagObjectProcessed(
    object
  ) {
    return hasArrayItem(
      processedGtagObjects,
      object
    );
  }

  /*
   * ---------------------------------------------------------
   * Query parameter parsing
   * ---------------------------------------------------------
   */

  function extractQueryParams(
    url
  ) {
    var result = {};

    try {
      var parsed =
        safeUrl(
          url
        );

      if (!parsed) {
        return result;
      }

      parsed.searchParams.forEach(
        function (
          value,
          key
        ) {
          result[key] =
            value;
        }
      );
    } catch (e) {}

    return result;
  }

  /*
   * ---------------------------------------------------------
   * Parameter merging
   * ---------------------------------------------------------
   */

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

  /*
   * ---------------------------------------------------------
   * Request body parser
   * ---------------------------------------------------------
   */

  function parseBody(
    body
  ) {
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

        if (
          text.charAt(0) ===
          '{'
        ) {

          try {

            var json =
              JSON.parse(
                text
              );

            if (
              json &&
              typeof json ===
              'object'
            ) {
              return json;
            }

          } catch (e) {}
        }

        try {

          var searchParams =
            new URLSearchParams(
              text
            );

          searchParams.forEach(
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
              String(
                value
              );
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
      name:
        'ga4',

      patterns: [

        /google-analytics\.com\/g\/collect/i,

        /google-analytics\.com\/mp\/collect/i,

        /analytics\.google\.com\/g\/collect/i,

        /analytics\.google\.com\/mp\/collect/i,

        /\/(?:metrics\/)?g\/collect(?:\?|$)/i,

        /\/(?:metrics\/)?mp\/collect(?:\?|$)/i,

        /\/analytics\/g\/collect(?:\?|$)/i,

        /\/analytics\/mp\/collect(?:\?|$)/i
      ]
    },

    {
      name:
        'gads',

      patterns: [

        /googleadservices\.com\/pagead\/conversion/i,

        /googleadservices\.com\/pagead\/1p-conversion/i,

        /googleadservices\.com\/pagead\/viewthroughconversion/i,

        /googlesyndication\.com\/pagead/i
      ]
    },

    {
      name:
        'meta',

      patterns: [

        /facebook\.com\/tr/i,

        /facebook\.net\/tr/i
      ]
    },

    {
      name:
        'tiktok',

      patterns: [

        /analytics\.tiktok\.com/i,

        /business-api\.tiktok\.com/i,

        /tiktok\.com\/api/i
      ]
    },

    {
      name:
        'linkedin',

      patterns: [

        /px\.ads\.linkedin\.com/i,

        /snap\.licdn\.com/i
      ]
    },

    {
      name:
        'snapchat',

      patterns: [

        /tr\.snapchat\.com/i,

        /sc-static\.net/i
      ]
    },

    {
      name:
        'pinterest',

      patterns: [

        /ct\.pinterest\.com/i,

        /pintrk/i
      ]
    },

    {
      name:
        'reddit',

      patterns: [

        /events\.redditmedia\.com/i,

        /www\.redditstatic\.com/i
      ]
    },

    {
      name:
        'twitter',

      patterns: [

        /analytics\.twitter\.com/i,

        /t\.co\/i\/adsct/i
      ]
    },

    {
      name:
        'clarity',

      patterns: [

        /clarity\.ms/i
      ]
    },

    {
      name:
        'mixpanel',

      patterns: [

        /api\.mixpanel\.com/i
      ]
    },

    {
      name:
        'amplitude',

      patterns: [

        /api2\.amplitude\.com/i,

        /api\.amplitude\.com/i
      ]
    },

    {
      name:
        'segment',

      patterns: [

        /api\.segment\.io/i,

        /cdn\.segment\.com/i
      ]
    },

    {
      name:
        'hubspot',

      patterns: [

        /hubspot\.com/i,

        /hubspot\.net/i
      ]
    },

    {
      name:
        'klaviyo',

      patterns: [

        /klaviyo\.com/i,

        /klaviyo\.js/i
      ]
    },

    {
      name:
        'intercom',

      patterns: [

        /intercom\.io/i,

        /intercom\.com/i
      ]
    }
  ];

  /*
   * ---------------------------------------------------------
   * GA4 request detection
   *
   * IMPORTANT:
   *
   * /metrics/g/collect is a first-party GA4 proxy.
   *
   * The request can contain:
   *
   *     en=connect_ga4_account
   *     en=run_audit
   *     en=purchase
   *
   * We must NOT require the event to be a known
   * GA4 event name.
   * ---------------------------------------------------------
   */

  function isGA4Request(
    url,
    params
  ) {

    params =
      params || {};

    var parsed =
      safeUrl(
        url
      );

    if (!parsed) {
      return false;
    }

    var hostname =
      parsed.hostname || '';

    var pathname =
      parsed.pathname || '';

    var eventName =
      params.en ||
      params.event_name ||
      params.event ||
      null;

    var measurementId =
      params.tid ||
      params.measurement_id ||
      '';

    var hasMeasurementId =
      /^G-[A-Z0-9]+$/i.test(
        String(
          measurementId
        )
      );

    /*
     * First-party GA4 collection.
     */

    var isFirstPartyGA4Collection =
      /\/metrics\/g\/collect$/i.test(
        pathname
      ) ||
      /\/metrics\/mp\/collect$/i.test(
        pathname
      ) ||
      /\/g\/collect$/i.test(
        pathname
      ) ||
      /\/mp\/collect$/i.test(
        pathname
      ) ||
      /\/analytics\/g\/collect$/i.test(
        pathname
      ) ||
      /\/analytics\/mp\/collect$/i.test(
        pathname
      );

    /*
     * Official Google Analytics host.
     */

    var isGoogleAnalyticsHost =
      /(^|\.)google-analytics\.com$/i.test(
        hostname
      ) ||
      /(^|\.)analytics\.google\.com$/i.test(
        hostname
      );

    /*
     * First-party GA4 proxy.
     *
     * `en` is enough to identify an event.
     */

    if (
      isFirstPartyGA4Collection &&
      eventName
    ) {
      return true;
    }

    /*
     * Measurement ID fallback.
     */

    if (
      isFirstPartyGA4Collection &&
      hasMeasurementId
    ) {
      return true;
    }

    /*
     * Official Google endpoint.
     */

    if (
      isGoogleAnalyticsHost &&
      (
        eventName ||
        hasMeasurementId
      )
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

    if (
      isGA4Request(
        url,
        params
      )
    ) {
      return 'ga4';
    }

    var text =
      String(
        url || ''
      );

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
   * GA4 parser
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
      parseBody(
        body
      );

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
        params['epn.transaction_id'] ||
        null,

      params:
        params
    };
  }

  /*
   * ---------------------------------------------------------
   * Generic parser
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
      parseBody(
        body
      );

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
   * GA4 configuration detection
   * ---------------------------------------------------------
   */

  function inspectGA4Configuration(
    item
  ) {

    try {

      /*
       * gtag('config', 'G-XXXX')
       */

      if (
        item &&
        typeof item.length ===
        'number' &&
        item[0] ===
        'config'
      ) {

        var configId =
          String(
            item[1] ||
            ''
          );

        var match =
          configId.match(
            /G-[A-Z0-9]+/i
          );

        if (match) {

          ga4Configured =
            true;

          ga4MeasurementIds[
            match[0].toUpperCase()
          ] =
            true;
        }

        return;
      }

      /*
       * Object-style configuration.
       */

      if (
        item &&
        typeof item ===
        'object'
      ) {

        var possibleId =
          item.measurement_id ||
          item.measurementId ||
          item.tid ||
          null;

        if (
          possibleId
        ) {

          var idString =
            String(
              possibleId
            );

          var idMatch =
            idString.match(
              /G-[A-Z0-9]+/i
            );

          if (idMatch) {

            ga4Configured =
              true;

            ga4MeasurementIds[
              idMatch[0].toUpperCase()
            ] =
              true;
          }
        }
      }

    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * DataLayer event extraction
   * ---------------------------------------------------------
   */

  function extractDataLayerEvent(
    item
  ) {

    if (!item) {
      return null;
    }

    inspectGA4Configuration(
      item
    );

    var eventName =
      null;

    var params =
      item;

    var source =
      'dataLayer';

    var explicitGA4 =
      false;

    /*
     * Standard dataLayer:
     *
     * {
     *   event: 'purchase'
     * }
     */

    if (
      typeof item ===
      'object' &&
      !Array.isArray(
        item
      )
    ) {

      eventName =
        item.event ||
        item.event_name ||
        item.eventName ||
        null;
    }

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

          source =
            'gtag';

          explicitGA4 =
            true;
        }

      } catch (e) {}
    }

    /*
     * gtag('config') is not an event.
     */

    if (
      typeof item.length ===
      'number' &&
      item[0] ===
      'config'
    ) {
      return null;
    }

    /*
     * Other gtag commands are not
     * analytics events.
     */

    if (
      typeof item.length ===
      'number' &&
      (
        item[0] ===
        'set' ||
        item[0] ===
        'consent'
      )
    ) {
      return null;
    }

    if (!eventName) {
      return null;
    }

    /*
     * Any explicit gtag event is a GA4
     * candidate.
     */

    if (
      source ===
      'gtag'
    ) {
      explicitGA4 =
        true;
    }

    /*
     * If GA4 is already known on the page,
     * custom events are valid candidates.
     */

    if (
      ga4Configured
    ) {
      explicitGA4 =
        true;
    }

    return {

      eventName:
        String(
          eventName
        ),

      params:
        params &&
        typeof params ===
        'object'
          ? params
          : {},

      source:
        source,

      isGA4Candidate:
        explicitGA4
    };
  }

  /*
   * ---------------------------------------------------------
   * Remember dataLayer event
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

    eventOccurrenceCounter++;

    var event = {

      /*
       * Unique occurrence ID.
       *
       * This is NOT based on event name.
       */

      occurrenceId:
        eventOccurrenceCounter,

      eventName:
        normalize(
          parsed.eventName
        ),

      originalEventName:
        String(
          parsed.eventName
        ),

      params:
        parsed.params ||
        {},

      pushIndex:
        dlPushIndex,

      timestamp:
        now(),

      isGA4Candidate:
        !!parsed.isGA4Candidate,

      source:
        parsed.source ||
        'dataLayer',

      networkMatched:
        false,

      networkOccurrenceId:
        null,

      networkParams:
        null,

      networkEventTimestamp:
        null
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

    pendingEvents.push(
      event
    );

    if (
      pendingEvents.length >
      MAX_PENDING_EVENTS
    ) {

      pendingEvents.shift();
    }

    /*
     * A network request can sometimes
     * arrive before dataLayer/gtag.
     */

    try {

      if (
        event.isGA4Candidate
      ) {

        matchPendingNetworkToEvent(
          event
        );
      }

    } catch (e) {}

    return event;
  }

  /*
   * ---------------------------------------------------------
   * Find matching dataLayer event
   *
   * IMPORTANT:
   *
   * FIFO matching is intentional.
   *
   * Example:
   *
   *   run_audit #1
   *   run_audit #2
   *   run_audit #3
   *
   * Network:
   *
   *   run_audit request #1
   *   run_audit request #2
   *
   * Result:
   *
   *   #1 -> request #1
   *   #2 -> request #2
   *   #3 -> blocked
   *
   * We NEVER use:
   *
   *   eventName -> true
   *
   * as the match state.
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

    for (
      var i = 0;
      i < pendingEvents.length;
      i++
    ) {

      var candidate =
        pendingEvents[i];

      if (!candidate) {
        continue;
      }

      /*
       * Already matched.
       */

      if (
        candidate.networkMatched
      ) {
        continue;
      }

      /*
       * Event name must match.
       */

      if (
        candidate.eventName !==
        target
      ) {
        continue;
      }

      /*
       * Don't match events that are
       * too far apart.
       */

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

      return candidate;
    }

    return null;
  }

  /*
   * ---------------------------------------------------------
   * Remove pending event
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
      index !==
      -1
    ) {

      pendingEvents.splice(
        index,
        1
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * Standard GA4 events
   * ---------------------------------------------------------
   */

  var STANDARD_GA4_EVENTS = {

    page_view:
      true,

    session_start:
      true,

    first_visit:
      true,

    user_engagement:
      true,

    scroll:
      true,

    click:
      true,

    file_download:
      true,

    view_search_results:
      true,

    login:
      true,

    sign_up:
      true,

    purchase:
      true,

    refund:
      true,

    add_to_cart:
      true,

    add_to_wishlist:
      true,

    begin_checkout:
      true,

    add_payment_info:
      true,

    generate_lead:
      true,

    search:
      true,

    select_item:
      true,

    select_promotion:
      true,

    view_item:
      true,

    view_item_list:
      true,

    remove_from_cart:
      true,

    video_start:
      true,

    video_progress:
      true,

    video_complete:
      true
  };

  function isStandardGA4Event(
    eventName
  ) {

    return !!STANDARD_GA4_EVENTS[
      normalize(
        eventName
      )
    ];
  }

  /*
   * ---------------------------------------------------------
   * Determine whether dataLayer event
   * should be treated as GA4.
   *
   * IMPORTANT:
   *
   * We do NOT restrict this to the
   * standard GA4 event list.
   *
   * Custom events such as:
   *
   *   run_audit
   *   connect_ga4_account
   *   audit_started
   *   whatever_you_define
   *
   * are valid GA4 events.
   * ---------------------------------------------------------
   */

  function isGA4EventCandidate(
    candidate
  ) {

    if (!candidate) {
      return false;
    }

    /*
     * Explicit gtag('event', ...)
     */

    if (
      candidate.isGA4Candidate
    ) {
      return true;
    }

    /*
     * GA4 already observed.
     */

    if (
      observedGA4
    ) {
      return true;
    }

    /*
     * GA4 configured.
     */

    if (
      ga4Configured
    ) {
      return true;
    }

    /*
     * Standard event fallback.
     */

    if (
      isStandardGA4Event(
        candidate.eventName
      )
    ) {
      return true;
    }

    return false;
  }

  /*
   * ---------------------------------------------------------
   * Match GA4 network event
   * ---------------------------------------------------------
   */

  function matchGA4NetworkEvent(
    eventName,
    networkParams,
    networkTimestamp,
    networkOccurrenceId
  ) {

    if (!eventName) {
      return null;
    }

    var candidate =
      findMatchingDataLayerEvent(
        eventName,
        networkTimestamp
      );

    if (!candidate) {
      return null;
    }

    /*
     * Mark THIS occurrence only.
     */

    candidate.networkMatched =
      true;

    candidate.networkOccurrenceId =
      networkOccurrenceId;

    candidate.networkParams =
      networkParams ||
      {};

    candidate.networkEventTimestamp =
      networkTimestamp;

    /*
     * Remove from pending list so
     * another network request cannot
     * match this same occurrence.
     */

    removePendingEvent(
      candidate
    );

    return candidate;
  }

  /*
   * ---------------------------------------------------------
   * Queue network GA4 request
   * ---------------------------------------------------------
   */

  function queueNetworkGA4(
    networkEvent
  ) {

    pendingNetworkGA4.push(
      networkEvent
    );

    if (
      pendingNetworkGA4.length >
      MAX_PENDING_NETWORK
    ) {

      pendingNetworkGA4.shift();
    }
  }

  /*
   * ---------------------------------------------------------
   * Match queued network request to
   * newly observed dataLayer event.
   * ---------------------------------------------------------
   */

  function matchPendingNetworkToEvent(
    candidate
  ) {

    if (!candidate) {
      return null;
    }

    if (
      !candidate.eventName
    ) {
      return null;
    }

    var target =
      normalize(
        candidate.eventName
      );

    for (
      var i = 0;
      i < pendingNetworkGA4.length;
      i++
    ) {

      var network =
        pendingNetworkGA4[i];

      if (!network) {
        continue;
      }

      if (
        normalize(
          network.eventName
        ) !==
        target
      ) {
        continue;
      }

      var distance =
        Math.abs(
          network.timestamp -
          candidate.timestamp
        );

      if (
        distance >
        NETWORK_MATCH_WINDOW
      ) {
        continue;
      }

      candidate.networkMatched =
        true;

      candidate.networkOccurrenceId =
        network.networkOccurrenceId;

      candidate.networkParams =
        network.params ||
        {};

      candidate.networkEventTimestamp =
        network.timestamp;

      pendingNetworkGA4.splice(
        i,
        1
      );

      removePendingEvent(
        candidate
      );

      return candidate;
    }

    return null;
  }

  /*
   * ---------------------------------------------------------
   * Blocked event detection
   * ---------------------------------------------------------
   */

  function scheduleBlockedCheck(
    candidate
  ) {

    if (!candidate) {
      return;
    }

    if (
      !isGA4EventCandidate(
        candidate
      )
    ) {
      return;
    }

    setTimeout(
      function () {

        try {

          /*
           * Network request matched this
           * exact event occurrence.
           */

          if (
            candidate.networkMatched
          ) {
            return;
          }

          /*
           * It may have been matched and
           * removed while the timeout was
           * waiting.
           */

          if (
            pendingEvents.indexOf(
              candidate
            ) ===
            -1
          ) {
            return;
          }

          /*
           * One final attempt to match
           * a late request.
           */

          var lateMatch =
            findMatchingDataLayerEvent(
              candidate.eventName,
              now()
            );

          if (
            lateMatch &&
            lateMatch ===
            candidate
          ) {

            /*
             * Don't report yet.
             */

            return;
          }

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
           * Exact occurrence identity.
           *
           * This means:
           *
           * run_audit #1
           * run_audit #2
           *
           * can both independently be
           * reported if required.
           */

          var key =
            'ga4_event_blocked:' +
            candidate.occurrenceId;

          if (
            blockedReported[
              key
            ]
          ) {
            return;
          }

          blockedReported[
            key
          ] =
            true;

          removePendingEvent(
            candidate
          );

          reportPlatformBlocked(
            'ga4_event_blocked',
            {

              eventName:
                candidate.originalEventName,

              occurrenceId:
                candidate.occurrenceId,

              dlPushIndex:
                candidate.pushIndex,

              source:
                candidate.source,

              reason:
                observedGA4
                  ? 'dataLayer_event_without_matching_ga4_request'
                  : 'ga4_event_without_network_request'
            }
          );

        } catch (e) {}

      },
      BLOCKED_WAIT_MS
    );
  }

  /*
   * ---------------------------------------------------------
   * Process dataLayer item
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

      /*
       * Already matched.
       */

      if (
        candidate.networkMatched
      ) {
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
   * Patch gtag
   *
   * IMPORTANT:
   *
   * gtag() usually pushes its Arguments
   * object into dataLayer.
   *
   * We process it immediately so we don't
   * miss it, but remember the object so
   * dataLayer.push does NOT create a
   * duplicate occurrence.
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
            'config'
          ) {

            inspectGA4Configuration(
              arguments
            );
          }

          if (
            arguments[0] ===
            'event'
          ) {

            if (
              !wasGtagObjectProcessed(
                arguments
              )
            ) {

              rememberProcessedGtagObject(
                arguments
              );

              processDataLayerItem(
                arguments
              );
            }
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
   * Wrap dataLayer processing to avoid
   * duplicate gtag event objects.
   *
   * Some implementations push the exact
   * gtag Arguments object into dataLayer.
   * ---------------------------------------------------------
   */

  /*
   * Re-wrap push after gtag installation
   * so the same object is ignored if
   * already processed.
   */

  dataLayer.push =
    (function (
      originalPush
    ) {

      return function () {

        for (
          var i = 0;
          i < arguments.length;
          i++
        ) {

          var item =
            arguments[i];

          /*
           * If this is the exact gtag
           * Arguments object already processed,
           * don't create a second event.
           */

          if (
            wasGtagObjectProcessed(
              item
            )
          ) {
            continue;
          }

          processDataLayerItem(
            item
          );
        }

        return originalPush.apply(
          this,
          arguments
        );
      };

    })(
      originalDataLayerPush
    );
    /*
   * ---------------------------------------------------------
   * Network processing
   * ---------------------------------------------------------
   */

  var networkOccurrenceCounter =
    0;

  function createNetworkOccurrenceId() {

    networkOccurrenceCounter++;

    return (
      'ga4-network-' +
      networkOccurrenceCounter
    );
  }

  /*
   * Normalize GA4 parameters.
   *
   * This does NOT remove the original
   * parameters. It only adds convenient
   * normalized aliases.
   */

  function enrichGA4Params(
    params
  ) {

    params =
      params || {};

    var enriched =
      {};

    Object.keys(
      params
    ).forEach(
      function (key) {

        enriched[key] =
          params[key];
      }
    );

    /*
     * Currency
     *
     * HAR example:
     *
     * cu=USD
     */

    if (
      enriched.currency ===
      undefined &&
      enriched.cu !==
      undefined
    ) {

      enriched.currency =
        enriched.cu;
    }

    if (
      enriched.currency ===
      undefined &&
      enriched['ep.currency'] !==
      undefined
    ) {

      enriched.currency =
        enriched['ep.currency'];
    }

    if (
      enriched.currency ===
      undefined &&
      enriched['epn.currency'] !==
      undefined
    ) {

      enriched.currency =
        enriched['epn.currency'];
    }

    /*
     * Value
     *
     * HAR example:
     *
     * epn.value=49.5
     */

    if (
      enriched.value ===
      undefined &&
      enriched['epn.value'] !==
      undefined
    ) {

      enriched.value =
        Number(
          enriched['epn.value']
        );
    }

    if (
      enriched.value ===
      undefined &&
      enriched['ep.value'] !==
      undefined
    ) {

      var parsedValue =
        Number(
          enriched['ep.value']
        );

      enriched.value =
        isNaN(
          parsedValue
        )
          ? enriched['ep.value']
          : parsedValue;
    }

    /*
     * Purchase type.
     */

    if (
      enriched.purchase_type ===
      undefined &&
      enriched['ep.purchase_type'] !==
      undefined
    ) {

      enriched.purchase_type =
        enriched['ep.purchase_type'];
    }

    return enriched;
  }

  function processNetworkRequest(
    url,
    body,
    transport
  ) {

    try {

      if (!url) {
        return;
      }

      if (
        isOwnMonitoringRequest(
          url
        )
      ) {
        return;
      }

      var queryParams =
        extractQueryParams(
          url
        );

      var bodyParams =
        parseBody(
          body
        );

      var params =
        mergeParams(
          queryParams,
          bodyParams
        );

      var vendor =
        detectVendor(
          url,
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
            url,
            body
          );

        parsed.params =
          enrichGA4Params(
            parsed.params
          );

      } else {

        parsed =
          parseGeneric(
            vendor,
            url,
            body
          );
      }

      var matchedCandidate =
        null;

      var networkOccurrenceId =
        null;

      /*
       * -----------------------------------------------------
       * GA4
       * -----------------------------------------------------
       */

      if (
        vendor ===
        'ga4'
      ) {

        observedGA4 =
          true;

        if (
          parsed.measurementId
        ) {

          ga4Configured =
            true;

          ga4MeasurementIds[
            String(
              parsed.measurementId
            ).toUpperCase()
          ] =
            true;
        }

        if (
          parsed.eventName
        ) {

          networkOccurrenceId =
            createNetworkOccurrenceId();

          var normalizedEvent =
            normalize(
              parsed.eventName
            );

          if (
            !observedGA4EventCounts[
              normalizedEvent
            ]
          ) {

            observedGA4EventCounts[
              normalizedEvent
            ] =
              0;
          }

          observedGA4EventCounts[
            normalizedEvent
          ]++;

          /*
           * Match THIS network request
           * to ONE pending event.
           */

          matchedCandidate =
            matchGA4NetworkEvent(
              parsed.eventName,
              parsed.params,
              now(),
              networkOccurrenceId
            );

          /*
           * If dataLayer/gtag hasn't arrived
           * yet, queue this specific request.
           */

          if (
            !matchedCandidate
          ) {

            queueNetworkGA4({

              networkOccurrenceId:
                networkOccurrenceId,

              eventName:
                parsed.eventName,

              params:
                parsed.params,

              timestamp:
                now()
            });
          }
        }
      }

      /*
       * -----------------------------------------------------
       * Send complete event to backend.
       * -----------------------------------------------------
       */

      send({

        type:
          'network',

        vendor:
          vendor,

        eventName:
          parsed.eventName ||
          null,

        measurementId:
          parsed.measurementId ||
          null,

        transactionId:
          parsed.transactionId ||
          null,

        clientId:
          parsed.clientId ||
          null,

        /*
         * COMPLETE GA4 PARAMETERS.
         *
         * Includes:
         *
         *   en
         *   tid
         *   cu
         *   epn.value
         *   ep.purchase_type
         *   dl
         *   dr
         *   cid
         *   sid
         *   etc.
         */

        params:
          parsed.params ||
          {},

        /*
         * Unique network request.
         */

        networkOccurrenceId:
          networkOccurrenceId,

        rawUrl:
          String(
            url
          ).slice(
            0,
            10000
          ),

        url:
          String(
            url
          ).slice(
            0,
            10000
          ),

        transport:
          transport ||
          null,

        pageUrl:
          safePageUrl(),

        /*
         * Exact dataLayer occurrence
         * that this network request matched.
         */

        occurrenceId:
          matchedCandidate
            ? matchedCandidate.occurrenceId
            : null,

        dlPushIndex:
          matchedCandidate
            ? matchedCandidate.pushIndex
            : null,

        source:
          matchedCandidate
            ? (
                matchedCandidate.source ||
                transport ||
                'network'
              )
            : (
                transport ||
                'network'
              ),

        timestamp:
          now()

      });

    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Fetch
   * ---------------------------------------------------------
   */

  if (
    typeof window.fetch ===
    'function'
  ) {

    var originalFetch =
      window.fetch;

    window.fetch =
      function () {

        try {

          var input =
            arguments[0];

          var init =
            arguments[1] ||
            {};

          var url;

          if (
            typeof input ===
            'string'
          ) {

            url =
              input;

          } else if (
            input &&
            input.url
          ) {

            url =
              input.url;
          }

          var body =
            init.body ||
            null;

          if (
            url
          ) {

            processNetworkRequest(
              url,
              body,
              'fetch'
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
   * XMLHttpRequest
   * ---------------------------------------------------------
   */

  try {

    var originalXHRopen =
      XMLHttpRequest.prototype.open;

    var originalXHRsend =
      XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open =
      function (
        method,
        url
      ) {

        try {

          this.__g4f_url =
            url;

          this.__g4f_method =
            method;

        } catch (e) {}

        return originalXHRopen.apply(
          this,
          arguments
        );
      };

    XMLHttpRequest.prototype.send =
      function (
        body
      ) {

        try {

          processNetworkRequest(
            this.__g4f_url,
            body,
            'xhr'
          );

        } catch (e) {}

        return originalXHRsend.apply(
          this,
          arguments
        );
      };

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * sendBeacon
   * ---------------------------------------------------------
   */

  try {

    if (
      navigator.sendBeacon
    ) {

      var originalSendBeacon =
        navigator.sendBeacon.bind(
          navigator
        );

      navigator.sendBeacon =
        function (
          url,
          data
        ) {

          try {

            processNetworkRequest(
              url,
              data,
              'sendBeacon'
            );

          } catch (e) {}

          return originalSendBeacon(
            url,
            data
          );
        };
    }

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Image tracking
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
      imageDescriptor.set &&
      imageDescriptor.get
    ) {

      Object.defineProperty(
        HTMLImageElement.prototype,
        'src',
        {

          configurable:
            true,

          enumerable:
            imageDescriptor.enumerable,

          get:
            function () {

              return imageDescriptor.get.call(
                this
              );
            },

          set:
            function (
              value
            ) {

              try {

                processNetworkRequest(
                  value,
                  null,
                  'image'
                );

              } catch (e) {}

              return imageDescriptor.set.call(
                this,
                value
              );
            }
        }
      );
    }

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Script src tracking
   * ---------------------------------------------------------
   */

  try {

    var originalSetAttribute =
      Element.prototype.setAttribute;

    Element.prototype.setAttribute =
      function (
        name,
        value
      ) {

        try {

          if (
            this.tagName ===
            'SCRIPT' &&
            String(
              name
            ).toLowerCase() ===
            'src'
          ) {

            processNetworkRequest(
              value,
              null,
              'script'
            );
          }

        } catch (e) {}

        return originalSetAttribute.apply(
          this,
          arguments
        );
      };

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Performance Resource Timing
   *
   * THIS IS IMPORTANT FOR YOUR HAR.
   *
   * Your request:
   *
   *   /metrics/g/collect
   *
   * is being initiated through:
   *
   *   /metrics/_/service_worker/.../sw.js
   *
   * The page's fetch/XHR monkey-patches cannot
   * necessarily see the Service Worker request.
   *
   * PerformanceResourceTiming lets us observe
   * the resulting resource.
   * ---------------------------------------------------------
   */

  function processPerformanceEntry(
    entry
  ) {

    try {

      if (!entry) {
        return;
      }

      var url =
        entry.name || '';

      if (!url) {
        return;
      }

      if (
        isOwnMonitoringRequest(
          url
        )
      ) {
        return;
      }

      /*
       * Use URL parameters to identify GA4.
       */

      var params =
        extractQueryParams(
          url
        );

      var vendor =
        detectVendor(
          url,
          params
        );

      if (
        vendor !==
        'ga4'
      ) {
        return;
      }

      /*
       * ResourceTiming entries can appear
       * more than once during scans.
       */

      var identity =
        url +
        '|' +
        String(
          entry.startTime ||
          0
        ) +
        '|' +
        String(
          entry.duration ||
          0
        ) +
        '|' +
        String(
          entry.transferSize ||
          0
        );

      if (
        networkReported[
          identity
        ]
      ) {
        return;
      }

      networkReported[
        identity
      ] =
        true;

      /*
       * The actual request has already happened,
       * so parse it and match it to the
       * corresponding dataLayer occurrence.
       */

      var parsed =
        parseGA4(
          url,
          null
        );

      parsed.params =
        enrichGA4Params(
          parsed.params
        );

      if (
        !parsed.eventName
      ) {
        return;
      }

      observedGA4 =
        true;

      if (
        parsed.measurementId
      ) {

        ga4Configured =
          true;

        ga4MeasurementIds[
          String(
            parsed.measurementId
          ).toUpperCase()
        ] =
          true;
      }

      var networkOccurrenceId =
        createNetworkOccurrenceId();

      var normalizedEvent =
        normalize(
          parsed.eventName
        );

      if (
        !observedGA4EventCounts[
          normalizedEvent
        ]
      ) {

        observedGA4EventCounts[
          normalizedEvent
        ] =
          0;
      }

      observedGA4EventCounts[
        normalizedEvent
      ]++;

      var timestamp =
        now();

      var matchedCandidate =
        matchGA4NetworkEvent(
          parsed.eventName,
          parsed.params,
          timestamp,
          networkOccurrenceId
        );

      /*
       * Send this network observation
       * even though it came through the
       * service worker.
       */

      send({

        type:
          'network',

        vendor:
          'ga4',

        eventName:
          parsed.eventName,

        measurementId:
          parsed.measurementId ||
          null,

        transactionId:
          parsed.transactionId ||
          null,

        clientId:
          parsed.clientId ||
          null,

        params:
          parsed.params ||
          {},

        networkOccurrenceId:
          networkOccurrenceId,

        rawUrl:
          String(
            url
          ).slice(
            0,
            10000
          ),

        url:
          String(
            url
          ).slice(
            0,
            10000
          ),

        transport:
          'performance',

        pageUrl:
          safePageUrl(),

        occurrenceId:
          matchedCandidate
            ? matchedCandidate.occurrenceId
            : null,

        dlPushIndex:
          matchedCandidate
            ? matchedCandidate.pushIndex
            : null,

        source:
          matchedCandidate
            ? (
                matchedCandidate.source ||
                'performance'
              )
            : 'performance',

        timestamp:
          timestamp
      });

    } catch (e) {}
  }

  function scanPerformanceEntries() {

    try {

      if (
        !performance ||
        !performance.getEntriesByType
      ) {
        return;
      }

      var entries =
        performance.getEntriesByType(
          'resource'
        );

      if (!entries) {
        return;
      }

      for (
        var i = 0;
        i < entries.length;
        i++
      ) {

        processPerformanceEntry(
          entries[i]
        );
      }

    } catch (e) {}
  }

  /*
   * PerformanceObserver gives near-real-time
   * visibility into resources loaded after
   * monitor initialization.
   */

  try {

    if (
      typeof PerformanceObserver !==
      'undefined'
    ) {

      var performanceObserver =
        new PerformanceObserver(
          function (
            list
          ) {

            try {

              var entries =
                list.getEntries();

              for (
                var i = 0;
                i < entries.length;
                i++
              ) {

                processPerformanceEntry(
                  entries[i]
                );
              }

            } catch (e) {}
          }
        );

      performanceObserver.observe({
        type:
          'resource',

        buffered:
          true
      });
    }

  } catch (e) {}

  /*
   * Also scan periodically because
   * Service Worker resources may not
   * always be surfaced immediately
   * through the observer callback.
   */

  try {

    setInterval(
      scanPerformanceEntries,
      PERFORMANCE_SCAN_MS
    );

  } catch (e) {}

  /*
   * Initial scan.
   */

  try {
    scanPerformanceEntries();
  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Telemetry queue
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
   * Flush telemetry
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
     * Fetch first.
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
     * Beacon fallback.
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
   * Blocked platform reporting
   * ---------------------------------------------------------
   */

  function reportPlatformBlocked(
    method,
    details
  ) {

    try {

      details =
        details ||
        {};

      var eventName =
        details.eventName ||
        null;

      var occurrenceId =
        details.occurrenceId ||
        null;

      var eventIdentity =
        occurrenceId ||
        (
          details.dlPushIndex !==
            undefined &&
          details.dlPushIndex !==
            null
            ? String(
                details.dlPushIndex
              )
            : (
                eventName ||
                'unknown'
              )
        );

      var key =
        method +
        ':' +
        eventIdentity;

      if (
        blockedReported[
          key
        ]
      ) {
        return;
      }

      blockedReported[
        key
      ] =
        true;

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

      /*
       * EXACT EVENT NAME
       *
       * Example:
       *
       *   e=run_audit
       *
       *   e=purchase
       *
       *   e=connect_ga4_account
       */

      if (
        eventName
      ) {

        url +=
          '&e=' +
          encodeURIComponent(
            eventName
          );
      }

      /*
       * Reason.
       */

      if (
        details.reason
      ) {

        url +=
          '&r=' +
          encodeURIComponent(
            details.reason
          );
      }

      /*
       * Unique event occurrence.
       */

      if (
        occurrenceId !==
        null
      ) {

        url +=
          '&o=' +
          encodeURIComponent(
            String(
              occurrenceId
            )
          );
      }

      /*
       * DataLayer push index.
       */

      if (
        details.dlPushIndex !==
        undefined &&
        details.dlPushIndex !==
        null
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
       * Source.
       */

      if (
        details.source
      ) {

        url +=
          '&s=' +
          encodeURIComponent(
            details.source
          );
      }

      /*
       * Page.
       */

      url +=
        '&p=' +
        encodeURIComponent(
          safePageUrl()
        );

      /*
       * Fetch.
       */

      try {

        fetch(
          url,
          {

            method:
              'GET',

            keepalive:
              true,

            credentials:
              'omit'
          }
        ).catch(
          function () {}
        );

        return;

      } catch (e) {}

      /*
       * Beacon fallback.
       */

      try {

        if (
          navigator.sendBeacon
        ) {

          navigator.sendBeacon(
            url
          );
        }

      } catch (e) {}

    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Debugging API
   * ---------------------------------------------------------
   */

  try {

    window.__g4fDebug =
      function () {

        return {

          version:
            g.version,

          ga4Configured:
            ga4Configured,

          ga4MeasurementIds:
            Object.keys(
              ga4MeasurementIds
            ),

          observedGA4:
            observedGA4,

          observedGA4EventCounts:
            Object.assign(
              {},
              observedGA4EventCounts
            ),

          pendingEvents:
            pendingEvents.map(
              function (
                event
              ) {

                return {

                  occurrenceId:
                    event.occurrenceId,

                  eventName:
                    event.originalEventName,

                  pushIndex:
                    event.pushIndex,

                  source:
                    event.source,

                  networkMatched:
                    event.networkMatched,

                  networkOccurrenceId:
                    event.networkOccurrenceId,

                  timestamp:
                    event.timestamp
                };
              }
            ),

          recentDataLayerEvents:
            recentDataLayerEvents.map(
              function (
                event
              ) {

                return {

                  occurrenceId:
                    event.occurrenceId,

                  eventName:
                    event.originalEventName,

                  pushIndex:
                    event.pushIndex,

                  source:
                    event.source,

                  isGA4Candidate:
                    event.isGA4Candidate,

                  networkMatched:
                    event.networkMatched,

                  networkOccurrenceId:
                    event.networkOccurrenceId
                };
              }
            ),

          pendingNetworkGA4:
            pendingNetworkGA4.map(
              function (
                event
              ) {

                return {

                  networkOccurrenceId:
                    event.networkOccurrenceId,

                  eventName:
                    event.eventName,

                  timestamp:
                    event.timestamp
                };
              }
            ),

          performanceResources:
            Object.keys(
              networkReported
            ).length
        };
      };

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Ready
   * ---------------------------------------------------------
   */

  g.ready =
    true;

  try {

    send({

      type:
        'monitor_ready',

      version:
        g.version,

      pageUrl:
        safePageUrl(),

      timestamp:
        now()

    });

  } catch (e) {}

})();
