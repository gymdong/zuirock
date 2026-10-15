import type { AvatarSource, ItemSlot, OAuthProvider, TopicId } from '../enums.js';
import type { IsoDateTime } from './common.js';

export interface AccountLevelDto {
  level: number;
  totalXp: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP needed to reach the next level (100 × current level). */
  xpForNextLevel: number;
}

export interface AvatarDto {
  source: AvatarSource;
  /** Resolved image URL (`/api/assets/:key` or social URL); null for `character`. */
  url: string | null;
}

/** Equipped item id per slot; missing slot = nothing equipped. */
export type EquippedItems = Partial<Record<ItemSlot, string>>;

export interface MeDto {
  id: string;
  nickname: string;
  avatar: AvatarDto;
  level: AccountLevelDto;
  cheese: number;
  isAdmin: boolean;
  providers: OAuthProvider[];
  selectedTopicIds: TopicId[];
  equipped: EquippedItems;
  createdAt: IsoDateTime;
}

/** PATCH /api/me */
export interface UpdateProfileRequest {
  /** Max 10 characters, unique among members (AC-A4). */
  nickname?: string;
  avatarSource?: AvatarSource;
  /** Required when avatarSource = 'upload' (key from POST /api/assets). */
  avatarAssetKey?: string;
}

/** GET /api/users/nickname-available?nickname= */
export interface NicknameAvailabilityDto {
  nickname: string;
  available: boolean;
  reason?: 'TOO_LONG' | 'EMPTY' | 'TAKEN';
}

/** PUT /api/me/topics — topics shown on home (p3/p5). */
export interface UpdateSelectedTopicsRequest {
  topicIds: TopicId[];
}

/** POST /api/assets (multipart, ≤ 1 MB, png/jpeg/webp) */
export interface AssetUploadResponse {
  key: string;
  url: string;
}

/** DELETE /api/me/learning-records and DELETE /api/me (AC-D7). */
export interface AccountDeletionResponse {
  deleted: true;
}
