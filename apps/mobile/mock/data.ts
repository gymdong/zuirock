import type { MeDto, QuestionPublicDto, QuestionRevealDto, TopicDto, TopicId } from '@zuirock/shared';

/** Sample content for the in-app mock (shapes from @zuirock/shared DTOs). */
export interface MockQuestion {
  pub: QuestionPublicDto;
  reveal: QuestionRevealDto;
  chosung?: string;
}

const src = { title: '표준국어대사전', url: 'https://stdict.korean.go.kr' };

function q(
  id: string,
  topicId: TopicId,
  subfield: QuestionPublicDto['subfield'],
  type: QuestionPublicDto['type'],
  difficulty: number,
  question: string,
  answer: string,
  explanation: string,
  extra: Partial<QuestionPublicDto> = {},
  chosung?: string,
): MockQuestion {
  return {
    pub: { id, topicId, subfield, type, difficulty, question, ...extra },
    reveal: { questionId: id, answer, explanation, source: src },
    chosung,
  };
}

export const QUESTIONS: MockQuestion[] = [
  q('q1', 'history', '한국사', 'chosung', 3.5, '조선의 제4대 왕으로, 훈민정음을 창제한 인물은?', '세종대왕',
    '세종대왕은 1443년 훈민정음을 창제하고 1446년 반포했어요.', { answerLength: 4 }, 'ㅅㅈㄷㅇ'),
  q('q2', 'science', '물리', 'mcq', 3, '번개가 천둥보다 먼저 보이는 이유는?', '빛이 소리보다 빠르기 때문',
    '빛은 초속 약 30만 km, 소리는 초속 약 340 m로 전해져요.',
    { choices: ['번개가 먼저 생겨서', '빛이 소리보다 빠르기 때문', '소리가 공기에 흡수돼서', '눈이 귀보다 민감해서'] }),
  q('q3', 'general', '생활', 'ox', 3, '달걀은 뾰족한 쪽을 아래로 두고 보관하는 것이 좋다.', 'O',
    '공기주머니가 있는 뭉툭한 쪽을 위로 두면 더 신선하게 보관돼요.', { choices: ['O', 'X'] }),
  q('q4', 'vocab', '맞춤법', 'chosung', 3, "'몹시 놀라 정신이 없다'는 뜻의 말로, '어이없다'와 비슷한 네 글자 말은?", '어처구니',
    "'어처구니없다'는 일이 너무 뜻밖이어서 기가 막히는 듯하다는 뜻이에요.", { answerLength: 4 }, 'ㅇㅊㄱㄴ'),
  q('q5', 'science', '화학', 'mcq', 3.5, '원소 기호 Na가 나타내는 원소는?', '나트륨',
    'Na는 라틴어 natrium에서 왔어요. 우리말로는 소듐이라고도 해요.', { choices: ['질소', '나트륨', '네온', '니켈'] }),
  q('q6', 'history', '세계사', 'ox', 3, '프랑스 혁명은 1789년에 일어났다.', 'O', '1789년 7월 14일 바스티유 습격이 상징적인 시작이에요.',
    { choices: ['O', 'X'] }),
  q('q7', 'general', '문화', 'chosung', 3, '한 해의 마지막 날 밤을 이르는 말은?', '섣달그믐', '음력 12월의 마지막 날을 섣달그믐이라고 해요.',
    { answerLength: 4 }, 'ㅅㄷㄱㅁ'),
  q('q8', 'science', '생물', 'mcq', 3, '광합성이 주로 일어나는 세포 소기관은?', '엽록체', '엽록체의 엽록소가 빛에너지를 흡수해요.',
    { choices: ['미토콘드리아', '엽록체', '리보솜', '골지체'] }),
];

export const TOPICS: TopicDto[] = [
  ['general', '상식', '생활 속 궁금증'],
  ['vocab', '어휘력', '맞춤법·한자어'],
  ['history', '역사', '한국사·세계사'],
  ['science', '과학', '물리·화학·생물·지구'],
  ['geography', '지리', '나라·수도·지형'],
  ['art', '예술', '미술·음악'],
  ['economy', '경제', '돈과 시장'],
  ['philosophy', '철학', '생각의 역사'],
  ['sports', '스포츠', '규칙과 기록'],
].map(([id, name, subtitle], i) => ({
  id: id as TopicId,
  name: name!,
  subtitle: subtitle!,
  subfields: [],
  available: i < 4,
  sortOrder: i,
}));

export const TOPIC_LEVELS: Partial<Record<TopicId, number>> = { general: 42, vocab: 57, history: 34, science: 12 };

export function mockMe(selected: TopicId[]): MeDto {
  return {
    id: 'u-me',
    nickname: '치즈러버',
    avatar: { source: 'character', url: null },
    level: { level: 12, totalXp: 7000, xpIntoLevel: 420, xpForNextLevel: 1200 },
    cheese: 320,
    isAdmin: false,
    providers: ['kakao'],
    selectedTopicIds: selected,
    equipped: {},
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}
