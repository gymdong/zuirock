import type { FriendshipStatus, InviteStatus, TopicId } from '../enums.js';
import type { IsoDateTime } from './common.js';
import type { MultiRecordDto } from './records.js';
import type { HeadToHeadDto } from './room.js';
import type { AccountLevelDto, AvatarDto, EquippedItems } from './users.js';

export interface FriendSummaryDto {
  userId: string;
  nickname: string;
  avatar: AvatarDto;
  level: number;
}

/** GET /api/friends — accepted friends plus pending requests. */
export interface FriendListDto {
  friends: FriendSummaryDto[];
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

export interface FriendRequestDto {
  requestId: string;
  user: FriendSummaryDto;
  status: FriendshipStatus;
  createdAt: IsoDateTime;
}

/** POST /api/friends/requests */
export interface CreateFriendRequest {
  userId: string;
}

/** GET /api/users/search?nickname= */
export interface UserSearchResultDto {
  users: Array<FriendSummaryDto & { friendship: FriendshipStatus | 'none' }>;
}

/** GET /api/friends/:userId — friend profile (p16, AC-A6). */
export interface FriendProfileDto {
  userId: string;
  nickname: string;
  avatar: AvatarDto;
  equipped: EquippedItems;
  level: AccountLevelDto;
  topicLevels: Array<{ topicId: TopicId; level: number }>;
  headToHead: HeadToHeadDto;
  /** The friend's multiplayer record (10/28). */
  record: MultiRecordDto;
  clearedStages: number;
}

/** GET /api/invites — in-app inbox. */
export interface InviteDto {
  id: string;
  roomCode: string;
  from: FriendSummaryDto;
  status: InviteStatus;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
}
