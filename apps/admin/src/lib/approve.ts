import type { AdminQuestionDto } from '@zuirock/shared';

export const BULK_APPROVE_MAX = 50;

/** 일괄 승인 규칙(계획 LE): reviewed만, ≤50, 같은 세부 분야, source.title 있음, url이 있으면 링크 확인. */
export function checkApprove(selected: AdminQuestionDto[], linksChecked: boolean): string[] {
  const problems: string[] = [];
  if (selected.length === 0) return ['선택한 문제가 없습니다'];
  if (selected.length > BULK_APPROVE_MAX) problems.push(`한 번에 ${BULK_APPROVE_MAX}건까지 승인할 수 있습니다`);
  if (selected.some((q) => q.status !== 'reviewed')) problems.push('검수 완료(reviewed) 상태만 승인할 수 있습니다');
  if (new Set(selected.map((q) => q.subfield)).size > 1) problems.push('같은 세부 분야끼리만 승인할 수 있습니다');
  if (selected.some((q) => q.source.title.trim() === '')) problems.push('출처 제목이 없는 문제가 있습니다');
  if (selected.some((q) => q.source.url.trim() !== '') && !linksChecked) problems.push('출처 링크를 열어 확인한 뒤 "링크 확인"에 체크하세요');
  return problems;
}

export function needsLinkCheck(selected: AdminQuestionDto[]): boolean {
  return selected.some((q) => q.source.url.trim() !== '');
}
