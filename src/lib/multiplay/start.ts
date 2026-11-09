import 'server-only';
import { getPlayableChart, playableChartsOfSong, randomPlayableChart } from '@/lib/charts';
import { env } from '@/lib/env';
import { viewerFromToken } from '@/lib/game-auth';
import { AuthUnavailable } from '@/lib/session';
import { DEFAULT_TIMINGS } from './room';
import { AuthServiceDown, startMultiplayServer } from './server';

const state = globalThis as unknown as { sekaiMultiplay?: Promise<unknown> };

/** Starts the co-op live gRPC server once per process (instrumentation runs again on dev reloads). */
export function startMultiplay(): Promise<unknown> {
  const e = env();
  if (e.MULTIPLAY_GRPC_PORT === 0) return Promise.resolve();
  state.sekaiMultiplay ??= startMultiplayServer({
    host: e.MULTIPLAY_GRPC_HOST,
    port: e.MULTIPLAY_GRPC_PORT,
    deps: {
      charts: { get: getPlayableChart, random: randomPlayableChart, ofSong: (sha) => playableChartsOfSong(sha) },
      timings: { ...DEFAULT_TIMINGS, minPlayers: e.MULTIPLAY_MIN_PLAYERS },
      log: (m) => console.log(m),
    },
    authenticate: async (token) => {
      try {
        const viewer = await viewerFromToken(token);
        return viewer && { userId: viewer.id, nickname: viewer.nickname, avatarUrl: viewer.avatarUrl, banned: viewer.banned };
      } catch (err) {
        if (err instanceof AuthUnavailable) throw new AuthServiceDown();
        throw err;
      }
    },
  }).then(
    (s) => {
      console.log(`co-op live gRPC on ${e.MULTIPLAY_GRPC_HOST}:${s.port}`);
      return s;
    },
    (err) => {
      // The website keeps running without co-op; a later reload may try again.
      console.error('co-op live gRPC failed to start', err);
      state.sekaiMultiplay = undefined;
    },
  );
  return state.sekaiMultiplay;
}
