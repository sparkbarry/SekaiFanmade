import 'server-only';
import { NextResponse } from 'next/server';
import { Conflict, NotFound, TooMany } from '@/lib/charts';
import { env } from '@/lib/env';
import { PackageError } from '@/lib/package';
import { AuthRequired, AuthUnavailable, Forbidden } from '@/lib/session';

export class BadRequest extends Error {}

export function errorStatus(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof AuthRequired) return { status: 401, code: 'AUTH_REQUIRED', message: err.message };
  if (err instanceof Forbidden) return { status: 403, code: 'FORBIDDEN', message: err.message || '没有权限。' };
  if (err instanceof NotFound) return { status: 404, code: 'NOT_FOUND', message: err.message || '不存在。' };
  if (err instanceof Conflict) return { status: 409, code: 'CONFLICT', message: err.message };
  if (err instanceof PackageError) return { status: 422, code: 'INVALID_PACKAGE', message: err.message };
  if (err instanceof BadRequest) return { status: 400, code: 'BAD_REQUEST', message: err.message };
  if (err instanceof TooMany) return { status: 429, code: 'RATE_LIMITED', message: err.message };
  if (err instanceof AuthUnavailable) return { status: 503, code: 'SSO_UNAVAILABLE', message: err.message };
  console.error(err);
  return { status: 500, code: 'INTERNAL', message: '服务器出错了，请稍后再试。' };
}

export function errorResponse(err: unknown) {
  const { status, code, message } = errorStatus(err);
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Cross-site request check for cookie-authenticated writes outside server actions. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== env().APP_ORIGIN) throw new Forbidden('请求来源不正确。');
}

/** Public URL of the current request (the container only sees the proxy's internal address). */
export function publicUrl(request: Request): URL {
  const internal = new URL(request.url);
  return new URL(internal.pathname + internal.search, env().APP_ORIGIN);
}
