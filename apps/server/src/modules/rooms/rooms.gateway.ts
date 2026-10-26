import { Inject, Logger, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
  ROOM_NAMESPACE,
  type Ack,
  type ChatAck,
  type ChatPayload,
  type StickerPayload,
  type GiveUpPayload,
  type JoinRoomPayload,
  type ReadyPayload,
  type ResumeRoomPayload,
  type RoomSnapshotDto,
  type StartRoomPayload,
  type StartRoomResult,
  type SubmitAnswerPayload,
  type SubmitAnswerResult,
  type TimePingPayload,
  type UpdateSettingsPayload,
} from '@zuirock/shared';
import { AUTH_VERIFIER, type AuthVerifier, type RoomIdentity } from './auth-verifier.js';
import type { Clock } from './clock.js';
import { RoomEngine, RoomError, roomChannel } from './room-engine.service.js';
import { ROOM_CLOCK } from './rooms.tokens.js';

interface SocketData {
  identity: RoomIdentity;
  code?: string;
  participantId?: string;
}

type RoomSocket = Socket & { data: SocketData };

function isCode(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}$/.test(v);
}

/** `/rooms` namespace (websocket transport only). Every client event is answered through its ack. */
@WebSocketGateway({ namespace: ROOM_NAMESPACE, transports: ['websocket'], cors: { origin: true } })
export class RoomsGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomsGateway.name);

  constructor(
    @Inject(RoomEngine) private readonly engine: RoomEngine,
    @Inject(ROOM_CLOCK) private readonly clock: Clock,
    @Optional() @Inject(AUTH_VERIFIER) private readonly auth?: AuthVerifier,
  ) {}

  afterInit(nsp: Namespace): void {
    this.engine.attach(nsp);
    // Authenticate in middleware so no event can arrive before the identity is known.
    nsp.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      const verify = this.auth && typeof token === 'string' ? this.auth.verify(token) : Promise.resolve(null);
      verify
        .then((identity) => {
          if (!identity) return next(new Error('UNAUTHORIZED'));
          (socket.data as SocketData).identity = identity;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  async handleDisconnect(socket: RoomSocket): Promise<void> {
    const { code, participantId } = socket.data ?? {};
    if (code && participantId) await this.engine.disconnect(code, participantId);
  }

  private async run<T>(fn: () => Promise<T>): Promise<Ack<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      if (err instanceof RoomError) return { ok: false, error: err.code, message: err.message };
      this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      return { ok: false, error: 'INTERNAL' };
    }
  }

  private seat(socket: RoomSocket): { code: string; participantId: string } {
    const { code, participantId } = socket.data;
    if (!code || !participantId) throw new RoomError('NOT_IN_ROOM');
    return { code, participantId };
  }

  private async attach(socket: RoomSocket, code: string, participantId: string): Promise<RoomSnapshotDto> {
    if (socket.data.code && socket.data.code !== code) await socket.leave(roomChannel(socket.data.code));
    await socket.join(roomChannel(code));
    socket.data.code = code;
    socket.data.participantId = participantId;
    return this.engine.snapshotFor(code, participantId);
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: JoinRoomPayload): Promise<Ack<RoomSnapshotDto>> {
    return this.run(async () => {
      if (!isCode(p?.code)) throw new RoomError('ROOM_NOT_FOUND');
      const pid = await this.engine.join(socket.data.identity, p);
      return this.attach(socket, p.code, pid);
    });
  }

  @SubscribeMessage('room:resume')
  resume(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: ResumeRoomPayload): Promise<Ack<RoomSnapshotDto>> {
    return this.run(async () => {
      if (!isCode(p?.code)) throw new RoomError('ROOM_NOT_FOUND');
      const pid = await this.engine.resume(socket.data.identity, p.code);
      return this.attach(socket, p.code, pid);
    });
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() socket: RoomSocket): Promise<Ack<null>> {
    return this.run(async () => {
      const { code, participantId } = this.seat(socket);
      await this.engine.leave(code, participantId);
      await socket.leave(roomChannel(code));
      socket.data.code = undefined;
      socket.data.participantId = undefined;
      return null;
    });
  }

  @SubscribeMessage('room:ready')
  ready(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: ReadyPayload): Promise<Ack<null>> {
    return this.run(async () => {
      const { code, participantId } = this.seat(socket);
      await this.engine.ready(code, participantId, p?.ready === true);
      return null;
    });
  }

  @SubscribeMessage('room:updateSettings')
  updateSettings(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: UpdateSettingsPayload): Promise<Ack<null>> {
    return this.run(async () => {
      const { code, participantId } = this.seat(socket);
      if (!p?.settings) throw new RoomError('INVALID_SETTINGS');
      await this.engine.updateSettings(code, participantId, p.settings);
      return null;
    });
  }

  @SubscribeMessage('room:start')
  start(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: StartRoomPayload): Promise<Ack<StartRoomResult>> {
    return this.run(() => {
      const { code, participantId } = this.seat(socket);
      return this.engine.start(code, participantId, p?.acceptShortageCount);
    });
  }

  @SubscribeMessage('room:submit')
  submit(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: SubmitAnswerPayload): Promise<Ack<SubmitAnswerResult>> {
    return this.run(() => {
      const { code, participantId } = this.seat(socket);
      if (!Number.isInteger(p?.questionIndex) || typeof p.answer !== 'string') throw new RoomError('STALE_QUESTION');
      return this.engine.submit(code, participantId, p.questionIndex, p.answer.slice(0, 100));
    });
  }

  @SubscribeMessage('room:giveUp')
  giveUp(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: GiveUpPayload): Promise<Ack<null>> {
    return this.run(async () => {
      const { code, participantId } = this.seat(socket);
      await this.engine.giveUp(code, participantId, p?.questionIndex);
      return null;
    });
  }

  @SubscribeMessage('room:rematch')
  rematch(@ConnectedSocket() socket: RoomSocket): Promise<Ack<RoomSnapshotDto>> {
    return this.run(async () => {
      const { code, participantId } = this.seat(socket);
      await this.engine.rematch(code, participantId);
      return this.engine.snapshotFor(code, participantId);
    });
  }

  @SubscribeMessage('room:chat')
  chat(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: ChatPayload): Promise<Ack<ChatAck>> {
    return this.run(() => {
      const { code, participantId } = this.seat(socket);
      return this.engine.chat(code, participantId, typeof p?.text === 'string' ? p.text : '');
    });
  }

  @SubscribeMessage('room:sticker')
  sticker(@ConnectedSocket() socket: RoomSocket, @MessageBody() p: StickerPayload): Promise<Ack<null>> {
    return this.run(async () => {
      const { code, participantId } = this.seat(socket);
      await this.engine.sticker(code, participantId, p?.sticker);
      return null;
    });
  }

  @SubscribeMessage('time:ping')
  ping(@MessageBody() _p: TimePingPayload): Ack<{ serverNow: number }> {
    return { ok: true, data: { serverNow: this.clock.now() } };
  }
}
