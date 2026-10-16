import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { staticMiddleware } from '../../src/modules/static/static.module.js';

const root = mkdtempSync(join(tmpdir(), 'static-'));
mkdirSync(join(root, 'web'));
mkdirSync(join(root, 'admin'));
writeFileSync(join(root, 'web/index.html'), 'WEB');
writeFileSync(join(root, 'admin/index.html'), 'ADMIN');
const mw = staticMiddleware(root);

/** Runs the middleware; resolves to the body it sent, or 'next' when it fell through. */
function run(path: string, accept?: string): Promise<string> {
  return new Promise((resolve) => {
    const res = new Writable({
      write(chunk, _enc, cb) {
        resolve(String(chunk));
        cb();
      },
    }) as unknown as Parameters<typeof mw>[1];
    (res as unknown as { setHeader: () => void }).setHeader = () => undefined;
    const req = { method: 'GET', path, headers: accept === undefined ? {} : { accept } } as Parameters<typeof mw>[0];
    mw(req, res, () => resolve('next'));
  });
}

describe('static middleware admin SPA fallback', () => {
  it.each([undefined, '*/*', 'text/html,application/xhtml+xml'])('serves /admin/ for Accept=%s', async (accept) => {
    expect(await run('/admin/', accept)).toBe('ADMIN');
    expect(await run('/admin/questions/1', accept)).toBe('ADMIN');
  });

  it('does not answer API-style Accept for unknown admin paths', async () => {
    expect(await run('/admin/missing', 'application/json')).toBe('next');
  });

  it('never handles /api or /socket.io', async () => {
    expect(await run('/api/health', '*/*')).toBe('next');
    expect(await run('/socket.io/', '*/*')).toBe('next');
  });
});
