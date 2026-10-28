export type GovernanceVendor = 'ga4' | 'gads' | 'meta' | 'bing' | 'tiktok' | 'linkedin' | 'snapchat';
export type GovernancePresence = 'required' | 'optional' | 'conditional';
export type GovernanceRule = { name: string; aliases?: string[]; type?: 'string' | 'number' | 'boolean' | 'array' | 'object'; presence: GovernancePresence; description?: string };
export type GovernanceEvent = { name: string; aliases?: string[]; category: 'standard' | 'conversion' | 'commerce' | 'lead' | 'engagement'; parameters: GovernanceRule[]; revenue?: boolean; dedupe?: string[] };

const r=(name:string,presence:GovernancePresence,type?:GovernanceRule['type'],aliases?:string[],description?:string):GovernanceRule=>({name,presence,type,aliases,description});
const e=(name:string,category:GovernanceEvent['category'],parameters:GovernanceRule[],options:Partial<GovernanceEvent>={})=>({name,category,parameters,...options});

const commerce=[r('currency','conditional','string',['cu','ep.currency']),r('value','conditional','number',['epn.value','ep.value']),r('transaction_id','conditional','string',['transactionId','ep.transaction_id']),r('items','optional','array',['pr1']),r('item_id','optional','string',['itemId']),r('item_name','optional','string',['itemName']),r('quantity','optional','number',['qt'])];
const ga4Commerce=[r('transaction_id','required','string',['transactionId','ep.transaction_id']),r('value','required','number',['epn.value','ep.value']),r('currency','conditional','string',['cu','ep.currency']),r('items','required','array',['pr1']),r('item_id','optional','string',['itemId']),r('item_name','optional','string',['itemName']),r('quantity','optional','number',['qt']),r('tax','optional','number'),r('shipping','optional','number'),r('coupon','optional','string'),r('affiliation','optional','string')];
const ga4Refund=[r('transaction_id','required','string',['transactionId','ep.transaction_id']),r('value','conditional','number',['epn.value','ep.value']),r('currency','conditional','string',['cu','ep.currency']),r('items','optional','array',['pr1'])];

export const PLATFORM_GOVERNANCE: Record<GovernanceVendor,{label:string;events:GovernanceEvent[];common:GovernanceRule[]}> = {
 ga4:{label:'Google Analytics 4',common:[r('user_id','optional','string',['uid']),r('session_id','conditional','string',['sid']),r('engagement_time_msec','optional','number')],events:[
  e('purchase','commerce',ga4Commerce,{revenue:true,dedupe:['transaction_id']}),e('refund','commerce',ga4Refund,{revenue:true,dedupe:['transaction_id']}),
  e('add_to_cart','commerce',[r('items','required','array'),r('currency','conditional','string'),r('value','conditional','number')]),e('remove_from_cart','commerce',[r('items','required','array')]),
  e('view_item','commerce',[r('items','required','array'),r('currency','conditional','string'),r('value','conditional','number')]),e('view_item_list','commerce',[r('items','required','array'),r('item_list_id','optional','string'),r('item_list_name','optional','string')]),
  e('select_item','commerce',[r('items','required','array'),r('item_list_id','optional','string'),r('item_list_name','optional','string')]),e('begin_checkout','commerce',[r('items','required','array'),r('currency','conditional','string'),r('value','conditional','number')]),
  e('add_payment_info','commerce',[r('currency','conditional','string'),r('value','conditional','number'),r('coupon','optional','string'),r('items','optional','array'),r('payment_type','optional','string')]),e('add_shipping_info','commerce',[r('currency','conditional','string'),r('value','conditional','number'),r('coupon','optional','string'),r('items','optional','array'),r('shipping_tier','optional','string')]),
  e('view_cart','commerce',[r('items','required','array'),r('currency','conditional','string'),r('value','conditional','number')]),e('view_promotion','commerce',[r('items','required','array'),r('creative_name','optional','string'),r('creative_slot','optional','string'),r('promotion_id','optional','string'),r('promotion_name','optional','string')]),e('select_promotion','commerce',[r('items','required','array'),r('creative_name','optional','string'),r('creative_slot','optional','string'),r('promotion_id','optional','string'),r('promotion_name','optional','string')]),
  e('page_view','standard',[r('page_location','optional','string',['dl']),r('page_title','optional','string',['dt']),r('page_referrer','optional','string',['dr'])]),e('scroll','engagement',[]),e('click','engagement',[]),e('file_download','engagement',[r('file_name','optional','string'),r('file_extension','optional','string'),r('link_url','optional','string')]),e('view_search_results','engagement',[r('search_term','optional','string')]),e('login','engagement',[r('method','optional','string')]),e('sign_up','engagement',[r('method','optional','string')]),e('search','engagement',[r('search_term','optional','string')]),e('generate_lead','lead',[r('currency','conditional','string'),r('value','conditional','number'),r('lead_source','optional','string')],{revenue:true}),e('select_content','engagement',[r('content_type','optional','string'),r('content_id','optional','string')]),e('share','engagement',[r('method','optional','string'),r('content_type','optional','string'),r('item_id','optional','string')])
 ]},
 gads:{label:'Google Ads',common:[r('conversion_id','required','string',['aw-id']),r('conversion_label','required','string',['label']),r('currency','conditional','string'),r('value','conditional','number'),r('transaction_id','optional','string',['oid']),r('gclid','conditional','string')],events:[
  e('conversion','conversion',[r('conversion_id','required','string',['aw-id']),r('conversion_label','required','string',['label']),r('value','conditional','number'),r('currency','conditional','string'),r('transaction_id','optional','string',['oid'])],{revenue:true,dedupe:['transaction_id']}),
  e('purchase','commerce',[r('conversion_id','required','string',['aw-id','send_to']),r('conversion_label','required','string',['label','send_to']),r('value','conditional','number',['conversion_value','gv','ecomm_totalvalue']),r('currency','conditional','string',['currency_code','gc']),r('transaction_id','conditional','string',['oid','order_id']),r('items','optional','array'),r('ecomm_prodid','optional','string'),r('ecomm_pagetype','optional','string'),r('ecomm_totalvalue','optional','number')],{revenue:true,dedupe:['transaction_id']}),
  e('lead','lead',[r('conversion_id','required','string',['aw-id']),r('conversion_label','required','string',['label']),r('value','optional','number'),r('currency','conditional','string')]),
 ]},
 meta:{label:'Meta',common:[r('event_name','required','string',['ev']),r('event_id','conditional','string',['eid']),r('event_source_url','optional','string'),r('action_source','optional','string'),r('fbp','optional','string'),r('fbc','conditional','string')],events:[
  e('PageView','standard',[r('event_name','required','string',['ev']),r('event_id','conditional','string',['eid'])]),e('ViewContent','engagement',[r('content_ids','optional','array'),r('content_type','optional','string'),r('content_name','optional','string'),r('value','conditional','number'),r('currency','conditional','string')]),e('Search','engagement',[r('search_string','optional','string')]),
  e('AddToCart','commerce',[r('content_ids','optional','array'),r('content_type','optional','string'),r('contents','optional','array'),r('value','conditional','number'),r('currency','conditional','string')]),e('InitiateCheckout','commerce',[r('content_ids','optional','array'),r('contents','optional','array'),r('num_items','optional','number'),r('value','conditional','number'),r('currency','conditional','string')]),e('AddPaymentInfo','commerce',[r('content_ids','optional','array'),r('contents','optional','array'),r('value','conditional','number'),r('currency','conditional','string')]),
  e('Purchase','commerce',[r('value','required','number',['cd[value]','custom_data.value']),r('currency','required','string',['cd[currency]','custom_data.currency']),r('event_id','conditional','string',['eid']),r('content_ids','optional','array'),r('contents','optional','array'),r('order_id','conditional','string')],{revenue:true,dedupe:['event_id','order_id']}),
  e('Lead','lead',[r('event_id','conditional','string',['eid']),r('value','optional','number'),r('currency','conditional','string'),r('lead_id','optional','string')]),e('CompleteRegistration','conversion',[r('event_id','conditional','string',['eid']),r('status','optional','string')]),e('Subscribe','conversion',[r('value','optional','number'),r('currency','conditional','string'),r('subscription_id','optional','string')])
 ]},
 bing:{label:'Microsoft Ads',common:[r('ti','required','string'),r('msclkid','conditional','string'),r('asc','conditional','string')],events:[
  e('pageLoad','standard',[r('ti','required','string')]),e('custom','conversion',[r('ec','optional','string',['event_category']),r('ea','optional','string',['event_action']),r('el','optional','string',['event_label']),r('ev','optional','number',['event_value']),r('gv','conditional','number',['revenue_value']),r('gc','conditional','string',['currency']),r('transaction_id','optional','string')],{revenue:true,dedupe:['transaction_id']}),
  e('purchase','commerce',[r('ea','optional','string',['event_action']),r('gv','conditional','number',['revenue_value']),r('gc','conditional','string',['currency']),r('transaction_id','optional','string',['order_id','transactionId']),r('items','optional','array')],{revenue:true,dedupe:['transaction_id','order_id']}),e('subscribe','conversion',[r('ea','optional','string',['event_action']),r('gv','optional','number',['revenue_value']),r('gc','conditional','string',['currency'])])
 ]},
 tiktok:{label:'TikTok',common:[r('event','required','string'),r('event_id','conditional','string'),r('event_time','optional','number'),r('event_source','optional','string'),r('event_source_url','optional','string'),r('pixel_code','required','string',['pixel']),r('ttclid','conditional','string'),r('ttp','optional','string')],events:[
  e('PageView','standard',[]),e('ViewContent','engagement',[r('content_type','optional','string'),r('content_ids','optional','array'),r('currency','conditional','string'),r('value','conditional','number')]),e('Search','engagement',[r('query','optional','string',['search_string'])]),e('AddToCart','commerce',[r('content_type','optional','string'),r('content_id','optional','string'),r('contents','optional','array'),r('currency','conditional','string'),r('value','conditional','number'),r('quantity','optional','number')]),e('InitiateCheckout','commerce',[r('contents','optional','array'),r('currency','conditional','string'),r('value','conditional','number')]),
  e('Purchase','commerce',[r('currency','required','string',['properties.currency']),r('value','required','number',['properties.value']),r('event_id','conditional','string',['eventId']),r('content_type','optional','string'),r('content_ids','optional','array'),r('contents','optional','array'),r('quantity','optional','number'),r('order_id','conditional','string')],{aliases:['CompletePayment'],revenue:true,dedupe:['event_id','order_id']}),e('SubmitForm','lead',[r('value','optional','number')]),e('Contact','lead',[r('value','optional','number')]),e('Subscribe','conversion',[r('value','optional','number'),r('currency','conditional','string')]),e('StartTrial','conversion',[r('value','optional','number'),r('currency','conditional','string')])
 ]},
 linkedin:{label:'LinkedIn',common:[r('pid','required','string'),r('li_fat_id','conditional','string'),r('conversion','conditional','string'),r('conversionHappenedAt','conditional','number'),r('eventId','conditional','string'),r('userIds','conditional','array')],events:[
  e('conversion','conversion',[r('conversion','required','string',['conversionId','conversion_id']),r('conversionHappenedAt','conditional','number'),r('eventId','conditional','string',['event_id']),r('userIds','conditional','array'),r('conversionValue.amount','conditional','number',['amount']),r('conversionValue.currencyCode','conditional','string',['currencyCode'])],{revenue:true,dedupe:['eventId']}),
  e('page_view','standard',[r('pid','required','string')]),e('lead','lead',[r('conversion','required','string'),r('conversionHappenedAt','required','number'),r('eventId','required','string'),r('userIds','conditional','array')]),e('purchase','commerce',[r('conversion','required','string',['conversionId','conversion_id']),r('conversionHappenedAt','conditional','number'),r('eventId','conditional','string',['event_id']),r('userIds','conditional','array'),r('conversionValue.amount','conditional','number',['amount']),r('conversionValue.currencyCode','conditional','string',['currencyCode'])],{revenue:true,dedupe:['eventId']})
 ]},
 snapchat:{label:'Snapchat',common:[r('pixel_id','required','string',['pid']),r('event_id','conditional','string'),r('event_source_url','optional','string')],events:[
  e('PAGE_VIEW','standard',[r('pixel_id','required','string',['pid'])]),e('VIEW_CONTENT','engagement',[r('item_ids','conditional','array'),r('item_category','conditional','string'),r('price','optional','number'),r('currency','conditional','string')]),e('ADD_CART','commerce',[r('item_ids','conditional','array'),r('item_category','conditional','string'),r('price','optional','number'),r('currency','conditional','string')]),e('START_CHECKOUT','commerce',[r('item_ids','optional','array'),r('price','optional','number'),r('currency','conditional','string')]),e('PURCHASE','commerce',[r('price','required','number',['properties.price']),r('currency','required','string',['properties.currency']),r('transaction_id','conditional','string',['transactionId','order_id']),r('item_ids','optional','array'),r('item_category','optional','string')],{revenue:true,dedupe:['event_id','transaction_id']}),e('SIGN_UP','engagement',[r('user_id','optional','string')]),e('SEARCH','engagement',[r('search_string','optional','string')]),e('SUBSCRIBE','conversion',[r('price','optional','number'),r('currency','conditional','string')])
 ]},
};

export function canonicalEvent(vendor: GovernanceVendor, raw: unknown): GovernanceEvent | undefined {
 const value=String(raw??'').trim(); if(!value)return undefined; const events=PLATFORM_GOVERNANCE[vendor]?.events||[]; const n=value.toLowerCase();
 const matched=events.find(x=>x.name.toLowerCase()===n||x.aliases?.some(a=>a.toLowerCase()===n)); if(matched)return matched;
 const profile=PLATFORM_DETECTION[vendor]; const standard=profile?.standardEvents.find(x=>x.toLowerCase()===n); return standard ? {name:standard,category:'standard',parameters:[]} : undefined;
}
export function canonicalParameter(event: GovernanceEvent|undefined, raw: unknown): GovernanceRule|undefined {
 const value=String(raw??'').trim().toLowerCase(); if(!event||!value)return undefined; return event.parameters.find(x=>x.name.toLowerCase()===value||x.aliases?.some(a=>a.toLowerCase()===value));
}
export function allRules(vendor: GovernanceVendor,eventName?:string):GovernanceRule[]{const p=PLATFORM_GOVERNANCE[vendor];if(!p)return[];const event=canonicalEvent(vendor,eventName||'');return [...p.common,...(event?.parameters||[])];}

export type EventNamePolicy = 'ga4_snake_case' | 'meta_standard_case' | 'gads_conversion_id_label' | 'microsoft_uet' | 'tiktok_standard_case' | 'linkedin_conversion_id' | 'snap_upper_case';
export type ConsentModel = 'google_consent_mode' | 'microsoft_uet_consent' | 'cmp_marketing_category' | 'meta_cmp_and_pixel_consent' | 'tiktok_pixel_consent' | 'linkedin_cmp_marketing';
export type RevenueFields = { events: string[]; value: string[]; currency: string[]; transaction: string[]; dedupe: string[]; conditionalValue?: boolean; notes: string };
export type PlatformDetectionProfile = {
  label: string;
  identity: 'event_name' | 'conversion_id_label' | 'conversion_id' | 'uet_event';
  eventNamePolicy: EventNamePolicy;
  endpointHosts: string[];
  endpointPaths: string[];
  loaderPatterns: string[];
  runtimeGlobals: string[];
  gtmTypeTokens: string[];
  directTokens: string[];
  identityFields: string[];
  eventFields: string[];
  standardEvents: string[];
  eventAliases?: Record<string,string>;
  consentModel: ConsentModel;
  consentFields: string[];
  consentCategories: string[];
  revenue: RevenueFields;
  clickIds: string[];
  attributionCookies: string[];
  baseline: { lookbackDays: number; minimumDailyEvents: number; dropWarningPct: number; dropCriticalPct: number; spikeWarningPct: number; spikeCriticalPct: number; consecutiveWindows: number; minimumDeliveryAttempts: number; deliveryWarningRate: number; deliveryCriticalRate: number };
};
const BASELINE = { lookbackDays: 28, minimumDailyEvents: 20, dropWarningPct: 30, dropCriticalPct: 60, spikeWarningPct: 100, spikeCriticalPct: 300, consecutiveWindows: 2, minimumDeliveryAttempts: 30, deliveryWarningRate: 0.02, deliveryCriticalRate: 0.10 };

export const PLATFORM_DETECTION: Record<GovernanceVendor, PlatformDetectionProfile> = {
  ga4: {
    label: 'Google Analytics 4', identity: 'event_name', eventNamePolicy: 'ga4_snake_case',
    endpointHosts: ['google-analytics.com','analytics.google.com','google.com'], endpointPaths: ['/g/collect','/j/collect','/collect'],
    loaderPatterns: ['googletagmanager.com/gtag/js','google-analytics.com/analytics.js','googletagmanager.com/gtm.js'],
    runtimeGlobals: ['gtag','dataLayer','google_tag_data'], gtmTypeTokens: ['gaawe','gaawc','google analytics','google tag'], directTokens: ["gtag('config'","gtag('event'","google-analytics.com/analytics.js"],
    identityFields: ['tid','measurement_id','measurementId'], eventFields: ['en','event_name','eventName','event'],
    standardEvents: ['page_view','first_visit','session_start','user_engagement','scroll','click','view_search_results','video_start','video_progress','video_complete','file_download','purchase','refund','add_to_cart','remove_from_cart','view_cart','view_item','view_item_list','select_item','view_promotion','select_promotion','begin_checkout','add_payment_info','add_shipping_info','login','sign_up','search','generate_lead','share','select_content','join_group','tutorial_begin','tutorial_complete','earn_virtual_currency','spend_virtual_currency','level_start','level_end','achievement_unlocked','post_score','exception','screen_view'],
    consentModel: 'google_consent_mode', consentFields: ['gcs','gcd','gcu','analytics_storage','ad_storage','ad_user_data','ad_personalization'], consentCategories: ['analytics_storage','ad_storage','ad_user_data','ad_personalization'],
    revenue: { events:['purchase','refund','transaction','order_complete','ecommerce_purchase'], value:['value','epn.value','ep.value'], currency:['currency','cu','ep.currency'], transaction:['transaction_id','transactionId','ep.transaction_id'], dedupe:['transaction_id','transactionId'], notes:'GA4 purchase/refund use value, currency and transaction_id; items is an ecommerce array.' },
    clickIds:['gclid','gbraid','wbraid'], attributionCookies:['_gcl_aw','_gcl_dc','_ga','_ga_*'], baseline:BASELINE
  },
  gads: {
    label:'Google Ads', identity:'conversion_id_label', eventNamePolicy:'gads_conversion_id_label',
    endpointHosts:['googleadservices.com','google.com','googleusercontent.com'], endpointPaths:['/pagead/conversion/','/pagead/1p-conversion/','/pagead/viewthroughconversion/'],
    loaderPatterns:['googletagmanager.com/gtag/js?id=AW-','googletagmanager.com/gtm.js','googleadservices.com/pagead/conversion'], runtimeGlobals:['gtag','google_conversion_id','google_remarketing_only'],
    gtmTypeTokens:['awct','google ads conversion tracking','google ads remarketing'], directTokens:["gtag('event', 'conversion'","googleadservices.com/pagead/conversion"],
    identityFields:['conversion_id','google_conversion_id','aw-id','tid'], eventFields:['label','conversion_label','google_conversion_label','send_to'],
    standardEvents:['conversion','purchase','lead','sign_up','begin_checkout','add_to_cart','page_view'],
    consentModel:'google_consent_mode', consentFields:['gcs','gcd','ad_storage','ad_user_data','ad_personalization'], consentCategories:['ad_storage','ad_user_data','ad_personalization'],
    revenue:{events:['purchase','conversion','transaction','order_complete','ecommerce_purchase'],value:['value','conversion_value','gv','ecomm_totalvalue'],currency:['currency','gc','currency_code'],transaction:['transaction_id','transactionId','oid','order_id'],dedupe:['transaction_id','oid'],notes:'Google Ads is conversion-action based; transaction_id is a deduplication hint and value/currency depend on the conversion action.'},
    clickIds:['gclid','gbraid','wbraid'],attributionCookies:['_gcl_aw','_gcl_dc','_gcl_au'],baseline:BASELINE
  },
  meta: {
    label:'Meta', identity:'event_name', eventNamePolicy:'meta_standard_case',
    endpointHosts:['facebook.com','connect.facebook.net','facebook.net'], endpointPaths:['/tr','/tr/'],
    loaderPatterns:['connect.facebook.net/en_US/fbevents.js','connect.facebook.net/signals/config'], runtimeGlobals:['fbq','_fbq'],
    gtmTypeTokens:['facebook pixel','meta pixel','facebook_conversion_pixel','facebook'], directTokens:["fbq('init'","fbq('track'","fbevents.js"],
    identityFields:['id','pixel_id'],eventFields:['ev','event','event_name','eventName'],
    standardEvents:['PageView','ViewContent','Search','AddToCart','AddToWishlist','InitiateCheckout','AddPaymentInfo','Purchase','Lead','CompleteRegistration','Contact','CustomizeProduct','Donate','FindLocation','Schedule','StartTrial','SubmitApplication','Subscribe'],
    consentModel:'meta_cmp_and_pixel_consent',consentFields:['fbq_consent','consent_state'],consentCategories:['marketing','ad_storage'],
    revenue:{events:['purchase','Purchase','transaction'],value:['value','cd[value]','custom_data.value'],currency:['currency','cd[currency]','custom_data.currency'],transaction:['event_id','eid','order_id'],dedupe:['event_id','eid','order_id'],notes:'Pixel + CAPI can intentionally share an event_id; treat matching cross-path pairs as a dedup pair, not automatically as a duplicate.'},
    clickIds:['fbclid'],attributionCookies:['_fbc','_fbp'],baseline:BASELINE
  },
  bing: {
    label:'Microsoft Ads',identity:'uet_event',eventNamePolicy:'microsoft_uet',
    endpointHosts:['bat.bing.com'],endpointPaths:['/action/0'],loaderPatterns:['bat.bing.com/bat.js'],runtimeGlobals:['uetq'],
    gtmTypeTokens:['baut','microsoft advertising universal event tracking','bing uet'],directTokens:['window.uetq.push','uetq.push','bat.bing.com/bat.js'],
    identityFields:['ti','tag_id','uet_tag_id'],eventFields:['evt','ea','event_action','event','event_name'],standardEvents:['pageLoad','custom'],
    consentModel:'microsoft_uet_consent',consentFields:['asc','adStorageConsent','ad_storage'],consentCategories:['ad_storage','marketing'],
    revenue:{events:['purchase','custom','order_complete'],value:['gv','revenue_value','ev','event_value','value'],currency:['gc','currency'],transaction:['transaction_id','transactionId','order_id'],dedupe:['transaction_id','order_id'],notes:'UET uses gv/gc for variable-revenue goals; fixed-value conversions may not send a value on each request.'},
    clickIds:['msclkid'],attributionCookies:['_uetmsclkid','_uetsid','_uetvid'],baseline:BASELINE
  },
  tiktok: {
    label:'TikTok',identity:'event_name',eventNamePolicy:'tiktok_standard_case',
    endpointHosts:['analytics.tiktok.com','analytics.us.tiktok.com'],endpointPaths:['/api/v2/pixel','/api/v2/pixel/batch'],
    loaderPatterns:['analytics.tiktok.com/i18n/pixel/events.js','events.js'],runtimeGlobals:['ttq'],
    gtmTypeTokens:['tiktok pixel','cvt_','tiktok'],directTokens:['ttq.load','ttq.track','ttq.page','events.js'],
    identityFields:['pixel_code','pixel','pixel_id'],eventFields:['event','event_name','eventName'],
    standardEvents:['ViewContent','ClickButton','Search','AddToWishlist','AddToCart','InitiateCheckout','AddPaymentInfo','CompletePayment','Purchase','PlaceAnOrder','Contact','Download','SubmitForm','CompleteRegistration','Subscribe','Lead','StartTrial'],
    eventAliases:{CompletePayment:'Purchase'},consentModel:'tiktok_pixel_consent',consentFields:['ttq_consent','consent_state'],consentCategories:['marketing'],
    revenue:{events:['Purchase','CompletePayment','purchase','completepayment'],value:['value','properties.value'],currency:['currency','properties.currency'],transaction:['order_id','transaction_id','event_id','eventId'],dedupe:['event_id','eventId','order_id'],notes:'Purchase/CompletePayment are one logical purchase. value must be a number, not a currency-formatted string; Events API dedupe uses event_id.'},
    clickIds:['ttclid'],attributionCookies:['_ttp'],baseline:BASELINE
  },
  linkedin: {
    label:'LinkedIn',identity:'conversion_id',eventNamePolicy:'linkedin_conversion_id',
    endpointHosts:['px.ads.linkedin.com','snap.licdn.com'],endpointPaths:['/collect'],loaderPatterns:['snap.licdn.com/li.lms-analytics/insight.min.js'],
    runtimeGlobals:['lintrk','_linkedin_partner_id','_linkedin_data_partner_ids'],gtmTypeTokens:['bzi','linkedin insight tag','insight tag 2.0','linkedin'],directTokens:["lintrk('track'","_linkedin_partner_id",'insight.min.js'],
    identityFields:['pid','partner_id'],eventFields:['conversionId','conversion_id','eventId','event_id'],standardEvents:[],
    consentModel:'linkedin_cmp_marketing',consentFields:['consent_state'],consentCategories:['marketing'],
    revenue:{events:['conversion','purchase','lead'],value:['conversionValue.amount','value','amount'],currency:['conversionValue.currencyCode','currency','currencyCode'],transaction:['eventId','event_id','transaction_id'],dedupe:['eventId','event_id'],conditionalValue:true,notes:'LinkedIn conversion value/currency apply to DYNAMIC value conversion rules; FIXED/NO_VALUE conversion rules should not be flagged for missing values.'},
    clickIds:['li_fat_id'],attributionCookies:['li_fat_id','li_gc'],baseline:BASELINE
  },
  snapchat: {
    label:'Snapchat',identity:'event_name',eventNamePolicy:'snap_upper_case',
    endpointHosts:['tr.snapchat.com'],endpointPaths:['/p','/cm/i'],loaderPatterns:['sc-static.net/scevent.min.js'],runtimeGlobals:['snaptr'],
    gtmTypeTokens:['snap pixel','snapchat','cvt_'],directTokens:["snaptr('init'","snaptr('track'",'scevent.min.js'],
    identityFields:['pixel_id','pid'],eventFields:['event','ev','event_name','eventName'],
    standardEvents:['PAGE_VIEW','VIEW_CONTENT','ADD_CART','ADD_TO_WISHLIST','START_CHECKOUT','ADD_BILLING','PURCHASE','SIGN_UP','SUBSCRIBE','START_TRIAL','SEARCH','SAVE','LIST_VIEW','LOGIN','SHARE','INVITE','RESERVE','RATE','ACHIEVEMENT_UNLOCKED','COMPLETE_TUTORIAL','LEVEL_COMPLETE','SPENT_CREDITS','AD_CLICK','AD_VIEW','APP_OPEN','CUSTOM_EVENT_1','CUSTOM_EVENT_2','CUSTOM_EVENT_3','CUSTOM_EVENT_4','CUSTOM_EVENT_5'],
    consentModel:'cmp_marketing_category',consentFields:['consent_state'],consentCategories:['marketing'],
    revenue:{events:['PURCHASE','purchase'],value:['price','properties.price'],currency:['currency','properties.currency'],transaction:['transaction_id','transactionId','event_id','eventId'],dedupe:['transaction_id','event_id'],notes:'Snapchat uses price, not GA4-style value. Missing value is not an issue when price is present.'},
    clickIds:['ScCid','sccid'],attributionCookies:['_scid'],baseline:BASELINE
  }
};

export function normaliseGovernanceVendor(value: unknown): GovernanceVendor | null {
  const raw=String(value??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const aliases:Record<string,GovernanceVendor>={ga4:'ga4',google_analytics:'ga4',google_analytics_4:'ga4',gads:'gads',google_ads:'gads',googleads:'gads',meta:'meta',facebook:'meta',facebook_pixel:'meta',microsoft_ads:'bing',microsoft_advertising:'bing',bing:'bing',microsoftads:'bing',tiktok:'tiktok',tik_tok:'tiktok',linkedin:'linkedin',snapchat:'snapchat',snap:'snapchat'};
  return aliases[raw]||null;
}

export function platformEventName(vendor: GovernanceVendor, raw: unknown): string {
  const name=String(raw??'').trim();
  if (!name) return '';
  const profile=PLATFORM_DETECTION[vendor];
  const alias=Object.entries(profile.eventAliases||{}).find(([source])=>source.toLowerCase()===name.toLowerCase());
  if (alias) return alias[1];
  const canonical=profile.standardEvents.find((value)=>value.toLowerCase()===name.toLowerCase());
  return canonical||name;
}

export function eventNameValidation(vendor: GovernanceVendor, raw: unknown): { valid: boolean; issueCode?: string; message?: string; suggestion?: string } {
  const name=String(raw??'').trim();
  const profile=PLATFORM_DETECTION[vendor];
  if (!name) return {valid:false,issueCode:'invalid_event_name',message:'Event or conversion identity is empty.'};
  if (profile.eventNamePolicy==='gads_conversion_id_label' || profile.eventNamePolicy==='linkedin_conversion_id') {
    return {valid:true};
  }
  if (profile.eventNamePolicy==='microsoft_uet') return {valid:true};
  if (profile.eventNamePolicy==='ga4_snake_case') {
    if (name.length>40||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||/^firebase_/i.test(name)) return {valid:false,issueCode:'invalid_event_name',message:'GA4 event names must be 40 characters or fewer, start with a letter, and contain only letters, numbers or underscores.',suggestion:name.toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,40)};
    return {valid:true};
  }
  if (profile.eventNamePolicy==='meta_standard_case') {
    const canonical=profile.standardEvents.find(x=>x.toLowerCase()===name.toLowerCase());
    if (canonical&&canonical!==name) return {valid:false,issueCode:'invalid_standard_event_name',message:'Meta standard event names are case-sensitive; use '+canonical+'.',suggestion:canonical};
    return {valid:name.length<=100,issueCode:name.length>100?'invalid_event_name':undefined,message:name.length>100?'Event names longer than 100 characters should be shortened.':undefined};
  }
  if (profile.eventNamePolicy==='tiktok_standard_case') {
    const canonical=profile.standardEvents.find(x=>x.toLowerCase()===name.toLowerCase());
    if (canonical&&canonical!==name) {
      const alias=profile.eventAliases?.[canonical];
      if (alias) return {valid:true};
      return {valid:false,issueCode:'invalid_standard_event_name',message:'TikTok standard event names are case-sensitive; use '+canonical+'.',suggestion:canonical};
    }
    return {valid:name.length<=100,issueCode:name.length>100?'invalid_event_name':undefined,message:name.length>100?'Event names longer than 100 characters should be shortened.':undefined};
  }
  if (profile.eventNamePolicy==='snap_upper_case') {
    const canonical=profile.standardEvents.find(x=>x.toLowerCase()===name.toLowerCase());
    if (canonical&&canonical!==name) return {valid:false,issueCode:'invalid_standard_event_name',message:'Snapchat standard event names must match '+canonical+' exactly.',suggestion:canonical};
    return {valid:name.length<=100,issueCode:name.length>100?'invalid_event_name':undefined,message:name.length>100?'Event names longer than 100 characters should be shortened.':undefined};
  }
  return {valid:true};
}

export function getParameterValue(params: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    const path=key.split('.');
    let value:any=params;
    for (const part of path) {
      if (!value||typeof value!=='object') {value=undefined;break;}
      value=value[part];
    }
    if (value===undefined&&Object.prototype.hasOwnProperty.call(params,key)) value=params[key];
    if (value!==undefined&&value!==null&&String(value).trim()!=='') return value;
  }
  return undefined;
}
