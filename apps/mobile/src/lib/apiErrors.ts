/** Server error codes → Korean copy for REST errors (room settings errors arrive as INVALID_SETTINGS + list). */
const SETTINGS_COPY: Record<string, string> = {
  TOPIC_UNAVAILABLE: '아직 문제가 준비되지 않은 주제가 있어요',
  TOPICS_EMPTY: '출제 주제를 하나 이상 골라 주세요',
  TYPES_EMPTY: '문제 유형을 하나 이상 골라 주세요',
  QUESTION_COUNT_OUT_OF_RANGE: '문제 수는 5~100문제로 정해 주세요',
  MIN_DIFFICULTY_INVALID: '난이도를 다시 골라 주세요',
  TIME_LIMIT_INVALID: '제한 시간을 다시 골라 주세요',
  CHOSUNG_REVEAL_INVALID: '초성 공개 시점을 다시 골라 주세요',
  CHOSUNG_REVEAL_NOT_BEFORE_LIMIT: '초성 공개는 제한 시간보다 먼저여야 해요',
};

const CODE_COPY: Record<string, string> = {
  ...SETTINGS_COPY,
  INVALID_SETTINGS: '방 설정을 확인해 주세요',
  UNAUTHORIZED: '다시 로그인해 주세요',
  ROOM_NOT_FOUND: '방을 찾을 수 없어요. 코드를 확인해 주세요',
  NOT_ENOUGH_CHEESE: '치즈가 부족해요',
};

/** Friendly message for an API error, or null to keep the server's own message. */
export function friendlyApiError(code: string, message: string): string | null {
  if (code === 'INVALID_SETTINGS') {
    const first = message.split(',').map((s) => s.trim()).find((s) => s in SETTINGS_COPY);
    return first ? SETTINGS_COPY[first]! : CODE_COPY.INVALID_SETTINGS!;
  }
  return CODE_COPY[code] ?? null;
}
