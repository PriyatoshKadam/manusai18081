(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-ga4fix-monitor],script[src*="/monitor.js"]');
  if (!script || !script.src) return;
  var src;
  try { src = new URL(script.src); } catch (_) { return; }
  var apiKey = src.searchParams.get('apiKey') || '';
  var gtmContainerId = src.searchParams.get('gtmContainerId') || '';
  if (!apiKey) return;
  var origin = src.origin;
  var ingestUrl = origin + '/api/ingest';
  var blockedUrl = origin + '/api/blocked';
  var g = window.__g4f = window.__g4f || {};
  if (g.__monitorInstalled) return;
  g.__monitorInstalled = true;
  g.version = '12.6';
  g.k = apiKey;
  g.c = gtmContainerId;
  g.q = g.q || [];
  g.ready = false;

  var dataLayer = window.dataLayer = window.dataLayer || [];
  var sessionId = getSessionId();
  var navigationId = token('nav');
  var occurrence = 0;
  var networkOccurrence = 0;
  var pushIndex = 0;
  var pending = [];
  var queue = g.q;
  var flushTimer = null;
  var seenResources = Object.create(null);
  var networkHistory = Object.create(null);
  var recentNetworkEvents = Object.create(null);
  var sentBlocked = Object.create(null);
  var counts = Object.create(null);
  var processedGtagObjects = [];
  var consentState = { gpc: !!navigator.globalPrivacyControl, do_not_track: navigator.doNotTrack || null, consent_source: 'browser' };
  var webVitals = {}; var vitalsSentForNavigation = false; var clsSessionValue = 0; var clsSessionStart = 0; var clsLastShift = 0;
  var MAX_QUEUE = 250;
  var MAX_PENDING = 300;
  var WAIT_MS = 3500;
  var MATCH_MS = 6000;

  function token(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function getSessionId() {
    try {
      var key = '__g4f_session';
      var current = sessionStorage.getItem(key);
      if (current) return current;
      current = token('session');
      sessionStorage.setItem(key, current);
      return current;
    } catch (_) { return token('session'); }
  }
  function pageUrl() { try { return location.href; } catch (_) { return ''; } }
  function normalize(value) { return value === null || value === undefined ? null : String(value).trim().toLowerCase() || null; }
  function text(value, max) { return value === null || value === undefined ? null : String(value).slice(0, max || 2048); }
  function eventNameValue(value, fallback) { if (value === null || value === undefined || typeof value === 'object' || typeof value === 'function') return fallback || null; var normalized = String(value).trim().slice(0, 120); return /^[\w.:-]+$/.test(normalized) ? normalized : (fallback || null); }
  function safeUrl(value) { try { return new URL(value, location.href); } catch (_) { return null; } }
  function ownUrl(value) { var u = safeUrl(value); return !!u && (u.href.indexOf(ingestUrl) === 0 || u.href.indexOf(blockedUrl) === 0); }
  function merge(a, b) { var out = {}; Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; }); Object.keys(b || {}).forEach(function (k) { out[k] = b[k]; }); return out; }
  function parseBody(body) {
    if (!body) return {};
    try {
      if (typeof body === 'string') {
        var s = body.trim();
        if (!s) return {};
        if (s.charAt(0) === '{') return JSON.parse(s) || {};
        var params = new URLSearchParams(s), out = {};
        params.forEach(function (v, k) { out[k] = v; });
        return out;
      }
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) { var p = {}; body.forEach(function (v, k) { p[k] = v; }); return p; }
      if (typeof FormData !== 'undefined' && body instanceof FormData) { var f = {}; body.forEach(function (v, k) { f[k] = String(v); }); return f; }
    } catch (_) {}
    return {};
  }
  function paramsFromUrl(url) { var out = {}; var u = safeUrl(url); if (!u) return out; u.searchParams.forEach(function (v, k) { out[k] = v; }); return out; }
  function safeValue(value, depth, seen) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function') return '[Function]';
    if (depth > 5) return '[MaxDepth]';
    if (value && value.nodeType === 1) return { tagName: text(value.tagName, 40), id: text(value.id, 120), name: text(value.name, 120), type: text(value.type, 80), className: text(typeof value.className === 'string' ? value.className : '', 160) };
    if (value && value.nodeType === 3) return { text: text(value.textContent, 160) };
    if (value && typeof value.type === 'string' && typeof value.preventDefault === 'function') return { type: text(value.type, 80), target: safeValue(value.target, depth + 1, seen) };
    seen = seen || [];
    if (seen.indexOf(value) !== -1) return '[Circular]';
    seen.push(value);
    var output;
    if (Array.isArray(value)) output = value.slice(0, 80).map(function (item) { return safeValue(item, depth + 1, seen); });
    else { output = {}; Object.keys(value).filter(function (key) { return !/^__react|^owner$|^_owner$|^fiber$/i.test(key); }).slice(0, 80).forEach(function (key) { try { output[key] = safeValue(value[key], depth + 1, seen); } catch (_) { output[key] = '[Unreadable]'; } }); }
    seen.pop();
    return output;
  }
  function safeParams(value) { return safeValue(value || {}, 0, []); }
  function captureConsent(value, source) { consentState = merge(consentState, safeParams(value || {})); if (source) consentState.consent_source = source; }
  function consentFromParams(params) { var gcs = String((params && params.gcs) || ''); if (!/^G1[01]{2}$/.test(gcs)) return {}; var bits = gcs.slice(2); return { ad_storage: bits.charAt(0) === '1' ? 'granted' : 'denied', analytics_storage: bits.charAt(1) === '1' ? 'granted' : 'denied', consent_gcs: gcs, consent_source: 'network_gcs' }; }
  function captureVital(name, value) { if (!name || !Number.isFinite(Number(value))) return; var numeric = Number(value); if (name === 'cls') { var now = Date.now(); if (!clsSessionStart || now - clsLastShift > 1000 || now - clsSessionStart > 5000) { clsSessionValue = 0; clsSessionStart = now; } clsSessionValue += numeric; clsLastShift = now; webVitals[name] = Math.round(Math.max(Number(webVitals[name]) || 0, clsSessionValue) * 100) / 100; } else if (name === 'inp') webVitals[name] = Math.max(Number(webVitals[name]) || 0, Math.round(numeric)); else webVitals[name] = Math.round(numeric * 100) / 100; }
  function diagnostic(name, params) { send({ type: 'diagnostic', vendor: 'browser', eventName: name, params: safeParams(params || {}), pageUrl: pageUrl(), source: 'browser', observationKind: 'diagnostic', sessionId: sessionId, occurrenceId: token('diagnostic'), navigationId: navigationId, gtmContainerId: gtmContainerId, consentState: safeParams(consentState), webVitals: safeParams(webVitals), timestamp: Date.now() }); }
  function stable(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return '[' + value.map(stable).sort().join(',') + ']';
    if (typeof value === 'object') return '{' + Object.keys(value).sort().map(function (k) { return k + ':' + stable(value[k]); }).join('|') + '}';
    return String(value);
  }
  function signature(params, eventName) {
    var ignored = { _p: 1, _s: 1, sid: 1, sct: 1, _et: 1, _tu: 1, _eu: 1, dt: 1, dr: 1, dl: 1, ecid: 1, cid: 1, seg: 1, _fplc: 1, uaa: 1, uab: 1, uafvl: 1, ul: 1, sr: 1, 'sst.rnd': 1, 'sst.tft': 1, 'sst.lpc': 1, 'sst.navt': 1, 'sst.ude': 1, 'sst.sw_exp': 1, tag_exp: 1, richsstsse: 1 };
    return (eventName || '') + '|' + Object.keys(params || {}).filter(function (k) { return !ignored[k]; }).sort().map(function (k) { return k + '=' + stable(params[k]); }).join('&').slice(0, 1000);
  }
  function vendorFor(url, params) {
    var u = safeUrl(url); var host = u ? u.hostname : ''; var value = String(url || '').toLowerCase();
    var eventName = params.en || params.event_name || params.event;
    var measurement = params.tid || params.measurement_id;
    if (/googletagmanager\.com\/(?:gtm|gtag\/js)|google-analytics\.com\/analytics\.js|analytics\.google\.com\/analytics\.js/i.test(value)) return 'gtm';
    var gadsRequest = u && /\/(?:rmkt|ccm)\/collect(?:\/|$)/i.test(u.pathname);
    var gadsMeasurement = /^AW-/i.test(String(measurement || '')) || params.conversion_id || params.google_conversion_id || params.conversion_label || params.google_conversion_label || params.send_to;
    if (gadsRequest || gadsMeasurement || /googleadservices\.com|googlesyndication\.com/.test(value)) return 'gads';
    var ga4Path = u && /\/(?:metrics\/|analytics\/)?(?:g|mp)\/collect$/i.test(u.pathname);
    if ((ga4Path || /(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/i.test(host) || measurement) && (eventName || /^G-[A-Z0-9]+$/i.test(String(measurement || '')))) return 'ga4';
    if (/googleadservices\.com|googlesyndication\.com/.test(value) || params.gclid || params.google_conversion_id) return 'gads';
    if (/facebook\.com\/tr|facebook\.net\/tr/.test(value)) return 'meta';
    if (/analytics\.tiktok\.com|business-api\.tiktok\.com|tiktok\.com\/api/.test(value)) return 'tiktok';
    if (/px\.ads\.linkedin\.com|snap\.licdn\.com/.test(value)) return 'linkedin';
    if (/snapchat|tr\.snapchat\.com/.test(value)) return 'snapchat';
    if (/pinterest|pintrk/.test(value)) return 'pinterest';
    if (/bat\.bing\.com|bing\.com\/action|uetq/.test(value)) return 'bing';
    if (/reddit/.test(value)) return 'reddit';
    if (/criteo/.test(value)) return 'criteo';
    if (/clarity\.ms/.test(value)) return 'clarity';
    if (/hotjar/.test(value)) return 'hotjar';
    if (/fullstory/.test(value)) return 'fullstory';
    if (/heap/.test(value)) return 'heap';
    if (/mixpanel/.test(value)) return 'mixpanel';
    if (/amplitude/.test(value)) return 'amplitude';
    if (/segment\.io/.test(value)) return 'segment';
    if (/hubspot/.test(value)) return 'hubspot';
    if (/klaviyo/.test(value)) return 'klaviyo';
    if (/braze/.test(value)) return 'braze';
    if (/optimizely/.test(value)) return 'optimizely';
    if (/vwo/.test(value)) return 'vwo';
    if (/intercom/.test(value)) return 'intercom';
    return null;
  }
  function gadsEventName(params) {
    if (!params) return null;
    var label = params.conversion_label || params.google_conversion_label || params.label;
    if (typeof label === 'string' && label.trim()) return label;
    var sendTo = params.send_to;
    if (typeof sendTo === 'string' && sendTo.trim()) {
      var parts = sendTo.split('/');
      return (parts[1] || parts[0]).trim() || null;
    }
    return params.conversion_id || params.google_conversion_id || params.tids || params.tid || params.ev || params.event || params.event_name || params.eventName || params.action || params.en || null;
  }
  function eventNameFor(vendor, params) {
    if (!params) return null;
    if (vendor === 'gads') return gadsEventName(params);
    if (vendor === 'ga4') return params.en || params.event_name || params.event || null;
    if (vendor === 'meta') return params.ev || params.event || params.event_name || params.eventName || params.action || 'PageView';
    if (vendor === 'linkedin') return params.ev || params.event || params.event_name || params.eventName || params.action || 'page_view';
    if (vendor === 'bing') return params.evt || params.event || params.event_name || params.eventName || params.action || 'pageLoad';
    if (vendor === 'snapchat') return params.ev || params.event || params.event_name || params.eventName || params.action || 'PAGE_VIEW';
    return params.ev || params.event || params.event_name || params.eventName || params.action || null;
  }
  function ga4Params(params) {
    var out = merge({}, params || {});
    if (out.currency === undefined && out.cu !== undefined) out.currency = out.cu;
    if (out.currency === undefined && out['ep.currency'] !== undefined) out.currency = out['ep.currency'];
    if (out.currency === undefined && out['epn.currency'] !== undefined) out.currency = out['epn.currency'];
    if (out.value === undefined && out['epn.value'] !== undefined) out.value = Number(out['epn.value']);
    if (out.value === undefined && out['ep.value'] !== undefined) out.value = Number(out['ep.value']) || out['ep.value'];
    if (out.purchase_type === undefined && out['ep.purchase_type'] !== undefined) out.purchase_type = out['ep.purchase_type'];
    return out;
  }
  function transactionId(params) { return params.transaction_id || params.transactionId || params['ep.transaction_id'] || params['epn.transaction_id'] || (params.ecommerce && (params.ecommerce.transaction_id || params.ecommerce.transactionId)) || null; }
  function send(payload) {
    if (queue.length >= MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE + 1);
    queue.push(payload);
    if (!flushTimer) flushTimer = setTimeout(flush, 250);
  }
  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    var body = JSON.stringify({ apiKey: apiKey, gtmContainerId: gtmContainerId, events: queue.splice(0, queue.length) });
    try {
      var request = fetch(ingestUrl, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
      if (request && request.catch) request.catch(function () { reportBlocked('ingest_transport_blocked', { blockedUrl: ingestUrl, signal: 'ingest_transport' }); });
      return;
    } catch (_) {}
    try { if (navigator.sendBeacon) navigator.sendBeacon(ingestUrl, new Blob([body], { type: 'text/plain;charset=UTF-8' })); } catch (_) {}
  }
  function sendVitalsSnapshot() { if (vitalsSentForNavigation || !Object.keys(webVitals).length) return; vitalsSentForNavigation = true; diagnostic('web_vitals', {}); }
  function flushOnPageExit() {
    try { sendVitalsSnapshot(); } catch (_) {}
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return;
    var body = JSON.stringify({ apiKey: apiKey, gtmContainerId: gtmContainerId, events: queue.splice(0, queue.length) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ingestUrl, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
    } catch (_) {}
    try { fetch(ingestUrl, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(function () {}); } catch (_) {}
  }
  function reportBlocked(method, details) {
    details = details || {};
    var key = method + '|' + (details.eventName || '') + '|' + (details.occurrenceId || details.blockedUrl || '');
    if (sentBlocked[key]) return;
    sentBlocked[key] = true;
    var u = new URL(blockedUrl);
    u.searchParams.set('k', apiKey); u.searchParams.set('m', method);
    if (details.eventName) u.searchParams.set('e', text(details.eventName, 120));
    if (details.blockedUrl) u.searchParams.set('u', text(details.blockedUrl, 2048));
    if (details.reason) u.searchParams.set('r', text(details.reason, 80));
    if (details.signal) u.searchParams.set('r', text(details.signal, 80));
    if (details.occurrenceId) u.searchParams.set('o', text(details.occurrenceId, 160));
    if (details.sessionId) u.searchParams.set('s', text(details.sessionId, 128));
    u.searchParams.set('p', pageUrl());
    try { var result = fetch(u.href, { method: 'GET', keepalive: true, credentials: 'omit' }); if (result && result.catch) result.catch(function () {}); return; } catch (_) {}
    try { if (navigator.sendBeacon) navigator.sendBeacon(u.href); } catch (_) {}
  }
  function currentEvent(eventName, params, source, kind, index, vendor) {
    var normalizedName = eventNameValue(eventName, null); if (!normalizedName) return null;
    occurrence += 1;
    var safe = safeParams(params);
    var implementationSource = vendor === 'gtm' ? 'gtm' : source === 'gtag' ? 'direct_gtag' : 'dataLayer';
    var event = { vendor: vendor || 'ga4', eventName: normalizedName, params: safe, source: source || 'dataLayer', originSource: implementationSource, observationKind: kind || 'datalayer', sessionId: sessionId, occurrenceId: 'event-' + occurrence, dlPushIndex: index === undefined ? null : index, navigationId: navigationId, gtmContainerId: gtmContainerId, pageUrl: pageUrl(), requestSignature: signature(safe, normalizedName), timestamp: Date.now() };
    var name = normalize(normalizedName); counts[name] = (counts[name] || 0) + 1;
    send({ type: kind || 'datalayer', vendor: event.vendor, eventName: event.eventName, params: event.params, clientId: event.params.cid || event.params.client_id || null, transactionId: transactionId(event.params), pageUrl: event.pageUrl, source: event.source, originSource: event.originSource, observationKind: event.observationKind, sessionId: event.sessionId, occurrenceId: event.occurrenceId, dlPushIndex: event.dlPushIndex, navigationId: event.navigationId, gtmContainerId: gtmContainerId, requestSignature: event.requestSignature, consentState: safeParams(consentState), webVitals: safeParams(webVitals), timestamp: event.timestamp });
    if (event.vendor !== 'ga4') return event;
    pending.push(event); if (pending.length > MAX_PENDING) pending.shift();
    setTimeout(function () {
      if (pending.indexOf(event) === -1 || event.networkMatched) return;
      pending.splice(pending.indexOf(event), 1);
      reportBlocked('ga4_event_unmatched', { eventName: event.eventName, occurrenceId: event.occurrenceId, sessionId: sessionId, reason: 'datalayer_event_without_matching_network_request', signal: 'ga4_event_correlation' });
    }, WAIT_MS);
    return event;
  }
  function wasProcessed(item) { return processedGtagObjects.indexOf(item) !== -1; }
  function rememberProcessed(item) { if (!item) return; processedGtagObjects.push(item); if (processedGtagObjects.length > 200) processedGtagObjects.shift(); }
  function dataLayerEvent(item, explicitIndex) {
    if (!item || wasProcessed(item)) return null;
    var name = null, params = item, source = 'dataLayer';
    var vendor = 'ga4';
    if (Array.isArray(item) || typeof item.length === 'number') {
      if (item[0] === 'event') { name = item[1]; params = item[2] || {}; source = 'gtag'; }
      if (item[0] === 'config' || item[0] === 'set') return null;
      if (item[0] === 'consent') { captureConsent(item[2] || item[1] || {}, 'datalayer'); return null; }
    } else if (typeof item === 'object') { name = item.event || item.event_name || item.eventName || null; }
    if (name && /^(consent_update|consent)$/i.test(String(name))) { captureConsent(params); return null; }
    if (!name) return null;
    if (/^gtm(?:\.|$)/i.test(String(name))) vendor = 'gtm';
    return currentEvent(name, params && typeof params === 'object' ? params : {}, source, 'datalayer', explicitIndex === undefined ? pushIndex : explicitIndex, vendor);
  }
  function matchPending(name, params, ts, requestSig) {
    var target = normalize(name); var best = null; var bestScore = -1;
    for (var i = 0; i < pending.length; i += 1) {
      var item = pending[i]; if (!item || item.vendor !== 'ga4' || item.networkMatched || normalize(item.eventName) !== target) continue;
      var age = ts - item.timestamp; if (age < 0 || age > MATCH_MS) continue;
      var score = 0; var itemParams = item.params || {};
      if (requestSig && item.requestSignature && requestSig === item.requestSignature) score += 100;
      var currentTransaction = transactionId(params); var itemTransaction = transactionId(itemParams);
      if (currentTransaction && itemTransaction && currentTransaction === itemTransaction) score += 90;
      var currentEventId = params.event_id || params.eventId || params.eventID; var itemEventId = itemParams.event_id || itemParams.eventId || itemParams.eventID;
      if (currentEventId && itemEventId && String(currentEventId) === String(itemEventId)) score += 90;
      var currentClient = params.cid || params.client_id; var itemClient = itemParams.cid || itemParams.client_id;
      if (currentClient && itemClient && String(currentClient) === String(itemClient)) score += 50;
      if (item.navigationId && item.navigationId === navigationId) score += 30;
      if (item.pageUrl && item.pageUrl === pageUrl()) score += 20;
      score += Math.max(0, 20 - Math.floor(age / 300));
      if (score > bestScore) { bestScore = score; best = item; }
    }
    if (!best || bestScore < 30) return null;
    best.networkMatched = true; best.requestSignature = requestSig; best.networkOccurrenceId = 'network-' + (++networkOccurrence); pending.splice(pending.indexOf(best), 1); return best;
  }
  function network(url, body, transport, failed, deferSend, observationKindOverride) {
    var observationKind = observationKindOverride || 'network';
    if (!url || ownUrl(url)) return null;
    var params = merge(paramsFromUrl(url), parseBody(body));
    var networkConsent = consentFromParams(params); if (Object.keys(networkConsent).length) captureConsent(networkConsent, 'network_gcs');
    var vendor = vendorFor(url, params);
    if (!vendor) return null;
    var name = eventNameValue(eventNameFor(vendor, params), null);
    if (vendor === 'ga4' && !name) return null;
    var normalizedParams = vendor === 'ga4' ? safeParams(ga4Params(params)) : safeParams(params);
    var requestSig = signature(normalizedParams, name);
    var historyKey = vendor + '|' + requestSig;
    var previousNetwork = networkHistory[historyKey];
    if (transport === 'performance' && previousNetwork && previousNetwork.transport !== 'performance' && Date.now() - previousNetwork.timestamp < 5000) return null;
    networkHistory[historyKey] = { transport: transport, timestamp: Date.now() };
    var match = observationKind === 'network' && vendor === 'ga4' ? matchPending(name, normalizedParams, Date.now(), requestSig) : null;
    var recentKey = vendor + '|' + String(name || '') + '|' + navigationId;
    var recent = recentNetworkEvents[recentKey];
    var rapidFanout = observationKind === 'network' && !match && vendor === 'ga4' && recent && Date.now() - recent.timestamp <= 750;
    var event = { type: observationKind === 'resource' ? 'resource' : 'network', vendor: vendor, eventName: text(name, 120), params: normalizedParams, clientId: text(params.cid || params.client_id || params.id, 160), transactionId: transactionId(params), measurementId: params.tid || params.measurement_id || null, pageUrl: pageUrl(), rawUrl: text(url, 10000), source: transport || 'network', originSource: match ? match.originSource : rapidFanout ? recent.originSource : null, observationKind: observationKind, transport: transport, sessionId: sessionId, occurrenceId: match ? match.occurrenceId : rapidFanout ? recent.occurrenceId : null, networkOccurrenceId: observationKind === 'network' ? 'network-' + (++networkOccurrence) : null, requestSignature: requestSig, dlPushIndex: match ? match.dlPushIndex : rapidFanout ? recent.dlPushIndex : null, navigationId: navigationId, gtmContainerId: gtmContainerId, statusCode: null, latencyMs: null, failureReason: null, consentState: safeParams(consentState), webVitals: safeParams(webVitals), startedAt: Date.now(), timestamp: Date.now() };
    if (observationKind === 'network') recentNetworkEvents[recentKey] = { timestamp: event.timestamp, occurrenceId: event.occurrenceId, dlPushIndex: event.dlPushIndex, source: event.source, originSource: event.originSource };
    if (!deferSend) send(event);
    if (failed && observationKind === 'network') reportBlocked(vendor + '_transport_blocked', { eventName: name, blockedUrl: url, sessionId: sessionId, signal: vendor + '_transport' });
    return event;
  }
  function patchDataLayer() {
    for (var i = 0; i < dataLayer.length; i += 1) { try { dataLayerEvent(dataLayer[i], i); } catch (_) {} }
    var original = dataLayer.push;
    dataLayer.push = function () { for (var j = 0; j < arguments.length; j += 1) { try { pushIndex += 1; if (!wasProcessed(arguments[j])) dataLayerEvent(arguments[j], pushIndex); } catch (_) {} } return original.apply(this, arguments); };
    if (typeof window.gtag === 'function') {
      var originalGtag = window.gtag;
      window.gtag = function () { try { if (arguments[0] === 'event') { pushIndex += 1; dataLayerEvent(arguments, pushIndex); rememberProcessed(arguments); } else if (arguments[0] === 'consent') { captureConsent(arguments[2] || {}, 'datalayer'); } } catch (_) {} return originalGtag.apply(this, arguments); };
    }
  }
  function recordVendorFunction(vendor, method, args) {
    var values = Array.prototype.slice.call(args || []);
    var objectArg = values[1] && typeof values[1] === 'object' ? values[1] : null;
    var eventName = eventNameValue(objectArg && (objectArg.event || objectArg.event_name || objectArg.action) || values[1] || values[0] || method || 'call', method || 'call');
    var candidate = values[2] && typeof values[2] === 'object' ? values[2] : objectArg || {};
    var params = safeParams(candidate);
    send({ type: 'function', vendor: vendor, eventName: eventName, params: params, clientId: text(params.cid || params.client_id, 160), transactionId: transactionId(params), pageUrl: pageUrl(), source: method, originSource: 'vendor_sdk', observationKind: 'function', transport: 'function', sessionId: sessionId, occurrenceId: token('function'), networkOccurrenceId: null, requestSignature: signature(params, eventName), dlPushIndex: null, navigationId: navigationId, gtmContainerId: gtmContainerId, statusCode: null, latencyMs: null, failureReason: null, consentState: safeParams(consentState), webVitals: safeParams(webVitals), timestamp: Date.now() });
  }
  function wrapVendorGlobal(name, vendor) {
    try {
      var original = window[name];
      if (typeof original !== 'function' || original.__g4fWrapped) return;
      var wrapped = function () { try { recordVendorFunction(vendor, name, arguments); } catch (_) {} return original.apply(this, arguments); };
      wrapped.__g4fWrapped = true;
      window[name] = wrapped;
    } catch (_) {}
  }
  function wrapVendorMethod(objectName, methodName, vendor) {
    try {
      var object = window[objectName];
      if (!object || typeof object[methodName] !== 'function' || object[methodName].__g4fWrapped) return;
      var original = object[methodName];
      var wrapped = function () { try { recordVendorFunction(vendor, objectName + '.' + methodName, arguments); } catch (_) {} return original.apply(this, arguments); };
      wrapped.__g4fWrapped = true;
      object[methodName] = wrapped;
    } catch (_) {}
  }
  function patchVendorFunctions() {
    [['fbq', 'meta'], ['pintrk', 'pinterest'], ['snaptr', 'snapchat'], ['lintrk', 'linkedin'], ['rdt', 'reddit'], ['hj', 'hotjar'], ['uetq', 'bing']].forEach(function (item) { wrapVendorGlobal(item[0], item[1]); });
    [['ttq', 'track', 'tiktok'], ['ttq', 'page', 'tiktok'], ['klaviyo', 'track', 'klaviyo'], ['heap', 'track', 'heap'], ['FS', 'event', 'fullstory'], ['analytics', 'track', 'segment']].forEach(function (item) { wrapVendorMethod(item[0], item[1], item[2]); });
  }
  function patchNetwork() {
    if (typeof window.fetch === 'function') {
      var fetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : input && input.url; var body = init && init.body;
        var parsed = null; try { parsed = network(url, body, 'fetch', false, true); } catch (_) {}
        var result;
        try { result = fetch.apply(this, arguments); } catch (error) { if (parsed) { parsed.failureReason = 'network_error'; parsed.latencyMs = Date.now() - parsed.startedAt; send(parsed); reportBlocked(parsed.vendor + '_transport_blocked', { eventName: parsed.eventName, blockedUrl: url, sessionId: sessionId }); } throw error; }
        if (result && result.then && parsed) result.then(function (response) { parsed.statusCode = Number(response.status) || 0; parsed.latencyMs = Date.now() - parsed.startedAt; var opaque = parsed.statusCode === 0 && response.type === 'opaque'; if (!response.ok && !opaque) { parsed.failureReason = 'http_' + parsed.statusCode; reportBlocked(parsed.vendor + '_http_failure', { eventName: parsed.eventName, blockedUrl: url, sessionId: sessionId, reason: parsed.failureReason, signal: parsed.vendor + '_http' }); } send(parsed); }).catch(function () { if (parsed) { parsed.failureReason = 'network_error'; parsed.latencyMs = Date.now() - parsed.startedAt; send(parsed); reportBlocked(parsed.vendor + '_transport_blocked', { eventName: parsed.eventName, blockedUrl: url, sessionId: sessionId }); } });
        return result;
      };
    }
    try {
      var open = XMLHttpRequest.prototype.open, sendXhr = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) { this.__g4f = { method: method, url: url }; return open.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function (body) { var item = this.__g4f; var parsed = null; try { parsed = item && network(item.url, body, 'xhr', false, true); } catch (_) {} if (parsed) { this.addEventListener('load', function () { parsed.statusCode = Number(this.status) || 0; parsed.latencyMs = Date.now() - parsed.startedAt; if (this.status >= 400) { parsed.failureReason = 'http_' + this.status; reportBlocked(parsed.vendor + '_http_failure', { eventName: parsed.eventName, blockedUrl: item.url, sessionId: sessionId, reason: parsed.failureReason, signal: parsed.vendor + '_http' }); } send(parsed); }); this.addEventListener('error', function () { parsed.failureReason = 'network_error'; parsed.latencyMs = Date.now() - parsed.startedAt; send(parsed); reportBlocked(parsed.vendor + '_transport_blocked', { eventName: parsed.eventName, blockedUrl: item.url, sessionId: sessionId }); }); this.addEventListener('abort', function () { parsed.failureReason = 'aborted'; send(parsed); reportBlocked(parsed.vendor + '_transport_blocked', { eventName: parsed.eventName, blockedUrl: item.url, sessionId: sessionId }); }); } return sendXhr.apply(this, arguments); };
    } catch (_) {}
    try {
      var beacon = navigator.sendBeacon;
      if (beacon) navigator.sendBeacon = function (url, body) { var parsed = null; try { parsed = network(url, body, 'sendBeacon', false, true); } catch (_) {} var ok = false; try { ok = beacon.call(navigator, url, body); } catch (_) {} if (parsed) { parsed.beaconAccepted = ok; parsed.failureReason = ok ? null : 'beacon_rejected'; send(parsed); if (!ok) { try { reportBlocked(parsed.vendor + '_beacon_rejected', { eventName: parsed.eventName, blockedUrl: url, sessionId: sessionId, signal: parsed.vendor + '_beacon_rejected' }); } catch (_) {} } } return ok; };
    } catch (_) {}
  }
  function patchHistory() {
    function nextNavigation() { navigationId = token('nav'); webVitals = {}; vitalsSentForNavigation = false; clsSessionValue = 0; clsSessionStart = 0; clsLastShift = 0; }
    ['pushState', 'replaceState'].forEach(function (method) { var original = history[method]; history[method] = function () { var result = original.apply(this, arguments); nextNavigation(); return result; }; });
    window.addEventListener('popstate', nextNavigation);
  }
  function scanPerformance() {
    try { (performance.getEntriesByType('resource') || []).forEach(function (entry) { try { var key = entry.name + '|' + entry.startTime + '|' + entry.duration; if (seenResources[key]) return; seenResources[key] = true; network(entry.name, null, 'performance', false, false, 'resource'); } catch (_) {} }); } catch (_) {}
  }
  patchDataLayer(); patchVendorFunctions(); patchNetwork(); patchHistory();
  try { setInterval(patchVendorFunctions, 1000); } catch (_) {}
  try { window.addEventListener('pagehide', flushOnPageExit); } catch (_) {}
  try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushOnPageExit(); }); } catch (_) {}
  try { if (typeof PerformanceObserver !== 'undefined') new PerformanceObserver(function (list) { list.getEntries().forEach(function (entry) { try { var key = entry.name + '|' + entry.startTime + '|' + entry.duration; if (!seenResources[key]) { seenResources[key] = true; network(entry.name, null, 'performance', false, false, 'resource'); } } catch (_) {} }); }).observe({ type: 'resource', buffered: true }); } catch (_) {}
  try { setInterval(scanPerformance, 1000); } catch (_) {}
  try { if (typeof PerformanceObserver !== 'undefined') { new PerformanceObserver(function (list) { list.getEntries().forEach(function (entry) { if (entry.name === 'first-paint') captureVital('fcp', entry.startTime); }); }).observe({ type: 'paint', buffered: true }); } } catch (_) {}
  try { if (typeof PerformanceObserver !== 'undefined') { new PerformanceObserver(function (list) { list.getEntries().forEach(function (entry) { captureVital('lcp', entry.startTime); }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } } catch (_) {}
  try { if (typeof PerformanceObserver !== 'undefined') { new PerformanceObserver(function (list) { list.getEntries().forEach(function (entry) { if (!entry.hadRecentInput) captureVital('cls', entry.value || 0); }); }).observe({ type: 'layout-shift', buffered: true }); } } catch (_) {}
  try { var navEntry = performance.getEntriesByType('navigation')[0]; if (navEntry) captureVital('ttfb', navEntry.responseStart || 0); } catch (_) {}
  try { if (typeof PerformanceObserver !== 'undefined') { new PerformanceObserver(function (list) { list.getEntries().forEach(function (entry) { if (entry.interactionId) captureVital('inp', entry.duration || 0); }); }).observe({ type: 'event', buffered: true, durationThreshold: 40 }); } } catch (_) {}
  try { window.addEventListener('error', function (event) { var target = event.target; var url = target && (target.src || target.href); if (url && vendorFor(url, {})) { reportBlocked('resource_error', { blockedUrl: url, sessionId: sessionId, signal: 'resource_error' }); diagnostic('resource_error', { blockedUrl: text(url, 2048), target: text(target.tagName, 40) }); } else if (!target) diagnostic('console_error', { message: text(event.message || 'Unhandled window error', 512), filename: text(event.filename, 2048), line: event.lineno || null }); }, true); } catch (_) {}
  try { window.addEventListener('unhandledrejection', function (event) { diagnostic('unhandled_rejection', { reason: text(event.reason && event.reason.message ? event.reason.message : event.reason, 512) }); }); } catch (_) {}
  try { var originalConsoleError = console.error; console.error = function () { var args = Array.prototype.slice.call(arguments); diagnostic('console_error', { message: text(args.map(function (value) { return typeof value === 'string' ? value : stable(safeParams(value)); }).join(' '), 1024) }); return originalConsoleError.apply(this, arguments); }; } catch (_) {}
  try { if (typeof MutationObserver !== 'undefined') new MutationObserver(function (records) { records.forEach(function (record) { Array.prototype.slice.call(record.addedNodes || []).forEach(function (node) { if (node && node.tagName === 'SCRIPT' && node.src && vendorFor(node.src, {})) diagnostic('script_injected', { vendor: vendorFor(node.src, {}), url: text(node.src, 2048) }); }); }); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  try { window.addEventListener('securitypolicyviolation', function (event) { diagnostic('csp_violation', { blockedUrl: text(event.blockedURI, 2048), directive: text(event.effectiveDirective, 120), policy: text(event.originalPolicy, 512), disposition: text(event.disposition, 40) }); }); } catch (_) {}
  try {
    var sriSeen = {};
    function scanSensitiveScripts() {
      var path = String(location.pathname || '').toLowerCase();
      if (!/(checkout|payment|confirm|order|cart)/.test(path)) return;
      Array.prototype.slice.call(document.scripts || []).forEach(function (script) {
        var src = script && script.src;
        if (!src || !/^https?:/i.test(src) || src.indexOf(location.origin) === 0 || script.integrity || sriSeen[src]) return;
        sriSeen[src] = true;
        diagnostic('sri_missing', { url: text(src, 2048), pagePath: path, reason: 'External script on a sensitive path has no integrity attribute' });
      });
    }
    scanSensitiveScripts(); setInterval(scanSensitiveScripts, 5000);
  } catch (_) {}
  try { window.__g4fDebug = function () { return { version: g.version, sessionId: sessionId, navigationId: navigationId, counts: Object.assign({}, counts), pending: pending.map(function (e) { return { eventName: e.eventName, occurrenceId: e.occurrenceId, pushIndex: e.dlPushIndex, matched: !!e.networkMatched }; }), queueLength: queue.length }; }; } catch (_) {}
  g.ready = true;
  send({ type: 'monitor_ready', vendor: 'ga4fix', observationKind: 'monitor_ready', sessionId: sessionId, navigationId: navigationId, gtmContainerId: gtmContainerId, consentState: safeParams(consentState), webVitals: safeParams(webVitals), pageUrl: pageUrl(), timestamp: Date.now() });
})();
