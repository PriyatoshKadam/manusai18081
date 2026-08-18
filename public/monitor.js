(function () {
  'use strict';

  /*
   * =========================================================
   * GA4FIX MONITOR
   * =========================================================
   *
   * Captures:
   *   - dataLayer events
   *   - gtag events
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
   * Also detects potential GA4 blocking:
   *
   *   dataLayer GA4 event
   *          ↓
   *   wait for GA4 network request
   *          ↓
   *   no request
   *          ↓
   *   report ga4_event_blocked
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
    scriptParams.get('apiKey') ||
    '';

  var GTM_ID =
    scriptParams.get('gtmContainerId') ||
    '';

  if (!API_KEY) {
    return;
  }

  var ORIGIN =
    new URL(scriptUrl).origin;

  var INGEST =
    ORIGIN +
    '/api/ingest';

  var BLOCKED =
    ORIGIN +
    '/api/blocked';

  /*
   * ---------------------------------------------------------
   * Global state
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
   * Prevent installing twice.
   */

  if (g.__monitor_v5_installed) {
    return;
  }

  g.__monitor_v5_installed =
    true;
  g.r = false;
  g.ready = false;
  g.version = '5.0';

  /*
   * ---------------------------------------------------------
   * Utility
   * ---------------------------------------------------------
   */

  function safePageUrl() {
    try {
      return window.location.href;
    } catch (e) {
      return '';
    }
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
          text.charAt(0) === '{'
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
      }

      /*
       * URLSearchParams
       */

      if (
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
       * Blob cannot safely be
       * synchronously read here.
       */

      if (
        typeof Blob !==
          'undefined' &&
        body instanceof Blob
      ) {
        return result;
      }

      /*
       * FormData
       */

      if (
        typeof FormData !==
          'undefined' &&
        body instanceof FormData
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
   * Vendor detection
   * ---------------------------------------------------------
   */

  var VENDORS = [
    {
      name: 'ga4',
      patterns: [
        /google-analytics\.com\/g\/collect/i,
        /google-analytics\.com\/mp\/collect/i,
        /analytics\.google\.com\/g\/collect/i,
        /analytics\.google\.com\/mp\/collect/i
      ]
    },

    {
      name: 'gads',
      patterns: [
        /googleadservices\.com\/pagead\/conversion/i,
        /googleadservices\.com\/pagead\/1p-conversion/i,
        /googlesyndication\.com\/pagead/i
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
        /business-api\.tiktok\.com/i
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

  function detectVendor(
    url,
    params
  ) {
    var text =
      String(url || '');

    for (
      var i = 0;
      i < VENDORS.length;
      i++
    ) {
      var vendor =
        VENDORS[i];

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
     * GA4 fallback based on
     * parameters.
     */

    if (
      params &&
      (
        params.tid ||
        params.measurement_id ||
        params.en
      )
    ) {
      return 'ga4';
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
   * GA4 parser
   * ---------------------------------------------------------
   */

  function parseGA4(
    url,
    body
  ) {
    var params =
      extractQueryParams(
        url
      );

    var bodyParams =
      parseBody(body);

    Object.keys(
      bodyParams
    ).forEach(
      function (key) {
        params[key] =
          bodyParams[key];
      }
    );

    return {
      eventName:
        params.en ||
        params.event_name ||
        params.event ||
        null,

      clientId:
        params.cid ||
        params.client_id ||
        null,

      measurementId:
        params.tid ||
        params.measurement_id ||
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
    url,
    body
  ) {
    var params =
      extractQueryParams(
        url
      );

    var bodyParams =
      parseBody(body);

    Object.keys(
      bodyParams
    ).forEach(
      function (key) {
        params[key] =
          bodyParams[key];
      }
    );

    return {
      eventName:
        params.en ||
        params.ev ||
        params.event ||
        params.event_name ||
        params.eventName ||
        null,

      clientId:
        params.cid ||
        params.client_id ||
        params.id ||
        null,

      params:
        params
    };
  }

  /*
   * ---------------------------------------------------------
   * DataLayer
   * ---------------------------------------------------------
   */

  var dataLayer =
    window.dataLayer ||
    [];

  window.dataLayer =
    dataLayer;

  var dlPushIndex =
    0;

  var lastDataLayerEvent =
    null;

  function getDataLayerEventName() {
    if (
      !lastDataLayerEvent
    ) {
      return null;
    }

    /*
     * Only use a dataLayer
     * event for a short period.
     */

    if (
      Date.now() -
        lastDataLayerEvent.timestamp >
        3000
    ) {
      return null;
    }

    return (
      lastDataLayerEvent.event ||
      null
    );
  }

  function getRecentDataLayerEvent() {
    if (
      !lastDataLayerEvent
    ) {
      return null;
    }

    if (
      Date.now() -
        lastDataLayerEvent.timestamp >
        3000
    ) {
      return null;
    }

    return lastDataLayerEvent;
  }

  /*
   * ---------------------------------------------------------
   * Pending GA4 events
   * ---------------------------------------------------------
   */

  var pendingGA4Events =
    {};

  var ga4BlockedReported =
    {};

  var GA4_WAIT_MS =
    3000;

  var STANDARD_GA4_EVENTS = {
    page_view: true,
    scroll: true,
    click: true,
    user_engagement: true,
    view_search_results: true,
    video_start: true,
    video_progress: true,
    video_complete: true,
    file_download: true,

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

    remove_from_cart: true
  };

  function isLikelyGA4Event(
    item
  ) {
    if (
      !item ||
      typeof item !==
        'object'
    ) {
      return false;
    }

    /*
     * gtag() pushes an Arguments
     * object into dataLayer.
     */

    var eventName =
      item.event ||
      item.event_name ||
      item.eventName;

    /*
     * Handle:
     *
     * dataLayer.push(
     *   arguments
     * )
     */

    if (
      typeof item.length ===
        'number' &&
      !eventName
    ) {
      try {
        if (
          item[0] ===
            'event'
        ) {
          eventName =
            item[1];
        }
      } catch (e) {}
    }

    if (!eventName) {
      return false;
    }

    /*
     * Strong GA4 signal.
     */

    if (
      item.send_to ||
      item.measurement_id ||
      item.measurementId ||
      item.ga4_measurement_id
    ) {
      return true;
    }

    /*
     * Standard GA4 event.
     */

    return !!STANDARD_GA4_EVENTS[
      normalize(eventName)
    ];
  }

  function extractDataLayerEvent(
    item
  ) {
    if (
      !item
    ) {
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

  function trackExpectedGA4Event(
    item
  ) {
    try {
      if (
        !isLikelyGA4Event(item)
      ) {
        return;
      }

      var parsed =
        extractDataLayerEvent(
          item
        );

      if (!parsed) {
        return;
      }

      var eventName =
        normalize(
          parsed.eventName
        );

      if (!eventName) {
        return;
      }

      /*
       * Ignore very frequent
       * automatic events for
       * blocking detection.
       *
       * This reduces false positives.
       */

      var detectionEligible =
        eventName ===
          'purchase' ||
        eventName ===
          'generate_lead' ||
        eventName ===
          'sign_up' ||
        eventName ===
          'login' ||
        eventName ===
          'add_to_cart' ||
        eventName ===
          'begin_checkout' ||
        eventName ===
          'page_view';

      if (!detectionEligible) {
        return;
      }

      var id =
        eventName +
        ':' +
        Date.now() +
        ':' +
        Math.random()
          .toString(36)
          .slice(2);

      pendingGA4Events[id] = {
        eventName:
          eventName,

        timestamp:
          Date.now(),

        item:
          item
      };

      setTimeout(
        function () {
          try {
            var pending =
              pendingGA4Events[id];

            if (!pending) {
              return;
            }

            delete pendingGA4Events[id];

            /*
             * Only report once per event
             * name during this page session.
             */

            if (
              ga4BlockedReported[
                eventName
              ]
            ) {
              return;
            }

            ga4BlockedReported[
              eventName
            ] = true;

            reportPlatformBlocked(
              'ga4_event_blocked',
              {
                eventName:
                  eventName
              }
            );
          } catch (e) {}
        },
        GA4_WAIT_MS
      );
    } catch (e) {}
  }

  function markGA4EventReceived(
    eventName
  ) {
    try {
      eventName =
        normalize(eventName);

      if (!eventName) {
        return;
      }

      var keys =
        Object.keys(
          pendingGA4Events
        );

      for (
        var i = 0;
        i < keys.length;
        i++
      ) {
        var key =
          keys[i];

        var pending =
          pendingGA4Events[
            key
          ];

        if (
          pending &&
          pending.eventName ===
            eventName
        ) {
          delete pendingGA4Events[
            key
          ];

          delete ga4BlockedReported[
            eventName
          ];

          return;
        }
      }
    } catch (e) {}
  }

  /*
   * Patch dataLayer.push.
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
        try {
          var item =
            arguments[i];

          dlPushIndex++;

          var parsed =
            extractDataLayerEvent(
              item
            );

          if (parsed) {
            lastDataLayerEvent = {
              event:
                parsed.eventName,

              pushIndex:
                dlPushIndex,

              timestamp:
                Date.now(),

              item:
                item
            };

            trackExpectedGA4Event(
              item
            );
          }
        } catch (e) {}
      }

      return originalDataLayerPush.apply(
        this,
        arguments
      );
    };

  /*
   * Process events that existed
   * before our monitor loaded.
   */

  try {
    for (
      var i = 0;
      i < dataLayer.length;
      i++
    ) {
      var item =
        dataLayer[i];

      var parsed =
        extractDataLayerEvent(
          item
        );

      if (parsed) {
          lastDataLayerEvent = {
            event:
              parsed.eventName,

            pushIndex:
              ++dlPushIndex,

            timestamp:
              Date.now(),

            item:
              item
          };
          trackExpectedGA4Event(item);
      }
    }
  } catch (e) {}

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
            trackExpectedGA4Event(
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

  function send(payload) {
    queue.push(payload);

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
     * Don't use sendBeacon first here.
     *
     * It can make debugging harder and
     * can be intercepted by other
     * monitoring scripts.
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
    method
  ) {
    var recent =
      getRecentDataLayerEvent();

    if (
      recent
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
   * Record network event
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
       * Don't intercept our own
       * monitoring requests.
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

      var params =
        extractQueryParams(
          absoluteUrl
        );

      var bodyParams =
        parseBody(body);

      Object.keys(
        bodyParams
      ).forEach(
        function (key) {
          params[key] =
            bodyParams[key];
        }
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

        if (
          parsed &&
          parsed.eventName
        ) {
          markGA4EventReceived(
            parsed.eventName
          );
        }
      } else {
        parsed =
          parseGeneric(
            absoluteUrl,
            body
          );
      }

      var eventName =
        parsed.eventName ||
        getDataLayerEventName() ||
        null;

      var recent =
        getRecentDataLayerEvent();

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
          recent
            ? recent.pushIndex
            : null,

        source:
          detectSource(
            method
          ),

        ts:
          Date.now()
      });
    } catch (e) {
      /*
       * Never break the customer site.
       */
    }
  }

  /*
   * ---------------------------------------------------------
   * Fetch
   * ---------------------------------------------------------
   */

  var originalFetch =
    window.fetch;

  if (
    originalFetch
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
          /*
           * IMPORTANT:
           * Don't process our own
           * blocked/ingest requests.
           */

          var absolute =
            safeUrl(url);

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
   * Platform script blocking
   * ---------------------------------------------------------
   */

  var blockedReported =
    {};

  function reportPlatformBlocked(
    method,
    details
  ) {
    try {
      var key =
        method +
        ':' +
        (
          details &&
          details.eventName
            ? details.eventName
            : ''
        );

      if (
        blockedReported[key]
      ) {
        return;
      }

      blockedReported[key] =
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

      if (
        details &&
        details.eventName
      ) {
        url +=
          '&e=' +
          encodeURIComponent(
            details.eventName
          );
      }

      if (
        navigator.sendBeacon
      ) {
        navigator.sendBeacon(
          url,
          ''
        );
      } else {
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
      }
    } catch (e) {}
  }

  /*
   * ---------------------------------------------------------
   * Resource error detection
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
   * Initialize
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
   * Flush on page exit
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
   * Debug information.
   */

  g.apiKey =
    API_KEY;

  g.gtmContainerId =
    GTM_ID;

  g.version =
    '5.0';
  g.ready = true;
  g.r = true;

})();
