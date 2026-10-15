import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';

export interface HealthDto {
  status: 'ok';
  serverNow: number;
  db?: 'ok';
  redis?: 'ok';
}

/**
 * GET /api/health → 200. `?deep=1` also queries PostgreSQL and pings Redis (keepalive/warm-up,
 * plan §2.3(d)); any failure answers 503.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health(@Query('deep') deep?: string): Promise<HealthDto> {
    const body: HealthDto = { status: 'ok', serverNow: Date.now() };
    if (deep !== '1') return body;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      body.db = 'ok';
      if (this.redis.status === 'wait') await this.redis.connect();
      await this.redis.ping();
      body.redis = 'ok';
    } catch (error) {
      throw new HttpException({ ...body, status: 'error', message: (error as Error).message }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
