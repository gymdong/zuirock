import { TOPIC_NAME_BY_ID, type MultiRecordDto } from '@zuirock/shared';
import { percent } from './copy';

/** '12전 8승 4패 · 승률 67%' (or a first-game hint). */
export function recordLine(r: MultiRecordDto): string {
  if (r.played === 0) return '아직 대결 기록이 없어요';
  return `${r.played}전 ${r.wins}승 ${r.losses}패 · 승률 ${percent(r.winRate)}`;
}

/** '과학 정답률 85%' for the best topic, '' until one qualifies. */
export function bestTopicLine(r: MultiRecordDto): string {
  return r.bestTopic ? `강한 주제 ${TOPIC_NAME_BY_ID[r.bestTopic.topicId]} ${percent(r.bestTopic.correctRate)}` : '';
}
