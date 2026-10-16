import type { ApiErrorBody, MeDto } from '@zuirock/shared';
import { createMockApi } from './mock.js';
import { ApiError, type AdminApi, type CountRow, type QuestionQuery } from './types.js';

const TOKEN_KEY = 'zuirock.admin.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only login */
  }
}

/** Reuse the app's member session (same origin) when no admin token is stored. */
export function adoptAppSession(): boolean {
  if (getToken()) return true;
  try {
    const raw = localStorage.getItem('zuirock.session');
    if (!raw) return false;
    const s = JSON.parse(raw) as { accessToken?: string; expiresAt?: string };
    if (!s.accessToken || (s.expiresAt && Date.parse(s.expiresAt) <= Date.now())) return false;
    setToken(s.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `요청 실패 (${res.status})`);
  }
  return (await res.json()) as T;
}

function query(q: QuestionQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Route list assumed from LB's admin module; see docs in the lane report. */
export const httpApi: AdminApi = {
  me: () => request<MeDto>('GET', '/api/admin/session'),
  listQuestions: (q) => request('GET', `/api/admin/questions${query(q)}`),
  getQuestion: (id) => request('GET', `/api/admin/questions/${id}`),
  updateQuestion: (id, body) => request('PATCH', `/api/admin/questions/${id}`, body),
  bulkTransition: (body) => request('POST', '/api/admin/questions/bulk-transition', body),
  approve: (body) => request('POST', '/api/admin/questions/approve', body),
  importQuestions: (items, dryRun) => request('POST', '/api/admin/questions/import', { questions: items, dryRun }),
  async counts() {
    const map = new Map<string, CountRow>();
    let cursor: string | undefined;
    do {
      const page = await httpApi.listQuestions({ limit: 200, cursor });
      for (const r of page.items) {
        const k = `${r.topicId}|${r.difficulty}|${r.type}|${r.status}`;
        const cur = map.get(k);
        if (cur) cur.count++;
        else map.set(k, { topicId: r.topicId, difficulty: r.difficulty, type: r.type, status: r.status, count: 1 });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return [...map.values()];
  },
};

/** `VITE_MOCK=1 pnpm --filter @zuirock/admin dev` runs against an in-memory store. */
export const api: AdminApi = import.meta.env.VITE_MOCK === '1' ? createMockApi() : httpApi;
