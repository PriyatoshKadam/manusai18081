import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';
import { rateLimit, requestKey } from '../../../lib/rate-limit';
import { classifyDeliveryMode } from '../../../lib/delivery';
import { redactTelemetryUrl } from '../../../lib/ingest-validation';
import { telemetryOriginAllowed } from '../../../lib/telemetry-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 2048;

type BlockerConfidence = 'confirmed' | 'likely' | 'telemetry_gap';

type Vendor = 'ga4' | 'gads' | 'meta' | 'tiktok' | 'linkedin' | 'snapchat' | 'pinterest' | 'reddit' | 'microsoft_ads';

const VENDOR_PATTERNS: Record<Vendor, RegExp[]> = {
  ga4: [/google-analytics/i, /analytics\.google/i, /googletagmanager/i, /\/g\/collect/i, /collect\?/i],
  gads: [/googleadservices/i, /googlesyndication/i, /doubleclick/i, /google\.com\/pagead/i, /conversion/i],
  meta: [/connect\.facebook/i, /facebook\.com\/tr/i, /facebook\.net/i, /fbq/i],
  tiktok: [/analytics\.tiktok/i, /business-api\.tiktok/i, /ttq/i, /tiktok/i],
  linkedin: [/snap\.licdn/i, /linkedin\.com\/insight/i, /linkedin/i],
  snapchat: [/sc-static/i, /tr\.snapchat/i, /snapchat/i],
  pinterest: [/ct\.pinterest/i, /pintrk/i, /pinterest/i],
  reddit: [/events\.reddit/i, /reddit\.com\/pixel/i, /rdt/i],
  microsoft_ads: [/bat\.bing/i, /clarity\.ms/i, /bing\.com\/action/i],
};

function corsHeaders(): Record<string, string> {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store', Vary: 'Origin' };
}
function json(data: unknown, status = 200, extra: Record<string, string> = {}) { return NextResponse.json(data, { status, headers: { ...corsHeaders(), ...extra } }); }
function text(value: unknown, max = MAX_TEXT) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function clientIp(req: NextRequest) { return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'; }
function clientIpHash(req: NextRequest) {
  const secret = process.env.IP_HASH_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('IP_HASH_SECRET must be configured');
  return crypto.createHmac('sha256', secret).update(clientIp(req)).digest('hex').slice(0, 32);
}

function vendorsForSignal(method: string, blockedUrl: string): Vendor[] {
  const haystack = `${method} ${blockedUrl}`.toLowerCase();
  const vendors = new Set<Vendor>();
  for (const [vendor, patterns] of Object.entries(VENDOR_PATTERNS) as [Vendor, RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(haystack))) vendors.add(vendor);
  }
  return [...vendors];
}

function classifyBlockerConfidence(method: string, signal: string, blockedUrl: string): BlockerConfidence {
  const haystack = `${method} ${signal} ${blockedUrl}`.toLowerCase();
  if (/err_blocked_by_client|blocked[_ -]?by[_ -]?client|net::err_blocked|aborterror.*blocked|blocked[_ -]?request/.test(haystack)) return 'confirmed';
  if (/adblock|ublock|uBlock|easylist|disconnect|privacy badger|tracker block|tracking protection/.test(haystack)) return 'confirmed';
  if (/probe.*blocked|request.*blocked|resource.*blocked/.test(haystack)) return 'likely';
  return 'telemetry_gap';
}

function requestHost(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    return origin ? new URL(origin).hostname.toLowerCase() : referer ? new URL(referer).hostname.toLowerCase() : null;
  } catch { return null; }
}
function allowedOrigin(req: NextRequest, site: { domain: string; first_party_domain: string | null }) {
  const host = requestHost(req);
  if (!host) return true;
  return telemetryOriginAllowed(host, site.domain, site.first_party_domain);
}

async function recordBlocked(req: NextRequest, values: {
  apiKey: string;
  method: string;
  eventName: string | null;
  pageUrl: string | null;
  blockedUrl: string | null;
  sessionId: string | null;
  signal: string | null;
}) {
  if (!/^[a-f0-9]{48,64}$/i.test(values.apiKey)) return json({ ok: false, error: 'Invalid telemetry credentials' }, 401);
  const siteResult = await query('SELECT id, domain, first_party_domain FROM sites WHERE api_key = $1 LIMIT 1', [values.apiKey]);
  const site = siteResult.rows[0];
  if (!site) return json({ ok: false, error: 'Invalid telemetry credentials' }, 401);
  if (!allowedOrigin(req, site)) return json({ ok: false, error: 'Telemetry origin is not registered for this site' }, 403);

  const method = text(values.method, 80).toLowerCase() || 'unknown';
  const eventName = text(values.eventName, 120) || null;
  const pageUrl = redactTelemetryUrl(text(values.pageUrl || req.headers.get('referer'), MAX_TEXT)) || null;
  const blockedUrl = redactTelemetryUrl(text(values.blockedUrl, MAX_TEXT)) || null;
  const signal = text(values.signal, 160) || method;
  const blockedVendors = vendorsForSignal(method, blockedUrl || '');
  const confidence = classifyBlockerConfidence(method, signal, blockedUrl || '');
  const deliveryMode = classifyDeliveryMode(blockedUrl, pageUrl, { ...site, appOrigin: process.env.NEXT_PUBLIC_APP_URL || null });
  const sessionId = text(values.sessionId, 128) || null;

  // A missing/unknown request is deliberately stored as a telemetry gap, not an ad-blocker finding.
  // Only explicit browser blocking evidence can become a confirmed blocker finding.
  const dedupeKey = `${site.id}:${sessionId || clientIpHash(req)}:${method}:${eventName || ''}:${blockedUrl || ''}:${signal}`;
  const limited = rateLimit(`blocked:${dedupeKey}`, 4, 60_000);
  if (!limited.allowed) return json({ ok: true, deduped: true });

  await query(
    `INSERT INTO adblock_events (site_id, detection_method, page_url, user_agent, ip_hash, blocked_vendors, confidence, session_id, blocked_url, event_name, signal, delivery_mode)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)`,
    [site.id, method, pageUrl, text(req.headers.get('user-agent'), 500), clientIpHash(req), JSON.stringify(blockedVendors), confidence, sessionId, blockedUrl, eventName, signal, deliveryMode],
  );

  return json({
    ok: true,
    deduped: false,
    confidence,
    vendors: blockedVendors,
    eventName,
    deliveryMode,
  });
}

async function safeRecordBlocked(req: NextRequest, values: Parameters<typeof recordBlocked>[1]) {
  const limited = rateLimit(requestKey(req, 'blocked'), 240, 60_000);
  if (!limited.allowed) return json({ ok: false, error: 'Rate limit exceeded' }, 429, { 'Retry-After': String(limited.retryAfterSeconds) });
  try { return await recordBlocked(req, values); } catch (error) { console.error('blocked endpoint error:', error); return json({ ok: false, error: 'Unable to record detection' }, 500); }
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders() }); }

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return safeRecordBlocked(req, {
    apiKey: text(url.searchParams.get('k'), 128),
    method: text(url.searchParams.get('m'), 80) || 'unknown',
    eventName: text(url.searchParams.get('e'), 120) || null,
    pageUrl: text(url.searchParams.get('p'), MAX_TEXT) || null,
    blockedUrl: text(url.searchParams.get('u'), MAX_TEXT) || null,
    sessionId: text(url.searchParams.get('s'), 128) || null,
    signal: text(url.searchParams.get('r'), 160) || null,
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length <= 16 * 1024 && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
    }
  } catch {}
  return safeRecordBlocked(req, {
    apiKey: text(url.searchParams.get('k') || body.apiKey, 128),
    method: text(url.searchParams.get('m') || body.method, 80) || 'unknown',
    eventName: text(url.searchParams.get('e') || body.eventName, 120) || null,
    pageUrl: text(url.searchParams.get('p') || body.pageUrl, MAX_TEXT) || null,
    blockedUrl: text(url.searchParams.get('u') || body.blockedUrl, MAX_TEXT) || null,
    sessionId: text(url.searchParams.get('s') || body.sessionId, 128) || null,
    signal: text(url.searchParams.get('r') || body.signal, 160) || null,
  });
}
