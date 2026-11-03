import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { useConnection } from './connection';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Load once per `deps` change; `reload()` refetches. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: unknown) => alive && setState({ data: null, error: errorMessage(e), loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  // 연결 모달에서 "다시 시도"를 누르면, 오류로 멈춰 있는 불러오기만 다시 한다
  const { retryTick } = useConnection();
  const failed = useRef(false);
  failed.current = state.error !== null;
  useEffect(() => {
    if (retryTick > 0 && failed.current) setTick((t) => t + 1);
  }, [retryTick]);
  return { ...state, reload };
}
