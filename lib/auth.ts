import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './db';

const COOKIE = 'g4f_session';
const MAX_AGE = 60 * 60 * 24 * 30;
const DEV_SECRET = 'dev_only_ga4fix_secret_replace_before_production_123456';

function getSecret() {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be configured in production');
    return new TextEncoder().encode(DEV_SECRET);
  }
  if (raw.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(raw);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number, email: string) {
  const token = await new SignJWT({ uid: userId, email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('ga4fix')
    .setAudience('ga4fix-app')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());

  cookies().set(COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE });
}

export async function getSession(): Promise<{ uid: number; email: string } | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: 'ga4fix',
      audience: 'ga4fix-app',
    });
    const uid = Number(payload.uid);
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!Number.isSafeInteger(uid) || uid <= 0 || !email) return null;
    return { uid, email };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<{ uid: number; email: string }> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

export function destroySession() {
  cookies().set(COOKIE, '', { ...cookieOptions(), maxAge: 0 });
}

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createUser(email: string, password: string, name?: string) {
  const hash = await hashPassword(password);
  const result = await query<{ id: number }>(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
    [email.toLowerCase().trim(), hash, name?.trim() || null]
  );
  return result.rows[0].id;
}

export async function findUserByEmail(email: string) {
  const result = await query(
    'SELECT id, email, password_hash, name FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}
