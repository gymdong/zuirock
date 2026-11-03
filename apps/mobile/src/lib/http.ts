import type { ApiErrorBody } from '@zuirock/shared';

/** 연결 문제(서버가 깨어나는 중·프록시 오류·인터넷 끊김)를 가리키는 문구. 화면에는 빨간 글씨 대신 연결 모달이 뜬다. */
export const CONNECTION_MESSAGE = '서버와 연결이 불안정해요';

/** 서버가 JSON 이 아닌 응답(Render 깨어나는 중 안내 페이지, 프록시 오류, 공용 와이파이 로그인 페이지)을 준 경우의 코드. */
export const SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE';
export const NETWORK = 'NETWORK';

export type ParsedResponse =
  | { kind: 'ok'; data: unknown }
  | { kind: 'api-error'; status: number; body: Partial<ApiErrorBody> }
  | { kind: 'unavailable' };

/**
 * 응답 본문을 해석한다. JSON 이 아니거나 502/503/504 이면 서버 연결 문제로 본다
 * (이때 JSON.parse 오류가 그대로 화면에 나가지 않게 한다).
 */
export function parseResponse(status: number, text: string): ParsedResponse {
  if (status === 502 || status === 503 || status === 504) return { kind: 'unavailable' };
  const ok = status >= 200 && status < 300;
  if (!text) return ok ? { kind: 'ok', data: null } : { kind: 'api-error', status, body: {} };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'unavailable' };
  }
  return ok ? { kind: 'ok', data } : { kind: 'api-error', status, body: (data ?? {}) as Partial<ApiErrorBody> };
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `attempt` 를 한 번 하고, 재시도 가능한 실패이면 `delaysMs` 간격으로 더 시도한다. */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  isRetryable: (e: unknown) => boolean,
  delaysMs: readonly number[],
  sleep: (ms: number) => Promise<void> = sleepMs,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (e) {
      const delay = delaysMs[i];
      if (delay === undefined || !isRetryable(e)) throw e;
      await sleep(delay);
    }
  }
}
