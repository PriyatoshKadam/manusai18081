import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 2048;

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function vendorsForMethod(method: string) {
  const normalized = method.toLowerCase();
  if (normalized.includes('ga4') || normalized.includes('google_analytics')) return ['ga4'];
  if (normalized.includes('google_ads')) return ['gads'];
  if (normalized.includes('meta') || normalized.includes('facebook')) return ['meta'];
  if (normalized.includes('tiktok')) return ['tiktok'];
  return [];
}

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.headers.get('x-real-ip') || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

async function recordBlocked(req: NextRequest, values: { apiKey: string; method: string; eventName: string | null; pageUrl: string | null }) {
  if (!/^[a-f0-9]{48,64}$/i.test(values.apiKey)) return json({ ok: false, error: 'Invalid API key' }, 401);
  const siteResult = await query('SELECT id FROM sites WHERE api_key = $1 LIMIT 1', [values.apiKey]);
  const site = siteResult.rows[0];
  if (!site) return json({ ok: false, error: 'Invalid API key' }, 401);

  const method = text(values.method, 80).toLowerCase() || 'unknown';
  const eventName = text(values.eventName, 120) || null;
  const pageUrl = text(values.pageUrl || req.headers.get('referer'), MAX_TEXT) || null;
  const blockedVendors = vendorsForMethod(method);
  const storedMethod =
  eventName && method === 'ga4_event_blocked'
    ? `${method}:${eventName}`
    : method;

await query(
  `INSERT INTO adblock_events (
     site_id,
     detection_method,
     page_url,
     user_agent,
     ip_hash,
     blocked_vendors
   )
   VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
  [
    site.id,
    storedMethod,
    pageUrl,
    text(req.headers.get('user-agent'), 500),
    clientIp(req),
    JSON.stringify(blockedVendors),
  ]
);
  return json({ ok: true });
}

async function safeRecordBlocked(req: NextRequest, values: { apiKey: string; method: string; eventName: string | null; pageUrl: string | null }) {
  try {
    return await recordBlocked(req, values);
  } catch (error) {
    console.error('blocked endpoint error:', error);
    return json({ ok: false, error: 'Unable to record detection' }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return safeRecordBlocked(req, {
    apiKey: text(url.searchParams.get('k'), 128),
    method: text(url.searchParams.get('m'), 80) || 'unknown',
    eventName: text(url.searchParams.get('e'), 120) || null,
    pageUrl: null,
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
  } catch {
    // sendBeacon may send a non-JSON or empty body; query parameters remain valid.
  }
  return safeRecordBlocked(req, {
    apiKey: text(url.searchParams.get('k') || body.apiKey, 128),
    method: text(url.searchParams.get('m') || body.method, 80) || 'unknown',
    eventName: text(url.searchParams.get('e') || body.eventName, 120) || null,
    pageUrl: text(body.pageUrl, MAX_TEXT) || null,
  });
}
