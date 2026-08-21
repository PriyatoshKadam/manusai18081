import crypto from 'node:crypto';
import { query } from './db';

export const GTM_SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
];

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be configured before connecting GTM');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string) {
  const [ivText, tagText, dataText] = value.split('.');
  if (!ivText || !tagText || !dataText) throw new Error('Invalid encrypted GTM credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}

export function gtmRedirectUri(requestUrl?: string) {
  const configured = process.env.GTM_REDIRECT_URI?.trim();
  const requestFallback = process.env.NODE_ENV !== 'production' && requestUrl ? (() => {
    try { return new URL('/api/gtm/callback', requestUrl).toString(); } catch { return ''; }
  })() : '';
  const fallback = process.env.NEXT_PUBLIC_APP_URL?.trim() ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/gtm/callback` : '';
  const value = configured || requestFallback || fallback;
  if (!value) return '';
  try {
    const url = new URL(value);
    const allowedProtocols = process.env.NODE_ENV === 'production' ? ['https:'] : ['https:', 'http:'];
    if (!allowedProtocols.includes(url.protocol) || url.username || url.password || url.hash) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function buildGtmAuthorizationUrl(state: string, requestUrl?: string) {
  const clientId = process.env.GTM_CLIENT_ID?.trim();
  if (!clientId) throw new Error('GTM_CLIENT_ID is missing. Add the Google OAuth web-client ID to the deployed service environment.');
  if (!gtmRedirectUri(requestUrl)) throw new Error('GTM_REDIRECT_URI is invalid and NEXT_PUBLIC_APP_URL is not configured.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', gtmRedirectUri(requestUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', GTM_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export async function googleUserInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || 'Unable to read Google account information');
  return payload as { email?: string; sub?: string };
}

export async function exchangeCode(code: string, requestUrl?: string) {
  const clientId = process.env.GTM_CLIENT_ID?.trim();
  const clientSecret = process.env.GTM_CLIENT_SECRET?.trim();
  if (!clientId) throw new Error('GTM_CLIENT_ID is missing');
  if (!clientSecret) throw new Error('GTM_CLIENT_SECRET is missing');
  const redirectUri = gtmRedirectUri(requestUrl);
  if (!redirectUri) throw new Error('GTM redirect URI is invalid');
  const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const payload = await response.json();
  if (!response.ok || !payload.refresh_token) throw new Error(payload.error_description || 'Google did not return a refresh token');
  return payload as { refresh_token: string; access_token?: string; expires_in?: number };
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GTM_CLIENT_ID;
  const clientSecret = process.env.GTM_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GTM OAuth credentials are not configured');
  const body = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Unable to refresh Google access token');
  return payload.access_token as string;
}

export async function getConnection(userId: string | number) {
  const result = await query('SELECT id, user_id, google_email, refresh_token_encrypted, scope, created_at, updated_at FROM gtm_connections WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0] || null;
}

export async function getAccessToken(connection: { refresh_token_encrypted: string }) {
  return refreshAccessToken(decryptSecret(connection.refresh_token_encrypted));
}

export const GTM_MONITOR_TAG_NAME = 'GA4Fix – Real User Monitor';
export const GTM_MONITOR_TRIGGER_NAME = 'GA4Fix – All Pages';

export function monitorTagHtml(site: { id: number | string; api_key: string }, gtmContainerId?: string) {
  const origin = (process.env.NEXT_PUBLIC_MONITOR_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!origin) throw new Error('NEXT_PUBLIC_MONITOR_ORIGIN or NEXT_PUBLIC_APP_URL must be configured');
  const url = new URL('/monitor.js', origin);
  url.searchParams.set('v', '12.3');
  url.searchParams.set('apiKey', String(site.api_key));
  if (gtmContainerId) url.searchParams.set('gtmContainerId', String(gtmContainerId));
  return `<script src="${url.toString()}" async></script>`;
}

export function monitorTagPayload(site: { id: number | string; api_key: string }, triggerId: string, gtmContainerId?: string) {
  return {
    name: GTM_MONITOR_TAG_NAME,
    type: 'html',
    notes: 'Managed by GA4Fix. This tag observes analytics, GTM, consent, performance, and blocked-request evidence for the selected site.',
    parameter: [{ type: 'TEMPLATE', key: 'html', value: monitorTagHtml(site, gtmContainerId) }, { type: 'BOOLEAN', key: 'supportDocumentWrite', value: 'false' }],
    firingTriggerId: [triggerId],
    tagFiringOption: 'oncePerLoad',
  };
}

export function monitorTriggerPayload() {
  return { name: GTM_MONITOR_TRIGGER_NAME, type: 'pageview', notes: 'GA4Fix monitor trigger. Fires on every page view.' };
}

export async function gtmRequest<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${path.replace(/^\//, '')}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `GTM API request failed (${response.status})`);
  return payload as T;
}
