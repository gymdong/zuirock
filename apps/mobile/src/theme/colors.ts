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
  /** 크림 — 바탕 (sample_img 시안, 10/26) */
  cream: '#FFFAF1',

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
  /** 홈 주제 카드 바탕 · 종합 카드 글자/아랫단 (sample_img 시안) */
  tile: '#F8F7FD',
  compositeText: '#9A6B5E',
  /** 치즈 마을 테마 (10/26) */
  cheeseLight: '#FFE7A6',
  /** 구운 치즈 테두리 · 피버 */
  crust: '#F29A2E',
  /** 시간 압박 비네트 */
  danger: '#FF4D3D',
  kakao: '#FEE500',
  naver: '#03C75A',
} as const;

export type ColorName = keyof typeof colors;
