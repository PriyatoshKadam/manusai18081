(function () {
  'use strict';

  /*
   * =========================================================
   * GA4FIX MONITOR v8
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
   * IMPORTANT:
   *
   * GA4 EVENT NAMES ARE NOT HARDCODED.
   *
   * Examples:
   *
   *   purchase
   *   run_audit
   *   generate_report
   *   foo_bar
   *
   * are all valid GA4 event candidates.
   *
   * GA4 blocked-event detection works by:
   *
   *   1. Observing dataLayer / gtag
   *   2. Capturing the event name
   *   3. Waiting for the corresponding GA4 network request
   *   4. If no request is observed, reporting:
   *
   *        ga4_event_blocked
   *
   *   together with:
   *
   *        eventName
   *
   *   and:
   *
   *        dlPushIndex
   *
   * This means:
   *
   *   run_audit
   *   run_audit
   *
   * are treated as TWO separate events.
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
   * Global monitor state
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

  window.__g4f =
    g;

  /*
   * Prevent duplicate installation.
   */

  if (
    g.__monitor_v8_installed
  ) {
    return;
  }

  g.__monitor_v8_installed =
    true;

  g.r =
    false;

  g.ready =
    false;

  g.version =
    '8.0';

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

  var dlPushIndex =
    0;

  var recentDataLayerEvents =
    [];

  var pendingEvents =
    [];

  /*
   * Network-observed GA4 events.
   *
   * Example:
   *
   * {
   *   purchase: true,
   *   run_audit: true
   * }
   */

  var observedGA4Events =
    {};

  /*
   * Number of network events observed.
   */

  var observedGA4EventCounts =
    {};

  /*
   * Whether any GA4 network request
   * has been observed.
   */

  var observedGA4 =
    false;

  /*
   * Whether GA4 configuration was
   * discovered on the page.
   */

  var ga4Configured =
    false;

  /*
   * Known GA4 measurement IDs.
   */

  var ga4MeasurementIds =
    {};

  /*
   * Prevent duplicate blocked reports.
   *
   * IMPORTANT:
   *
   * This is keyed by event instance,
   * NOT just event name.
   *
   * Therefore:
   *
   * run_audit #1
   * run_audit #2
   *
   * can both be reported.
   */

  var blockedReported =
    {};

  var MAX_RECENT_EVENTS =
    200;

  var NETWORK_MATCH_WINDOW =
    5000;

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
      var absolute =
        safeUrl(
          url
        );

      if (!absolute) {
        return false;
      }

      var href =
        absolute.href;

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
   * Query-string parsing
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
   * Request body parsing
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
         * JSON
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
              String(
                value
              );
          }
        );

        return result;
      }

      /*
       * Blob cannot be synchronously
       * parsed.
       */

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
   */

  function isGA4Request(
    url,
    params
  ) {
    if (!params) {
      params = {};
    }

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
     * Official endpoint.
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
     */

    if (
      collectEndpoint &&
      (
        hasMeasurementId ||
        !!eventName
      )
    ) {
      return true;
    }

    /*
     * Custom first-party endpoint.
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
   *
   * Detect:
   *
   *   gtag('config', 'G-XXXX')
   *
   * and configuration-like objects.
   *
   * This is critical because a custom
   * event can be blocked before we ever
   * see the GA4 network request.
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

        var configMatch =
          configId.match(
            /G-[A-Z0-9]+/i
          );

        if (
          configMatch
        ) {
          ga4Configured =
            true;

          ga4MeasurementIds[
            configMatch[0]
              .toUpperCase()
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
          item.send_to ||
          null;

        if (
          possibleId
        ) {
          var idString =
            String(
              possibleId
            );

          var match =
            idString.match(
              /G-[A-Z0-9]+/i
            );

          if (
            match
          ) {
            ga4Configured =
              true;

            ga4MeasurementIds[
              match[0]
                .toUpperCase()
            ] =
              true;
          }
        }
      }

    } catch (e) {}
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

    /*
     * Always inspect configuration
     * first.
     */

    inspectGA4Configuration(
      item
    );

    var eventName =
      null;

    var params =
      item;

    var source =
      'dataLayer';

    var isGA4Candidate =
      false;

    /*
     * -------------------------------------------------------
     * Standard dataLayer event
     *
     * {
     *   event: 'purchase'
     * }
     * -------------------------------------------------------
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
     * -------------------------------------------------------
     * gtag('event', 'purchase', {...})
     * -------------------------------------------------------
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

          isGA4Candidate =
            true;
        }

      } catch (e) {}
    }

    /*
     * -------------------------------------------------------
     * gtag('config', ...)
     *
     * Configuration is not an event.
     * -------------------------------------------------------
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
     * -------------------------------------------------------
     * Ignore other gtag commands.
     * -------------------------------------------------------
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
     * If GA4 has already been
     * configured, every named
     * dataLayer event is a candidate.
     */

    if (
      ga4Configured
    ) {
      isGA4Candidate =
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
        isGA4Candidate
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
        'dataLayer'
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
     * Every named event becomes
     * a candidate.
     */

    pendingEvents.push({

      eventName:
        event.eventName,

      originalEventName:
        event.originalEventName,

      pushIndex:
        event.pushIndex,

      timestamp:
        event.timestamp,

      item:
        item,

      params:
        event.params,

      isGA4Candidate:
        event.isGA4Candidate,

      source:
        event.source

    });

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
        pendingEvents.length -
        1;
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
   * Remove one matched event
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
   * GA4 network event received
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
    ] =
      true;

    if (
      !observedGA4EventCounts[
        normalized
      ]
    ) {
      observedGA4EventCounts[
        normalized
      ] =
        0;
    }

    observedGA4EventCounts[
      normalized
    ]++;

    /*
     * Match ONE dataLayer event.
     */

    var candidate =
      findMatchingDataLayerEvent(
        eventName,
        now()
      );

    if (candidate) {
      removePendingEvent(
        candidate
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
   * Determine whether an event is a
   * GA4 candidate.
   * ---------------------------------------------------------
   */

  function isGA4EventCandidate(
    candidate
  ) {
    if (!candidate) {
      return false;
    }

    /*
     * Explicit gtag('event')
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
     * GA4 network already observed.
     */

    if (
      observedGA4
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

    return false;
  }

  /*
   * ---------------------------------------------------------
   * Blocked GA4 event detection
   * ---------------------------------------------------------
   */

  function scheduleBlockedCheck(
    candidate
  ) {
    if (!candidate) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * We do NOT require observedGA4
     * to already be true.
     *
     * This is what allows:
     *
     *   run_audit
     *
     * to be detected when GA4 is
     * completely blocked.
     */

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
           * If the candidate has
           * already been removed,
           * a matching network event
           * was found.
           */

          if (
            pendingEvents.indexOf(
              candidate
            ) ===
            -1
          ) {
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
           * If this event name was
           * observed on the GA4 network,
           * don't classify it as blocked.
           *
           * IMPORTANT:
           *
           * This is event-name based,
           * which handles the common case
           * where multiple identical events
           * are fired.
           */

          if (
            observedGA4Events[
              candidate.eventName
            ]
          ) {

            /*
             * Remove the candidate so
             * it does not stay pending.
             */

            removePendingEvent(
              candidate
            );

            return;
          }

          /*
           * Unique event instance key.
           *
           * This means:
           *
           * run_audit #41
           *
           * and:
           *
           * run_audit #42
           *
           * are separate.
           */

          var key =
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

          /*
           * Remove it after classification.
           */

          removePendingEvent(
            candidate
          );

          /*
           * Report blocked GA4 event.
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
      i <
      dataLayer.length;
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
        i <
        arguments.length;
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

          /*
           * Capture:
           *
           * gtag(
           *   'config',
           *   'G-XXXX'
           * )
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
           * Capture:
           *
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
   * Report blocked platform
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

      /*
       * IMPORTANT:
       *
       * Deduplicate using event identity,
       * not only method + event name.
       */

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

      /*
       * Build blocked endpoint.
       */

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
       * EVENT NAME
       *
       * This is the important addition.
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
       * DataLayer push index.
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
       * Page URL.
       */

      url +=
        '&p=' +
        encodeURIComponent(
          safePageUrl()
        );

      /*
       * Send with fetch.
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
       * sendBeacon fallback.
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
   * Network event processor
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

      /*
       * Never monitor our own
       * telemetry endpoints.
       */

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

      /*
       * Mark GA4 network activity.
       */

      if (
        vendor ===
        'ga4'
      ) {

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

        markGA4EventReceived(
          parsed.eventName
        );

      }

      /*
       * Record all network events.
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

        transport:
          transport ||
          null,

        url:
          String(
            url
          ).slice(
            0,
            2000
          ),

        pageUrl:
          safePageUrl(),

        timestamp:
          now()

      });

    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Patch fetch
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
   * Patch XMLHttpRequest
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
   * Patch navigator.sendBeacon
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
   * Image pixel monitoring
   * ---------------------------------------------------------
   */

  try {

    var OriginalImage =
      window.Image;

    if (
      OriginalImage
    ) {

      /*
       * We do not replace Image
       * completely because doing so
       * can break third-party scripts.
       *
       * Instead, monitor src assignment
       * through a lightweight wrapper.
       */

      var imageSrcDescriptor =
        Object.getOwnPropertyDescriptor(
          HTMLImageElement.prototype,
          'src'
        );

      if (
        imageSrcDescriptor &&
        imageSrcDescriptor.set &&
        imageSrcDescriptor.get
      ) {

        Object.defineProperty(
          HTMLImageElement.prototype,
          'src',
          {

            configurable:
              true,

            enumerable:
              imageSrcDescriptor.enumerable,

            get:
              function () {

                return imageSrcDescriptor.get.call(
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

                return imageSrcDescriptor.set.call(
                  this,
                  value
                );

              }

          }
        );

      }
    }

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Observe script src assignments
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
   * Initial readiness
   * ---------------------------------------------------------
   */

  g.ready =
    true;

  /*
   * ---------------------------------------------------------
   * Public debugging API
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

          observedGA4Events:
            Object.assign(
              {},
              observedGA4Events
            ),

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
                    event.isGA4Candidate

                };

              }
            )

        };

      };

  } catch (e) {}

  /*
   * ---------------------------------------------------------
   * Final marker
   * ---------------------------------------------------------
   */

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
