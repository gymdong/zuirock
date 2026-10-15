import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { accountLevel, type GrowthConfig } from '@zuirock/game-rules';
import {
  TOPIC_IDS,
  type MeDto,
  type NicknameAvailabilityDto,
  type OAuthProvider,
  type TopicId,
  type TopicProgressDto,
  type UpdateProfileRequest,
  type XpLedgerEntryDto,
} from '@zuirock/shared';
import { badRequest, conflict, notFound } from '../../common/api-error.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dateToDay } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { OAuthProfile } from '../auth/oauth-providers.js';

const codePoints = (s: string) => [...s].length;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { socialAccounts: true, selectedTopics: { orderBy: { addedAt: 'asc' } }, equipped: true },
    });
    if (!user) throw notFound('USER_NOT_FOUND', '회원을 찾을 수 없어요');
    const [xp, cheese] = await Promise.all([
      this.prisma.xpLedger.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.cheeseBalance(userId),
    ]);
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: this.avatar(user),
      level: accountLevel(xp._sum.amount ?? 0, this.cfg),
      cheese,
      isAdmin: user.isAdmin,
      providers: user.socialAccounts.map((s) => s.provider as OAuthProvider),
      selectedTopicIds: user.selectedTopics.map((t) => t.topicId as TopicId),
      equipped: Object.fromEntries(user.equipped.map((e) => [e.slot, e.itemId])),
      createdAt: user.createdAt.toISOString(),
    };
  }

  avatar(user: Pick<User, 'avatarSource' | 'avatarAssetKey' | 'socialAvatarUrl'>): MeDto['avatar'] {
    if (user.avatarSource === 'upload' && user.avatarAssetKey) return { source: 'upload', url: `/api/assets/${user.avatarAssetKey}` };
    if (user.avatarSource === 'social' && user.socialAvatarUrl) return { source: 'social', url: user.socialAvatarUrl };
    return { source: 'character', url: null };
  }

  async cheeseBalance(userId: string): Promise<number> {
    const sum = await this.prisma.cheeseLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return sum._sum.delta ?? 0;
  }

  /** Login: existing social account → its user; otherwise a new member with a unique nickname. */
  async findOrCreateSocial(provider: OAuthProvider, profile: OAuthProfile): Promise<User> {
    const existing = await this.prisma.socialAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (existing) return existing.user;
    for (let attempt = 0; attempt < 5; attempt++) {
      const nickname = await this.freeNickname(profile.nickname ?? '쥐돌이');
      try {
        return await this.prisma.user.create({
          data: {
            nickname,
            socialAvatarUrl: profile.avatarUrl,
            avatarSource: profile.avatarUrl ? 'social' : 'character',
            socialAccounts: { create: { provider, providerUserId: profile.providerUserId } },
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    throw conflict('NICKNAME_RACE', '닉네임을 정하지 못했어요. 다시 시도해 주세요');
  }

  /** `base` cut to 10 code points; on collision a numeric suffix replaces the tail. */
  async freeNickname(base: string): Promise<string> {
    const max = this.cfg.nickname.memberMax;
    const clean = [...(base.trim() || '쥐돌이')].slice(0, max).join('');
    if (!(await this.prisma.user.findUnique({ where: { nickname: clean } }))) return clean;
    for (let i = 0; i < 50; i++) {
      const suffix = String(Math.floor(1000 + Math.random() * 9000));
      const candidate = [...clean].slice(0, max - suffix.length).join('') + suffix;
      if (!(await this.prisma.user.findUnique({ where: { nickname: candidate } }))) return candidate;
    }
    throw conflict('NICKNAME_RACE', '닉네임을 정하지 못했어요');
  }

  async nicknameAvailable(raw: string, selfId?: string): Promise<NicknameAvailabilityDto> {
    const nickname = (raw ?? '').trim();
    if (!nickname) return { nickname, available: false, reason: 'EMPTY' };
    if (codePoints(nickname) > this.cfg.nickname.memberMax) return { nickname, available: false, reason: 'TOO_LONG' };
    const taken = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    return taken && taken.id !== selfId ? { nickname, available: false, reason: 'TAKEN' } : { nickname, available: true };
  }

  async updateProfile(userId: string, req: UpdateProfileRequest): Promise<MeDto> {
    const data: Record<string, unknown> = {};
    if (req.nickname !== undefined) {
      const check = await this.nicknameAvailable(req.nickname, userId);
      if (!check.available) {
        if (check.reason === 'TAKEN') throw conflict('NICKNAME_TAKEN', '이미 쓰고 있는 닉네임이에요');
        throw badRequest(`NICKNAME_${check.reason}`, '닉네임은 1~10자로 정해 주세요');
      }
      data.nickname = check.nickname;
    }
    if (req.avatarSource !== undefined) {
      if (!['social', 'upload', 'character'].includes(req.avatarSource)) throw badRequest('BAD_AVATAR_SOURCE', '사진 출처가 올바르지 않아요');
      if (req.avatarSource === 'upload') {
        if (!req.avatarAssetKey) throw badRequest('ASSET_REQUIRED', '업로드한 사진이 필요해요');
        const asset = await this.prisma.asset.findUnique({ where: { key: req.avatarAssetKey }, select: { key: true } });
        if (!asset) throw badRequest('ASSET_NOT_FOUND', '업로드한 사진을 찾을 수 없어요');
        data.avatarAssetKey = asset.key;
      }
      data.avatarSource = req.avatarSource;
    }
    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw conflict('NICKNAME_TAKEN', '이미 쓰고 있는 닉네임이에요');
      throw error;
    }
    return this.me(userId);
  }

  async setTopics(userId: string, topicIds: readonly string[]): Promise<MeDto> {
    if (!Array.isArray(topicIds) || topicIds.some((t) => !(TOPIC_IDS as readonly string[]).includes(t))) {
      throw badRequest('BAD_TOPIC', '주제가 올바르지 않아요');
    }
    const unique = [...new Set(topicIds)];
    await this.prisma.$transaction([
      this.prisma.userTopic.deleteMany({ where: { userId, topicId: { notIn: unique } } }),
      ...unique.map((topicId) =>
        this.prisma.userTopic.upsert({ where: { userId_topicId: { userId, topicId } }, create: { userId, topicId }, update: {} }),
      ),
    ]);
    return this.me(userId);
  }

  async xpLedger(userId: string, limit = 50): Promise<XpLedgerEntryDto[]> {
    const rows = await this.prisma.xpLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
    return rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      amount: r.amount,
      preCapAmount: r.preCapAmount,
      cappedAmount: r.cappedAmount,
      reason: r.reason,
      kstDay: dateToDay(r.kstDay),
      configVersion: r.configVersion,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async topicProgress(userId: string, topicId: string): Promise<TopicProgressDto> {
    if (!(TOPIC_IDS as readonly string[]).includes(topicId)) throw notFound('TOPIC_NOT_FOUND', '주제를 찾을 수 없어요');
    const [p, selected] = await Promise.all([
      this.prisma.topicProgress.findUnique({ where: { userId_topicId: { userId, topicId } } }),
      this.prisma.userTopic.findUnique({ where: { userId_topicId: { userId, topicId } } }),
    ]);
    const highest = p?.highestClearedStage ?? 0;
    return {
      topicId: topicId as TopicId,
      level: Math.min(highest + 1, this.cfg.stage.maxLevel),
      highestClearedStage: highest,
      completed: p?.completed ?? false,
      selected: !!selected,
      started: p?.started ?? false,
    };
  }
}
