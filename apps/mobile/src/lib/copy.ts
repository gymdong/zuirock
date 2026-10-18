import type { XpIneligibleReason, XpResultDto } from '@zuirock/shared';

/** Battle result XP line (p11). Guests see the preview "최대 N XP" (D6-6). */
export function battleXpCopy(xp: XpResultDto, isGuest: boolean): { value: string; caption: string } {
  if (isGuest) {
    return { value: `최대 ${xp.guestPreviewMax ?? 0} XP`, caption: '로그인하면 받을 수 있어요' };
  }
  return { value: `+${xp.granted}`, caption: xp.capReached ? '오늘 XP 상한 도달' : '계정 XP' };
}

/** "틀린 N문제는 오답노트에 담았어요" — replaces the mockup's topic-XP gauge sentence (spec R14). */
export function wrongNoteCopy(wrongNotesAdded: number): string {
  if (wrongNotesAdded <= 0) return '이번엔 틀린 문제가 없어요. 완벽해요!';
  return `틀린 ${wrongNotesAdded}문제는 오답노트에 담았어요`;
}

const INELIGIBLE: Record<XpIneligibleReason, string> = {
  NOT_FIRST_CLEAR: '이미 깬 스테이지는 XP가 없어요',
  STAGE_FAILED: '7문제 이상 맞히면 스테이지를 깰 수 있어요',
  BELOW_PASS: '7문제 이상 맞혀야 XP를 받아요',
  DAILY_ALREADY_GRANTED: '오늘의 3분 지식 XP는 이미 받았어요',
  QUEST_ALREADY_GRANTED: '이번 주 퀘스트 XP는 이미 받았어요',
  NO_XP_MODE: '이 세트는 XP가 없어요',
  GUEST: '로그인하면 XP가 쌓여요',
};

/** Solo result XP line. */
export function soloXpCopy(xp: XpResultDto): string {
  if (xp.granted > 0) return xp.capReached ? `+${xp.granted} XP · 오늘 XP 상한 도달` : `+${xp.granted} XP`;
  if (xp.capReached) return '오늘 XP 상한 도달';
  return xp.ineligibleReason ? INELIGIBLE[xp.ineligibleReason] : '+0 XP';
}

export function percent(rate: number | null): string {
  return rate == null ? '–' : `${Math.round(rate * 100)}%`;
}

export function signedPp(delta: number | null): string {
  if (delta == null) return '';
  const r = Math.round(delta);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '0';
}

/** "10월 7일 – 10월 13일" from KST day keys. */
export function weekRange(start: string, end: string): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}월 ${Number(day)}일`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function timeLimitLabel(sec: number): string {
  return sec === 60 ? '1분' : `${sec}초`;
}

export const TYPE_LABEL = { chosung: '초성퀴즈', mcq: '객관식', ox: 'OX' } as const;

/** p9 footer: "상식·역사·과학에서 ★3 이상 초성퀴즈·객관식 20문제 · 문제당 60초 · 남은 45초에 초성 공개" (N = remaining seconds, D-R2-1). */
export function settingsSummary(
  s: { topicIds: string[]; types: Array<keyof typeof TYPE_LABEL>; questionCount: number; minDifficulty: number; timeLimitSec: number; chosungRevealSec: number | null },
  topicName: (id: string) => string,
): string {
  const reveal = s.types.includes('chosung')
    ? s.chosungRevealSec == null
      ? ' · 초성 힌트 없음'
      : ` · 남은 ${s.chosungRevealSec}초에 초성 공개`
    : '';
  return (
    `${s.topicIds.map(topicName).join('·')}에서 ★${s.minDifficulty} 이상 ` +
    `${s.types.map((t) => TYPE_LABEL[t]).join('·')} ${s.questionCount}문제 · 문제당 ${s.timeLimitSec}초${reveal}`
  );
}
