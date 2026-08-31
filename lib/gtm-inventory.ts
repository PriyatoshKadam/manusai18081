export type GtmTagRecord = {
  tagId: string;
  name: string;
  type: string;
  firingTriggerIds: string[];
  parameterKeys: string[];
  eventName: string | null;
  measurementId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  sendTo: string | null;
  platformId: string | null;
};

export type GtmTriggerRecord = {
  triggerId: string;
  name: string;
  type: string;
  customEventName: string | null;
};

export type GtmVariableRecord = {
  variableId: string;
  name: string;
  type: string;
};

export type GtmInventory = {
  accountId: string;
  containerId: string;
  workspaceId: string;
  fetchedAt: string;
  tags: GtmTagRecord[];
  triggers: GtmTriggerRecord[];
  variables: GtmVariableRecord[];
  environment?: 'workspace' | 'live' | 'version';
  snapshotVersionId?: string | null;
  snapshotVersionName?: string | null;
  liveVersionId?: string | null;
  liveVersionName?: string | null;
  liveVersionUpdatedAt?: string | null;
  snapshotStale?: boolean;
};

export type EventEnrichment = {
  tagId: string | null;
  tagName: string | null;
  triggerName: string | null;
  workspaceId: string | null;
  confidence: 'configuration_match' | 'likely_match' | 'ambiguous' | 'unmatched';
  missingParameters: string[];
  observedParameters: string[];
  parameterStatus: 'complete' | 'missing' | 'not_applicable';
};

type RawResource = Record<string, unknown>;

import { query } from './db';
import { getAccessToken, getConnection, gtmRequest } from './gtm';

const VALUE_KEYS = new Set(['eventName', 'event_name', 'measurementId', 'measurement_id', 'conversionId', 'conversion_id', 'conversionLabel', 'conversion_label', 'sendTo', 'send_to', 'pixelId', 'pixel_id', 'partnerId', 'partner_id', 'pid', 'uetTagId', 'uet_tag_id', 'ti']);
const SENSITIVE_KEYS = /html|script|token|secret|key|password|credential|authorization/i;

function stringValue(value: unknown, max = 240): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
}

function safeId(value: unknown): string {
  return stringValue(value, 100)?.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 100) || '';
}

function parametersOf(resource: RawResource): RawResource[] {
  return Array.isArray(resource.parameter) ? resource.parameter.filter((item): item is RawResource => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function parameterMap(resource: RawResource) {
  const values: Record<string, string> = {};
  for (const parameter of parametersOf(resource)) {
    const key = stringValue(parameter.key, 80);
    if (!key || SENSITIVE_KEYS.test(key)) continue;
    const value = stringValue(parameter.value, 240);
    const canonical = key.toLowerCase().replace(/[-.]/g, '_');
    if (value && VALUE_KEYS.has(key)) values[key] = value;
    if (value && ['eventname', 'event_name', 'measurementid', 'measurement_id', 'conversionid', 'conversion_id', 'conversionlabel', 'conversion_label', 'sendto', 'send_to', 'pixelid', 'pixel_id', 'partnerid', 'partner_id', 'pid', 'uettagid', 'uet_tag_id', 'ti'].includes(canonical)) values[key] = value;
  }
  return values;
}

function firstValue(values: Record<string, string>, keys: string[]) {
  for (const key of keys) if (values[key]) return values[key];
  return null;
}

export function normalizeGtmTag(resource: RawResource): GtmTagRecord | null {
  const tagId = safeId(resource.tagId);
  if (!tagId) return null;
  const parameters = parametersOf(resource);
  const parameterKeys = parameters.map((parameter) => stringValue(parameter.key, 80)).filter((value): value is string => Boolean(value && !SENSITIVE_KEYS.test(value))).slice(0, 80);
  const values = parameterMap(resource);
  const sendTo = firstValue(values, ['sendTo', 'send_to']);
  const sendToParts = sendTo?.split('/').map((part) => part.trim()).filter(Boolean) || [];
  return {
    tagId,
    name: stringValue(resource.name, 200) || `Tag ${tagId}`,
    type: stringValue(resource.type, 80) || 'unknown',
    firingTriggerIds: Array.isArray(resource.firingTriggerId) ? resource.firingTriggerId.map(safeId).filter(Boolean).slice(0, 40) : [],
    parameterKeys,
    eventName: firstValue(values, ['eventName', 'event_name']),
    measurementId: firstValue(values, ['measurementId', 'measurement_id']),
    conversionId: firstValue(values, ['conversionId', 'conversion_id']) || (sendToParts[0]?.match(/^AW-[A-Z0-9]+$/i) ? sendToParts[0] : null),
    conversionLabel: firstValue(values, ['conversionLabel', 'conversion_label']) || (sendToParts.length > 1 ? sendToParts[1] : null),
    sendTo,
    platformId: firstValue(values, ['pixelId', 'pixel_id', 'partnerId', 'partner_id', 'pid', 'uetTagId', 'uet_tag_id', 'ti']),
  };
}

export function normalizeGtmTrigger(resource: RawResource): GtmTriggerRecord | null {
  const triggerId = safeId(resource.triggerId);
  if (!triggerId) return null;
  const filters = Array.isArray(resource.customEventFilter) ? resource.customEventFilter : [];
  const customEventName = filters
    .map((filter) => {
      if (!filter || typeof filter !== 'object') return null;
      const filterParams = Array.isArray((filter as RawResource).parameter) ? (filter as RawResource).parameter as unknown[] : [];
      const value = filterParams[1] && typeof filterParams[1] === 'object' ? (filterParams[1] as RawResource).value : null;
      return stringValue(value, 120);
    })
    .find(Boolean) || stringValue(resource.customEventName, 120);
  return {
    triggerId,
    name: stringValue(resource.name, 200) || `Trigger ${triggerId}`,
    type: stringValue(resource.type, 80) || 'unknown',
    customEventName,
  };
}

export function normalizeGtmVariable(resource: RawResource): GtmVariableRecord | null {
  const variableId = safeId(resource.variableId);
  if (!variableId) return null;
  return { variableId, name: stringValue(resource.name, 200) || `Variable ${variableId}`, type: stringValue(resource.type, 80) || 'unknown' };
}

export function normalizeGtmInventory(input: { accountId: string; containerId: string; workspaceId: string; tags?: unknown[]; triggers?: unknown[]; variables?: unknown[] }): GtmInventory {
  return {
    accountId: safeId(input.accountId),
    containerId: safeId(input.containerId),
    workspaceId: safeId(input.workspaceId),
    fetchedAt: new Date().toISOString(),
    tags: (input.tags || []).filter((value): value is RawResource => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map(normalizeGtmTag).filter((value): value is GtmTagRecord => Boolean(value)).slice(0, 2000),
    triggers: (input.triggers || []).filter((value): value is RawResource => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map(normalizeGtmTrigger).filter((value): value is GtmTriggerRecord => Boolean(value)).slice(0, 2000),
    variables: (input.variables || []).filter((value): value is RawResource => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map(normalizeGtmVariable).filter((value): value is GtmVariableRecord => Boolean(value)).slice(0, 2000),
  };
}

function normalized(value: unknown) { return String(value || '').trim().toLowerCase(); }
function containsEventName(value: string | null, eventName: string) {
  const candidate = normalized(value);
  if (!candidate || !eventName) return false;
  return candidate === eventName;
}
function triggerMatchesEvent(inventory: GtmInventory, tag: GtmTagRecord, eventName: string) {
  return tag.firingTriggerIds.some((triggerId) => {
    const trigger = inventory.triggers.find((item) => item.triggerId === triggerId);
    return Boolean(trigger && containsEventName(trigger.customEventName, eventName));
  });
}
function isBaseEvent(vendor: string, eventName: string) {
  const baseEvents: Record<string, string[]> = {
    meta: ['pageview', 'page_view'],
    linkedin: ['pageview', 'page_view'],
    bing: ['pageload', 'page_load'],
    snapchat: ['pageview', 'page_view'],
  };
  return Boolean(baseEvents[vendor]?.includes(eventName));
}
function tagVendor(tag: GtmTagRecord): 'ga4' | 'gads' | 'meta' | 'linkedin' | 'bing' | 'snapchat' | 'other' {
  const type = normalized(tag.type);
  if (type.includes('googleads') || type === 'awct' || type === 'sp') return 'gads';
  if (type.includes('googleanalytics') || type === 'gaawe' || type === 'gaawc') return 'ga4';
  const name = normalized(tag.name);
  if (type.includes('linkedin') || name.includes('linkedin') || name.includes('insight tag')) return 'linkedin';
  if (type.includes('facebook') || type.includes('meta') || name.includes('facebook') || name.includes('meta pixel')) return 'meta';
  if (type.includes('microsoft') || type.includes('bing') || name.includes('bing') || name.includes('uet')) return 'bing';
  if (type.includes('snapchat') || type.includes('snap') || name.includes('snapchat') || name.includes('snap pixel')) return 'snapchat';
  return 'other';
}

function urlParameter(rawUrl: string | null, names: string[]): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    for (const name of names) {
      const value = url.searchParams.get(name)?.trim();
      if (value) return value;
    }
  } catch {}
  return null;
}

function googleAdsPathConversionId(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const pathname = new URL(rawUrl).pathname;
    const match = pathname.match(/\/pagead\/(?:conversion|viewthroughconversion)\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() || null : null;
  } catch {
    return null;
  }
}

function eventValue(event: Record<string, unknown>, names: string[]) {
  const params = event.params && typeof event.params === 'object' && !Array.isArray(event.params) ? event.params as Record<string, unknown> : {};
  for (const name of names) {
    const value = event[name] ?? params[name];
    const result = stringValue(value, 240);
    if (result) return result;
  }
  return null;
}

export function parameterHealth(vendor: string, eventName: string | null, params: Record<string, unknown> = {}, rawUrl: string | null = null) {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(params)) {
    const text = stringValue(value, 240);
    if (text) values.set(normalized(key), text);
  }
  try {
    if (rawUrl) for (const [key, value] of new URL(rawUrl).searchParams.entries()) if (value) values.set(normalized(key), value);
  } catch {}
  const pathConversionId = googleAdsPathConversionId(rawUrl);
  if (pathConversionId) values.set('conversion_id', pathConversionId);
  const normalizedVendor = normalized(vendor);
  const name = normalized(eventName);
  const requestText = `${name} ${normalized(rawUrl)}`;
  const isRemarketingBeacon = normalizedVendor === 'gads' && /(?:\/rmkt\/collect|viewthroughconversion|en=gtag\.config|gtag\.config)/.test(`${requestText} ${normalized(rawUrl)}`);
  const gadsConversion = normalizedVendor === 'gads' && !isRemarketingBeacon && /(?:^|[^a-z])conversion|purchase|sign[_ -]?up|lead|submit/i.test(requestText);
  const required = gadsConversion
    ? [['conversion_id', 'google_conversion_id', 'tid'], ['conversion_label', 'google_conversion_label', 'label', 'send_to']]
    : normalizedVendor === 'ga4' && name === 'purchase'
      ? [['currency', 'cu', 'ep.currency', 'epn.currency'], ['value', 'ep.value', 'epn.value'], ['transaction_id', 'transactionid', 'ep.transaction_id', 'epn.transaction_id']]
      : normalizedVendor === 'meta'
        ? [['id', 'pixel_id', 'pixelid'], ['ev', 'event', 'event_name']]
        : normalizedVendor === 'linkedin'
          ? [['pid', 'partner_id', 'partnerid']]
          : normalizedVendor === 'bing'
            ? [['ti', 'uet_tag_id', 'uetTagId', 'tag_id']]
            : normalizedVendor === 'snapchat'
              ? [['pid', 'pids', 'pixel_id', 'pixelId']]
              : [];
  if (!required.length) return { missingParameters: [], observedParameters: [], parameterStatus: 'not_applicable' as const };
  const observedParameters: string[] = [];
  const missingParameters: string[] = [];
  for (const aliases of required) {
    const found = aliases.find((alias) => values.has(alias) && values.get(alias));
    if (found) observedParameters.push(found);
    else missingParameters.push(aliases[0]);
  }
  return { missingParameters, observedParameters, parameterStatus: missingParameters.length ? 'missing' as const : 'complete' as const };
}

export async function refreshGtmSnapshotFreshness(limit = 50) {
  const snapshots = await query(`SELECT DISTINCT ON (site_id, container_id) id, user_id, account_id, container_id, environment, snapshot_version_id, live_version_id FROM gtm_config_snapshots ORDER BY site_id, container_id, fetched_at DESC LIMIT $1`, [Math.max(1, Math.min(100, limit))]);
  let checked = 0;
  let updated = 0;
  for (const snapshot of snapshots.rows) {
    try {
      const connection = await getConnection(snapshot.user_id);
      if (!connection) continue;
      const token = await getAccessToken(connection);
      const live = await gtmRequest<{ containerVersion?: { versionId?: string; name?: string; updateTime?: string } }>(`accounts/${encodeURIComponent(snapshot.account_id)}/containers/${encodeURIComponent(snapshot.container_id)}/versions/live`, token);
      const version = live.containerVersion || {};
      const liveVersionId = stringValue(version.versionId, 120);
      const stale = snapshot.environment !== 'live' || Boolean(snapshot.snapshot_version_id && liveVersionId && snapshot.snapshot_version_id !== liveVersionId);
      await query(`UPDATE gtm_config_snapshots SET live_version_id=$2, live_version_name=$3, live_version_updated_at=$4::timestamptz, snapshot_stale=$5 WHERE id=$1`, [snapshot.id, liveVersionId, stringValue(version.name, 240), version.updateTime || null, stale]);
      checked += 1;
      updated += 1;
    } catch (error) {
      console.warn('GTM snapshot freshness check skipped:', error instanceof Error ? error.message : 'provider error');
    }
  }
  return { checked, updated, attempted: snapshots.rows.length };
}

export function correlateEventWithGtm(event: Record<string, unknown>, inventory: GtmInventory | null): EventEnrichment {
  const health = parameterHealth(String(event.vendor || ''), stringValue(event.eventName, 120), event.params && typeof event.params === 'object' && !Array.isArray(event.params) ? event.params as Record<string, unknown> : {}, stringValue(event.rawUrl, 2048));
  if (!inventory) return { tagId: null, tagName: null, triggerName: null, workspaceId: null, confidence: 'unmatched', ...health };
  const vendor = normalized(event.vendor);
  const eventName = normalized(event.eventName);
  const eventParams = event.params && typeof event.params === 'object' && !Array.isArray(event.params) ? event.params as Record<string, unknown> : {};
  const measurementId = normalized(event.measurementId || eventParams.tid || eventParams.measurement_id);
  const conversionId = normalized(eventParams.conversion_id || eventParams.google_conversion_id || eventParams.tid || googleAdsPathConversionId(stringValue(event.rawUrl, 2048)));
  const conversionLabel = normalized(eventParams.conversion_label || eventParams.google_conversion_label || eventParams.label || urlParameter(stringValue(event.rawUrl, 2048), ['conversion_label', 'google_conversion_label', 'label', 'send_to']));
  const platformId = vendor === 'meta'
    ? normalized(eventParams.id || eventParams.pixel_id || eventParams.pixelId || urlParameter(stringValue(event.rawUrl, 2048), ['id', 'pixel_id', 'pixelId']))
    : vendor === 'linkedin'
      ? normalized(eventParams.pid || eventParams.partner_id || eventParams.partnerId || urlParameter(stringValue(event.rawUrl, 2048), ['pid', 'partner_id', 'partnerId']))
      : vendor === 'bing'
        ? normalized(eventParams.ti || eventParams.uet_tag_id || eventParams.uetTagId || eventParams.tag_id)
        : vendor === 'snapchat'
          ? normalized(eventParams.pid || eventParams.pids || eventParams.pixel_id || eventParams.pixelId)
          : '';
  const candidates = inventory.tags.map((tag) => {
    let score = 0;
    const tagType = tagVendor(tag);
    if (tagType === vendor) score += 4;
    else if (tagType !== 'other') return { tag, score: -1 };
    const isRemarketingRequest = vendor === 'gads' && /(?:\/rmkt\/collect|viewthroughconversion|en=gtag\.config|gtag\.config)/.test(`${eventName} ${normalized(stringValue(event.rawUrl, 2048))}`);
    if (isRemarketingRequest && normalized(tag.type) === 'sp') score += 6;
    if (isRemarketingRequest && normalized(tag.type) !== 'sp') return { tag, score: -1 };
    const eventMatch = Boolean(eventName && (containsEventName(tag.eventName, eventName) || triggerMatchesEvent(inventory, tag, eventName)));
    const baseEventPlatformMatch = Boolean(eventName && isBaseEvent(vendor, eventName) && platformId && normalized(tag.platformId) === platformId);
    if (vendor === 'ga4' && !eventMatch) return { tag, score: -1 };
    if (vendor !== 'gads' && !isBaseEvent(vendor, eventName) && !eventMatch) return { tag, score: -1 };
    if (eventMatch) score += 5;
    if (baseEventPlatformMatch) score += 4;
    if (vendor === 'ga4' && measurementId && normalized(tag.measurementId) === measurementId) score += 3;
    if (vendor === 'gads' && conversionId && normalized(tag.conversionId) === conversionId) score += 4;
    if (vendor === 'gads' && conversionLabel && normalized(tag.conversionLabel) === conversionLabel) score += 4;
    if (vendor === 'gads' && tag.sendTo && conversionLabel && normalized(tag.sendTo).includes(conversionLabel)) score += 2;
    if ((vendor === 'meta' || vendor === 'linkedin' || vendor === 'bing' || vendor === 'snapchat') && platformId && normalized(tag.platformId) === platformId && !baseEventPlatformMatch) score += 2;
    if (tag.firingTriggerIds.length) score += 1;
    return { tag, score, eventMatch, baseEventPlatformMatch };
  }).filter((candidate) => candidate.score >= 5).sort((a, b) => b.score - a.score);
  if (!candidates.length) return { tagId: null, tagName: null, triggerName: null, workspaceId: inventory.workspaceId, confidence: 'unmatched', ...health };
  const best = candidates[0];
  const tied = candidates.filter((candidate) => candidate.score === best.score);
  const triggerIds = best.tag.firingTriggerIds;
  const triggerName = inventory.triggers.find((trigger) => triggerIds.includes(trigger.triggerId))?.name || null;
  const exactPlatformMatch = Boolean(platformId && normalized(best.tag.platformId) === platformId);
  const exactEventMatch = Boolean((best as { eventMatch?: boolean }).eventMatch);
  const baseEventMatch = Boolean((best as { baseEventPlatformMatch?: boolean }).baseEventPlatformMatch);
  const baseConfidence = tied.length > 1 ? 'ambiguous' : exactEventMatch || baseEventMatch || (vendor === 'gads' && (exactPlatformMatch || best.score >= 8)) ? 'configuration_match' : 'likely_match';
  const confidence = inventory.snapshotStale && baseConfidence === 'configuration_match' ? 'likely_match' : baseConfidence;
  return {
    tagId: tied.length === 1 ? best.tag.tagId : null,
    tagName: tied.length === 1 ? best.tag.name : null,
    triggerName: tied.length === 1 ? triggerName : null,
    workspaceId: inventory.workspaceId,
    confidence,
    ...health,
  };
}
