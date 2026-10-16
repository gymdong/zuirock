import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { SubfieldName, TopicDto, TopicId } from '@zuirock/shared';
import { PrismaService } from '../../common/prisma.service.js';

interface TopicJson {
  id: string;
  name: string;
  subtitle: string;
  subfields: string[];
  mvp: boolean;
}

/** content/topics.json: TOPICS_JSON env, the repo checkout, or /app/content in the image. */
export function findTopicsJson(): string | null {
  const candidates = [
    process.env.TOPICS_JSON,
    resolve(process.cwd(), 'content/topics.json'),
    resolve(process.cwd(), '../../content/topics.json'),
    new URL('../../../../../content/topics.json', import.meta.url).pathname,
    new URL('../../../content/topics.json', import.meta.url).pathname,
  ].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Topics are data (AC-C8): seeded from topics.json; availability = has published questions. */
@Injectable()
export class TopicsService implements OnApplicationBootstrap {
  private readonly log = new Logger('Topics');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (error) {
      this.log.warn(`topic seed skipped: ${(error as Error).message}`);
    }
  }

  async seed(path = findTopicsJson()): Promise<number> {
    if (!path) throw new Error('content/topics.json not found (set TOPICS_JSON)');
    const topics = JSON.parse(readFileSync(path, 'utf8')) as TopicJson[];
    for (const [i, t] of topics.entries()) {
      const data = { name: t.name, subtitle: t.subtitle, sortOrder: i, mvp: t.mvp };
      await this.prisma.topic.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
      for (const name of t.subfields) {
        await this.prisma.subfield.upsert({ where: { topicId_name: { topicId: t.id, name } }, create: { topicId: t.id, name }, update: {} });
      }
    }
    return topics.length;
  }

  async list(): Promise<TopicDto[]> {
    const [topics, counts] = await Promise.all([
      this.prisma.topic.findMany({ include: { subfields: { orderBy: { name: 'asc' } } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.question.groupBy({ by: ['topicId'], where: { status: 'published' }, _count: { _all: true } }),
    ]);
    const published = new Map(counts.map((c) => [c.topicId, c._count._all]));
    return topics.map((t) => ({
      id: t.id as TopicId,
      name: t.name,
      subtitle: t.subtitle,
      subfields: t.subfields.map((s) => ({ id: s.id, name: s.name as SubfieldName })),
      available: (published.get(t.id) ?? 0) > 0,
      sortOrder: t.sortOrder,
    }));
  }

  /** Published question counts by topic × type × difficulty (room creation hints, content checks). */
  async stats(): Promise<Array<{ topicId: string; type: string; difficulty: number; count: number }>> {
    const rows = await this.prisma.question.groupBy({
      by: ['topicId', 'type', 'difficulty'],
      where: { status: 'published' },
      _count: { _all: true },
      orderBy: [{ topicId: 'asc' }, { type: 'asc' }, { difficulty: 'asc' }],
    });
    return rows.map((r) => ({ topicId: r.topicId, type: r.type, difficulty: r.difficulty, count: r._count._all }));
  }
}
