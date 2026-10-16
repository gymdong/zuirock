import type {
  AccountDeletionResponse,
  CreateIssueReportRequest,
  IssueReportDto,
  UserSearchResultDto,
  AuthExchangeRequest,
  AuthSession,
  AuthStartRequest,
  AuthStartResponse,
  AssetUploadResponse,
  ConfirmStartLevelRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  DailySetStatusDto,
  EquippedItems,
  FriendListDto,
  FriendProfileDto,
  HistorySummaryDto,
  PurchaseItemResponse,
  WardrobeDto,
  GuestSession,
  MeDto,
  NicknameAvailabilityDto,
  PlacementNextDto,
  UpdateProfileRequest,
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
  updateProfile: (body: UpdateProfileRequest) => api<MeDto>('PATCH', '/me', { body }),
  nicknameAvailable: (nickname: string) =>
    api<NicknameAvailabilityDto>('GET', `/users/nickname-available?nickname=${encodeURIComponent(nickname)}`),
  uploadAsset: (form: FormData) => api<AssetUploadResponse>('POST', '/assets', { form }),
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
  placementNext: (setId: string) => api<PlacementNextDto>('POST', `/solo/sets/${setId}/next`),
  confirmStart: (topicId: TopicId, body: ConfirmStartLevelRequest) =>
    api<TopicProgressDto>('POST', `/solo/topics/${topicId}/start`, { body }),
  completeSet: (setId: string) =>
    api<SetResultDto>('POST', `/solo/sets/${setId}/complete`, { idempotencyKey: `${setId}:complete` }),

  history: () => api<HistorySummaryDto>('GET', '/reports/history'),

  wardrobe: () => api<WardrobeDto>('GET', '/me/wardrobe'),
  equip: (equipped: EquippedItems) => api<WardrobeDto>('PUT', '/me/wardrobe/equipped', { body: { equipped } }),
  purchaseItem: (itemId: string) => api<PurchaseItemResponse>('POST', `/me/wardrobe/items/${itemId}/purchase`),
  friends: () => api<FriendListDto>('GET', '/friends'),
  friendProfile: (userId: string) => api<FriendProfileDto>('GET', `/friends/${userId}`),
  searchUsers: (nickname: string) =>
    api<UserSearchResultDto>('GET', `/users/search?nickname=${encodeURIComponent(nickname)}`),
  requestFriend: (userId: string) => api<unknown>('POST', '/friends/requests', { body: { userId } }),
  acceptFriend: (userId: string) => api<unknown>('POST', `/friends/${userId}/accept`),
  removeFriend: (userId: string) => api<unknown>('DELETE', `/friends/${userId}`),
  deleteLearningRecords: () => api<AccountDeletionResponse>('DELETE', '/me/learning-records'),
  deleteAccount: () => api<AccountDeletionResponse>('DELETE', '/me'),
  reportQuestion: (questionId: string, body: CreateIssueReportRequest) =>
    api<IssueReportDto>('POST', `/questions/${questionId}/reports`, { body }),

  weeklyReport: () => api<WeeklyReportDto>('GET', '/reports/weekly/current'),
  weakness: () => api<WeaknessReportDto>('GET', '/reports/weakness'),

  createRoom: (body: CreateRoomRequest) => api<CreateRoomResponse>('POST', '/rooms', { body }),
  lookupRoom: (code: string) => api<RoomLookupDto>('GET', `/rooms/${code}`),
};
