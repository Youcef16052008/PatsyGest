import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('db:push refuse même avec DATABASE_URL, sans lancer drizzle-kit', () => {
  const app = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync('npm', ['run', 'db:push'], {
    cwd: app,
    env: { ...process.env, DATABASE_URL: 'postgres://invalid:invalid@127.0.0.1:1/invalid' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /db:push est désactivé/);
  assert.doesNotMatch(result.stdout + result.stderr, /drizzle-kit push/);
});
