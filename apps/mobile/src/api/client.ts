import { IDEMPOTENCY_KEY_HEADER } from '@zuirock/shared';
import { friendlyApiError } from '../lib/apiErrors';
import { connection } from '../lib/connection';
import { CONNECTION_MESSAGE, NETWORK, parseResponse, SERVER_UNAVAILABLE, withRetry } from '../lib/http';
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
  /** multipart body (asset upload); the browser sets the boundary header. */
  form?: FormData;
}

/** Mock transport: `apps/mobile/mock/api.ts` registers itself here when EXPO_PUBLIC_API_MOCK=1. */
export type MockHandler = (method: Method, path: string, body: unknown, token: string | null) => Promise<unknown>;
let mockHandler: MockHandler | null = null;
export function setMockHandler(h: MockHandler) {
  mockHandler = h;
}

/** 조회(GET)는 요청마다 이 시간 안에 응답이 없으면 끊고 다시 시도한다(Render 무료 서버가 깨어나는 동안 붙잡힐 수 있다). */
const GET_TIMEOUT_MS = 25_000;
/** 연결 문제일 때 조용히 다시 시도하는 간격(총 3번 시도). */
const RETRY_DELAYS_MS = [1500, 3500] as const;

export function isConnectionError(e: unknown): boolean {
  return e instanceof ApiError && (e.code === NETWORK || e.code === SERVER_UNAVAILABLE);
}

export async function api<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = session.token();
  if (useMockApi && mockHandler) return (await mockHandler(method, path, opts.body ?? opts.form, token)) as T;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = opts.idempotencyKey;

  const attempt = async (): Promise<T> => {
    // 조회만 시간 제한을 둔다(쓰기 요청은 끊으면 서버에서는 성공했는데 앱만 실패로 보일 수 있다)
    const controller = method === 'GET' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), GET_TIMEOUT_MS) : null;
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
        signal: controller?.signal,
      });
      text = await res.text();
    } catch {
      throw new ApiError(0, NETWORK, CONNECTION_MESSAGE);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const parsed = parseResponse(res.status, text);
    if (parsed.kind === 'unavailable') throw new ApiError(res.status, SERVER_UNAVAILABLE, CONNECTION_MESSAGE);
    if (parsed.kind === 'api-error') {
      const code = parsed.body.code ?? `HTTP_${res.status}`;
      const message = parsed.body.message ?? '요청을 처리하지 못했어요.';
      throw new ApiError(res.status, code, friendlyApiError(code, message) ?? message);
    }
    return parsed.data as T;
  };

  try {
    // 조회와, 같은 키로 다시 보내도 안전한 쓰기(중복 방지 키)는 연결 문제일 때 조용히 다시 시도한다
    const retryable = method === 'GET' || opts.idempotencyKey !== undefined;
    return retryable ? await withRetry(attempt, isConnectionError, RETRY_DELAYS_MS) : await attempt();
  } catch (e) {
    if (isConnectionError(e)) connection.report();
    throw e;
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '문제가 생겼어요. 다시 시도해 주세요.';
}
