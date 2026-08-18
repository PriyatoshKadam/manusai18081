import { query } from './db';

export interface ParsedEvent {
  siteId: number;
  eventId: number;
  receivedAt: Date | string;

  vendor: string;

  eventName: string | null;

  pageUrl: string;

  clientId: string | null;

  params: Record<string, any>;

  rawUrl: string;

  dlPushIndex: number | null;

  source: string | null;

  measurementId?: string | null;

  transactionId?: string | null;

  dataLayerMatched?: boolean;
}

type DuplicateMatch = {
  id: number;

  dlPushIndex:
    number | null;

  source:
    string | null;

  rawUrl:
    string | null;

  pageUrl:
    string | null;

  clientId:
    string | null;

  params:
    Record<string, any>;

  receivedAt:
    Date | string;
};

/*
 * ---------------------------------------------------------
 * Event classification
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * Do not use this to determine whether
 * an event is valid GA4.
 *
 * GA4 supports arbitrary custom event
 * names.
 */

const AUTOMATIC_EVENTS =
  new Set([
    'page_view',
    'scroll',
    'click',
    'user_engagement',
    'session_start',
    'first_visit',
    'file_download',
    'view_search_results',
    'video_start',
    'video_progress',
    'video_complete',
  ]);

const INTERNAL_EVENTS =
  new Set([
    'exception',
    'debug',
    'monitor_event',
  ]);

export function classifyEvent(
  eventName: string | null
): string {
  if (!eventName) {
    return 'unknown';
  }

  const normalized =
    eventName
      .trim()
      .toLowerCase();

  if (
    AUTOMATIC_EVENTS.has(
      normalized
    )
  ) {
    return 'standard';
  }

  if (
    INTERNAL_EVENTS.has(
      normalized
    )
  ) {
    return 'internal';
  }

  return 'custom';
}

/*
 * ---------------------------------------------------------
 * URL normalization
 * ---------------------------------------------------------
 */

export function normalizePageUrl(
  url: string | null
): string {
  if (!url) {
    return '';
  }

  try {
    const parsed =
      new URL(url);

    parsed.hash = '';

    /*
     * Remove tracking parameters
     * that should not make two events
     * appear to be different pages.
     */

    const volatileParams = [
      '_gl',
      '_ga',
      '_gac',
      'gclid',
      'fbclid',
      'msclkid',
      'ttclid',
      'twclid',
      'li_fat_id',
    ];

    for (
      const param of volatileParams
    ) {
      parsed.searchParams.delete(
        param
      );
    }

    return parsed.href;
  } catch {
    return url.split('#')[0];
  }
}

/*
 * ---------------------------------------------------------
 * Utility
 * ---------------------------------------------------------
 */

function firstValue(
  ...values: unknown[]
) {
  return values.find(
    (
      value
    ) =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
  );
}

/*
 * ---------------------------------------------------------
 * Strong identity
 * ---------------------------------------------------------
 *
 * Priority:
 *
 * 1. transaction_id
 * 2. event_id
 * 3. client_id + page + event
 *
 * But duplicate detection does NOT
 * require client_id anymore.
 */

export function getStrongIdentity(
  event: ParsedEvent
): string | null {
  const params =
    event.params || {};

  const transactionId =
    firstValue(
      event.transactionId,

      params.transaction_id,

      params.transactionId,

      params['ep.transaction_id'],

      params['epn.transaction_id'],

      params.ecommerce?.transaction_id,

      params.ecommerce?.transactionId
    );

  if (
    transactionId
  ) {
    return (
      'transaction:' +
      String(
        transactionId
      )
    );
  }

  const eventId =
    firstValue(
      params.event_id,

      params.eventId,

      params.eventID,

      params['ep.event_id']
    );

  if (
    eventId
  ) {
    return (
      'event_id:' +
      String(
        eventId
      )
    );
  }

  return null;
}

/*
 * ---------------------------------------------------------
 * Normalized request signature
 * ---------------------------------------------------------
 */

function normalizeRawUrl(
  rawUrl: string | null
): string {
  if (!rawUrl) {
    return '';
  }

  try {
    const parsed =
      new URL(rawUrl);

    /*
     * Parameters which change on
     * every GA4 request but don't
     * represent event identity.
     */

    const volatileParams = [
      '_p',
      '_s',
      'tfd',

      'sst.rnd',
      'sst.tft',
      'sst.lpc',
      'sst.navt',
      'sst.ude',
      'sst.syn',
      'sst.sw_exp',

      'tag_exp',

      'gcs',
      'gcd',
      'gcu',
      'gcut',

      'rcb',

      '_et',
      '_tu',
      '_eu',

      'richsstsse',

      'attribution-reporting-eligible',
    ];

    for (
      const param of volatileParams
    ) {
      parsed.searchParams.delete(
        param
      );
    }

    /*
     * Sort parameters so equivalent
     * requests produce the same URL.
     */

    const entries =
      Array.from(
        parsed.searchParams.entries()
      ).sort(
        (
          [aKey, aValue],
          [bKey, bValue]
        ) => {
          const keyCompare =
            aKey.localeCompare(
              bKey
            );

          if (
            keyCompare !== 0
          ) {
            return keyCompare;
          }

          return aValue.localeCompare(
            bValue
          );
        }
      );

    parsed.search = '';

    for (
      const [
        key,
        value,
      ] of entries
    ) {
      parsed.searchParams.append(
        key,
        value
      );
    }

    return parsed.href;
  } catch {
    return rawUrl;
  }
}

/*
 * ---------------------------------------------------------
 * Duplicate root cause
 * ---------------------------------------------------------
 */

export function classifyDuplicateRootCause(
  current: ParsedEvent,
  previous: DuplicateMatch
): string {
  /*
   * Same dataLayer push.
   */

  if (
    current.dlPushIndex !==
      null &&
    previous.dlPushIndex !==
      null &&
    current.dlPushIndex ===
      previous.dlPushIndex
  ) {
    return (
      'One dataLayer push produced multiple ' +
      'analytics requests. This usually indicates ' +
      'duplicate GTM tags, duplicate triggers, or ' +
      'GTM plus a direct analytics implementation.'
    );
  }

  /*
   * Different transport.
   */

  if (
    current.source &&
    previous.source &&
    current.source !==
      previous.source
  ) {
    return (
      `The event was sent through multiple transports ` +
      `(${previous.source} and ${current.source}). ` +
      `This often means GTM and direct code are both configured.`
    );
  }

  /*
   * Same raw network signature.
   */

  if (
    normalizeRawUrl(
      current.rawUrl
    ) !== '' &&
    normalizeRawUrl(
      current.rawUrl
    ) ===
      normalizeRawUrl(
        previous.rawUrl
      )
  ) {
    return (
      'The same analytics network request signature ' +
      'was sent more than once within a short period.'
    );
  }

  /*
   * Different client IDs.
   */

  if (
    current.clientId &&
    previous.clientId &&
    current.clientId !==
      previous.clientId
  ) {
    return (
      'The same event was sent repeatedly within a short ' +
      'period with different analytics client identifiers.'
    );
  }

  return (
    'The same analytics event was generated more than once ' +
    'within a short time window.'
  );
}

/*
 * ---------------------------------------------------------
 * Duplicate detection
 * ---------------------------------------------------------
 */

export async function checkDuplicateEvent(
  event: ParsedEvent
): Promise<DuplicateMatch | null> {
  if (
    !event.eventName
  ) {
    return null;
  }

  const eventName =
    event.eventName
      .trim()
      .toLowerCase();

  const pageUrl =
    normalizePageUrl(
      event.pageUrl
    );

  const strongIdentity =
    getStrongIdentity(
      event
    );

  /*
   * Business events need a slightly
   * longer duplicate window.
   */

  const strongEvent =
    !!strongIdentity ||
    eventName ===
      'purchase' ||
    eventName ===
      'refund';

  const windowSeconds =
    strongEvent
      ? 30
      : 5;

  /*
   * IMPORTANT:
   *
   * NO client_id condition here.
   *
   * Client ID is useful evidence,
   * but it is not a duplicate key.
   */

  const result =
    await query(
      `SELECT
         id,
         dl_push_index,
         source,
         raw_url,
         page_url,
         client_id,
         params,
         received_at
       FROM events
       WHERE site_id = $1
         AND vendor = $2
         AND LOWER(event_name) = $3
         AND id <> $4
         AND received_at >= NOW() -
             ($5 * INTERVAL '1 second')
         AND COALESCE(page_url, '') = $6
       ORDER BY received_at DESC
       LIMIT 50`,
      [
        event.siteId,

        event.vendor,

        eventName,

        event.eventId,

        windowSeconds,

        pageUrl,
      ]
    );

  for (
    const row of result.rows
  ) {
    const previous:
      ParsedEvent = {
      siteId:
        event.siteId,

      eventId:
        Number(row.id),

      receivedAt:
        row.received_at,

      vendor:
        event.vendor,

      eventName:
        event.eventName,

      pageUrl:
        row.page_url ||
        '',

      clientId:
        row.client_id ||
        null,

      params:
        row.params ||
        {},

      rawUrl:
        row.raw_url ||
        '',

      dlPushIndex:
        row.dl_push_index ===
          null
          ? null
          : Number(
              row.dl_push_index
            ),

      source:
        row.source ||
        null,
    };

    /*
     * -----------------------------------------------------
     * Rule 1: Strong business identity
     * -----------------------------------------------------
     */

    if (
      strongIdentity &&
      getStrongIdentity(
        previous
      ) ===
        strongIdentity
    ) {
      return {
        id:
          Number(row.id),

        dlPushIndex:
          previous.dlPushIndex,

        source:
          previous.source,

        rawUrl:
          previous.rawUrl,

        pageUrl:
          previous.pageUrl,

        clientId:
          previous.clientId,

        params:
          previous.params,

        receivedAt:
          previous.receivedAt,
      };
    }

    /*
     * -----------------------------------------------------
     * Rule 2: Same network request
     * -----------------------------------------------------
     */

    const currentNormalized =
      normalizeRawUrl(
        event.rawUrl
      );

    const previousNormalized =
      normalizeRawUrl(
        previous.rawUrl
      );

    if (
      currentNormalized &&
      previousNormalized &&
      currentNormalized ===
        previousNormalized
    ) {
      return {
        id:
          Number(row.id),

        dlPushIndex:
          previous.dlPushIndex,

        source:
          previous.source,

        rawUrl:
          previous.rawUrl,

        pageUrl:
          previous.pageUrl,

        clientId:
          previous.clientId,

        params:
          previous.params,

        receivedAt:
          previous.receivedAt,
      };
    }

    /*
     * -----------------------------------------------------
     * Rule 3: Same dataLayer push
     * -----------------------------------------------------
     */

    if (
      event.dlPushIndex !==
        null &&
      previous.dlPushIndex !==
        null &&
      event.dlPushIndex ===
        previous.dlPushIndex
    ) {
      return {
        id:
          Number(row.id),

        dlPushIndex:
          previous.dlPushIndex,

        source:
          previous.source,

        rawUrl:
          previous.rawUrl,

        pageUrl:
          previous.pageUrl,

        clientId:
          previous.clientId,

        params:
          previous.params,

        receivedAt:
          previous.receivedAt,
      };
    }

    /*
     * -----------------------------------------------------
     * Rule 4: Same event + page +
     *          very short interval
     * -----------------------------------------------------
     *
     * This is intentionally conservative.
     */

    const elapsed =
      Math.abs(
        new Date(
          event.receivedAt
        ).getTime() -
          new Date(
            previous.receivedAt
          ).getTime()
      );

    if (
      elapsed <=
      3000
    ) {
      return {
        id:
          Number(row.id),

        dlPushIndex:
          previous.dlPushIndex,

        source:
          previous.source,

        rawUrl:
          previous.rawUrl,

        pageUrl:
          previous.pageUrl,

        clientId:
          previous.clientId,

        params:
          previous.params,

        receivedAt:
          previous.receivedAt,
      };
    }
  }

  return null;
}

/*
 * ---------------------------------------------------------
 * Alert creation
 * ---------------------------------------------------------
 */

async function createAlert(
  input: {
    siteId: number;

    severity: string;

    code: string;

    vendor:
      string | null;

    eventName:
      string | null;

    message:
      string;

    rootCause:
      string;

    fixSteps:
      string[];

    pageUrl:
      string;

    raw:
      Record<string, unknown>;

    dedupeMinutes?:
      number;
  }
) {
  const dedupeMinutes =
    input.dedupeMinutes ??
    10;

  await query(
    `INSERT INTO alerts
       (
         site_id,
         severity,
         code,
         vendor,
         event_name,
         message,
         root_cause,
         fix_steps,
         page_url,
         raw
       )
     SELECT
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8::jsonb,
       $9,
       $10::jsonb
     WHERE NOT EXISTS (
       SELECT 1
       FROM alerts
       WHERE site_id = $1
         AND code = $3
         AND COALESCE(vendor, '') =
             COALESCE($4, '')
         AND COALESCE(event_name, '') =
             COALESCE($5, '')
         AND COALESCE(page_url, '') =
             COALESCE($9, '')
         AND resolved = false
         AND created_at >= NOW() -
             ($11 * INTERVAL '1 minute')
     )`,
    [
      input.siteId,

      input.severity,

      input.code,

      input.vendor,

      input.eventName,

      input.message,

      input.rootCause,

      JSON.stringify(
        input.fixSteps
      ),

      input.pageUrl ||
        null,

      JSON.stringify(
        input.raw
      ),

      dedupeMinutes,
    ]
  );
}

/*
 * ---------------------------------------------------------
 * Purchase validation
 * ---------------------------------------------------------
 */

function getPurchaseCurrency(
  params: Record<string, any>
) {
  return firstValue(
    params.currency,

    params['ep.currency'],

    params['epn.currency'],

    // GA4 network collection parameter.
    // Example from HAR: cu=USD
    params.cu,

    params.ecommerce?.currency,

    params.items?.[0]?.currency
  );
}

function getPurchaseValue(
  params: Record<string, any>
) {
  return firstValue(
    params.value,

    params['epn.value'],

    params['ep.value'],

    params.ecommerce?.value
  );
}

function getTransactionId(
  params: Record<string, any>
) {
  return firstValue(
    params.transaction_id,

    params.transactionId,

    params['ep.transaction_id'],

    params['epn.transaction_id'],

    params.ecommerce?.transaction_id,

    params.ecommerce?.transactionId
  );
}

async function checkPurchase(
  event: ParsedEvent
) {
  if (
    event.vendor !==
      'ga4' ||
    event.eventName !==
      'purchase'
  ) {
    return;
  }

  const currency =
    getPurchaseCurrency(
      event.params
    );

  const value =
    getPurchaseValue(
      event.params
    );

  const transactionId =
    getTransactionId(
      event.params
    );

  /*
   * Missing currency.
   */

  if (!currency) {
    await createAlert({
      siteId:
        event.siteId,

      severity:
        'critical',

      code:
        'missing_purchase_currency',

      vendor:
        event.vendor,

      eventName:
        event.eventName,

      message:
        'Purchase event is missing a currency parameter.',

      rootCause:
        'GA4 received a purchase without currency.',

      fixSteps: [
        'Add currency to the purchase event in GTM or gtag.',
        'Use a three-letter ISO 4217 currency code such as USD or EUR.',
        'Verify currency is sent on every purchase path.',
      ],

      pageUrl:
        event.pageUrl,

      raw: {
        eventId:
          event.eventId,

        transactionId:
          transactionId ||
          null,

        value:
          value ||
          null,

        params:
          event.params,
      },

      dedupeMinutes:
        10,
    });
  }

  /*
   * Missing transaction ID.
   *
   * This is especially important
   * for purchase duplicate detection.
   */

  if (!transactionId) {
    await createAlert({
      siteId:
        event.siteId,

      severity:
        'warning',

      code:
        'missing_purchase_transaction_id',

      vendor:
        event.vendor,

      eventName:
        event.eventName,

      message:
        'Purchase event is missing transaction_id.',

      rootCause:
        'Without transaction_id, GA4Fix cannot reliably determine whether two purchase events represent the same transaction.',

      fixSteps: [
        'Send a unique transaction_id with every purchase.',
        'Use the same transaction ID across the browser and server purchase implementations.',
        'Do not generate a new transaction_id every time the purchase tag fires.',
      ],

      pageUrl:
        event.pageUrl,

      raw: {
        eventId:
          event.eventId,

        value:
          value ||
          null,

        currency:
          currency ||
          null,

        params:
          event.params,
      },

      dedupeMinutes:
        10,
    });
  }
}

/*
 * ---------------------------------------------------------
 * First-seen custom events
 * ---------------------------------------------------------
 */

async function trackFirstSeenCustomEvent(
  event: ParsedEvent
) {
  if (
    !event.eventName
  ) {
    return;
  }

  if (
    classifyEvent(
      event.eventName
    ) !== 'custom'
  ) {
    return;
  }

  const result =
    await query(
      `INSERT INTO custom_events_seen
         (site_id, event_name)
       VALUES ($1, $2)
       ON CONFLICT
         (site_id, event_name)
       DO NOTHING
       RETURNING event_name`,
      [
        event.siteId,

        event.eventName,
      ]
    );

  if (
    !result.rows[0]
  ) {
    return;
  }

  await createAlert({
    siteId:
      event.siteId,

    severity:
      'info',

    code:
      'custom_event_first_seen',

    vendor:
      event.vendor,

    eventName:
      event.eventName,

    message:
      `New custom event detected: ${event.eventName}.`,

    rootCause:
      'This event is not one of the predefined automatic events. GA4 custom events are valid and should be reviewed based on the implementation.',

    fixSteps: [
      'Confirm the event is intentional.',
      'Document the event and its parameters.',
      'Mark it as a conversion if appropriate.',
      'Verify the event is sent consistently across all relevant user flows.',
    ],

    pageUrl:
      event.pageUrl,

    raw: {
      eventId:
        event.eventId,

      params:
        event.params,

      measurementId:
        event.measurementId ||
        null,
    },

    dedupeMinutes:
      60 * 24 * 365,
  });
}

/*
 * ---------------------------------------------------------
 * Main detection
 * ---------------------------------------------------------
 */

export async function runDetection(
  event: ParsedEvent
) {
  try {
    /*
     * Duplicate detection.
     */

    const duplicate =
      await checkDuplicateEvent(
        event
      );

    if (
      duplicate
    ) {
      await createAlert({
        siteId:
          event.siteId,

        severity:
          event.eventName ===
            'purchase'
            ? 'critical'
            : 'warning',

        code:
          'duplicate_event',

        vendor:
          event.vendor,

        eventName:
          event.eventName,

        message:
          `${event.eventName} fired more than once within a short period.`,

        rootCause:
          classifyDuplicateRootCause(
            event,
            duplicate
          ),

        fixSteps: [
          'Check whether the event is configured in both GTM and direct code.',
          'Check whether multiple GTM tags fire from the same trigger.',
          'Check whether a vendor SDK and GTM are both sending the event.',
          'For purchase events, verify transaction_id is unique.',
          'For purchase events, make sure the same transaction is not sent by both browser and server implementations without deduplication.',
        ],

        pageUrl:
          event.pageUrl,

        raw: {
          eventId:
            event.eventId,

          duplicateOf:
            duplicate.id,

          vendor:
            event.vendor,

          eventName:
            event.eventName,

          clientId:
            event.clientId,

          duplicateClientId:
            duplicate.clientId,

          source:
            event.source,

          duplicateSource:
            duplicate.source,

          dlPushIndex:
            event.dlPushIndex,

          duplicateDlPushIndex:
            duplicate.dlPushIndex,

          rawUrl:
            event.rawUrl,

          duplicateRawUrl:
            duplicate.rawUrl,

          transactionId:
            event.transactionId ||
            getTransactionId(
              event.params
            ) ||
            null,

          params:
            event.params,
        },

        dedupeMinutes:
          10,
      });
    }

    /*
     * Purchase-specific validation.
     */

    await checkPurchase(
      event
    );

    /*
     * Custom event discovery.
     */

    await trackFirstSeenCustomEvent(
      event
    );
  } catch (error) {
    /*
     * Detection must NEVER break
     * ingestion.
     */

    console.error(
      'Detection error:',
      error
    );
  }
}
