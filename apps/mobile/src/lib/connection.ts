import { useSyncExternalStore } from 'react';

/**
 * 연결 문제 안내 상태. api() 가 재시도 끝에도 연결하지 못하면 `report()` 로 모달을 연다.
 * "다시 시도"는 `retry()` 로 tick 을 올리고, 오류 상태인 불러오기(useAsync)가 이를 보고 다시 불러온다.
 */
export interface ConnectionState {
  open: boolean;
  retryTick: number;
}

let state: ConnectionState = { open: false, retryTick: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<ConnectionState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const connection = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** 한꺼번에 여러 요청이 실패해도 모달은 하나만 연다. */
  report: () => {
    if (!state.open) set({ open: true });
  },
  dismiss: () => set({ open: false }),
  retry: () => set({ open: false, retryTick: state.retryTick + 1 }),
};

export function useConnection(): ConnectionState {
  return useSyncExternalStore(connection.subscribe, connection.get, connection.get);
}
