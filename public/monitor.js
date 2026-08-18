(function () {
  'use strict';

  /*
   * =========================================================
   * GA4FIX MONITOR v9
   * =========================================================
   *
   * Main responsibilities:
   *
   * 1. Observe dataLayer
   * 2. Observe gtag()
   * 3. Observe fetch()
   * 4. Observe XMLHttpRequest
   * 5. Observe sendBeacon()
   * 6. Observe image pixels
   * 7. Detect GA4 and other analytics vendors
   * 8. Match individual analytics requests to
   *    individual dataLayer / gtag events
   * 9. Detect blocked events
   * 10. Preserve complete GA4 request parameters
   *
   * IMPORTANT:
   *
   * We DO NOT use:
   *
   *     observedGA4Events[eventName] = true
   *
   * to decide whether a particular event was sent.
   *
   * Every event instance has its own:
   *
   *     dlPushIndex
   *
   * and every network request is matched to exactly
   * one pending event.
   *
   * Example:
   *
   *     run_audit #1 -> GA4 request #1
   *     run_audit #2 -> GA4 request #2
   *     run_audit #3 -> NO request
   *
   * Result:
   *
   *     #1 detected
   *     #2 detected
   *     #3 GA4 event blocked: run_audit
   *
   * =========================================================
   */

  /*
   * ---------------------------------------------------------
   * Script configuration
   * ---------------------------------------------------------
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
    '9.0';

  window.__g4f =
    g;

  /*
   * Prevent duplicate installation.
   */

  if (
    g.__monitor_v9_installed
  ) {
    return;
  }

  g.__monitor_v9_installed =
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
   * Every dataLayer event gets a unique
   * sequential index.
   */

  var dlPushIndex =
    0;

  /*
   * Recent dataLayer events for debugging.
   */

  var recentDataLayerEvents =
    [];

  /*
   * Events waiting for their
   * corresponding analytics request.
   */

  var pendingEvents =
    [];

  /*
   * Network requests that arrived before
   * their dataLayer/gtag event.
   */

  var pendingNetworkGA4 =
    [];

  /*
   * GA4 configuration.
   */

  var ga4Configured =
    false;

  var ga4MeasurementIds =
    {};

  /*
   * Whether ANY GA4 request has been
   * observed.
   */

  var observedGA4 =
    false;

  /*
   * Counts are informational only.
   *
   * They are NOT used to determine
   * whether an event instance fired.
   */

  var observedGA4EventCounts =
    {};

  /*
   * Prevent duplicate blocked reports.
   */

  var blockedReported =
    {};

  var MAX_RECENT_EVENTS =
    500;

  var MAX_PENDING_EVENTS =
    500;

  var MAX_PENDING_NETWORK =
    500;

  /*
   * Network/dataLayer matching window.
   */

  var NETWORK_MATCH_WINDOW =
    5000;

  /*
   * How long we wait before saying
   * an event was blocked.
   */

  var BLOCKED_WAIT_MS =
    3500;

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

      /*
       * String
       */

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
         * JSON body
         */

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

        /*
         * Query string body
         */

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
      parsed.hostname ||
      '';

    var pathname =
      parsed.pathname ||
      '';

    var officialGA4Host =
      /(^|\.)google-analytics\.com$/i.test(
        hostname
      ) ||
      /(^|\.)analytics\.google\.com$/i.test(
        hostname
      );

    var collectionPath =
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
      officialGA4Host &&
      (
        hasMeasurementId ||
        !!eventName
      )
    ) {
      return true;
    }

    /*
     * First-party GA4 proxy.
     */

    if (
      collectionPath &&
      (
        hasMeasurementId ||
        !!eventName
      )
    ) {
      return true;
    }

    /*
     * Any collection request containing
     * a GA4 event.
     */

    if (
      collectionPath &&
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

    /*
     * IMPORTANT:
     *
     * Do NOT delete:
     *
     *     cu
     *     epn.value
     *     ep.value
     *     ep.currency
     *     ep.purchase_type
     *
     * These are needed by detection.
     */

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
     * If GA4 is configured, arbitrary
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

      /*
       * Will become true only when
       * THIS event is matched to
       * THIS network request.
       */

      networkMatched:
        false,

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
     * Check if a GA4 network request
     * arrived before this dataLayer event.
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
   * Find pending event
   *
   * IMPORTANT:
   *
   * FIFO matching.
   *
   * We do NOT search from the newest
   * event backwards because:
   *
   * run_audit #1
   * run_audit #2
   *
   * must match:
   *
   * request #1
   * request #2
   *
   * in that order.
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

      if (
        candidate.networkMatched
      ) {
        continue;
      }

      if (
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
   * Is GA4 candidate?
   * ---------------------------------------------------------
   */

  function isGA4EventCandidate(
    candidate
  ) {

    if (!candidate) {
      return false;
    }

    /*
     * Explicit gtag event.
     */

    if (
      candidate.isGA4Candidate
    ) {
      return true;
    }

    /*
     * GA4 configuration discovered.
     */

    if (
      ga4Configured
    ) {
      return true;
    }

    /*
     * Standard GA4 event.
     */

    if (
      isStandardGA4Event(
        candidate.eventName
      )
    ) {
      return true;
    }

    /*
     * GA4 network was observed.
     */

    if (
      observedGA4
    ) {
      return true;
    }

    return false;
  }

  /*
   * ---------------------------------------------------------
   * Match a network GA4 request to
   * exactly ONE dataLayer event.
   * ---------------------------------------------------------
   */

  function matchGA4NetworkEvent(
    eventName,
    networkParams,
    networkTimestamp
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
     * Mark ONLY this event instance.
     */

    candidate.networkMatched =
      true;

    candidate.networkParams =
      networkParams ||
      {};

    candidate.networkEventTimestamp =
      networkTimestamp;

    /*
     * Remove it from the pending
     * blocked-event queue immediately.
     *
     * This is important.
     *
     * Otherwise a second identical
     * network request could match
     * the same candidate.
     */

    removePendingEvent(
      candidate
    );

    return candidate;
  }

  /*
   * ---------------------------------------------------------
   * Pending network queue
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
   * Match previously queued network
   * request to a newly observed event.
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
           * If it was matched to a
           * network request, it is good.
           */

          if (
            candidate.networkMatched
          ) {
            return;
          }

          /*
           * If it has already been removed
           * because of a matching network
           * request, do nothing.
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
           * Give late network requests
           * one final chance.
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
             * It is still pending.
             *
             * We intentionally do not
             * classify it as blocked
             * until the timeout has passed.
             */

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
           * If a request appeared
           * during the waiting period,
           * this candidate may now be
           * matched.
           */

          if (
            candidate.networkMatched
          ) {
            return;
          }

          /*
           * Unique event instance.
           */

          var key =
            'ga4_event_blocked:' +
            candidate.eventName +
            ':' +
            candidate.pushIndex;

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

          /*
           * Report the EXACT event name.
           */

          reportPlatformBlocked(
            'ga4_event_blocked',
            {

              eventName:
                candidate.originalEventName,

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
       * If a network request was already
       * waiting for this event, it has
       * already been matched.
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

          /*
           * gtag('config', 'G-XXXX')
           */

          if (
            arguments[0] ===
            'config'
          ) {

            inspectGA4Configuration(
              arguments
            );
          }

          /*
           * gtag(
           *   'event',
           *   'run_audit',
           *   {...}
           * )
           */

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
   * Network processing
   * ---------------------------------------------------------
   */

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
           * Match THIS request to
           * ONE specific dataLayer event.
           */

          matchedCandidate =
            matchGA4NetworkEvent(
              parsed.eventName,
              parsed.params,
              now()
            );

          /*
           * If no dataLayer event exists
           * yet, temporarily queue the
           * network request.
           */

          if (
            !matchedCandidate
          ) {

            queueNetworkGA4({

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
         * IMPORTANT:
         *
         * Full GA4 parameters.
         *
         * This includes:
         *
         *     cu=USD
         *     epn.value=49.5
         *     ep.purchase_type=Single Audit
         *     en=purchase
         *     tid=G-XXXX
         *
         */

        params:
          parsed.params ||
          {},

        /*
         * Keep full raw URL.
         */

        rawUrl:
          String(
            url
          ).slice(
            0,
            10000
          ),

        /*
         * Keep legacy url field too.
         */

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
         * The dataLayer push which
         * produced this request.
         */

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
     * Fetch.
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
     * sendBeacon fallback.
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

      var eventIdentity =
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
       * Reason
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
       * DataLayer push index
       */

      if (
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
       * Source
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
       * Page
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

                  eventName:
                    event.originalEventName,

                  pushIndex:
                    event.pushIndex,

                  source:
                    event.source,

                  networkMatched:
                    event.networkMatched,

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

                  eventName:
                    event.originalEventName,

                  pushIndex:
                    event.pushIndex,

                  source:
                    event.source,

                  isGA4Candidate:
                    event.isGA4Candidate,

                  networkMatched:
                    event.networkMatched
                };
              }
            ),

          pendingNetworkGA4:
            pendingNetworkGA4.map(
              function (
                event
              ) {

                return {

                  eventName:
                    event.eventName,

                  timestamp:
                    event.timestamp
                };
              }
            )
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
