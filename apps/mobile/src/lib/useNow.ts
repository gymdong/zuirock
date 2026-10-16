import { useEffect, useState } from 'react';

/** Re-render every `ms` and return `now()` (e.g. the server clock). */
export function useNow(now: () => number, ms = 250): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), ms);
    return () => clearInterval(id);
  }, [now, ms]);
  return t;
}
