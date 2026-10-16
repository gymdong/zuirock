import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { validateGuestNickname, type GrowthConfig } from '@zuirock/game-rules';
import type { CreateGuestRequest, GuestSession } from '@zuirock/shared';
import { badRequest } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TokensService } from '../../common/tokens.service.js';

const DAY_MS = 86_400_000;

@Injectable()
export class GuestsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Guests');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async create(req: CreateGuestRequest): Promise<GuestSession> {
    let nickname: string | null = null;
    if (req?.nickname !== undefined && req.nickname !== null) {
      const v = validateGuestNickname(String(req.nickname), this.cfg);
      if (!v.ok) throw badRequest(`NICKNAME_${v.reason}`, '닉네임은 2~10자로 정해 주세요');
      nickname = v.nickname;
    }
    const now = new Date(this.clock.now());
    const guest = await this.prisma.guest.create({ data: { nickname, createdAt: now, lastSeenAt: now } });
    const { token, expiresAt } = this.tokens.signGuest(guest.id);
    return { guestId: guest.id, guestToken: token, nickname, expiresAt: expiresAt.toISOString() };
  }

  /** AC-A3: unmerged guests unseen for 30 days are deleted with their records (FK cascade). */
  async cleanup(): Promise<number> {
    const cutoff = new Date(this.clock.now() - this.cfg.guest.retentionDays * DAY_MS);
    const { count } = await this.prisma.guest.deleteMany({ where: { mergedUserId: null, lastSeenAt: { lt: cutoff } } });
    return count;
  }

  /** On boot and daily (a sleeping free instance runs it when it wakes up). */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    const run = () => this.cleanup().then((n) => n && this.log.log(`deleted ${n} expired guests`)).catch((e) => this.log.warn(`guest cleanup failed: ${(e as Error).message}`));
    void run();
    this.timer = setInterval(run, DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
