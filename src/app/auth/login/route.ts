import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { startLogin } from '@/lib/session';

export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get('next');
  try {
    return NextResponse.redirect(await startLogin(next ?? '/'), 303);
  } catch (err) {
    console.error('sso login start failed', err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL('/auth/error?reason=unavailable', env().APP_ORIGIN), 303);
  }
}
