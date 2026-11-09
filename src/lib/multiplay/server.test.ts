import * as grpc from '@grpc/grpc-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlayableChart } from '@/lib/charts';
import type { ClientMessage } from './proto/sekai/multiplay/v1/ClientMessage';
import type { ServerMessage__Output } from './proto/sekai/multiplay/v1/ServerMessage';
import { DEFAULT_TIMINGS } from './room';
import { loadMultiplayPackage, startMultiplayServer } from './server';

const SONG = 'c'.repeat(64);
const EXPERT: PlayableChart = { id: 'e'.repeat(32), numberId: 7, title: 'Song', difficulty: 'expert', playLevel: 26, jacketUrl: null, audioSha256: SONG, composer: '', uploader: 'u' };
const MASTER: PlayableChart = { ...EXPERT, id: 'd'.repeat(32), difficulty: 'master', playLevel: 30 };

const tokens: Record<string, { userId: string; nickname: string }> = {
  ['1'.repeat(64)]: { userId: 'a'.repeat(32), nickname: 'Alice' },
  ['2'.repeat(64)]: { userId: 'b'.repeat(32), nickname: 'Bob' },
};

let server: grpc.Server;
let address = '';
const pkg = loadMultiplayPackage();

beforeAll(async () => {
  const started = await startMultiplayServer({
    host: '127.0.0.1',
    port: 0,
    deps: {
      charts: {
        get: async (ref) => [EXPERT, MASTER].find((c) => c.id === ref || String(c.numberId) === ref) ?? null,
        random: async () => EXPERT,
        ofSong: async () => [EXPERT, MASTER],
      },
      timings: { ...DEFAULT_TIMINGS, songDrawMs: 50, statusIntervalMs: 20, feverWaitMs: 200 },
    },
    authenticate: async (token) => {
      const user = tokens[token];
      return user ? { ...user, avatarUrl: null } : null;
    },
  });
  server = started.server;
  address = `127.0.0.1:${started.port}`;
});

afterAll(() => {
  server?.forceShutdown();
});

/** A test client: collects server messages and waits for one that matches. */
function connect(token: string | null) {
  const client = new pkg.sekai.multiplay.v1.MultiLive(address, grpc.credentials.createInsecure());
  const metadata = new grpc.Metadata();
  if (token) metadata.set('authorization', `Bearer ${token}`);
  const call = client.Connect(metadata);
  const received: ServerMessage__Output[] = [];
  const waiters: { test: (m: ServerMessage__Output) => boolean; resolve: (m: ServerMessage__Output) => void }[] = [];
  let error: grpc.ServiceError | null = null;
  let ended = false;
  const errorWaiters: ((e: grpc.ServiceError | null) => void)[] = [];
  call.on('data', (m: ServerMessage__Output) => {
    received.push(m);
    for (const w of [...waiters]) {
      if (w.test(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  call.on('error', (e: grpc.ServiceError) => {
    error = e;
    errorWaiters.forEach((f) => f(e));
  });
  call.on('end', () => {
    ended = true;
    errorWaiters.forEach((f) => f(null));
  });
  return {
    send: (m: ClientMessage) => call.write(m),
    received,
    next(test: (m: ServerMessage__Output) => boolean, ms = 3000) {
      const hit = received.find(test);
      if (hit) {
        received.splice(received.indexOf(hit), 1);
        return Promise.resolve(hit);
      }
      return new Promise<ServerMessage__Output>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), ms);
        waiters.push({
          test,
          resolve: (m) => {
            clearTimeout(timer);
            received.splice(received.indexOf(m), 1);
            resolve(m);
          },
        });
      });
    },
    finished() {
      return new Promise<grpc.ServiceError | null>((resolve) => (error || ended ? resolve(error) : errorWaiters.push(resolve)));
    },
    end: () => {
      call.end();
      client.close();
    },
  };
}

const roomIn = (phase: string) => (m: ServerMessage__Output) => m.room?.phase === phase;

describe('MultiLive.Connect', () => {
  it('refuses a stream without a valid game session', async () => {
    const c = connect('9'.repeat(64));
    c.send({ join: { quickMatch: {} } });
    const err = await c.finished();
    expect(err?.code).toBe(grpc.status.UNAUTHENTICATED);
  });

  it('plays a whole round between two players', async () => {
    const alice = connect('1'.repeat(64));
    alice.send({ join: { createPrivate: {}, protocol: 1 } });
    const welcome = await alice.next((m) => !!m.welcome);
    expect(welcome.welcome?.nickname).toBe('Alice');
    const lobby = await alice.next(roomIn('LOBBY'));
    const code = lobby.room!.code;
    expect(code).toMatch(/^\d{5}$/);

    const bob = connect('2'.repeat(64));
    bob.send({ join: { roomCode: code } });
    await bob.next((m) => m.room?.members.length === 2);

    // Bob is not the host.
    bob.send({ lockMembers: {} });
    expect((await bob.next((m) => !!m.notice)).notice?.code).toBe('NOT_HOST');

    alice.send({ lockMembers: {} });
    await alice.next(roomIn('SONG_SELECT'));
    alice.send({ pickSong: { chart: '7' } });
    bob.send({ pickSong: { chart: '' } });
    const draw = await bob.next(roomIn('SONG_DRAW'));
    expect(draw.room?.difficultyOptions.map((c) => c.difficulty)).toEqual(['expert', 'master']);

    await bob.next(roomIn('DIFFICULTY'));
    bob.send({ pickDifficulty: { chartId: MASTER.id } });
    alice.send({ setReady: { ready: true } });
    bob.send({ setReady: { ready: true } });
    const loading = await alice.next(roomIn('LOADING'));
    expect(loading.room?.members.map((m) => [m.nickname, m.chartId])).toEqual([
      ['Alice', EXPERT.id],
      ['Bob', MASTER.id],
    ]);

    alice.send({ loaded: { ok: true } });
    bob.send({ loaded: { ok: true } });
    expect((await alice.next((m) => !!m.startLive)).startLive?.round).toBe(1);
    await bob.next((m) => !!m.startLive);

    alice.send({ status: { score: 12345, combo: 50, life: 1000 } });
    const statuses = await bob.next((m) => !!m.statuses?.members.find((s) => s.status?.score === 12345));
    expect(statuses.statuses?.members).toHaveLength(2);

    alice.send({ feverReport: { judged: 40, perfectOrGreat: 40, comboKept: true } });
    bob.send({ feverReport: { judged: 40, perfectOrGreat: 30, comboKept: false } });
    expect((await alice.next((m) => !!m.fever)).fever?.kind).toBe('FEVER');

    alice.send({ finish: { final: { score: 950_000, perfect: 600, maxCombo: 700 } } });
    bob.send({ finish: { final: { score: 700_000, perfect: 400, maxCombo: 200, miss: 4 }, failed: false } });
    const result = await bob.next(roomIn('RESULT'));
    expect(Number(result.room?.result?.teamScore)).toBe(1_650_000);
    expect(result.room?.result?.players.map((p) => [p.nickname, p.rank, p.award])).toEqual([
      ['Alice', 1, 'SUPER_STAR'],
      ['Bob', 2, 'NO_AWARD'],
    ]);

    bob.send({ stamp: { stampId: 2 } });
    expect((await alice.next((m) => !!m.stamp)).stamp?.stampId).toBe(2);

    bob.send({ leave: {} });
    expect((await bob.next((m) => !!m.closed)).closed?.code).toBe('LEFT');
    await alice.next((m) => m.room?.members.length === 1);
    alice.end();
    bob.end();
  });
});
