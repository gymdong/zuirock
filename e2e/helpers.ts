import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { io, type Socket } from 'socket.io-client';
import type { Ack, FinishedEvent, QuestionEvent, RoomSnapshotDto } from '@zuirock/shared';

const seedFile = new URL('./.seed-user.json', import.meta.url);

export function seedUsers(): { userId: string; loginBId: string } | null {
  return existsSync(seedFile) ? (JSON.parse(readFileSync(seedFile, 'utf8')) as { userId: string; loginBId: string }) : null;
}

/** Same HS256 format the server verifies; only usable where JWT_SECRET is known (local runs). */
export function memberToken(userId: string): string {
  const secret = process.env.JWT_SECRET ?? '';
  const b64 = (v: string) => Buffer.from(v).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub: userId, typ: 'user', iat, exp: iat + 3600 }));
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

export interface Player {
  socket: Socket;
  questions: QuestionEvent[];
  finished: Promise<FinishedEvent>;
}

export function connect(baseURL: string, token: string): Promise<Player> {
  const socket = io(`${baseURL}/rooms`, { auth: { token }, transports: ['websocket'] });
  const questions: QuestionEvent[] = [];
  socket.on('room:question', (e: QuestionEvent) => questions.push(e));
  const finished = new Promise<FinishedEvent>((resolve) => socket.once('room:finished', resolve));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve({ socket, questions, finished }));
    socket.once('connect_error', reject);
  });
}

export function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(15_000).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) return reject(err);
      if (!res.ok) return reject(new Error(`${event} -> ${res.error} ${res.message ?? ''}`));
      resolve(res.data);
    });
  });
}

export type { RoomSnapshotDto };
