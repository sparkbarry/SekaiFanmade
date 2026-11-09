import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { publicUrl } from '@/lib/http';
import { finishLogin } from '@/lib/session';

export async function GET(request: Request) {
  const origin = env().APP_ORIGIN;
  try {
    const next = await finishLogin(publicUrl(request));
    return NextResponse.redirect(new URL(next, origin), 303);
  } catch (err) {
    console.error('sso callback failed', err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL('/auth/error', origin), 303);
  }
}
