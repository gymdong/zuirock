import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/** Throwaway run databases older than this are left over from crashed runs and get dropped. */
const STALE_SEC = 6 * 3600;

/**
 * Creates the test database if needed and applies migrations once per run. A per-run database
 * (vitest.config.ts, ZR_TEST_DB_EPHEMERAL) is created here and dropped by the returned teardown.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://zuirock:zuirock@localhost:5432/zuirock_test_lb';
  // Never touch another lane's or the shared demo database: tests only run on zuirock_test_*.
  const name = /\/(zuirock_test_[a-z0-9_]+)(\?|$)/.exec(url)?.[1];
  if (!name) throw new Error(`refusing to run tests on ${url} (need a zuirock_test_* database)`);
  const ephemeral = process.env.ZR_TEST_DB_EPHEMERAL === '1';
  const admin = new PrismaClient({ datasourceUrl: url.replace(`/${name}`, '/postgres') });
  if (ephemeral) {
    const now = Math.floor(Date.now() / 1000);
    const runs = await admin.$queryRaw<Array<{ datname: string }>>`SELECT datname FROM pg_database WHERE datname LIKE 'zuirock_test_run_%'`;
    for (const { datname } of runs) {
      const at = Number(/^zuirock_test_run_(\d+)_/.exec(datname)?.[1]);
      if (at && now - at > STALE_SEC) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  }
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: new URL('../..', import.meta.url).pathname });
  return async () => {
    if (ephemeral) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
