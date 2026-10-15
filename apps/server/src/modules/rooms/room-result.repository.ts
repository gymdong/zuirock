import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { KstDay, OwnerRef, RoomSettings, RoomStatus } from '@zuirock/shared';
import { PrismaService } from '../../common/prisma.service.js';
import type { Tx } from '../../ports/index.js';

export interface BattleResultInput {
  roomSessionId: string;
  participantId: string;
  owner: OwnerRef;
  nickname: string;
  rank: number;
  score: number;
  correctCount: number;
  totalResponseMs: number;
  participantCount: number;
  left: boolean;
  memberKey: string;
  rematch: boolean;
  endedAt: Date;
  kstDay: KstDay;
}

/**
 * Persistent room records (Room, RoomSession, BattleResult). Live state stays in Redis; this is the
 * durable side that the result transaction and invites need.
 */
export interface RoomResultRepository {
  createRoom(input: { code: string; host: OwnerRef; settings: RoomSettings }): Promise<{ roomId: string }>;
  /** Best-effort status mirror of the live room. */
  updateRoomStatus(roomId: string, status: RoomStatus): Promise<void>;
  /** Idempotent on `id` (engine-generated). */
  createSession(input: {
    id: string;
    roomId: string;
    seq: number;
    settings: RoomSettings;
    questionIds: readonly string[];
    startedAt: Date;
  }): Promise<void>;
  /** Same member set finished a battle at or after `since` (rematch XP ×0.5, D6-4). */
  hasBattleSince(memberKey: string, since: Date): Promise<boolean>;
  /** Runs `fn` in one DB transaction; retried on transient connection errors (P1001/P1017, ≤ 3 tries). */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Inserts missing rows (idempotent on roomSessionId + participantId); returns participantId → BattleResult.id. */
  writeBattleResults(tx: Tx, rows: readonly BattleResultInput[]): Promise<Map<string, string>>;
  endSession(tx: Tx, sessionId: string, endedAt: Date): Promise<void>;
}

export const ROOM_RESULT_REPOSITORY = Symbol('RoomResultRepository');

const TRANSIENT = new Set(['P1001', 'P1017']);

function ownerColumns(owner: OwnerRef): { userId: string | null; guestId: string | null } {
  return owner.kind === 'user' ? { userId: owner.userId, guestId: null } : { userId: null, guestId: owner.guestId };
}

@Injectable()
export class PrismaRoomResultRepository implements RoomResultRepository {
  private readonly logger = new Logger(PrismaRoomResultRepository.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createRoom(input: { code: string; host: OwnerRef; settings: RoomSettings }): Promise<{ roomId: string }> {
    const owner = ownerColumns(input.host);
    const room = await this.prisma.room.create({
      data: {
        code: input.code,
        hostUserId: owner.userId,
        hostGuestId: owner.guestId,
        settings: input.settings as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { roomId: room.id };
  }

  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    const closed = status === 'finished' || status === 'dissolved';
    await this.prisma.room.update({ where: { id: roomId }, data: { status, closedAt: closed ? new Date() : null } });
  }

  async createSession(input: {
    id: string;
    roomId: string;
    seq: number;
    settings: RoomSettings;
    questionIds: readonly string[];
    startedAt: Date;
  }): Promise<void> {
    await this.prisma.roomSession.upsert({
      where: { id: input.id },
      update: {},
      create: {
        id: input.id,
        roomId: input.roomId,
        seq: input.seq,
        settings: input.settings as unknown as Prisma.InputJsonValue,
        questionIds: [...input.questionIds],
        startedAt: input.startedAt,
      },
    });
  }

  async hasBattleSince(memberKey: string, since: Date): Promise<boolean> {
    const row = await this.prisma.battleResult.findFirst({
      where: { memberKey, endedAt: { gte: since } },
      select: { id: true },
    });
    return row !== null;
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => fn(tx), { timeout: 15_000 });
      } catch (err) {
        const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
        if (attempt >= 3 || code === undefined || !TRANSIENT.has(code)) throw err;
        this.logger.warn(`result transaction retry ${attempt} after ${code}`);
      }
    }
  }

  async writeBattleResults(tx: Tx, rows: readonly BattleResultInput[]): Promise<Map<string, string>> {
    if (rows.length === 0) return new Map();
    await tx.battleResult.createMany({
      data: rows.map((r) => ({
        roomSessionId: r.roomSessionId,
        participantId: r.participantId,
        ...ownerColumns(r.owner),
        nickname: r.nickname,
        rank: r.rank,
        score: r.score,
        correctCount: r.correctCount,
        totalResponseMs: r.totalResponseMs,
        participantCount: r.participantCount,
        left: r.left,
        memberKey: r.memberKey,
        rematch: r.rematch,
        endedAt: r.endedAt,
        kstDay: new Date(`${r.kstDay}T00:00:00.000Z`),
      })),
      skipDuplicates: true,
    });
    const saved = await tx.battleResult.findMany({
      where: { roomSessionId: rows[0]!.roomSessionId },
      select: { id: true, participantId: true },
    });
    return new Map(saved.map((s) => [s.participantId, s.id]));
  }

  async endSession(tx: Tx, sessionId: string, endedAt: Date): Promise<void> {
    await tx.roomSession.update({ where: { id: sessionId }, data: { endedAt } });
  }
}
