import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';
import { rateLimit, requestKey } from '../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 2048;

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
function vendorsForSignal(method: string, blockedUrl: string) {
  const textValue = `${method} ${blockedUrl}`.toLowerCase();
  const vendors: string[] = [];
  if (/ga4|google-analytics|google-analytics\.com|collect/.test(textValue)) vendors.push('ga4');
  if (/googleadservices|googlesyndication|conversion/.test(textValue)) vendors.push('gads');
  if (/facebook|fbq|connect\.facebook/.test(textValue)) vendors.push('meta');
  if (/tiktok/.test(textValue)) vendors.push('tiktok');
  if (/linkedin|licdn/.test(textValue)) vendors.push('linkedin');
  if (/snapchat|snap\.licdn/.test(textValue)) vendors.push('snapchat');
  if (/pinterest|pintrk/.test(textValue)) vendors.push('pinterest');
  if (/reddit/.test(textValue)) vendors.push('reddit');
  return vendors;
}
function hostnameMatches(host: string | null, candidate: string | null) {
  if (!host || !candidate) return false;
  const normalized = candidate.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
  return host === normalized || host.endsWith(`.${normalized}`);
}
function requestHost(req: NextRequest) {
  try { const origin = req.headers.get('origin'); const referer = req.headers.get('referer'); return origin ? new URL(origin).hostname.toLowerCase() : referer ? new URL(referer).hostname.toLowerCase() : null; } catch { return null; }
}
function allowedOrigin(req: NextRequest, site: { domain: string; first_party_domain: string | null }) {
  const host = requestHost(req);
  if (!host) return true;
  return hostnameMatches(host, site.domain) || hostnameMatches(host, site.first_party_domain);
}

async function recordBlocked(req: NextRequest, values: { apiKey: string; method: string; eventName: string | null; pageUrl: string | null; blockedUrl: string | null; sessionId: string | null; signal: string | null }) {
  if (!/^[a-f0-9]{48,64}$/i.test(values.apiKey)) return json({ ok: false, error: 'Invalid telemetry credentials' }, 401);
  const siteResult = await query('SELECT id, domain, first_party_domain FROM sites WHERE api_key = $1 LIMIT 1', [values.apiKey]);
  const site = siteResult.rows[0];
  if (!site) return json({ ok: false, error: 'Invalid telemetry credentials' }, 401);
  if (!allowedOrigin(req, site)) return json({ ok: false, error: 'Telemetry origin is not registered for this site' }, 403);
  const method = text(values.method, 80).toLowerCase() || 'unknown';
  const eventName = text(values.eventName, 120) || null;
  const pageUrl = text(values.pageUrl || req.headers.get('referer'), MAX_TEXT) || null;
  const blockedUrl = text(values.blockedUrl, MAX_TEXT) || null;
  const blockedVendors = vendorsForSignal(method, blockedUrl || '');
  const signal = text(values.signal, 80) || method;
  const sessionId = text(values.sessionId, 128) || null;
  const dedupeKey = `${site.id}:${sessionId || clientIpHash(req)}:${method}:${eventName || ''}:${blockedUrl || ''}`;
  const limited = rateLimit(`blocked:${dedupeKey}`, 4, 60_000);
  if (!limited.allowed) return json({ ok: true, deduped: true });
  await query(
    `INSERT INTO adblock_events (site_id, detection_method, page_url, user_agent, ip_hash, blocked_vendors, session_id, blocked_url, event_name, signal)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
    [site.id, method, pageUrl, text(req.headers.get('user-agent'), 500), clientIpHash(req), JSON.stringify(blockedVendors), sessionId, blockedUrl, eventName, signal],
  );
  return json({ ok: true, deduped: false });
}
async function safeRecordBlocked(req: NextRequest, values: Parameters<typeof recordBlocked>[1]) {
  const limited = rateLimit(requestKey(req, 'blocked'), 240, 60_000);
  if (!limited.allowed) return json({ ok: false, error: 'Rate limit exceeded' }, 429, { 'Retry-After': String(limited.retryAfterSeconds) });
  try { return await recordBlocked(req, values); } catch (error) { console.error('blocked endpoint error:', error); return json({ ok: false, error: 'Unable to record detection' }, 500); }
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders() }); }
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return safeRecordBlocked(req, { apiKey: text(url.searchParams.get('k'), 128), method: text(url.searchParams.get('m'), 80) || 'unknown', eventName: text(url.searchParams.get('e'), 120) || null, pageUrl: text(url.searchParams.get('p'), MAX_TEXT) || null, blockedUrl: text(url.searchParams.get('u'), MAX_TEXT) || null, sessionId: text(url.searchParams.get('s'), 128) || null, signal: text(url.searchParams.get('r'), 80) || null });
}
export async function POST(req: NextRequest) {
  const url = new URL(req.url); let body: Record<string, unknown> = {};
  try { const raw = await req.text(); if (raw.length <= 16 * 1024 && raw.trim()) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed; } } catch {}
  return safeRecordBlocked(req, { apiKey: text(url.searchParams.get('k') || body.apiKey, 128), method: text(url.searchParams.get('m') || body.method, 80) || 'unknown', eventName: text(url.searchParams.get('e') || body.eventName, 120) || null, pageUrl: text(url.searchParams.get('p') || body.pageUrl, MAX_TEXT) || null, blockedUrl: text(url.searchParams.get('u') || body.blockedUrl, MAX_TEXT) || null, sessionId: text(url.searchParams.get('s') || body.sessionId, 128) || null, signal: text(url.searchParams.get('r') || body.signal, 80) || null });
}
