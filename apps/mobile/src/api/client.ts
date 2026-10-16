import { IDEMPOTENCY_KEY_HEADER, type ApiErrorBody } from '@zuirock/shared';
import { apiBase, useMockApi } from '../lib/config';
import { session } from '../state/session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  /**
   * Required on result-writing calls (solo answers/complete). Callers pass a key derived from the
   * logical operation (e.g. `${setAttemptId}:complete`) so retries replay instead of double-write.
   */
  idempotencyKey?: string;
}

/** Mock transport: `apps/mobile/mock/api.ts` registers itself here when EXPO_PUBLIC_API_MOCK=1. */
export type MockHandler = (method: Method, path: string, body: unknown, token: string | null) => Promise<unknown>;
let mockHandler: MockHandler | null = null;
export function setMockHandler(h: MockHandler) {
  mockHandler = h;
}

const NETWORK_MESSAGE = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';

export async function api<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = session.token();
  if (useMockApi && mockHandler) return (await mockHandler(method, path, opts.body, token)) as T;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? '요청을 처리하지 못했어요.');
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '문제가 생겼어요. 다시 시도해 주세요.';
}
