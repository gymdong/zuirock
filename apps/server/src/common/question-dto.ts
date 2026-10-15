import type { Question, Subfield } from '@prisma/client';
import type { QuestionPublicDto, QuestionRevealDto, SubfieldName, TopicId } from '@zuirock/shared';

export type QuestionWithSubfield = Question & { subfield: Subfield };

/** Player view: never contains the answer. */
export function toPublicQuestion(q: QuestionWithSubfield): QuestionPublicDto {
  return {
    id: q.id,
    topicId: q.topicId as TopicId,
    subfield: q.subfield.name as SubfieldName,
    type: q.type,
    difficulty: q.difficulty,
    question: q.question,
    ...(q.type === 'mcq' ? { choices: q.choices } : {}),
    ...(q.type === 'chosung' ? { answerLength: [...q.answer.replace(/\s/g, '')].length } : {}),
  };
}

export function toRevealDto(q: Question): QuestionRevealDto {
  return { questionId: q.id, answer: q.answer, explanation: q.explanation, source: { title: q.sourceTitle, url: q.sourceUrl } };
}
