/**
 * Tiny typed event bus for UI moments. Animations and screens emit; lane LG's audio system
 * (src/audio) subscribes to attach sounds. Emitting never throws and costs nothing without listeners.
 */
export interface UiEvents {
  tap: void;
  correct: { score?: number };
  wrong: void;
  hintReveal: void;
  /** Once per second during the last 10 seconds of a battle question. */
  tick: { remaining: number };
  questionStart: { index: number; total: number };
  reveal: void;
  victory: { rank: number };
  defeat: { rank: number };
  levelUp: { level: number };
  chestOpen: { tier?: string };
}

export type UiEventName = keyof UiEvents;
type Listener<E extends UiEventName> = (payload: UiEvents[E]) => void;

const listeners = new Map<UiEventName, Set<Listener<never>>>();

export function on<E extends UiEventName>(name: E, fn: Listener<E>): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn as Listener<never>);
  return () => set!.delete(fn as Listener<never>);
}

export function emit<E extends UiEventName>(name: E, ...payload: UiEvents[E] extends void ? [] : [UiEvents[E]]): void {
  listeners.get(name)?.forEach((fn) => {
    try {
      (fn as Listener<E>)(payload[0] as UiEvents[E]);
    } catch {
      // A broken listener (e.g. audio) must never break the UI.
    }
  });
}
