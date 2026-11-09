import 'server-only';
import * as client from 'openid-client';
import { env } from '@/lib/env';

/**
 * OurTaiko SSO (https://sso.ourtaiko.org) as a plain OIDC provider: authorization
 * code + S256 PKCE, confidential client with HTTP Basic auth, scopes openid profile.
 */

let configPromise: Promise<client.Configuration> | undefined;

export function oidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const e = env();
    const issuer = new URL(e.SSO_ISSUER);
    const insecure = issuer.protocol === 'http:';
    const auth = client.ClientSecretBasic(e.SSO_CLIENT_SECRET);
    configPromise = client
      .discovery(
        issuer,
        e.SSO_CLIENT_ID,
        undefined,
        auth,
        insecure ? { execute: [client.allowInsecureRequests], timeout: 10 } : { timeout: 10 },
      )
      .then((discovered) => {
        // OurTaiko SSO's discovery document does not list its revocation endpoint (/o/revoke/).
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { supportsPKCE, ...meta } = discovered.serverMetadata();
        if (meta.revocation_endpoint) return discovered;
        const config = new client.Configuration(
          { ...meta, revocation_endpoint: new URL('/o/revoke/', issuer).href },
          e.SSO_CLIENT_ID,
          undefined,
          auth,
        );
        config.timeout = 10;
        if (insecure) client.allowInsecureRequests(config);
        return config;
      })
      .catch((err) => {
        configPromise = undefined;
        throw err;
      });
  }
  return configPromise;
}

export function redirectUri(): string {
  return `${env().APP_ORIGIN}/auth/callback`;
}

export interface SsoProfile {
  sub: string;
  nickname: string;
  picture: string | null;
}

export function profileFrom(claims: Record<string, unknown>): SsoProfile {
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  const nickname =
    (typeof claims.nickname === 'string' && claims.nickname.trim()) ||
    (typeof claims.preferred_username === 'string' && claims.preferred_username.trim()) ||
    '未命名用户';
  const picture = typeof claims.picture === 'string' && /^https:\/\//.test(claims.picture) ? claims.picture : null;
  return { sub, nickname, picture };
}

/** Thrown when SSO answered that the token is no longer valid (as opposed to being unreachable). */
export class SsoRejected extends Error {}

export function isRejection(err: unknown): boolean {
  if (err instanceof SsoRejected) return true;
  if (err instanceof client.ResponseBodyError) return err.error === 'invalid_grant' || err.status === 401;
  if (err instanceof client.WWWAuthenticateChallengeError) return err.status === 401;
  return false;
}
