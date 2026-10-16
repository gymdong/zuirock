// One-command local E2E: `pnpm e2e:local` (needs Docker and a clean checkout with `pnpm i` done).
// Creates/migrates the lane DB zuirock_lf (any other DB name is refused), builds, starts the server on :3004 with generated
// dev secrets, seeds, verifies, runs the Playwright suite, stops the server and prints PASS/FAIL. E2E_SKIP_BUILD=1 reuses builds.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const PORT = 3004;
const ORIGIN = `http://localhost:${PORT}`;
const DB = 'zuirock_lf';
const dbUrl = `postgresql://zuirock:zuirock@localhost:5432/${DB}`;
if (!/^zuirock_lf/.test(DB)) throw new Error(`refusing to touch database ${DB}`);

const staticRoot = resolve(root, '.e2e/static');
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PORT),
  PUBLIC_ORIGIN: ORIGIN,
  DATABASE_URL: dbUrl,
  DIRECT_URL: dbUrl,
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: randomBytes(32).toString('base64url'),
  STATE_SECRET: randomBytes(32).toString('base64url'),
  GUEST_TOKEN_SECRET: randomBytes(32).toString('base64url'),
  DEV_LOGIN: '1',
  STATIC_ROOT: staticRoot,
  E2E_BASE_URL: ORIGIN,
};
delete env.E2E_TARGET;
delete env.EXPO_PUBLIC_API_MOCK;

function run(label: string, cmd: string, args: string[], extra: NodeJS.ProcessEnv = {}): void {
  console.log(`\n[e2e:local] ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, env: { ...env, ...extra }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

let server: ChildProcess | undefined;
let ok = false;
try {
  run('docker compose up', 'docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d', '--wait']);
  const exists = spawnSync('docker', ['exec', 'zuirock-postgres-1', 'psql', '-U', 'zuirock', '-tAc', `select 1 from pg_database where datname='${DB}'`], { encoding: 'utf8' });
  if (!exists.stdout.includes('1')) run(`create database ${DB}`, 'docker', ['exec', 'zuirock-postgres-1', 'psql', '-U', 'zuirock', '-c', `CREATE DATABASE ${DB}`]);
  if (process.env.E2E_SKIP_BUILD !== '1' || !existsSync(resolve(staticRoot, 'web/index.html'))) {
    run('build shared, game-rules, server', 'pnpm', ['turbo', 'run', 'build', '--filter=@zuirock/server...']);
    run('export web', 'pnpm', ['--filter', '@zuirock/mobile', 'run', 'export:web']);
    run('build admin', 'pnpm', ['--filter', '@zuirock/admin', 'run', 'build']);
    rmSync(staticRoot, { recursive: true, force: true });
    mkdirSync(staticRoot, { recursive: true });
    cpSync(resolve(root, 'apps/mobile/dist'), resolve(staticRoot, 'web'), { recursive: true });
    cpSync(resolve(root, 'apps/admin/dist'), resolve(staticRoot, 'admin'), { recursive: true });
  }
  run('migrate', 'pnpm', ['--filter', '@zuirock/server', 'run', 'prisma:deploy']);

  console.log('\n[e2e:local] start server');
  server = spawn('node', ['apps/server/dist/main.js'], { cwd: root, env, stdio: 'inherit' });
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    up = await fetch(`${ORIGIN}/api/health?deep=1`).then((r) => r.ok, () => false);
  }
  if (!up) throw new Error('server did not become healthy');

  run('seed:reset', 'node', ['scripts/seed/insert.ts', '--reset', '--dev-questions']);
  run('seed:verify', 'node', ['scripts/seed/verify.ts']);
  run('playwright', 'node', ['node_modules/@playwright/test/cli.js', 'test', '-c', 'e2e/playwright.config.ts']);
  ok = true;
} catch (error) {
  console.error(`\n[e2e:local] ${(error as Error).message}`);
} finally {
  server?.kill('SIGTERM');
}
console.log(`\n[e2e:local] ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
