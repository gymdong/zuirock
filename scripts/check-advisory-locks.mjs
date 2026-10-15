// Fails when session-level advisory locks are used. Only pg_advisory_xact_lock /
// pg_try_advisory_xact_lock are allowed (PgBouncer transaction pooling, plan §2.3(d)).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps', 'packages', 'scripts'];
const skip = new Set(['node_modules', 'dist', '.expo', '.turbo', 'coverage']);
const forbidden = /pg_(try_)?advisory_(un)?lock(_shared)?\s*\(|pg_advisory_unlock_all/;
const self = 'scripts/check-advisory-locks.mjs';
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs|cjs|sql|lua)$/.test(name) && path !== self) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => forbidden.test(line) && hits.push(`${path}:${i + 1}: ${line.trim()}`));
    }
  }
}

roots.forEach(walk);
if (hits.length) {
  console.error('Session advisory locks are forbidden; use pg_advisory_xact_lock:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('advisory lock check: ok');
