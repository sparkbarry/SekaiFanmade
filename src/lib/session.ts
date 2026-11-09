import 'server-only';
import { eq, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import * as client from 'openid-client';
import { cache } from 'react';
import { seal, sha256Hex, randomToken, unseal } from '@/lib/crypto';
import { db, sessions, users } from '@/lib/db';
import { adminIds, env, isSecureOrigin } from '@/lib/env';
import { isRejection, oidcConfig, profileFrom, type SsoProfile } from '@/lib/oidc';

export interface Viewer {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  banned: boolean;
}

export class AuthUnavailable extends Error {
  constructor() {
    super('账号服务暂时不可用，请稍后再试。');
  }
}

export function sessionCookieName(): string {
  // __Host- needs Secure, so plain-HTTP loopback development uses a normal name.
  return isSecureOrigin() ? '__Host-sekai_session' : 'sekai_session';
}

export function loginCookieName(): string {
  return isSecureOrigin() ? '__Host-sekai_login' : 'sekai_login';
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isSecureOrigin(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

const tokenContext = (sessionId: string, kind: 'access' | 'refresh') => `session:${sessionId}:${kind}`;

/* ---------- login attempt (state / nonce / PKCE verifier, bound to this browser) ---------- */

interface LoginAttempt {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  createdAt: number;
}

const LOGIN_TTL_SECONDS = 600;

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/auth/')) return '/';
  return next.slice(0, 500);
}

export async function startLogin(next: string): Promise<URL> {
  const config = await oidcConfig();
  const attempt: LoginAttempt = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    verifier: client.randomPKCECodeVerifier(),
    next: safeNext(next),
    createdAt: Date.now(),
  };
  const jar = await cookies();
  jar.set(loginCookieName(), seal(JSON.stringify(attempt), 'login'), cookieOptions(LOGIN_TTL_SECONDS));
  return client.buildAuthorizationUrl(config, {
    redirect_uri: `${env().APP_ORIGIN}/auth/callback`,
    scope: 'openid profile',
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(attempt.verifier),
    code_challenge_method: 'S256',
  });
}

/** Consumes the login attempt cookie, exchanges the code, and opens a session. Returns where to go next. */
export async function finishLogin(callbackUrl: URL): Promise<string> {
  const jar = await cookies();
  const sealed = jar.get(loginCookieName())?.value;
  jar.delete(loginCookieName());
  const raw = sealed ? unseal(sealed, 'login') : null;
  const attempt = raw ? (JSON.parse(raw) as LoginAttempt) : null;
  if (!attempt || Date.now() - attempt.createdAt > LOGIN_TTL_SECONDS * 1000) {
    throw new Error('登录已过期，请重新登录。');
  }
  if (callbackUrl.searchParams.get('error')) {
    throw new Error('登录已取消。');
  }

  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: attempt.verifier,
    expectedState: attempt.state,
    expectedNonce: attempt.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error('SSO 没有返回用户身份。');
  const info = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
  const profile = profileFrom({ ...claims, ...info });

  await upsertUser(profile);
  await createSession(profile.sub, tokens);
  return attempt.next;
}

async function upsertUser(profile: SsoProfile) {
  await db()
    .insert(users)
    .values({ id: profile.sub, nickname: profile.nickname, avatarUrl: profile.picture })
    .onConflictDoUpdate({
      target: users.id,
      set: { nickname: profile.nickname, avatarUrl: profile.picture, lastSeenAt: new Date() },
    });
}

async function createSession(userId: string, tokens: client.TokenEndpointResponse) {
  const token = randomToken();
  const id = sha256Hex(token);
  const days = env().SESSION_DAYS;
  const now = Date.now();
  await db()
    .insert(sessions)
    .values({
      id,
      userId,
      accessToken: seal(tokens.access_token, tokenContext(id, 'access')),
      refreshToken: tokens.refresh_token ? seal(tokens.refresh_token, tokenContext(id, 'refresh')) : null,
      accessExpiresAt: new Date(now + (tokens.expires_in ?? 3600) * 1000),
      checkedAt: new Date(now),
      expiresAt: new Date(now + days * 86400_000),
    });
  // Drop this browser's previous session, if any, and expired sessions in general.
  const jar = await cookies();
  const previous = jar.get(sessionCookieName())?.value;
  if (previous) await db().delete(sessions).where(eq(sessions.id, sha256Hex(previous)));
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
  jar.set(sessionCookieName(), token, cookieOptions(days * 86400));
}

/* ---------- reading the session ---------- */

type SessionRow = typeof sessions.$inferSelect;

/**
 * Makes sure the session's SSO grant is still alive: refreshes the access token
 * when it is about to expire and asks UserInfo again every SESSION_RECHECK_SECONDS.
 * Returns false when SSO says the grant is gone; throws AuthUnavailable when SSO
 * cannot be reached.
 */
async function revalidate(sessionId: string): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [row] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for('update');
    if (!row) return false;
    const now = Date.now();
    if (now - row.checkedAt.getTime() < env().SESSION_RECHECK_SECONDS * 1000 && row.accessExpiresAt.getTime() > now) {
      return true; // another request already did it while we waited for the lock
    }
    try {
      const config = await oidcConfig();
      let access = unseal(row.accessToken, tokenContext(row.id, 'access'));
      let refresh = row.refreshToken ? unseal(row.refreshToken, tokenContext(row.id, 'refresh')) : null;
      let accessExpiresAt = row.accessExpiresAt;
      if (!access) return false;
      if (accessExpiresAt.getTime() - now < 60_000) {
        if (!refresh) return false;
        const renewed = await client.refreshTokenGrant(config, refresh);
        access = renewed.access_token;
        refresh = renewed.refresh_token ?? refresh;
        accessExpiresAt = new Date(now + (renewed.expires_in ?? 3600) * 1000);
      }
      const info = await client.fetchUserInfo(config, access, row.userId);
      const profile = profileFrom(info as Record<string, unknown>);
      await tx
        .update(sessions)
        .set({
          accessToken: seal(access, tokenContext(row.id, 'access')),
          refreshToken: refresh ? seal(refresh, tokenContext(row.id, 'refresh')) : null,
          accessExpiresAt,
          checkedAt: new Date(now),
        })
        .where(eq(sessions.id, row.id));
      await tx
        .update(users)
        .set({ nickname: profile.nickname, avatarUrl: profile.picture, lastSeenAt: new Date(now) })
        .where(eq(users.id, row.userId));
      return true;
    } catch (err) {
      if (isRejection(err)) return false;
      console.error('sso revalidation failed', err instanceof Error ? err.message : err);
      throw new AuthUnavailable();
    }
  });
}

async function loadSession(): Promise<{ row: SessionRow; user: typeof users.$inferSelect } | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  const id = sha256Hex(token);
  const [found] = await db()
    .select({ row: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!found) return null;
  if (found.row.expiresAt.getTime() <= Date.now()) {
    await db().delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return found;
}

function toViewer(user: typeof users.$inferSelect): Viewer {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    isAdmin: adminIds().has(user.id),
    banned: user.bannedAt !== null,
  };
}

/**
 * The signed-in user for rendering pages. If SSO is unreachable the last known
 * identity is shown; writes go through requireViewer, which does not allow that.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const found = await loadSession();
  if (!found) return null;
  const stale = Date.now() - found.row.checkedAt.getTime() >= env().SESSION_RECHECK_SECONDS * 1000;
  if (stale || found.row.accessExpiresAt.getTime() <= Date.now()) {
    try {
      if (!(await revalidate(found.row.id))) {
        await db().delete(sessions).where(eq(sessions.id, found.row.id));
        return null;
      }
      const [user] = await db().select().from(users).where(eq(users.id, found.user.id));
      return user ? toViewer(user) : null;
    } catch (err) {
      if (err instanceof AuthUnavailable) return toViewer(found.user);
      throw err;
    }
  }
  return toViewer(found.user);
});

export class AuthRequired extends Error {
  constructor() {
    super('请先登录。');
  }
}

export class Forbidden extends Error {}

/** For writes: a live, re-checked session or an error. */
export async function requireViewer(): Promise<Viewer> {
  const found = await loadSession();
  if (!found) throw new AuthRequired();
  const stale = Date.now() - found.row.checkedAt.getTime() >= env().SESSION_RECHECK_SECONDS * 1000;
  if (stale || found.row.accessExpiresAt.getTime() <= Date.now()) {
    if (!(await revalidate(found.row.id))) {
      await db().delete(sessions).where(eq(sessions.id, found.row.id));
      throw new AuthRequired();
    }
  }
  const [user] = await db().select().from(users).where(eq(users.id, found.user.id));
  if (!user) throw new AuthRequired();
  const viewer = toViewer(user);
  if (viewer.banned) throw new Forbidden('账号已被本站停用。');
  return viewer;
}

/** Ends this site's session and revokes its SSO tokens (best effort). Does not sign out of SSO. */
export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  jar.delete(sessionCookieName());
  if (!token) return;
  const id = sha256Hex(token);
  const [row] = await db().delete(sessions).where(eq(sessions.id, id)).returning();
  if (!row) return;
  try {
    const config = await oidcConfig();
    const refresh = row.refreshToken ? unseal(row.refreshToken, tokenContext(id, 'refresh')) : null;
    const access = unseal(row.accessToken, tokenContext(id, 'access'));
    if (refresh) await client.tokenRevocation(config, refresh, { token_type_hint: 'refresh_token' });
    if (access) await client.tokenRevocation(config, access, { token_type_hint: 'access_token' });
  } catch (err) {
    console.error('sso token revocation failed', err instanceof Error ? err.message : err);
  }
}
