/** Brand palette from mockup p1 (색 · 글꼴). */
export const colors = {
  /** 쥐 바이올렛 — 캐릭터 */
  mouse: '#7C6CF2',
  /** 버튼 바이올렛 — 주요 버튼 */
  primary: '#5B47E0',
  primaryDark: '#4636B8',
  /** 치즈 옐로 — 보상·스트릭 */
  cheese: '#FFC93C',
  cheeseDark: '#D9A520',
  cheeseText: '#9A7414',
  /** 정답 민트 */
  correct: '#2FB98F',
  /** 귀 핑크 — 포인트 */
  ear: '#FF8FB1',
  /** 오답 코랄 */
  wrong: '#FF6B5B',
  /** 잉크 — 본문 */
  ink: '#241B4D',
  /** 크림 — 바탕 */
  cream: '#FFF8EE',

  white: '#FFFFFF',
  inkSoft: '#5E577A',
  inkMuted: '#8E88A6',
  border: '#ECE6D9',
  borderDark: '#DCD5C6',
  track: '#EAE5DA',
  lavender: '#EEEBFD',
  lavenderStrong: '#DCD6FB',
  mintSoft: '#E3F6EF',
  mintText: '#1F7A5E',
  coralSoft: '#FDE9E5',
  cheeseSoft: '#FDF1CF',
  peach: '#F6DCCB',
  kakao: '#FEE500',
  naver: '#03C75A',
} as const;

export type ColorName = keyof typeof colors;
