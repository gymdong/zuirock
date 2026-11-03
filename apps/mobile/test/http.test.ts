import { describe, expect, it, vi } from 'vitest';
import { parseResponse, withRetry } from '../src/lib/http';

describe('parseResponse', () => {
  it('parses a JSON body on success', () => {
    expect(parseResponse(200, '{"a":1}')).toEqual({ kind: 'ok', data: { a: 1 } });
  });
  it('treats an empty success body as null', () => {
    expect(parseResponse(204, '')).toEqual({ kind: 'ok', data: null });
  });
  it('reads the server error body for 4xx/500 JSON errors', () => {
    expect(parseResponse(409, '{"code":"ROOM_FULL","message":"가득 참"}')).toEqual({
      kind: 'api-error',
      status: 409,
      body: { code: 'ROOM_FULL', message: '가득 참' },
    });
  });
  it('keeps an empty error body as a plain API error', () => {
    expect(parseResponse(500, '')).toEqual({ kind: 'api-error', status: 500, body: {} });
  });
  // 서버가 깨어나는 중이거나 프록시·공용 와이파이가 HTML 을 돌려줄 때: JSON Parse error 가 화면에 나가던 경우
  it('flags an HTML page with status 200 as a connection problem', () => {
    expect(parseResponse(200, '<!DOCTYPE html><html><body>Service waking up</body></html>')).toEqual({ kind: 'unavailable' });
  });
  it('flags a non-JSON error page as a connection problem', () => {
    expect(parseResponse(500, 'Internal Server Error')).toEqual({ kind: 'unavailable' });
  });
  it.each([502, 503, 504])('flags proxy status %i as a connection problem even with a JSON body', (status) => {
    expect(parseResponse(status, '{"x":1}')).toEqual({ kind: 'unavailable' });
  });
  it('does not treat a normal 404 JSON error as a connection problem', () => {
    expect(parseResponse(404, '{"code":"ROOM_NOT_FOUND"}').kind).toBe('api-error');
  });
});

describe('withRetry', () => {
  const noSleep = async (_ms: number) => {};
  const retryable = (e: unknown) => e instanceof Error && e.message === 'conn';

  it('returns the first success without waiting', async () => {
    const attempt = vi.fn(async () => 'ok');
    expect(await withRetry(attempt, retryable, [10, 20], noSleep)).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  it('retries a connection failure and succeeds on a later attempt', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error('conn')).mockRejectedValueOnce(new Error('conn')).mockResolvedValue('ok');
    const sleep = vi.fn(async (_ms: number) => {});
    expect(await withRetry(attempt, retryable, [10, 20], sleep)).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });
  it('gives up after the last delay and throws the last error', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('conn'));
    await expect(withRetry(attempt, retryable, [10, 20], noSleep)).rejects.toThrow('conn');
    expect(attempt).toHaveBeenCalledTimes(3);
  });
  it('does not retry a failure that is not retryable', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('bad request'));
    await expect(withRetry(attempt, retryable, [10, 20], noSleep)).rejects.toThrow('bad request');
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
