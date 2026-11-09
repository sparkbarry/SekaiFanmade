import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayableChart } from '@/lib/charts';
import type { ServerMessage } from './proto/sekai/multiplay/v1/ServerMessage';
import { DEFAULT_TIMINGS, decideFever, rankResults, sanitizeStatus, type RoomConnection, type RoomDeps } from './room';
import { RoomManager } from './rooms';

const SONG_A = 'a'.repeat(64);
const SONG_B = 'b'.repeat(64);

function chart(id: string, audioSha256: string, difficulty: PlayableChart['difficulty'], playLevel = 20): PlayableChart {
  return { id: id.padEnd(32, '0'), numberId: 1, title: id, difficulty, playLevel, jacketUrl: null, audioSha256, composer: '', uploader: 'u' };
}

const A_EXPERT = chart('a1', SONG_A, 'expert', 26);
const A_MASTER = chart('a2', SONG_A, 'master', 30);
const B_HARD = chart('b1', SONG_B, 'hard', 18);
const ALL = [A_EXPERT, A_MASTER, B_HARD];

class FakeConn implements RoomConnection {
  messages: ServerMessage[] = [];
  closed: { code: string; message: string } | null = null;
  send(message: ServerMessage) {
    this.messages.push(message);
  }
  close(code: string, message: string) {
    this.closed = { code, message };
  }
  get room() {
    return [...this.messages].reverse().find((m) => m.room)?.room ?? null;
  }
  of<K extends keyof ServerMessage>(kind: K) {
    return this.messages.filter((m) => m[kind]).map((m) => m[kind]!);
  }
}

let randomValue = 0;
function deps(overrides: Partial<RoomDeps['timings']> = {}): RoomDeps {
  return {
    now: () => Date.now(),
    random: () => randomValue,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
    charts: {
      get: async (ref) => ALL.find((c) => c.id === ref) ?? null,
      random: async () => B_HARD,
      ofSong: async (sha) => ALL.filter((c) => c.audioSha256 === sha),
    },
    timings: { ...DEFAULT_TIMINGS, ...overrides },
  };
}

const player = (n: number) => ({ userId: `user${n}`.padEnd(32, '0'), nickname: `P${n}`, avatarUrl: null });
const tick = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  randomValue = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

/** Two players in a private room, members locked, picks made, everyone ready and loaded. */
async function playingRoom(manager = new RoomManager(deps())) {
  const c1 = new FakeConn();
  const c2 = new FakeConn();
  const room = manager.join(player(1), { kind: 'private' }, c1);
  manager.join(player(2), { kind: 'code', code: room.code }, c2);
  room.lockMembers(player(1).userId);
  await room.pickSong(player(1).userId, A_EXPERT.id);
  await room.pickSong(player(2).userId, B_HARD.id);
  await tick();
  await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.songDrawMs);
  room.setReady(player(1).userId, true);
  room.setReady(player(2).userId, true);
  room.loaded(player(1).userId, true);
  room.loaded(player(2).userId, true);
  await tick();
  return { manager, room, c1, c2 };
}

describe('joining', () => {
  it('gives a private room a 5-digit code and makes the first player host', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, c1);
    await tick();
    expect(room.code).toMatch(/^\d{5}$/);
    expect(c1.room?.hostId).toBe(player(1).userId);
    expect(c1.room?.public).toBe(false);
  });

  it('quick match fills a waiting public room instead of opening another', async () => {
    const manager = new RoomManager(deps());
    const a = manager.join(player(1), { kind: 'quick' }, new FakeConn());
    const b = manager.join(player(2), { kind: 'quick' }, new FakeConn());
    expect(b).toBe(a);
    expect(manager.roomCount).toBe(1);
  });

  it('does not quick-match into private rooms', () => {
    const manager = new RoomManager(deps());
    const priv = manager.join(player(1), { kind: 'private' }, new FakeConn());
    const pub = manager.join(player(2), { kind: 'quick' }, new FakeConn());
    expect(pub).not.toBe(priv);
  });

  it('refuses a sixth player and a bad code', () => {
    const manager = new RoomManager(deps());
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    for (let i = 2; i <= 5; i++) manager.join(player(i), { kind: 'code', code: room.code }, new FakeConn());
    expect(() => manager.join(player(6), { kind: 'code', code: room.code }, new FakeConn())).toThrow(/房间已满/);
    expect(() => manager.join(player(6), { kind: 'code', code: '1234' }, new FakeConn())).toThrow(/5 位数字/);
  });

  it('locks a public room by itself after the countdown', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const room = manager.join(player(1), { kind: 'quick' }, c1);
    manager.join(player(2), { kind: 'quick' }, new FakeConn());
    await tick();
    expect(c1.room?.deadlineMs).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.lobbyCountdownMs);
    expect(room.phase).toBe('SONG_SELECT');
  });

  it('passes host on when the host leaves, and closes when empty', async () => {
    const manager = new RoomManager(deps());
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    manager.leave(player(1).userId);
    await tick();
    expect(c2.room?.hostId).toBe(player(2).userId);
    manager.leave(player(2).userId);
    expect(room.closed).toBe(true);
    expect(manager.roomCount).toBe(0);
  });

  it('only lets the host lock members, with enough players', () => {
    const manager = new RoomManager(deps());
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    expect(() => room.lockMembers(player(1).userId)).toThrow(/至少需要 2 人/);
    manager.join(player(2), { kind: 'code', code: room.code }, new FakeConn());
    expect(() => room.lockMembers(player(2).userId)).toThrow(/只有房主/);
    room.lockMembers(player(1).userId);
    expect(room.phase).toBe('SONG_SELECT');
  });

  it('keeps a dropped player for the grace period and lets it back in', async () => {
    const manager = new RoomManager(deps());
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    room.disconnected(player(2).userId, c2);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.reconnectGraceMs - 1);
    expect(room.has(player(2).userId)).toBe(true);
    const again = new FakeConn();
    manager.join(player(2), { kind: 'code', code: room.code }, again);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.reconnectGraceMs);
    expect(room.has(player(2).userId)).toBe(true);
    expect(again.room?.members?.find((m) => m.userId === player(2).userId)?.connected).toBe(true);
  });

  it('removes a dropped player after the grace period', async () => {
    const manager = new RoomManager(deps());
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    room.disconnected(player(2).userId, c2);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.reconnectGraceMs);
    expect(room.has(player(2).userId)).toBe(false);
  });
});

describe('a round', () => {
  it('hides picks until the draw, draws one, and lets each player pick a difficulty of that song', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, c1);
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    room.lockMembers(player(1).userId);
    await room.pickSong(player(1).userId, A_MASTER.id);
    await tick();
    expect(c2.room?.members?.[0].picked).toBe(true);
    expect(c2.room?.members?.[0].pickedChartId).toBe('');

    randomValue = 0; // player 1's pick wins
    await room.pickSong(player(2).userId, B_HARD.id);
    await tick();
    expect(room.phase).toBe('SONG_DRAW');
    const snap = c1.room!;
    expect(snap.song?.id).toBe(A_MASTER.id);
    expect(snap.songPickedBy).toBe(player(1).userId);
    expect(snap.difficultyOptions?.map((c) => c.id)).toEqual([A_EXPERT.id, A_MASTER.id]);
    // Player 1 keeps its own chart; player 2's pick was another song, so it gets the drawn one.
    expect(snap.members?.map((m) => m.chartId)).toEqual([A_MASTER.id, A_MASTER.id]);
    expect(snap.members?.[1].pickedChartId).toBe(B_HARD.id);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.songDrawMs);
    expect(room.phase).toBe('DIFFICULTY');
    room.pickDifficulty(player(2).userId, A_EXPERT.id);
    expect(() => room.pickDifficulty(player(2).userId, B_HARD.id)).toThrow(/没有这个难度/);
    room.setReady(player(1).userId, true);
    room.setReady(player(2).userId, true);
    expect(room.phase).toBe('LOADING');
    await tick();
    expect(c1.room?.members?.map((m) => m.chartId)).toEqual([A_MASTER.id, A_EXPERT.id]);
  });

  it('draws any chart when everyone leaves it to おまかせ', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, c1);
    manager.join(player(2), { kind: 'code', code: room.code }, new FakeConn());
    room.lockMembers(player(1).userId);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.songSelectMs);
    expect(room.phase).toBe('SONG_DRAW');
    await tick();
    expect(c1.room?.song?.id).toBe(B_HARD.id);
    expect(c1.room?.songPickedBy).toBe('');
  });

  it('rejects an unknown chart', async () => {
    const manager = new RoomManager(deps());
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    manager.join(player(2), { kind: 'code', code: room.code }, new FakeConn());
    room.lockMembers(player(1).userId);
    await expect(room.pickSong(player(1).userId, 'f'.repeat(32))).rejects.toThrow(/找不到/);
  });

  it('starts the live once everyone has loaded and drops players that did not load in time', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, c1);
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    room.lockMembers(player(1).userId);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.songSelectMs + DEFAULT_TIMINGS.songDrawMs + DEFAULT_TIMINGS.difficultyMs);
    expect(room.phase).toBe('LOADING');
    room.loaded(player(1).userId, true);
    expect(room.phase).toBe('LOADING');
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.loadingMs);
    expect(room.phase).toBe('PLAYING');
    expect(c1.of('startLive')).toHaveLength(1);
    expect(c2.of('startLive')).toHaveLength(0);
  });

  it('goes back to the lobby when too few players remain before the live', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, c1);
    manager.join(player(2), { kind: 'code', code: room.code }, new FakeConn());
    room.lockMembers(player(1).userId);
    manager.leave(player(2).userId);
    await tick();
    expect(room.phase).toBe('LOBBY');
    expect(c1.of('notice').map((n) => n.code)).toContain('NOT_ENOUGH_PLAYERS');
  });

  it('streams statuses, decides FEVER, and ranks the result', async () => {
    const { room, c1, c2 } = await playingRoom();
    expect(room.phase).toBe('PLAYING');
    room.status(player(1).userId, { score: 1000, combo: 10 });
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.statusIntervalMs);
    const statuses = c2.of('statuses');
    expect(statuses.at(-1)?.members?.find((m) => m.userId === player(1).userId)?.status?.score).toBe(1000);

    room.feverReport(player(1).userId, { judged: 50, perfectOrGreat: 50, comboKept: true });
    expect(c1.of('fever')).toHaveLength(0);
    room.feverReport(player(2).userId, { judged: 50, perfectOrGreat: 50, comboKept: true });
    expect(c1.of('fever')[0].kind).toBe('SUPER_FEVER');

    room.finish(player(1).userId, { score: 900_000, perfect: 500, maxCombo: 500, life: 1000 }, false);
    expect(room.phase).toBe('PLAYING');
    room.finish(player(2).userId, { score: 600_000, perfect: 300, maxCombo: 100, good: 3, life: 800 }, false);
    expect(room.phase).toBe('RESULT');
    await tick();
    const result = c2.room?.result;
    expect(result?.teamScore).toBe(1_500_000);
    expect(result?.fever).toBe('SUPER_FEVER');
    expect(result?.players?.map((p) => [p.rank, p.award])).toEqual([
      [1, 'SUPER_STAR'],
      [2, 'NO_AWARD'],
    ]);
    expect(result?.players?.[0].fullCombo).toBe(true);
    expect(result?.players?.[1].fullCombo).toBe(false);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.resultMs);
    expect(room.phase).toBe('LOBBY');
    await tick();
    expect(c1.room?.result?.round).toBe(1);
  });

  it('ends the live for a player who dropped and lists it as disconnected', async () => {
    const { room, c1, c2 } = await playingRoom();
    room.status(player(2).userId, { score: 5000 });
    room.disconnected(player(2).userId, c2);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.reconnectGraceMs);
    // Still listed while the live runs.
    expect(room.has(player(2).userId)).toBe(true);
    room.finish(player(1).userId, { score: 800_000 }, false);
    expect(room.phase).toBe('RESULT');
    await tick();
    const players = c1.room?.result?.players ?? [];
    expect(players.map((p) => [p.userId, p.disconnected])).toEqual([
      [player(1).userId, false],
      [player(2).userId, true],
    ]);
    expect(players[0].award).toBe('NO_AWARD');
    expect(room.has(player(2).userId)).toBe(false);
  });

  it('ends the live 30 s after the first finish even if someone never does', async () => {
    const { room } = await playingRoom();
    room.finish(player(1).userId, { score: 1 }, false);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMINGS.finishGraceMs);
    expect(room.phase).toBe('RESULT');
  });

  it('relays stamps, at most one a second per player', async () => {
    const manager = new RoomManager(deps());
    const c1 = new FakeConn();
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, c1);
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    room.stamp(player(1).userId, 3);
    room.stamp(player(1).userId, 4);
    expect(c2.of('stamp')).toEqual([{ userId: player(1).userId, stampId: 3 }]);
    expect(() => room.stamp(player(1).userId, 99)).toThrow();
  });

  it('lets the host kick in the lobby', async () => {
    const manager = new RoomManager(deps());
    const c2 = new FakeConn();
    const room = manager.join(player(1), { kind: 'private' }, new FakeConn());
    manager.join(player(2), { kind: 'code', code: room.code }, c2);
    room.kick(player(1).userId, player(2).userId);
    expect(c2.closed?.code).toBe('KICKED');
    expect(room.has(player(2).userId)).toBe(false);
  });
});

describe('decideFever', () => {
  it('is SUPER FEVER when two or more players all kept their combo', () => {
    expect(decideFever([{ judged: 10, perfectOrGreat: 10, comboKept: true }, { judged: 5, perfectOrGreat: 5, comboKept: true }], 2)).toBe('SUPER_FEVER');
  });
  it('is not SUPER FEVER alone or when a report is missing', () => {
    expect(decideFever([{ judged: 10, perfectOrGreat: 10, comboKept: true }], 1)).toBe('FEVER');
    expect(decideFever([{ judged: 10, perfectOrGreat: 10, comboKept: true }], 2)).toBe('FEVER');
  });
  it('needs 70 % PERFECT or GREAT for FEVER', () => {
    expect(decideFever([{ judged: 10, perfectOrGreat: 7, comboKept: false }, { judged: 10, perfectOrGreat: 7, comboKept: false }], 2)).toBe('FEVER');
    expect(decideFever([{ judged: 10, perfectOrGreat: 6, comboKept: false }, { judged: 10, perfectOrGreat: 7, comboKept: false }], 2)).toBe('NO_FEVER');
    expect(decideFever([], 2)).toBe('NO_FEVER');
  });
});

describe('rankResults', () => {
  const s = (score: number, extra = {}) => sanitizeStatus({ score, ...extra });
  it('gives MVP unless the top score is 30 % ahead', () => {
    const e = (id: string, score: number) => ({ userId: id, nickname: id, chartId: '', status: s(score), failed: false, disconnected: false });
    expect(rankResults([e('a', 100), e('b', 90)], 1, 'NO_FEVER').players?.[0].award).toBe('MVP');
    expect(rankResults([e('a', 130), e('b', 100)], 1, 'NO_FEVER').players?.[0].award).toBe('SUPER_STAR');
    expect(rankResults([e('a', 130)], 1, 'NO_FEVER').players?.[0].award).toBe('NO_AWARD');
  });
  it('breaks score ties by PERFECT count', () => {
    const a = { userId: 'a', nickname: 'a', chartId: '', status: s(100, { perfect: 1 }), failed: false, disconnected: false };
    const b = { userId: 'b', nickname: 'b', chartId: '', status: s(100, { perfect: 2 }), failed: false, disconnected: false };
    expect(rankResults([a, b], 1, 'NO_FEVER').players?.map((p) => p.userId)).toEqual(['b', 'a']);
  });
  it('clamps statuses from clients', () => {
    expect(sanitizeStatus({ score: -5, combo: 1e12, life: Number.NaN })).toMatchObject({ score: 0, combo: 100_000, life: 0 });
  });
});
