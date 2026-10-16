import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Lazily connected Prisma client (connects on first query; Neon may be suspended at boot).
 * PRISMA_QUERY_EVENTS=1 emits `query` events (tests count DB round trips per request).
 */
@Injectable()
export class PrismaService extends PrismaClient<{ log: [{ emit: 'event'; level: 'query' }] }> implements OnModuleDestroy {
  constructor() {
    super((process.env.PRISMA_QUERY_EVENTS === '1' ? { log: [{ emit: 'event', level: 'query' }] } : {}) as never);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
