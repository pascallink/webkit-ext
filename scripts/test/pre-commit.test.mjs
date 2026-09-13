// Tests fuer .githooks/pre-commit: sichert die zentrale Zusage ab, dass der
// Hook einen Commit nie blockiert - egal ob der Collector fehlerhaft ist,
// fehlt oder korrekt eine CSV-Datei schreibt. Jeder Testfall baut dafuer ein
// eigenes Wegwerf-Repo in einem Temp-Verzeichnis auf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const HOOK_SOURCE = path.join(REPO_ROOT, '.githooks', 'pre-commit');

function gitEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };
}

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-hook-'));
  const env = gitEnv(dir);

  execFileSync('git', ['init', '-q'], { cwd: dir, env });
  // Lokal setzen, nie --global - die Maschinen-Config bleibt unangetastet.
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, env });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env });

  const hooksDir = path.join(dir, '.githooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookTarget = path.join(hooksDir, 'pre-commit');
  fs.copyFileSync(HOOK_SOURCE, hookTarget);
  fs.chmodSync(hookTarget, 0o755);

  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir, env });

  // Initialer Commit, damit HEAD existiert. Der Collector fehlt an dieser
  // Stelle absichtlich noch - der Hook muss auch das klaglos wegstecken.
  fs.writeFileSync(path.join(dir, 'README.md'), 'init\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir, env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env });

  return { dir, env };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function headSha(dir, env) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, env, encoding: 'utf8' }).trim();
}

function writeCollector(dir, code) {
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts', 'costs-update.mjs'), code);
}

function commitDatei(dir, env, name = 'datei.txt', inhalt = 'inhalt\n') {
  fs.writeFileSync(path.join(dir, name), inhalt);
  execFileSync('git', ['add', name], { cwd: dir, env });
  return spawnSync('git', ['commit', '-q', '-m', `test: ${name}`], { cwd: dir, env, encoding: 'utf8' });
}

test('Collector mit Syntaxfehler blockiert den Commit nicht', (t) => {
  const { dir, env } = initRepo();
  t.after(() => cleanup(dir));

  writeCollector(dir, 'const x = ;\n');
  const shaVorher = headSha(dir, env);

  const result = commitDatei(dir, env);
  assert.equal(result.status, 0);

  const shaNachher = headSha(dir, env);
  assert.notEqual(shaNachher, shaVorher);
});

test('fehlender Collector blockiert den Commit nicht', (t) => {
  const { dir, env } = initRepo();
  t.after(() => cleanup(dir));

  // scripts/costs-update.mjs bewusst nicht anlegen.
  const result = commitDatei(dir, env);
  assert.equal(result.status, 0);
});

test('laufender Collector schreibt stats/costs.csv ohne manuelles Staging', (t) => {
  const { dir, env } = initRepo();
  t.after(() => cleanup(dir));

  writeCollector(
    dir,
    [
      "import fs from 'node:fs';",
      "fs.mkdirSync('stats', { recursive: true });",
      "fs.writeFileSync('stats/costs.csv', 'branch,session_id,updated_at,cost_usd\\n');",
      '',
    ].join('\n'),
  );

  const result = commitDatei(dir, env);
  assert.equal(result.status, 0);

  const tree = execFileSync(
    'git',
    ['ls-tree', '--name-only', 'HEAD', '--', 'stats/costs.csv'],
    { cwd: dir, env, encoding: 'utf8' },
  ).trim();
  assert.notEqual(tree, '');
});

test('Hook-Datei im echten Repo ist als ausfuehrbar eingecheckt (Modus 100755)', (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-hook-home-'));
  t.after(() => cleanup(homeDir));
  const env = gitEnv(homeDir);

  // Liest nur den echten Projekt-Zustand, arbeitet nicht gegen ein Temp-Repo.
  const output = execFileSync(
    'git',
    ['ls-files', '-s', '.githooks/pre-commit'],
    { cwd: REPO_ROOT, env, encoding: 'utf8' },
  ).trim();

  assert.ok(output.startsWith('100755'), `unerwarteter Modus: ${output}`);
});
