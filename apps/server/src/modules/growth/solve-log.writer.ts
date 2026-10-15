import { Injectable } from '@nestjs/common';
import { toKstDay } from '@zuirock/game-rules';
import { dayToDate } from '../../common/kst-date.js';
import type { SolveLogInput, SolveLogWriter } from '../../ports/solve-log-writer.port.js';
import type { Tx } from '../../ports/tx.js';

/** SolveLog rows (AC-D1); duplicates on the idempotency keys are skipped. */
@Injectable()
export class PrismaSolveLogWriter implements SolveLogWriter {
  async writeMany(tx: Tx, logs: readonly SolveLogInput[]): Promise<void> {
    if (!logs.length) return;
    await tx.solveLog.createMany({
      skipDuplicates: true,
      data: logs.map((l) => ({
        userId: l.owner.kind === 'user' ? l.owner.userId : null,
        guestId: l.owner.kind === 'guest' ? l.owner.guestId : null,
        questionId: l.questionId,
        mode: l.mode,
        correct: l.correct,
        submitted: l.submitted,
        responseMs: Math.max(0, Math.round(l.responseMs)),
        beforeReveal: l.beforeReveal,
        hintUsed: l.hintUsed,
        attempts: l.attempts,
        isReview: l.isReview,
        answeredAt: l.answeredAt,
        kstDay: dayToDate(toKstDay(l.answeredAt.getTime())),
        setAttemptId: l.setAttemptId ?? null,
        battleResultId: l.battleResultId ?? null,
      })),
    });
  }
}
