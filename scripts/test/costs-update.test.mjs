// Tests fuer scripts/costs-update.mjs gegen Fixture-Transcripts in einem
// temporaeren Git-Repo je Testfall. Kein Netzwerk, keine echte Session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, '..', 'costs-update.mjs');

const PRICING_FIXTURE = {
  _meta: { einheit: 'USD je 1 Million Token', quelle: 'test-fixture', stand: '2026-01-01' },
  models: {
    'claude-test-model': {
      input: 2,
      output: 10,
      cache_read: 0.2,
      cache_write_5m: 2.5,
      cache_write_1h: 4,
    },
  },
};

function git(cwd, args) {
  execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function initRepo(branchName = 'test-branch') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-update-'));
  git(dir, ['init', '-q', '-b', branchName]);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'test\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'init']);
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'stats', 'pricing.json'),
    JSON.stringify(PRICING_FIXTURE, null, 2),
  );
  return dir;
}

function assistantLine({ requestId, messageId, model = 'claude-test-model', usage }) {
  return JSON.stringify({
    type: 'assistant',
    requestId,
    message: { id: messageId, model, usage },
  });
}

function writeTranscript(dir, sessionId, lines) {
  const file = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

function runScript(repoDir, args) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: repoDir,
    encoding: 'utf8',
    input: '',
  });
}

function readCsvRows(repoDir, name) {
  const file = path.join(repoDir, 'stats', name);
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('legt costs.csv und tokens.csv neu an', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage = { input_tokens: 1_000_000, output_tokens: 500_000, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-neu', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const costs = readCsvRows(dir, 'costs.csv');
  assert.deepEqual(costs.header, ['branch', 'session_id', 'updated_at', 'cost_usd']);
  assert.equal(costs.rows.length, 1);
  const [branch, sessionId, updatedAt, costUsd] = costs.rows[0];
  assert.equal(branch, 'test-branch');
  assert.equal(sessionId, 'sess-neu');
  assert.match(updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  // 1 Mio Input * 2 USD + 0.5 Mio Output * 10 USD = 2 + 5 = 7 USD
  assert.equal(costUsd, '7.0000');

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.deepEqual(tokens.header, [
    'branch',
    'session_id',
    'model',
    'input',
    'output',
    'cache_read',
    'cache_write',
    'cost_usd',
  ]);
  assert.equal(tokens.rows.length, 1);
  assert.deepEqual(tokens.rows[0], [
    'test-branch',
    'sess-neu',
    'claude-test-model',
    '1000000',
    '500000',
    '0',
    '0',
    '7.0000',
  ]);

  // Atomares Schreiben: keine liegen gebliebene .tmp-Datei.
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'costs.csv.tmp')), false);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'tokens.csv.tmp')), false);
});

test('zweiter Lauf ist ein Upsert, keine zweite Zeile', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage = { input_tokens: 100_000, output_tokens: 50_000, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-upsert', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage }),
  ]);

  assert.equal(runScript(dir, ['--transcript', transcript]).status, 0);
  assert.equal(runScript(dir, ['--transcript', transcript]).status, 0);

  const costs = readCsvRows(dir, 'costs.csv');
  assert.equal(costs.rows.length, 1);
  assert.equal(costs.rows[0][3], '0.7000');

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 1);
  assert.equal(tokens.rows[0][3], '100000');
});

test('dedupliziert doppelte requestId/message.id (Retry)', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage = { input_tokens: 10_000, output_tokens: 1_000, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-dedupe', [
    assistantLine({ requestId: 'req-retry', messageId: 'msg-retry', usage }),
    assistantLine({ requestId: 'req-retry', messageId: 'msg-retry', usage }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 1);
  // Nur einmal gezaehlt, nicht doppelt.
  assert.equal(tokens.rows[0][3], '10000');
  assert.equal(tokens.rows[0][4], '1000');
});

test('unbekanntes Modell wird mit 0 USD gewertet, kein harter Fehler', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage = { input_tokens: 5_000, output_tokens: 2_000, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-unbekannt', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', model: 'claude-does-not-exist', usage }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Unbekanntes Modell/);

  const costs = readCsvRows(dir, 'costs.csv');
  assert.equal(costs.rows[0][3], '0.0000');

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.deepEqual(tokens.rows[0], [
    'test-branch',
    'sess-unbekannt',
    'claude-does-not-exist',
    '5000',
    '2000',
    '0',
    '0',
    '0.0000',
  ]);
});

test('zaehlt Subagenten-Transcripts mit', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const mainUsage = { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const subUsage = { input_tokens: 50_000, output_tokens: 0, cache_read_input_tokens: 0 };

  const transcript = writeTranscript(dir, 'sess-subagent', [
    assistantLine({ requestId: 'req-main', messageId: 'msg-main', usage: mainUsage }),
  ]);

  const subagentsDir = path.join(dir, 'sess-subagent', 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(subagentsDir, 'sub-1.jsonl'),
    `${assistantLine({ requestId: 'req-sub', messageId: 'msg-sub', usage: subUsage })}\n`,
  );

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 1);
  // 100000 (Haupt) + 50000 (Subagent) = 150000
  assert.equal(tokens.rows[0][3], '150000');
});

test('detached HEAD beendet sauber ohne zu schreiben', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  git(dir, ['checkout', '-q', '--detach', sha]);

  const usage = { input_tokens: 1_000, output_tokens: 1_000, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-detached', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  assert.equal(fs.existsSync(path.join(dir, 'stats', 'costs.csv')), false);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'tokens.csv')), false);
});
