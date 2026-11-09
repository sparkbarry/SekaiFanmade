/**
 * The co-op live gRPC service (proto/sekai/multiplay/v1/multiplay.proto). It runs inside the website's
 * Node process (started from src/instrumentation.ts) on its own port, so it shares the game session
 * check and the database with /api/v1. Rooms are in memory.
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import type { ClientMessage__Output } from './proto/sekai/multiplay/v1/ClientMessage';
import type { MultiLiveHandlers } from './proto/sekai/multiplay/v1/MultiLive';
import type { ProtoGrpcType } from './proto/multiplay';
import type { ServerMessage } from './proto/sekai/multiplay/v1/ServerMessage';
import { PROTOCOL, Room, RoomError, type Player, type RoomConnection, type RoomDeps } from './room';
import { RoomManager, type JoinTarget } from './rooms';

export const PROTO_PATH = path.join(process.cwd(), 'proto', 'sekai', 'multiplay', 'v1', 'multiplay.proto');

/** Thrown by an Authenticator when the account service cannot be reached. */
export class AuthServiceDown extends Error {}

/** Game session (64 hex) → player, or null when the session is not valid. */
export type Authenticator = (token: string) => Promise<(Player & { banned?: boolean }) | null>;

const JOIN_TIMEOUT_MS = 15_000;
/** Messages per second a client may send on average; statuses come about 5 times a second. */
const MESSAGE_RATE = 40;

export function loadMultiplayPackage(): ProtoGrpcType {
  const definition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(definition) as unknown as ProtoGrpcType;
}

function bearer(metadata: grpc.Metadata): string | null {
  const value = metadata.get('authorization')[0];
  const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(typeof value === 'string' ? value.trim() : '');
  return match ? match[1].toLowerCase() : null;
}

function joinTarget(message: ClientMessage__Output): JoinTarget | null {
  const join = message.join;
  if (!join) return null;
  switch (join.target) {
    case 'quickMatch':
      return { kind: 'quick' };
    case 'createPrivate':
      return { kind: 'private' };
    case 'roomCode':
      return { kind: 'code', code: join.roomCode ?? '' };
    default:
      return null;
  }
}

export function createMultiplayService(manager: RoomManager, authenticate: Authenticator, log = console) {
  const handlers: MultiLiveHandlers = {
    Connect(call) {
      let ended = false;
      let player: Player | null = null;
      let room: Room | null = null;
      let joining = false;
      let tokens = MESSAGE_RATE;
      let refilledAt = Date.now();

      const fail = (code: grpc.status, details: string) => {
        if (ended) return;
        ended = true;
        clearTimeout(joinTimer);
        call.emit('error', { code, details, metadata: new grpc.Metadata() });
      };

      const conn: RoomConnection = {
        send(message: ServerMessage) {
          if (!ended) call.write(message);
        },
        close(code: string, message: string) {
          if (ended) return;
          call.write({ closed: { code, message } });
          ended = true;
          clearTimeout(joinTimer);
          room = null;
          call.end();
        },
      };

      const joinTimer = setTimeout(() => {
        if (!player) fail(grpc.status.DEADLINE_EXCEEDED, 'join was not sent');
      }, JOIN_TIMEOUT_MS);

      const token = bearer(call.metadata);
      if (!token) {
        fail(grpc.status.UNAUTHENTICATED, 'AUTH_REQUIRED');
        return;
      }
      const auth = authenticate(token).then(
        (user) => {
          if (!user) {
            fail(grpc.status.UNAUTHENTICATED, 'AUTH_REQUIRED');
            return null;
          }
          if (user.banned) {
            fail(grpc.status.PERMISSION_DENIED, 'BANNED');
            return null;
          }
          return { userId: user.userId, nickname: user.nickname, avatarUrl: user.avatarUrl } satisfies Player;
        },
        (err) => {
          if (!(err instanceof AuthServiceDown)) log.error('multiplay auth failed', err);
          fail(grpc.status.UNAVAILABLE, 'AUTH_UNAVAILABLE');
          return null;
        },
      );

      const notice = (err: unknown) => {
        if (err instanceof RoomError) {
          conn.send({ notice: { code: err.code, message: err.message } });
        } else {
          log.error('multiplay request failed', err);
          conn.send({ notice: { code: 'SERVER_ERROR', message: '服务器出错了。' } });
        }
      };

      const handle = async (message: ClientMessage__Output) => {
        if (ended) return;
        const now = Date.now();
        tokens = Math.min(MESSAGE_RATE, tokens + ((now - refilledAt) / 1000) * MESSAGE_RATE);
        refilledAt = now;
        if (--tokens < 0) {
          if (player) manager.roomOf(player.userId)?.disconnected(player.userId, conn);
          fail(grpc.status.RESOURCE_EXHAUSTED, 'TOO_MANY_MESSAGES');
          return;
        }

        if (!player) {
          const target = joinTarget(message);
          if (!target || joining) {
            fail(grpc.status.FAILED_PRECONDITION, 'the first message must be join');
            return;
          }
          joining = true;
          const who = await auth;
          if (!who || ended) return;
          try {
            room = manager.join(who, target, conn);
          } catch (err) {
            if (err instanceof RoomError) {
              conn.close(err.code, err.message);
            } else {
              log.error('multiplay join failed', err);
              fail(grpc.status.INTERNAL, 'SERVER_ERROR');
            }
            return;
          }
          player = who;
          clearTimeout(joinTimer);
          // Welcome goes out before the room snapshot, which is sent at the end of this tick.
          conn.send({ welcome: { userId: who.userId, nickname: who.nickname, protocol: PROTOCOL } });
          return;
        }

        const userId = player.userId;
        const current = room && !room.closed && room.has(userId) ? room : null;
        try {
          switch (message.kind) {
            case 'ping':
              conn.send({ pong: { clientTimeMs: message.ping?.clientTimeMs ?? 0, serverTimeMs: Date.now() } });
              return;
            case 'leave':
              manager.leave(userId);
              conn.close('LEFT', '已离开房间。');
              return;
            case 'join':
              throw new RoomError('BAD_REQUEST', '已经在房间里了。');
          }
          if (!current) {
            conn.close('NOT_IN_ROOM', '你已经不在房间里了。');
            return;
          }
          switch (message.kind) {
            case 'lockMembers':
              current.lockMembers(userId);
              break;
            case 'openRoom':
              current.openToPublic(userId);
              break;
            case 'kick':
              current.kick(userId, message.kick?.userId ?? '');
              break;
            case 'pickSong':
              await current.pickSong(userId, message.pickSong?.chart ?? '');
              break;
            case 'pickDifficulty':
              current.pickDifficulty(userId, message.pickDifficulty?.chartId ?? '');
              break;
            case 'setReady':
              current.setReady(userId, message.setReady?.ready ?? false);
              break;
            case 'loaded':
              current.loaded(userId, message.loaded?.ok ?? false);
              break;
            case 'status':
              current.status(userId, message.status);
              break;
            case 'feverReport':
              if (message.feverReport) current.feverReport(userId, message.feverReport);
              break;
            case 'finish':
              current.finish(userId, message.finish?.final, message.finish?.failed ?? false);
              break;
            case 'stamp':
              current.stamp(userId, message.stamp?.stampId ?? -1);
              break;
            default:
              throw new RoomError('BAD_REQUEST', '不认识的请求。');
          }
        } catch (err) {
          notice(err);
        }
      };

      // One message at a time, in order, even when one waits for the database.
      let queue = Promise.resolve();
      call.on('data', (message: ClientMessage__Output) => {
        queue = queue.then(() => handle(message)).catch((err) => log.error('multiplay message failed', err));
      });
      const gone = () => {
        clearTimeout(joinTimer);
        if (player && room) room.disconnected(player.userId, conn);
        room = null;
        if (!ended) {
          ended = true;
          try {
            call.end();
          } catch {
            // already closed
          }
        }
      };
      call.on('end', gone);
      call.on('cancelled', gone);
      call.on('error', () => gone());
    },
  };
  return handlers;
}

export interface MultiplayServerOptions {
  host: string;
  port: number;
  deps: Omit<RoomDeps, 'now' | 'random' | 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;
  authenticate: Authenticator;
}

export function realTimers(): Pick<RoomDeps, 'now' | 'random' | 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'> {
  return {
    now: () => Date.now(),
    random: () => Math.random(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
  };
}

/** Starts the server; resolves with it and the port it bound (useful with port 0 in tests). */
export async function startMultiplayServer(options: MultiplayServerOptions) {
  const pkg = loadMultiplayPackage();
  const manager = new RoomManager({ ...realTimers(), ...options.deps });
  const server = new grpc.Server({
    // Streams stay open for a whole session; pings keep NAT and proxies from dropping idle ones.
    'grpc.keepalive_time_ms': 30_000,
    'grpc.keepalive_timeout_ms': 10_000,
    'grpc.keepalive_permit_without_calls': 1,
    'grpc.http2.min_ping_interval_without_data_ms': 10_000,
    'grpc.max_receive_message_length': 64 * 1024,
  });
  server.addService(pkg.sekai.multiplay.v1.MultiLive.service, createMultiplayService(manager, options.authenticate));
  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync(`${options.host}:${options.port}`, grpc.ServerCredentials.createInsecure(), (err, bound) =>
      err ? reject(err) : resolve(bound),
    );
  });
  return { server, manager, port };
}
