/**
 * One co-op live room (協力ライブ), as in Project SEKAI's マルチライブ: up to 5 players, a 5-digit room
 * ID, the host locks the members, everyone picks a song (one pick is drawn), each player picks a
 * difficulty of that song, the live is played together with everyone's score shown, and a FEVER
 * CHANCE / SUPER FEVER is decided for the team. The protocol is in proto/sekai/multiplay/v1.
 *
 * No I/O here: time, randomness, timers and chart lookups come from `RoomDeps`, connections are
 * `RoomConnection`s. Everything runs on the event loop, so there is no locking; after every await the
 * code checks that the room is still in the round and phase it started in.
 */
import type { PlayableChart } from '@/lib/charts';
import type { Award } from './proto/sekai/multiplay/v1/Award';
import type { ChartInfo } from './proto/sekai/multiplay/v1/ChartInfo';
import type { FeverKind } from './proto/sekai/multiplay/v1/FeverKind';
import type { FeverReport__Output } from './proto/sekai/multiplay/v1/FeverReport';
import type { LiveResult } from './proto/sekai/multiplay/v1/LiveResult';
import type { Member } from './proto/sekai/multiplay/v1/Member';
import type { Phase__Output } from './proto/sekai/multiplay/v1/Phase';
import type { PlayerResult } from './proto/sekai/multiplay/v1/PlayerResult';
import type { PlayerStatus } from './proto/sekai/multiplay/v1/PlayerStatus';
import type { Room as RoomMessage } from './proto/sekai/multiplay/v1/Room';
import type { ServerMessage } from './proto/sekai/multiplay/v1/ServerMessage';

export const PROTOCOL = 1;

export interface RoomTimings {
  maxMembers: number;
  /** Fewest players a round needs (the original: 2). */
  minPlayers: number;
  /** A public room locks its members by itself this long after it has `minPlayers`. */
  lobbyCountdownMs: number;
  songSelectMs: number;
  songDrawMs: number;
  difficultyMs: number;
  loadingMs: number;
  /** A live ends for everyone this long after the first player finished. */
  finishGraceMs: number;
  /** FEVER is decided once every player reported, or this long after the first report. */
  feverWaitMs: number;
  resultMs: number;
  /** A dropped player keeps its place this long (PLAYER_TTL_SEC in the original). */
  reconnectGraceMs: number;
  statusIntervalMs: number;
  stampIntervalMs: number;
  /** No live is longer than this; a round still playing then is ended. */
  maxLiveMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  maxMembers: 5,
  minPlayers: 2,
  lobbyCountdownMs: 30_000,
  songSelectMs: 20_000,
  songDrawMs: 3_000,
  difficultyMs: 10_000,
  loadingMs: 90_000,
  finishGraceMs: 30_000,
  feverWaitMs: 2_500,
  resultMs: 10_000,
  reconnectGraceMs: 10_000,
  statusIntervalMs: 250,
  stampIntervalMs: 1_000,
  maxLiveMs: 15 * 60_000,
};

/** FEVER: share of PERFECT + GREAT among the team's judged notes in FEVER CHANCE. */
export const FEVER_RATE = 0.7;
/** SUPER STAR instead of MVP when the top score is this much above the second. */
export const SUPER_STAR_MARGIN = 1.3;
export const STAMP_COUNT = 16;

export interface ChartCatalog {
  get(ref: string): Promise<PlayableChart | null>;
  random(): Promise<PlayableChart | null>;
  ofSong(audioSha256: string): Promise<PlayableChart[]>;
}

export interface RoomDeps {
  now(): number;
  random(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  charts: ChartCatalog;
  timings: RoomTimings;
  log?(message: string): void;
}

export interface RoomConnection {
  send(message: ServerMessage): void;
  /** Sends `closed` and ends the stream. */
  close(code: string, message: string): void;
}

export interface Player {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

interface MemberState extends Player {
  slot: number;
  conn: RoomConnection | null;
  dropTimer: unknown;
  /** SONG_SELECT pick: undefined = none yet, null = おまかせ. */
  pick: PlayableChart | null | undefined;
  chartId: string;
  ready: boolean;
  loaded: boolean;
  playing: boolean;
  finished: boolean;
  failed: boolean;
  status: Required<PlayerStatus>;
  fever: FeverReport__Output | null;
  lastStampAt: number;
}

export class RoomError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const EMPTY_STATUS: Required<PlayerStatus> = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  life: 0,
  perfect: 0,
  great: 0,
  good: 0,
  bad: 0,
  miss: 0,
  musicTimeMs: 0,
};

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  return Math.min(max, Math.max(min, n));
}

/** Statuses come from clients: keep them in range so a broken client cannot break the results. */
export function sanitizeStatus(s: PlayerStatus | null | undefined): Required<PlayerStatus> {
  const big = 100_000_000;
  return {
    score: clampInt(s?.score, 0, big),
    combo: clampInt(s?.combo, 0, 100_000),
    maxCombo: clampInt(s?.maxCombo, 0, 100_000),
    life: clampInt(s?.life, 0, 100_000),
    perfect: clampInt(s?.perfect, 0, 100_000),
    great: clampInt(s?.great, 0, 100_000),
    good: clampInt(s?.good, 0, 100_000),
    bad: clampInt(s?.bad, 0, 100_000),
    miss: clampInt(s?.miss, 0, 100_000),
    musicTimeMs: clampInt(s?.musicTimeMs, 0, 60 * 60_000),
  };
}

export function chartInfo(c: PlayableChart): ChartInfo {
  return {
    id: c.id,
    numberId: c.numberId,
    title: c.title,
    difficulty: c.difficulty,
    playLevel: c.playLevel,
    jacketUrl: c.jacketUrl ?? '',
    audioSha256: c.audioSha256,
    composer: c.composer,
    uploader: c.uploader,
  };
}

/**
 * FEVER CHANCE outcome for the players' reports. `participants` is how many players were in the live
 * and connected; a missing report counts as a broken combo with nothing judged.
 */
export function decideFever(reports: FeverReport__Output[], participants: number): FeverKind {
  if (reports.length === 0) return 'NO_FEVER';
  const everyoneReported = reports.length >= participants;
  if (everyoneReported && participants >= 2 && reports.every((r) => r.comboKept)) return 'SUPER_FEVER';
  let judged = 0;
  let good = 0;
  for (const r of reports) {
    judged += Math.max(0, r.judged);
    good += Math.min(Math.max(0, r.perfectOrGreat), Math.max(0, r.judged));
  }
  return judged > 0 && good / judged >= FEVER_RATE ? 'FEVER' : 'NO_FEVER';
}

interface RankedEntry {
  userId: string;
  nickname: string;
  chartId: string;
  status: Required<PlayerStatus>;
  failed: boolean;
  disconnected: boolean;
}

/** Orders the players (score, then PERFECT, then max combo, then life) and gives MVP / SUPER STAR. */
export function rankResults(entries: RankedEntry[], round: number, fever: FeverKind): LiveResult {
  const sorted = [...entries].sort(
    (a, b) =>
      Number(a.disconnected) - Number(b.disconnected) ||
      b.status.score - a.status.score ||
      b.status.perfect - a.status.perfect ||
      b.status.maxCombo - a.status.maxCombo ||
      b.status.life - a.status.life,
  );
  const finishers = sorted.filter((e) => !e.disconnected);
  let topAward: Award = 'NO_AWARD';
  if (finishers.length >= 2 && finishers[0].status.score > 0) {
    topAward = finishers[0].status.score >= finishers[1].status.score * SUPER_STAR_MARGIN ? 'SUPER_STAR' : 'MVP';
  }
  const players: PlayerResult[] = sorted.map((e, i) => {
    const s = e.status;
    const fullCombo = !e.disconnected && s.good === 0 && s.bad === 0 && s.miss === 0 && s.perfect + s.great > 0;
    return {
      userId: e.userId,
      nickname: e.nickname,
      chartId: e.chartId,
      status: s,
      rank: i + 1,
      award: i === 0 && !e.disconnected ? topAward : 'NO_AWARD',
      failed: e.failed,
      disconnected: e.disconnected,
      fullCombo,
      allPerfect: fullCombo && s.great === 0,
    };
  });
  return {
    round,
    teamScore: entries.reduce((sum, e) => sum + e.status.score, 0),
    fever,
    players,
  };
}

export class Room {
  readonly members: MemberState[] = [];
  phase: Phase__Output = 'LOBBY';
  hostId = '';
  round = 0;
  closed = false;

  private deadline = 0;
  private phaseTimer: unknown = null;
  private statusTimer: unknown = null;
  private feverTimer: unknown = null;
  private finishTimer: unknown = null;
  private song: PlayableChart | null = null;
  private songPickedBy = '';
  private options: PlayableChart[] = [];
  private result: LiveResult | null = null;
  private fever: FeverKind = 'NO_FEVER';
  private feverDecided = false;
  private statusDirty = false;
  private flushQueued = false;
  private nextSlot = 0;

  constructor(
    readonly code: string,
    public isPublic: boolean,
    private readonly deps: RoomDeps,
    /** Called once the last member is gone. */
    private readonly onEmpty: (room: Room) => void,
  ) {}

  get size(): number {
    return this.members.length;
  }

  get isFull(): boolean {
    return this.members.length >= this.deps.timings.maxMembers;
  }

  has(userId: string): boolean {
    return this.members.some((m) => m.userId === userId);
  }

  /** Whether a quick match may put a new player here. */
  get acceptsQuickMatch(): boolean {
    return this.isPublic && !this.closed && this.phase === 'LOBBY' && !this.isFull;
  }

  private get t(): RoomTimings {
    return this.deps.timings;
  }

  private member(userId: string): MemberState {
    const m = this.members.find((x) => x.userId === userId);
    if (!m) throw new RoomError('NOT_IN_ROOM', '你不在这个房间里。');
    return m;
  }

  /* ---------- joining and leaving ---------- */

  /** Adds a player, or reattaches a member that dropped (or connected again from elsewhere). */
  join(player: Player, conn: RoomConnection): void {
    if (this.closed) throw new RoomError('ROOM_CLOSED', '房间已经解散。');
    const existing = this.members.find((m) => m.userId === player.userId);
    if (existing) {
      if (existing.conn && existing.conn !== conn) existing.conn.close('REPLACED', '这个账号在别处进入了房间。');
      if (existing.dropTimer) this.deps.clearTimeout(existing.dropTimer);
      existing.dropTimer = null;
      existing.conn = conn;
      existing.nickname = player.nickname;
      existing.avatarUrl = player.avatarUrl;
      this.changed();
      this.sendSnapshotTo(existing);
      return;
    }
    if (this.phase !== 'LOBBY') throw new RoomError('ROOM_BUSY', '这个房间正在进行中，请稍后再试。');
    if (this.isFull) throw new RoomError('ROOM_FULL', '房间已满。');
    this.members.push({
      ...player,
      slot: this.nextSlot++,
      conn,
      dropTimer: null,
      pick: undefined,
      chartId: '',
      ready: false,
      loaded: false,
      playing: false,
      finished: false,
      failed: false,
      status: { ...EMPTY_STATUS },
      fever: null,
      lastStampAt: 0,
    });
    if (!this.hostId) this.hostId = player.userId;
    this.updateLobbyCountdown();
    if (this.isPublic && this.isFull) this.startSongSelect();
    this.changed();
  }

  /** The member's stream ended without `leave`: keep its place for a while. */
  disconnected(userId: string, conn: RoomConnection): void {
    const m = this.members.find((x) => x.userId === userId);
    if (!m || m.conn !== conn) return;
    m.conn = null;
    m.dropTimer = this.deps.setTimeout(() => {
      m.dropTimer = null;
      if (!m.conn) this.drop(m);
    }, this.t.reconnectGraceMs);
    this.changed();
    this.afterPresenceChange();
  }

  leave(userId: string): void {
    const m = this.members.find((x) => x.userId === userId);
    if (!m) return;
    const conn = m.conn;
    m.conn = null;
    this.drop(m);
    conn?.close('LEFT', '已离开房间。');
  }

  kick(byUserId: string, userId: string): void {
    this.requireHost(byUserId);
    if (this.phase !== 'LOBBY') throw new RoomError('BAD_PHASE', '只能在等待时移出成员。');
    if (userId === byUserId) throw new RoomError('BAD_REQUEST', '不能移出自己。');
    const m = this.member(userId);
    const conn = m.conn;
    m.conn = null;
    this.drop(m);
    conn?.close('KICKED', '你被房主移出了房间。');
  }

  /** Removes a member for good, or, in a live, keeps it in the round as disconnected. */
  private drop(m: MemberState): void {
    if (m.dropTimer) this.deps.clearTimeout(m.dropTimer);
    m.dropTimer = null;
    if (this.phase === 'PLAYING' && m.playing) {
      // Stays listed (disconnected) until the result; see finishRound.
      this.changed();
      this.afterPresenceChange();
      return;
    }
    this.removeMember(m);
  }

  private removeMember(m: MemberState): void {
    const i = this.members.indexOf(m);
    if (i < 0) return;
    this.members.splice(i, 1);
    if (this.members.length === 0) {
      this.close();
      return;
    }
    if (this.hostId === m.userId) {
      const next = this.members.find((x) => x.conn) ?? this.members[0];
      this.hostId = next.userId;
    }
    this.updateLobbyCountdown();
    this.changed();
    this.afterPresenceChange();
  }

  /** Someone left or dropped: a phase that waits for everyone may be done now, or lack players. */
  private afterPresenceChange(): void {
    switch (this.phase) {
      case 'SONG_SELECT':
      case 'SONG_DRAW':
      case 'DIFFICULTY':
        if (this.members.filter((m) => m.conn).length < this.t.minPlayers) {
          this.backToLobby('NOT_ENOUGH_PLAYERS', '人数不足，回到房间。');
          return;
        }
        if (this.phase === 'SONG_SELECT') this.maybeEndSongSelect();
        if (this.phase === 'DIFFICULTY') this.maybeEndDifficulty();
        break;
      case 'LOADING':
        this.maybeStartLive();
        break;
      case 'PLAYING':
        this.maybeDecideFever();
        this.maybeFinishRound();
        break;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearPhaseTimer();
    this.stopStatusTimer();
    for (const timer of [this.feverTimer, this.finishTimer]) if (timer) this.deps.clearTimeout(timer);
    for (const m of this.members) {
      if (m.dropTimer) this.deps.clearTimeout(m.dropTimer);
      m.conn?.close('ROOM_CLOSED', '房间已经解散。');
    }
    this.members.length = 0;
    this.onEmpty(this);
  }

  /* ---------- host actions ---------- */

  private requireHost(userId: string): void {
    if (this.hostId !== userId) throw new RoomError('NOT_HOST', '只有房主可以这样做。');
  }

  openToPublic(userId: string): void {
    this.requireHost(userId);
    if (this.isPublic) return;
    this.isPublic = true;
    this.updateLobbyCountdown();
    this.changed();
  }

  /** メンバー決定. */
  lockMembers(userId: string): void {
    this.requireHost(userId);
    if (this.phase !== 'LOBBY') throw new RoomError('BAD_PHASE', '现在不能开始。');
    const present = this.members.filter((m) => m.conn).length;
    if (present < this.t.minPlayers) throw new RoomError('NOT_ENOUGH_PLAYERS', `至少需要 ${this.t.minPlayers} 人。`);
    this.startSongSelect();
  }

  private updateLobbyCountdown(): void {
    if (this.phase !== 'LOBBY') return;
    const enough = this.members.filter((m) => m.conn).length >= this.t.minPlayers;
    if (this.isPublic && enough) {
      if (!this.phaseTimer) this.setPhaseTimer(this.t.lobbyCountdownMs, () => this.startSongSelect());
    } else {
      this.clearPhaseTimer();
    }
  }

  /* ---------- phases ---------- */

  private setPhaseTimer(ms: number, fn: () => void): void {
    this.clearPhaseTimer();
    this.deadline = this.deps.now() + ms;
    this.phaseTimer = this.deps.setTimeout(() => {
      this.phaseTimer = null;
      this.deadline = 0;
      if (!this.closed) fn();
    }, ms);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) this.deps.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.deadline = 0;
  }

  private setPhase(phase: Phase__Output): void {
    this.phase = phase;
    this.changed();
  }

  private backToLobby(code: string, message: string): void {
    this.clearPhaseTimer();
    this.stopStatusTimer();
    for (const m of this.members) {
      m.playing = false;
      m.ready = false;
      m.loaded = false;
    }
    // Set the phase first: removing members below must not re-enter this round's phase handlers.
    this.setPhase('LOBBY');
    for (const m of [...this.members]) if (!m.conn && !m.dropTimer) this.removeMember(m);
    if (this.closed) return;
    this.updateLobbyCountdown();
    if (code) this.notice(code, message);
  }

  private startSongSelect(): void {
    if (this.closed) return;
    this.round++;
    this.result = null;
    this.song = null;
    this.songPickedBy = '';
    this.options = [];
    this.fever = 'NO_FEVER';
    this.feverDecided = false;
    for (const m of this.members) {
      m.pick = undefined;
      m.chartId = '';
      m.ready = false;
      m.loaded = false;
      m.playing = false;
      m.finished = false;
      m.failed = false;
      m.status = { ...EMPTY_STATUS };
      m.fever = null;
    }
    this.setPhase('SONG_SELECT');
    this.setPhaseTimer(this.t.songSelectMs, () => void this.drawSong());
  }

  async pickSong(userId: string, ref: string): Promise<void> {
    const m = this.member(userId);
    if (this.phase !== 'SONG_SELECT') throw new RoomError('BAD_PHASE', '现在不能选歌。');
    const round = this.round;
    let pick: PlayableChart | null = null;
    if (ref.trim()) {
      pick = await this.deps.charts.get(ref.trim());
      if (!pick) throw new RoomError('CHART_NOT_FOUND', '找不到这张谱面。');
    }
    if (this.round !== round || this.phase !== 'SONG_SELECT' || !this.has(userId)) return;
    m.pick = pick;
    this.changed();
    this.maybeEndSongSelect();
  }

  private maybeEndSongSelect(): void {
    const present = this.members.filter((m) => m.conn);
    if (present.length > 0 && present.every((m) => m.pick !== undefined)) void this.drawSong();
  }

  private drawing = false;

  /** Draws one pick (おまかせ: any chart) and lists the charts of that song. */
  private async drawSong(): Promise<void> {
    if (this.phase !== 'SONG_SELECT' || this.drawing) return;
    this.drawing = true;
    this.clearPhaseTimer();
    const round = this.round;
    try {
      const candidates = this.members.filter((m) => m.conn);
      for (const m of candidates) if (m.pick === undefined) m.pick = null;
      const winner = candidates[Math.floor(this.deps.random() * candidates.length)];
      let song = winner?.pick ?? null;
      let pickedBy = song ? winner.userId : '';
      if (!song) {
        song = await this.deps.charts.random();
        pickedBy = '';
      }
      if (this.round !== round || this.closed) return;
      if (!song) {
        this.backToLobby('NO_CHARTS', '网站上还没有可以游玩的谱面。');
        return;
      }
      let options = await this.deps.charts.ofSong(song.audioSha256);
      if (this.round !== round || this.closed) return;
      if (!options.some((c) => c.id === song.id)) options = [song, ...options];
      this.song = song;
      this.songPickedBy = pickedBy;
      this.options = options;
      for (const m of this.members) {
        const own = m.pick && options.some((c) => c.id === m.pick!.id) ? m.pick.id : song.id;
        m.chartId = own;
      }
      this.setPhase('SONG_DRAW');
      this.setPhaseTimer(this.t.songDrawMs, () => this.startDifficulty());
    } catch (err) {
      this.deps.log?.(`room ${this.code}: song draw failed: ${err instanceof Error ? err.message : String(err)}`);
      if (this.round === round && !this.closed) this.backToLobby('SERVER_ERROR', '抽选歌曲失败，请重试。');
    } finally {
      this.drawing = false;
    }
  }

  private startDifficulty(): void {
    this.setPhase('DIFFICULTY');
    this.setPhaseTimer(this.t.difficultyMs, () => this.startLoading());
    this.maybeEndDifficulty();
  }

  pickDifficulty(userId: string, chartId: string): void {
    const m = this.member(userId);
    if (this.phase !== 'SONG_DRAW' && this.phase !== 'DIFFICULTY') throw new RoomError('BAD_PHASE', '现在不能选难度。');
    if (!this.options.some((c) => c.id === chartId)) throw new RoomError('BAD_REQUEST', '这首歌没有这个难度。');
    if (m.ready) throw new RoomError('BAD_PHASE', '已经准备完毕。');
    m.chartId = chartId;
    this.changed();
  }

  setReady(userId: string, ready: boolean): void {
    const m = this.member(userId);
    if (this.phase !== 'DIFFICULTY' && this.phase !== 'SONG_DRAW') throw new RoomError('BAD_PHASE', '现在不能准备。');
    m.ready = ready;
    this.changed();
    this.maybeEndDifficulty();
  }

  private maybeEndDifficulty(): void {
    if (this.phase !== 'DIFFICULTY') return;
    const present = this.members.filter((m) => m.conn);
    if (present.length > 0 && present.every((m) => m.ready)) this.startLoading();
  }

  private startLoading(): void {
    if (this.phase !== 'DIFFICULTY') return;
    for (const m of this.members) {
      m.playing = m.conn !== null;
      m.ready = m.playing;
      m.loaded = false;
    }
    this.setPhase('LOADING');
    this.setPhaseTimer(this.t.loadingMs, () => {
      // Whoever has not loaded by now sits this round out.
      for (const m of this.members) if (m.playing && !m.loaded) m.playing = false;
      this.changed();
      this.maybeStartLive(true);
    });
  }

  loaded(userId: string, ok: boolean): void {
    const m = this.member(userId);
    if (this.phase !== 'LOADING' || !m.playing) return;
    if (ok) m.loaded = true;
    else m.playing = false;
    this.changed();
    this.maybeStartLive();
  }

  private maybeStartLive(timedOut = false): void {
    if (this.phase !== 'LOADING') return;
    const players = this.members.filter((m) => m.playing && m.conn);
    if (!timedOut && players.some((m) => !m.loaded)) return;
    const ready = players.filter((m) => m.loaded);
    if (ready.length === 0) {
      this.backToLobby('LOAD_FAILED', '没有人加载完成，回到房间。');
      return;
    }
    for (const m of this.members) if (m.playing && !m.loaded) m.playing = false;
    this.startLive();
  }

  private startLive(): void {
    this.setPhase('PLAYING');
    this.setPhaseTimer(this.t.maxLiveMs, () => this.finishRound());
    for (const m of this.members) if (m.playing) m.conn?.send({ startLive: { round: this.round } });
    this.statusTimer = this.deps.setInterval(() => this.flushStatuses(), this.t.statusIntervalMs);
  }

  private stopStatusTimer(): void {
    if (this.statusTimer) this.deps.clearInterval(this.statusTimer);
    this.statusTimer = null;
    if (this.feverTimer) this.deps.clearTimeout(this.feverTimer);
    this.feverTimer = null;
    if (this.finishTimer) this.deps.clearTimeout(this.finishTimer);
    this.finishTimer = null;
  }

  /* ---------- the live ---------- */

  status(userId: string, status: PlayerStatus | null | undefined): void {
    const m = this.member(userId);
    if (this.phase !== 'PLAYING' || !m.playing || m.finished) return;
    m.status = sanitizeStatus(status);
    this.statusDirty = true;
  }

  private flushStatuses(): void {
    if (!this.statusDirty) return;
    this.statusDirty = false;
    const members = this.members
      .filter((m) => m.playing)
      .map((m) => ({ userId: m.userId, status: m.status, connected: m.conn !== null, finished: m.finished }));
    this.broadcast({ statuses: { members } }, (m) => m.playing);
  }

  feverReport(userId: string, report: FeverReport__Output): void {
    const m = this.member(userId);
    if (this.phase !== 'PLAYING' || !m.playing || this.feverDecided || m.fever) return;
    m.fever = {
      judged: clampInt(report.judged, 0, 100_000),
      perfectOrGreat: clampInt(report.perfectOrGreat, 0, 100_000),
      comboKept: report.comboKept === true,
    };
    if (!this.feverTimer) this.feverTimer = this.deps.setTimeout(() => this.decideFever(), this.t.feverWaitMs);
    this.maybeDecideFever();
  }

  private maybeDecideFever(): void {
    if (this.phase !== 'PLAYING' || this.feverDecided) return;
    const players = this.members.filter((m) => m.playing && m.conn);
    if (players.length > 0 && players.every((m) => m.fever)) this.decideFever();
  }

  private decideFever(): void {
    if (this.phase !== 'PLAYING' || this.feverDecided) return;
    if (this.feverTimer) this.deps.clearTimeout(this.feverTimer);
    this.feverTimer = null;
    this.feverDecided = true;
    const players = this.members.filter((m) => m.playing && (m.conn || m.fever));
    const reports = players.map((m) => m.fever).filter((r): r is FeverReport__Output => r !== null);
    this.fever = decideFever(reports, players.length);
    this.broadcast({ fever: { kind: this.fever } }, (m) => m.playing);
  }

  finish(userId: string, final: PlayerStatus | null | undefined, failed: boolean): void {
    const m = this.member(userId);
    if (this.phase !== 'PLAYING' || !m.playing || m.finished) return;
    m.status = sanitizeStatus(final);
    m.failed = failed;
    m.finished = true;
    this.statusDirty = true;
    if (!this.finishTimer) this.finishTimer = this.deps.setTimeout(() => this.finishRound(), this.t.finishGraceMs);
    this.changed();
    this.maybeFinishRound();
  }

  private maybeFinishRound(): void {
    if (this.phase !== 'PLAYING') return;
    const players = this.members.filter((m) => m.playing && m.conn);
    if (players.every((m) => m.finished)) this.finishRound();
  }

  private finishRound(): void {
    if (this.phase !== 'PLAYING') return;
    this.flushStatuses();
    this.stopStatusTimer();
    const entries: RankedEntry[] = this.members
      .filter((m) => m.playing)
      .map((m) => ({
        userId: m.userId,
        nickname: m.nickname,
        chartId: m.chartId,
        status: m.status,
        failed: m.failed,
        disconnected: !m.finished,
      }));
    this.result = rankResults(entries, this.round, this.fever);
    for (const m of this.members) {
      m.playing = false;
      m.ready = false;
      m.loaded = false;
    }
    this.setPhase('RESULT');
    // Members that dropped during the live leave now; reconnecting ones (still in grace) stay.
    for (const m of [...this.members]) if (!m.conn && !m.dropTimer) this.removeMember(m);
    if (this.closed) return;
    this.setPhaseTimer(this.t.resultMs, () => {
      this.setPhase('LOBBY');
      this.updateLobbyCountdown();
    });
  }

  /* ---------- stamps ---------- */

  stamp(userId: string, stampId: number): void {
    const m = this.member(userId);
    if (!Number.isInteger(stampId) || stampId < 0 || stampId >= STAMP_COUNT) throw new RoomError('BAD_REQUEST', '没有这个贴图。');
    if (this.phase === 'PLAYING' && m.playing) return;
    const now = this.deps.now();
    if (now - m.lastStampAt < this.t.stampIntervalMs) return;
    m.lastStampAt = now;
    this.broadcast({ stamp: { userId, stampId } });
  }

  /* ---------- snapshots ---------- */

  private notice(code: string, message: string): void {
    this.broadcast({ notice: { code, message } });
  }

  private broadcast(message: ServerMessage, filter?: (m: MemberState) => boolean): void {
    for (const m of this.members) if (m.conn && (!filter || filter(m))) m.conn.send(message);
  }

  /** Coalesces changes made in one tick into one snapshot. */
  private changed(): void {
    if (this.flushQueued || this.closed) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      if (this.closed) return;
      const room = this.snapshot();
      this.broadcast({ room });
    });
  }

  private sendSnapshotTo(m: MemberState): void {
    m.conn?.send({ room: this.snapshot() });
  }

  snapshot(): RoomMessage {
    const revealPicks = this.phase !== 'SONG_SELECT' && this.phase !== 'LOBBY';
    const members: Member[] = this.members.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      avatarUrl: m.avatarUrl ?? '',
      slot: m.slot,
      connected: m.conn !== null,
      picked: m.pick !== undefined,
      pickedChartId: revealPicks && m.pick ? m.pick.id : '',
      chartId: m.chartId,
      ready: m.ready,
      loaded: m.loaded,
      playing: m.playing,
      finished: m.finished,
    }));
    return {
      code: this.code,
      public: this.isPublic,
      phase: this.phase,
      deadlineMs: this.deadline,
      serverTimeMs: this.deps.now(),
      hostId: this.hostId,
      members,
      maxMembers: this.t.maxMembers,
      round: this.round,
      song: this.song ? chartInfo(this.song) : null,
      songPickedBy: this.songPickedBy,
      difficultyOptions: this.options.map(chartInfo),
      result: this.result,
    };
  }
}
