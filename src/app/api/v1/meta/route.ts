import { NextResponse } from 'next/server';
import { DIFFICULTIES } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { PAGE_SIZE, SORTS } from '@/lib/charts';

export const dynamic = 'force-dynamic';

/** What a client needs to talk to this site: where to sign in and which service to trade the account token for. */
export async function GET() {
  const e = env();
  return NextResponse.json(
    {
      apiVersion: 1,
      sso: { issuer: e.SSO_ISSUER, service: e.SSO_CLIENT_ID },
      pageSize: PAGE_SIZE,
      sorts: SORTS,
      difficulties: DIFFICULTIES,
      // Co-op live (gRPC, proto/sekai/multiplay/v1). Null when this server does not run it.
      multiplay:
        e.MULTIPLAY_GRPC_PORT > 0
          ? { url: e.MULTIPLAY_PUBLIC_URL ?? e.APP_ORIGIN, protocol: 1, maxMembers: 5, minPlayers: e.MULTIPLAY_MIN_PLAYERS }
          : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
