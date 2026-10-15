import { Injectable } from '@nestjs/common';
import type { OwnerRef, WrongNoteDto } from '@zuirock/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { toPublicQuestion, toRevealDto } from '../../common/question-dto.js';
import type { Tx } from '../../ports/tx.js';
import type { WrongNotePort, WrongNoteResult } from '../../ports/wrong-note.port.js';

/** Wrong-note upkeep (AC-D6). Guests: no-op (notes are rebuilt from SolveLogs on merge). */
@Injectable()
export class WrongNotesService implements WrongNotePort {
  constructor(private readonly prisma: PrismaService) {}

  async recordResults(tx: Tx, owner: OwnerRef, results: readonly WrongNoteResult[]): Promise<void> {
    if (owner.kind !== 'user') return;
    await applyWrongNotes(tx, owner.userId, results);
  }

  async list(userId: string, status?: string): Promise<WrongNoteDto[]> {
    const rows = await this.prisma.wrongNote.findMany({
      where: { userId, ...(status === 'open' || status === 'reviewed' ? { status } : {}) },
      include: { question: { include: { subfield: true } } },
      orderBy: { lastWrongAt: 'desc' },
    });
    return rows.map((n) => ({
      questionId: n.questionId,
      question: toPublicQuestion(n.question),
      reveal: toRevealDto(n.question),
      status: n.status,
      wrongCount: n.wrongCount,
      lastWrongAt: n.lastWrongAt.toISOString(),
      reviewedAt: n.reviewedAt?.toISOString() ?? null,
    }));
  }
}

/** Wrong answer → open/increment (a reviewed note reopens); correct review answer → reviewed. */
export async function applyWrongNotes(tx: Tx, userId: string, results: readonly WrongNoteResult[]): Promise<void> {
  for (const r of [...results].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!r.correct) {
      await tx.wrongNote.upsert({
        where: { userId_questionId: { userId, questionId: r.questionId } },
        create: { userId, questionId: r.questionId, firstWrongAt: r.at, lastWrongAt: r.at },
        update: { wrongCount: { increment: 1 }, lastWrongAt: r.at, status: 'open', reviewedAt: null },
      });
    } else if (r.isReview) {
      await tx.wrongNote.updateMany({
        where: { userId, questionId: r.questionId, status: 'open' },
        data: { status: 'reviewed', reviewedAt: r.at },
      });
    }
  }
}
