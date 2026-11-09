import { randomInt } from 'node:crypto';
import { Room, RoomError, type Player, type RoomConnection, type RoomDeps } from './room';

/** Most rooms open at once; more would only come from a misbehaving client. */
const MAX_ROOMS = 2000;

export type JoinTarget = { kind: 'quick' } | { kind: 'private' } | { kind: 'code'; code: string };

/** All rooms of this server process. Rooms live in memory: a restart closes them. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly userRoom = new Map<string, Room>();

  constructor(private readonly deps: RoomDeps) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** The room the player is in, if any. */
  roomOf(userId: string): Room | undefined {
    const room = this.userRoom.get(userId);
    if (room && !room.closed && room.has(userId)) return room;
    this.userRoom.delete(userId);
    return undefined;
  }

  join(player: Player, target: JoinTarget, conn: RoomConnection): Room {
    const current = this.roomOf(player.userId);
    if (target.kind === 'code') {
      const code = target.code.trim();
      if (!/^\d{5}$/.test(code)) throw new RoomError('BAD_ROOM_CODE', '房间号是 5 位数字。');
      const room = this.rooms.get(code);
      if (!room || room.closed) throw new RoomError('ROOM_NOT_FOUND', '找不到这个房间。');
      if (current && current !== room) current.leave(player.userId);
      room.join(player, conn);
      this.userRoom.set(player.userId, room);
      return room;
    }
    if (current) current.leave(player.userId);
    let room: Room | undefined;
    if (target.kind === 'quick') {
      // The fullest waiting public room, so rooms fill up and start sooner.
      for (const r of this.rooms.values()) {
        if (r.acceptsQuickMatch && (!room || r.size > room.size)) room = r;
      }
    }
    room ??= this.create(target.kind === 'quick');
    room.join(player, conn);
    this.userRoom.set(player.userId, room);
    return room;
  }

  leave(userId: string): void {
    this.roomOf(userId)?.leave(userId);
    this.userRoom.delete(userId);
  }

  private create(isPublic: boolean): Room {
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError('SERVER_FULL', '服务器房间已满，请稍后再试。');
    let code = '';
    for (let i = 0; i < 100 && (!code || this.rooms.has(code)); i++) {
      code = String(randomInt(10000, 100000));
    }
    if (this.rooms.has(code)) throw new RoomError('SERVER_FULL', '服务器房间已满，请稍后再试。');
    const room = new Room(code, isPublic, this.deps, (r) => {
      if (this.rooms.get(r.code) === r) this.rooms.delete(r.code);
      for (const [user, ur] of this.userRoom) if (ur === r) this.userRoom.delete(user);
    });
    this.rooms.set(code, room);
    return room;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.close();
  }
}
