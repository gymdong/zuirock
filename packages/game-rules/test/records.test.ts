import { describe, expect, it } from 'vitest';
import { EMPTY_MULTI_AGGREGATE, MIN_RANKED_ANSWERS, MIN_TOPIC_ANSWERS, multiRecord, placeByValue } from '../src/records.js';

describe('multiRecord', () => {
  it('is all zero / null before the first game', () => {
    expect(multiRecord(EMPTY_MULTI_AGGREGATE)).toEqual({
      played: 0, wins: 0, losses: 0, winRate: null, answered: 0, correct: 0, correctRate: null, bestTopic: null,
    });
  });

  it('wins / losses / rates', () => {
    const r = multiRecord({ played: 8, wins: 5, topics: [{ topicId: 'science', answered: 20, correct: 15 }, { topicId: 'history', answered: 10, correct: 4 }] });
    expect(r).toMatchObject({ played: 8, wins: 5, losses: 3, winRate: 0.625, answered: 30, correct: 19 });
    expect(r.correctRate).toBeCloseTo(19 / 30, 12);
    expect(r.bestTopic).toEqual({ topicId: 'science', correctRate: 0.75, answered: 20 });
  });

  it(`a topic needs ${MIN_TOPIC_ANSWERS}+ answers to be the best topic`, () => {
    const r = multiRecord({ played: 1, wins: 1, topics: [{ topicId: 'science', answered: 4, correct: 4 }, { topicId: 'general', answered: 6, correct: 4 }] });
    expect(r.bestTopic).toEqual({ topicId: 'general', correctRate: 4 / 6, answered: 6 });
    expect(multiRecord({ played: 1, wins: 1, topics: [{ topicId: 'science', answered: 4, correct: 4 }] }).bestTopic).toBeNull();
  });

  it('equal rates pick the topic with more answers, then the lower id', () => {
    expect(multiRecord({ played: 2, wins: 1, topics: [{ topicId: 'history', answered: 6, correct: 3 }, { topicId: 'science', answered: 10, correct: 5 }] }).bestTopic?.topicId).toBe('science');
    expect(multiRecord({ played: 2, wins: 1, topics: [{ topicId: 'science', answered: 6, correct: 3 }, { topicId: 'history', answered: 6, correct: 3 }] }).bestTopic?.topicId).toBe('history');
  });

  it('min ranked answers is 10', () => expect(MIN_RANKED_ANSWERS).toBe(10));
});

describe('placeByValue', () => {
  it('competition ranking with shared places', () => {
    expect(placeByValue([5, 9, 9, 1])).toEqual([3, 1, 1, 4]);
    expect(placeByValue([3])).toEqual([1]);
    expect(placeByValue([])).toEqual([]);
  });
  it('null values are unranked and do not take a place', () => {
    expect(placeByValue([0.5, null, 0.9, null, 0.5])).toEqual([2, null, 1, null, 2]);
    expect(placeByValue([null, null])).toEqual([null, null]);
  });
});
