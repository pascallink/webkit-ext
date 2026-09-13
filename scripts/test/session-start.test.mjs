// Tests fuer .claude/hooks/session-start.sh. Geprueft wird nur die
// Hook-Konfiguration - Installation und Chromium-Check haengen an einer
// echten Umgebung und bleiben aussen vor. Jeder Fall arbeitet gegen ein
// Wegwerf-Repo, die Maschinen-Config wird nie angefasst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const HOOK = path.join(REPO_ROOT, '.claude', 'hooks', 'session-start.sh');

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-'));
  const env = {
    ...process.env,
    HOME: dir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    CLAUDE_PROJECT_DIR: dir,
  };
  execFileSync('git', ['init', '-q'], { cwd: dir, env });
  return { dir, env };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function hooksPath(dir, env) {
  const result = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: dir,
    env,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

function runHook(dir, env, extraEnv) {
  return spawnSync('bash', [HOOK], { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8' });
}

test('Cloud-Sitzung aktiviert die Git-Hooks aus .githooks', (t) => {
  const { dir, env } = initRepo();
  t.after(() => cleanup(dir));

  const result = runHook(dir, env, { CLAUDE_CODE_REMOTE: 'true' });
  assert.equal(result.status, 0);
  assert.equal(hooksPath(dir, env), '.githooks');
});

test('lokale Sitzung aendert die Konfiguration nicht, weist aber darauf hin', (t) => {
  const { dir, env } = initRepo();
  t.after(() => cleanup(dir));

  const result = runHook(dir, env, { CLAUDE_CODE_REMOTE: '' });
  assert.equal(result.status, 0);
  assert.equal(hooksPath(dir, env), '');
  assert.match(result.stdout, /npm run hooks:install/);
});

test('lokale Sitzung mit aktiven Hooks schweigt', (t) => {
  const { dir, env } = initRepo();
  t.after(() => cleanup(dir));

  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir, env });

  const result = runHook(dir, env, { CLAUDE_CODE_REMOTE: '' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});
