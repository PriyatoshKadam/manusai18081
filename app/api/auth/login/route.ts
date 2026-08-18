import { NextRequest, NextResponse } from 'next/server';
import { createSession, findUserByEmail, verifyPassword } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 320 || password.length > 128) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await createSession(Number(user.id), user.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('login error:', error);
    return NextResponse.json({ error: 'Unable to log in. Please try again.' }, { status: 500 });
  }
}
