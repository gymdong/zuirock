import { Inject, Injectable } from '@nestjs/common';
import type { QuestionPublicDto, QuestionRevealDto, QuestionType, RoomSettings, SubfieldName, TopicId } from '@zuirock/shared';
import type { CandidateQuestion } from '@zuirock/game-rules';
import { PrismaService } from '../../common/prisma.service.js';

/** A question as the room engine keeps it in Redis for one battle (public part + answer for judging). */
export interface RoomQuestion {
  public: QuestionPublicDto;
  answer: string;
  reveal: QuestionRevealDto;
}

/** Read access to the published question bank (AC-C3: only `published` is ever served). */
export interface QuestionPool {
  /** Topics that currently have at least one published question (AC-C8). */
  availableTopicIds(): Promise<TopicId[]>;
  /** Published questions matching topics ∩ types ∩ difficulty ≥ min. */
  findCandidates(settings: Pick<RoomSettings, 'topicIds' | 'types' | 'minDifficulty'>): Promise<CandidateQuestion[]>;
  /** Loads still-published questions in the given order; missing/suspended ones are left out. */
  loadQuestions(ids: readonly string[]): Promise<RoomQuestion[]>;
  /**
   * 최근 푼 문제 덜 나오게: for each participant, the questions among their latest `limit` solves;
   * returns questionId → number of participants who solved it recently.
   */
  recentSolveCounts(owners: ReadonlyArray<{ userId: string | null; guestId: string | null }>, limit: number): Promise<Record<string, number>>;
}

export const QUESTION_POOL = Symbol('RoomQuestionPool');

@Injectable()
export class PrismaQuestionPool implements QuestionPool {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async availableTopicIds(): Promise<TopicId[]> {
    const rows = await this.prisma.question.findMany({
      where: { status: 'published' },
      distinct: ['topicId'],
      select: { topicId: true },
    });
    return rows.map((r) => r.topicId as TopicId);
  }

  async findCandidates(settings: Pick<RoomSettings, 'topicIds' | 'types' | 'minDifficulty'>): Promise<CandidateQuestion[]> {
    const rows = await this.prisma.question.findMany({
      where: {
        status: 'published',
        topicId: { in: [...settings.topicIds] },
        type: { in: [...settings.types] },
        difficulty: { gte: settings.minDifficulty },
      },
      select: { id: true, topicId: true, subfieldId: true, type: true, difficulty: true },
    });
    return rows.map((r) => ({ ...r, topicId: r.topicId as TopicId, type: r.type as QuestionType }));
  }

  /** One indexed query per participant ([userId|guestId, answeredAt]); at most 8 per battle start. */
  async recentSolveCounts(owners: ReadonlyArray<{ userId: string | null; guestId: string | null }>, limit: number): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const o of owners) {
      const where = o.userId ? { userId: o.userId } : o.guestId ? { guestId: o.guestId } : null;
      if (!where) continue;
      const rows = await this.prisma.solveLog.findMany({ where, orderBy: { answeredAt: 'desc' }, take: limit, select: { questionId: true } });
      for (const id of new Set(rows.map((r) => r.questionId))) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }

  async loadQuestions(ids: readonly string[]): Promise<RoomQuestion[]> {
    const rows = await this.prisma.question.findMany({
      where: { id: { in: [...ids] }, status: 'published' },
      include: { subfield: { select: { name: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const q = byId.get(id);
      if (!q) return [];
      const type = q.type as QuestionType;
      return [
        {
          public: {
            id: q.id,
            topicId: q.topicId as TopicId,
            subfield: q.subfield.name as SubfieldName,
            type,
            difficulty: q.difficulty,
            question: q.question,
            ...(type === 'mcq' ? { choices: q.choices } : {}),
            ...(type === 'chosung' ? { answerLength: [...q.answer].length } : {}),
          },
          answer: q.answer,
          reveal: {
            questionId: q.id,
            answer: q.answer,
            explanation: q.explanation,
            source: { title: q.sourceTitle, url: q.sourceUrl },
          },
        },
      ];
    });
  }
}
