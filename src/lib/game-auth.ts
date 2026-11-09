import 'server-only';
import { sha256Hex } from '@/lib/crypto';
import { db, users } from '@/lib/db';
import { adminIds, env } from '@/lib/env';
import { assertSameOrigin } from '@/lib/http';
import { AuthRequired, AuthUnavailable, Forbidden, getViewer, requireViewer, type Viewer } from '@/lib/session';

/**
 * Game sessions. OpenSekai signs in to OurTaiko SSO once (POST /api/v1/game/account/login on the
 * SSO), trades the account token for a game session of this site (POST /api/v1/game/tokens with
 * service = SSO_CLIENT_ID) and sends it as `Authorization: Bearer <64 hex>`. This site checks it
 * with SSO's internal introspect using its own Application ID and secret.
 */

interface Cached {
  viewer: Viewer;
  until: number;
}

const CACHE_MS = 30_000;
const cache = new Map<string, Cached>();

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim());
  return match ? match[1].toLowerCase() : null;
}

interface IntrospectUser {
  id: string;
  nickname?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

async function introspect(token: string): Promise<IntrospectUser | null> {
  const e = env();
  let response: Response;
  try {
    response = await fetch(new URL('/internal/v1/game/introspect', e.SSO_ISSUER), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-ID': e.SSO_CLIENT_ID,
        'X-Service-Key': e.SSO_CLIENT_SECRET,
      },
      body: JSON.stringify({ accessToken: token }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('sso introspect unreachable', err instanceof Error ? err.message : err);
    throw new AuthUnavailable();
  }
  if (response.status === 401) return null;
  if (!response.ok) {
    console.error('sso introspect failed', response.status);
    throw new AuthUnavailable();
  }
  const body = (await response.json()) as { user?: IntrospectUser };
  return body.user && /^[0-9a-f]{32}$/.test(body.user.id) ? body.user : null;
}

/** The user behind a game session (cached for 30 s), or null. Throws AuthUnavailable when SSO is down. */
export async function viewerFromToken(token: string): Promise<Viewer | null> {
  const key = sha256Hex(token);
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.viewer;
  const user = await introspect(token);
  if (!user) {
    cache.delete(key);
    return null;
  }
  const nickname = user.nickname?.trim() || '未命名用户';
  const avatar = user.avatarUrl && /^https:\/\//.test(user.avatarUrl) ? user.avatarUrl : null;
  const [row] = await db()
    .insert(users)
    .values({ id: user.id, nickname, avatarUrl: avatar })
    .onConflictDoUpdate({ target: users.id, set: { nickname, avatarUrl: avatar, lastSeenAt: new Date() } })
    .returning();
  const viewer: Viewer = {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    isAdmin: adminIds().has(row.id) || user.isAdmin === true,
    banned: row.bannedAt !== null,
  };
  if (cache.size > 5000) cache.clear();
  cache.set(key, { viewer, until: Date.now() + CACHE_MS });
  return viewer;
}

/** The signed-in user for an API read: a game Bearer token, else the website cookie. */
export async function apiViewer(request: Request): Promise<Viewer | null> {
  const token = bearer(request);
  if (token) {
    try {
      return await viewerFromToken(token);
    } catch (err) {
      if (err instanceof AuthUnavailable) return null;
      throw err;
    }
  }
  return getViewer();
}

/** For API writes: a valid game token, or a website session from this origin. */
export async function requireApiViewer(request: Request): Promise<Viewer> {
  const token = bearer(request);
  if (token) {
    const viewer = await viewerFromToken(token);
    if (!viewer) throw new AuthRequired();
    if (viewer.banned) throw new Forbidden('账号已被本站停用。');
    return viewer;
  }
  if (request.headers.get('authorization')) throw new AuthRequired();
  assertSameOrigin(request);
  return requireViewer();
}
