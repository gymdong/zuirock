import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeUser, type TestApp } from '../support/app.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const q = (i: number, over: object = {}) => ({
  topic: '과학', subfield: '화학', type: 'mcq', difficulty: 2, question: `물질 문제 ${i}번은 무엇일까?`, answer: 'A',
  choices: ['A', 'B', 'C', 'D'], explanation: '화학 교과서에 나오는 기본 개념입니다.', source: { title: '교과서', url: '' }, ...over,
});

describe('assets, static routing, admin API', () => {
  let t: TestApp;
  let admin: string;
  let member: string;
  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'zr-static-'));
    mkdirSync(join(root, 'web/_expo/static/js'), { recursive: true });
    mkdirSync(join(root, 'admin'), { recursive: true });
    writeFileSync(join(root, 'web/index.html'), '<html>web</html>');
    writeFileSync(join(root, 'web/_expo/static/js/app.js'), 'console.log(1)');
    writeFileSync(join(root, 'admin/index.html'), '<html>admin</html>');
    process.env.STATIC_ROOT = root;
    process.env.ANDROID_CERT_SHA256 = 'AA:BB, CC:DD';
    t = await createTestApp();
    admin = (await makeUser(t, '관리자', true)).auth;
    member = (await makeUser(t, '회원')).auth;
  });
  afterAll(() => t.close());

  it('assets: auth, type sniffing, 1 MB limit, immutable cache', async () => {
    await t.http().post('/api/assets').attach('file', PNG, 'a.png').expect(401);
    const up = await t.http().post('/api/assets').set('Authorization', member).attach('file', PNG, 'a.png').expect(201);
    expect(up.body.url).toBe(`/api/assets/${up.body.key}`);
    const got = await t.http().get(up.body.url).expect(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    await t.http().post('/api/assets').set('Authorization', member).attach('file', Buffer.from('GIF89a....'), 'a.png').expect(415);
    await t.http().post('/api/assets').set('Authorization', member).attach('file', Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]), 'big.png').expect(413);
    await t.http().get('/api/assets/nothere').expect(404);
  });

  it.each([
    ['/join/1234', 'text/html', 200, 'web'],
    ['/', 'text/html', 200, 'web'],
    ['/_expo/static/js/app.js', '*/*', 200, 'console'],
    ['/admin/questions', 'text/html', 200, 'admin'],
    ['/api/nope', 'text/html', 404, ''],
    ['/missing.png', 'image/png', 404, ''],
  ])('static %s (%s) → %i', async (path, accept, status, body) => {
    const r = await t.http().get(path).set('Accept', accept).expect(status);
    if (body) expect(r.text).toContain(body);
  });

  it('/socket.io is left to the socket server (never the SPA)', async () => {
    const r = await t.http().get('/socket.io/x').set('Accept', 'text/html');
    expect(r.text).not.toContain('<html>web');
  });

  it('assetlinks.json from env', async () => {
    const r = await t.http().get('/.well-known/assetlinks.json').expect(200);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.body[0].target).toEqual({ namespace: 'android_app', package_name: 'com.zuirock.app', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] });
  });

  it('admin: guard, import (dry-run, drafts, errors), transitions, bulk approve conditions', async () => {
    await t.http().get('/api/admin/questions').set('Authorization', member).expect(403);
    const file = [q(1), q(2), q(3, { choices: ['B', 'C', 'D', 'E'] }), q(1)];
    const dry = await t.http().post('/api/admin/questions/import?dryRun=1').set('Authorization', admin).send(file).expect(200);
    expect(dry.body).toMatchObject({ total: 4, acceptedCount: 2, dryRun: true });
    expect(dry.body.errors.map((e: { index: number }) => e.index).sort()).toEqual([3, 4]);
    expect(await t.prisma.question.count()).toBe(0);
    const imp = await t.http().post('/api/admin/questions/import').set('Authorization', admin).send(file).expect(200);
    expect(imp.body.acceptedCount).toBe(2);
    const list = await t.http().get('/api/admin/questions?status=draft').set('Authorization', admin).expect(200);
    const ids = list.body.items.map((x: { id: string }) => x.id);
    expect(ids).toHaveLength(2);
    // not served while draft (AC-C3)
    expect((await t.http().get('/api/topics').expect(200)).body.find((x: { id: string }) => x.id === 'science').available).toBe(false);

    await t.http().patch(`/api/admin/questions/${ids[0]}`).set('Authorization', admin).send({ status: 'published' }).expect(409);
    await t.http().post('/api/admin/questions/approve').set('Authorization', admin).send({ questionIds: ids, linksChecked: false }).expect(409);
    for (const id of ids) await t.http().patch(`/api/admin/questions/${id}`).set('Authorization', admin).send({ status: 'reviewed' }).expect(200);
    await t.http().post('/api/admin/questions/approve').set('Authorization', admin).send({ questionIds: [] }).expect(400);
    const ok = await t.http().post('/api/admin/questions/approve').set('Authorization', admin).send({ questionIds: ids, linksChecked: false }).expect(200);
    expect(ok.body.published).toBe(2);
    expect((await t.http().get('/api/topics').expect(200)).body.find((x: { id: string }) => x.id === 'science').available).toBe(true);
    await t.http().patch(`/api/admin/questions/${ids[0]}`).set('Authorization', admin).send({ choices: ['X', 'B', 'C', 'D'] }).expect(400);
    await t.http().get('/api/admin/issue-reports').set('Authorization', admin).expect(200);
    await t.http().get('/api/admin/calibration').set('Authorization', admin).expect(200);
  });
});
