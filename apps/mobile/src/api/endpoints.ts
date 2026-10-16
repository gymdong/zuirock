import type {
  AuthExchangeRequest,
  AuthSession,
  AuthStartRequest,
  AuthStartResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  DailySetStatusDto,
  GuestSession,
  MeDto,
  OAuthProvider,
  Paginated,
  RoomLookupDto,
  SetResultDto,
  SetSessionDto,
  SoloGiveUpResponse,
  SoloHintResponse,
  SoloSubmitRequest,
  SoloSubmitResponse,
  StartSetRequest,
  StreakDto,
  TopicDto,
  TopicId,
  TopicProgressDto,
  WeaknessReportDto,
  WeeklyReportDto,
  WrongNoteDto,
} from '@zuirock/shared';
import { api } from './client';

/** Typed REST calls (paths from the DTO JSDoc in @zuirock/shared). */
export const Api = {
  authStart: (provider: OAuthProvider, body: AuthStartRequest) =>
    api<AuthStartResponse>('POST', `/auth/${provider}/start`, { body }),
  authExchange: (body: AuthExchangeRequest) => api<AuthSession>('POST', '/auth/exchange', { body }),
  createGuest: (nickname: string) => api<GuestSession>('POST', '/guests', { body: { nickname } }),

  me: () => api<MeDto>('GET', '/me'),
  topics: () => api<TopicDto[]>('GET', '/topics'),
  topicProgress: (topicId: TopicId) => api<TopicProgressDto>('GET', `/me/topics/${topicId}`),
  setTopics: (topicIds: TopicId[]) => api<MeDto>('PUT', '/me/topics', { body: { topicIds } }),
  streak: () => api<StreakDto>('GET', '/me/streak'),
  wrongNotes: async () => {
    const r = await api<WrongNoteDto[] | Paginated<WrongNoteDto>>('GET', '/me/wrong-notes');
    return Array.isArray(r) ? r : r.items;
  },

  dailyStatus: () => api<DailySetStatusDto>('GET', '/solo/daily'),
  startSet: (body: StartSetRequest) => api<SetSessionDto>('POST', '/solo/sets', { body }),
  submitSolo: (setId: string, body: SoloSubmitRequest, attempt: number) =>
    api<SoloSubmitResponse>('POST', `/solo/sets/${setId}/answers`, {
      body,
      idempotencyKey: `${setId}:${body.questionId}:${attempt}`,
    }),
  soloHint: (setId: string, questionId: string) =>
    api<SoloHintResponse>('POST', `/solo/sets/${setId}/hint`, { body: { questionId } }),
  soloGiveUp: (setId: string, questionId: string) =>
    api<SoloGiveUpResponse>('POST', `/solo/sets/${setId}/give-up`, {
      body: { questionId },
      idempotencyKey: `${setId}:${questionId}:give-up`,
    }),
  completeSet: (setId: string) =>
    api<SetResultDto>('POST', `/solo/sets/${setId}/complete`, { idempotencyKey: `${setId}:complete` }),

  weeklyReport: () => api<WeeklyReportDto>('GET', '/reports/weekly/current'),
  weakness: () => api<WeaknessReportDto>('GET', '/reports/weakness'),

  createRoom: (body: CreateRoomRequest) => api<CreateRoomResponse>('POST', '/rooms', { body }),
  lookupRoom: (code: string) => api<RoomLookupDto>('GET', `/rooms/${code}`),
};
