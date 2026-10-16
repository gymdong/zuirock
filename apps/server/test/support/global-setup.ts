import { execSync } from 'node:child_process';

/** Creates the test database if needed and applies migrations once per run. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://zuirock:zuirock@localhost:5432/zuirock_test_lb';
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: new URL('../..', import.meta.url).pathname });
}
