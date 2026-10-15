/**
 * Korean IME guard for answer inputs (AC-M6). While a syllable is being composed, Enter and the
 * submit button must not send a half-finished answer; on web the last syllable only lands in the
 * input value after `compositionend`. A submit requested mid-composition is deferred and fired
 * once composition ends, with the final text.
 */
export interface KeyLike {
  key?: string;
  isComposing?: boolean;
  keyCode?: number;
}

/** True when a keydown belongs to an active IME composition (keyCode 229 per UI Events). */
export function isComposingKey(e: KeyLike): boolean {
  return e.isComposing === true || e.keyCode === 229;
}

export function shouldSubmitOnKey(e: KeyLike): boolean {
  return e.key === 'Enter' && !isComposingKey(e);
}

export interface ImeSubmitGuard {
  compositionStart(): void;
  /** Call with the input value after composition committed. */
  compositionEnd(text: string): void;
  /** Returns true when submitted now, false when deferred or empty. */
  requestSubmit(text: string): boolean;
  readonly composing: boolean;
}

export function createImeSubmitGuard(submit: (answer: string) => void): ImeSubmitGuard {
  let composing = false;
  let pending = false;
  const fire = (text: string): boolean => {
    const answer = text.trim();
    if (!answer) return false;
    submit(answer);
    return true;
  };
  return {
    compositionStart() {
      composing = true;
    },
    compositionEnd(text) {
      composing = false;
      if (pending) {
        pending = false;
        fire(text);
      }
    },
    requestSubmit(text) {
      if (composing) {
        pending = true;
        return false;
      }
      return fire(text);
    },
    get composing() {
      return composing;
    },
  };
}
