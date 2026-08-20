import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const TELEMETRY_PATHS = new Set(['/monitor.js', '/api/ingest', '/api/blocked', '/api/health']);

function hostname(value: string) { return value.toLowerCase().split(':')[0].replace(/\.$/, ''); }
function primaryHost() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return '';
  try { return hostname(new URL(configured).host); } catch { return ''; }
}
function securityHeaders(response: NextResponse, telemetry = false) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (!telemetry) {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  } else {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  return response;
}

async function validSession(token: string | undefined) {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!token || !secret || secret.length < 32) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'ga4fix', audience: 'ga4fix-app' });
    return Number.isSafeInteger(Number(payload.uid)) && Number(payload.uid) > 0 && typeof payload.email === 'string';
  } catch { return false; }
}

export async function proxy(req: NextRequest) {
  const upgrade = req.headers.get('upgrade')?.toLowerCase();
  if (upgrade) return securityHeaders(new NextResponse('WebSocket upgrades are not supported', { status: 400 }));

  const requestHost = hostname(req.headers.get('host') || '');
  const configuredHost = primaryHost();
  const isLocal = requestHost === 'localhost' || requestHost === '127.0.0.1' || requestHost === '::1';
  const isPrimary = isLocal || (!!configuredHost && requestHost === configuredHost);

  if (!isPrimary) {
    if (!TELEMETRY_PATHS.has(req.nextUrl.pathname)) return securityHeaders(new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }));
    return securityHeaders(NextResponse.next(), true);
  }

  const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (unsafeMethod && req.nextUrl.pathname.startsWith('/api/') && configuredHost) {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const suppliedOrigin = origin || (referer ? (() => { try { return new URL(referer).origin; } catch { return ''; } })() : '');
    if (suppliedOrigin && hostname(suppliedOrigin.replace(/^https?:\/\//, '')) !== configuredHost) return securityHeaders(new NextResponse('Cross-site request blocked', { status: 403 }));
  }

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    const session = req.cookies.get('g4f_session')?.value;
    if (!(await validSession(session))) {
      const login = new URL('/login', req.url);
      const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
      login.searchParams.set('next', next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
      return securityHeaders(NextResponse.redirect(login));
    }
  }
  return securityHeaders(NextResponse.next());
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
