import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { assertSameOrigin, errorResponse } from '@/lib/http';
import { logout } from '@/lib/session';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (err) {
    return errorResponse(err);
  }
  await logout();
  return NextResponse.redirect(new URL('/', env().APP_ORIGIN), 303);
}
