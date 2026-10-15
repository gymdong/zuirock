import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/** Shared Redis connection (rooms, OAuth nonces). Lazy so the API boots while Redis is down. */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    super(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }
}
