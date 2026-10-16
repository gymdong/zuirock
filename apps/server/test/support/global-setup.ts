import { execSync } from 'node:child_process';

/** Creates the test database if needed and applies migrations once per run. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://zuirock:zuirock@localhost:5432/zuirock_test_lb';
  // Never touch another lane's or the shared demo database: tests only run on zuirock_test_*.
  if (!/\/zuirock_test_[a-z0-9_]+(\?|$)/.test(url)) throw new Error(`refusing to run tests on ${url} (need a zuirock_test_* database)`);
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: new URL('../..', import.meta.url).pathname });
}
