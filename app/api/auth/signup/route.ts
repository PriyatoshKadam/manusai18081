import { NextRequest, NextResponse } from 'next/server';
import { createSession, createUser, findUserByEmail } from '../../../../lib/auth';

export const runtime = 'nodejs';

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return errorResponse('Enter a valid email address');
    if (password.length < 8 || password.length > 128) return errorResponse('Password must be between 8 and 128 characters');

    if (await findUserByEmail(email)) return errorResponse('Account already exists — try logging in', 409);
    const userId = await createUser(email, password, name || undefined);
    await createSession(userId, email);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') return errorResponse('Account already exists — try logging in', 409);
    console.error('signup error:', error);
    return errorResponse('Signup failed. Please try again.', 500);
  }
}
