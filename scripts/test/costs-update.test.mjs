// Tests fuer scripts/costs-update.mjs gegen Fixture-Transcripts in einem
// temporaeren Git-Repo je Testfall. Kein Netzwerk, keine echte Session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

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
    'claude-test-model-b': {
      input: 3,
      output: 7,
      cache_read: 0.3,
      cache_write_5m: 1.1,
      cache_write_1h: 1.7,
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

function runScript(repoDir, args, stdinInput = '') {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: repoDir,
    encoding: 'utf8',
    input: stdinInput,
  });
}

/**
 * Fuehrt das Skript asynchron aus und verbindet stdin ueber eine echte,
 * benannte FIFO statt einer anonymen spawn-Pipe. Anonyme Pipes landen in
 * manchen Sandboxes als Socket auf Deskriptor 0 - der isFIFO()-Check im
 * Skript greift dann nie, egal was auf stdin liegt (siehe runScript oben,
 * das genau daran vorbeitestet). Eine benannte FIFO ist plattformunabhaengig
 * garantiert eine echte FIFO und macht den --stdin-Pfad damit erst testbar.
 */
function runScriptAsync(repoDir, args, { payload, closeStdin = false } = {}) {
  return new Promise((resolve, reject) => {
    const fifoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-update-fifo-'));
    const fifoPath = path.join(fifoDir, 'stdin.fifo');
    execFileSync('mkfifo', [fifoPath]);

    const readFd = fs.openSync(fifoPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const child = spawn('node', [SCRIPT_PATH, ...args], {
      cwd: repoDir,
      stdio: [readFd, 'pipe', 'pipe'],
    });
    fs.closeSync(readFd);

    let writeFd = null;
    if (payload) {
      writeFd = fs.openSync(fifoPath, 'w');
      fs.writeSync(writeFd, payload);
    }
    if (closeStdin && writeFd !== null) {
      fs.closeSync(writeFd);
      writeFd = null;
    }

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.resume();

    // Sicherheitsnetz: haengt der Kindprozess trotzdem, spaetestens nach 8s
    // gewaltsam beenden, damit kein Testlauf blockiert.
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 8000);

    const finish = (settle) => {
      clearTimeout(killTimer);
      if (writeFd !== null) {
        try {
          fs.closeSync(writeFd);
        } catch {
          // bereits geschlossen
        }
      }
      fs.rmSync(fifoDir, { recursive: true, force: true });
      settle();
    };

    child.on('error', (err) => finish(() => reject(err)));
    child.on('close', (code) => finish(() => resolve({ status: code, stderr })));
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

  // Atomares Schreiben: keine liegen gebliebene .tmp-Datei (Name traegt die
  // PID, damit parallele Laeufe sich nicht gegenseitig ueberschreiben).
  const leftoverTmp = fs
    .readdirSync(path.join(dir, 'stats'))
    .filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftoverTmp, []);
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

test('JSON auf stdin wird ohne --stdin-Schalter ignoriert', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const stdinPayload = JSON.stringify({
    session_id: 'sess-from-stdin',
    transcript_path: path.join(dir, 'sess-from-stdin.jsonl'),
    cwd: dir,
  });

  // Kein --transcript, kein --stdin: der Payload darf nicht blockierend
  // gelesen werden und muss sauber ohne ermittelte Session enden.
  const result = runScript(dir, [], stdinPayload);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Keine Session ermittelbar/);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'costs.csv')), false);
});

test('--transcript gewinnt gegen stdin-Payload, wenn beides vorliegt', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usageReal = { input_tokens: 10_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const realTranscript = writeTranscript(dir, 'sess-real', [
    assistantLine({ requestId: 'req-real', messageId: 'msg-real', usage: usageReal }),
  ]);

  // stdin zeigt auf eine andere, nicht existierende Session - darf nicht
  // gewinnen, solange --transcript gesetzt ist.
  const stdinPayload = JSON.stringify({
    session_id: 'sess-from-stdin',
    transcript_path: path.join(dir, 'sess-from-stdin.jsonl'),
    cwd: dir,
  });

  const result = runScript(dir, ['--stdin', '--transcript', realTranscript], stdinPayload);
  assert.equal(result.status, 0);

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 1);
  assert.equal(tokens.rows[0][1], 'sess-real');
});

test('stdin-Payload wird gelesen, wenn der Erzeuger schliesst', async (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage = { input_tokens: 1_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-stdin-close', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage }),
  ]);
  const payload = JSON.stringify({
    session_id: 'sess-stdin-close',
    transcript_path: transcript,
    cwd: dir,
  });

  const result = await runScriptAsync(dir, ['--stdin'], { payload, closeStdin: true });
  assert.equal(result.status, 0);

  const costs = readCsvRows(dir, 'costs.csv');
  assert.ok(costs);
  assert.equal(costs.rows.length, 1);
  assert.equal(costs.rows[0][1], 'sess-stdin-close');
});

test('stdin-Payload wird verworfen, wenn der Erzeuger die Pipe offen laesst', async (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage = { input_tokens: 1_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-stdin-open', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage }),
  ]);
  const payload = JSON.stringify({
    session_id: 'sess-stdin-open',
    transcript_path: transcript,
    cwd: dir,
  });

  // Der Payload liegt vollstaendig auf der Pipe, der Erzeuger schliesst aber
  // nicht. costs-update.mjs verwirft im timedOut-Zweig von readStdinJson()
  // bereits gepufferte Daten ungeprueft nach dem 2s-Zeitlimit - nur das
  // Schliessen der Pipe zaehlt, nicht das blosse Vorhandensein der Daten.
  const result = await runScriptAsync(dir, ['--stdin'], { payload, closeStdin: false });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /binnen 2s keinen vollstaendigen Payload/);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'costs.csv')), false);
});

test('offene Pipe ohne Payload blockiert nicht', async (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const result = await runScriptAsync(dir, ['--stdin'], { closeStdin: false });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /binnen 2s keinen vollstaendigen Payload/);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'costs.csv')), false);
});

test('--stdin mit ungueltigem JSON', async (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const result = await runScriptAsync(dir, ['--stdin'], {
    payload: '{nicht-valides-json',
    closeStdin: true,
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /kein gueltiges JSON/);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'costs.csv')), false);
});

test('fehlen requestId und message.id, dedupliziert nicht ueber Zeilen hinweg', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage1 = { input_tokens: 1_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const usage2 = { input_tokens: 2_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-no-ids', [
    assistantLine({ usage: usage1 }),
    assistantLine({ usage: usage2 }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 1);
  // 1000 + 2000 = 3000 - beide Zeilen gezaehlt statt auf demselben leeren
  // Dedupe-Schluessel zu kollidieren.
  assert.equal(tokens.rows[0][3], '3000');
});

test('leeres cache_creation-Objekt faellt zurueck auf cache_creation_input_tokens', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usage1 = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: {},
    cache_creation_input_tokens: 1_000_000,
  };
  const usage2 = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: {},
    cache_creation_input_tokens: 1_000_000,
  };
  const transcript = writeTranscript(dir, 'sess-cache-fallback', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage: usage1 }),
    assistantLine({ requestId: 'req-2', messageId: 'msg-2', usage: usage2 }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 1);
  // Beide Zeilen zaehlen cache_creation_input_tokens statt es wegen des
  // leeren cache_creation-Objekts zu verlieren: 2 Mio Token gesamt.
  assert.equal(tokens.rows[0][6], '2000000');
  // Fixture-pricing.json hat kein _meta.default_cache_ttl -> Default 1h.
  // 2 Mio * 4 USD / 1e6 = 8 USD.
  assert.equal(tokens.rows[0][7], '8.0000');

  // Warnung nur einmal je Lauf, nicht einmal je Zeile.
  const warnings = result.stderr.match(/cache_creation ohne 5m\/1h-Aufschluesselung/g) || [];
  assert.equal(warnings.length, 1);
});

test('Rundung: costs.csv-Summe entspricht exakt der Summe der tokens.csv-Zeilen', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const usageA = { input_tokens: 111_111, output_tokens: 222_222, cache_read_input_tokens: 0 };
  const usageB = { input_tokens: 333_333, output_tokens: 444_444, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-rundung', [
    assistantLine({ requestId: 'req-a', messageId: 'msg-a', model: 'claude-test-model', usage: usageA }),
    assistantLine({
      requestId: 'req-b',
      messageId: 'msg-b',
      model: 'claude-test-model-b',
      usage: usageB,
    }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const costs = readCsvRows(dir, 'costs.csv');
  const tokens = readCsvRows(dir, 'tokens.csv');
  assert.equal(tokens.rows.length, 2);

  const tokensSum = tokens.rows.reduce((sum, row) => sum + Number(row[7]), 0);
  assert.equal(costs.rows[0][3], tokensSum.toFixed(4));
});

test('bestehende costs.csv: groesseres updated_at gewinnt bei doppeltem Schluessel', (t) => {
  const dir = initRepo();
  t.after(() => cleanup(dir));

  const costsPath = path.join(dir, 'stats', 'costs.csv');
  fs.writeFileSync(
    costsPath,
    [
      'branch,session_id,updated_at,cost_usd',
      // Juengere Zeile steht zuerst in der Datei - "zuletzt gelesen" wuerde
      // faelschlich die aeltere behalten.
      'test-branch,sess-dup,2026-06-01T00:00:00Z,2.0000',
      'test-branch,sess-dup,2026-01-01T00:00:00Z,1.0000',
    ].join('\n') + '\n',
  );

  const usage = { input_tokens: 1_000, output_tokens: 0, cache_read_input_tokens: 0 };
  const transcript = writeTranscript(dir, 'sess-andere', [
    assistantLine({ requestId: 'req-1', messageId: 'msg-1', usage }),
  ]);

  const result = runScript(dir, ['--transcript', transcript]);
  assert.equal(result.status, 0);

  const costs = readCsvRows(dir, 'costs.csv');
  const dupRow = costs.rows.find((row) => row[1] === 'sess-dup');
  assert.ok(dupRow);
  assert.equal(dupRow[2], '2026-06-01T00:00:00Z');
  assert.equal(dupRow[3], '2.0000');
});

test('Quelltext enthaelt keine Bytes ausserhalb ASCII 0x09/0x0a/0x20-0x7e', () => {
  const buf = fs.readFileSync(SCRIPT_PATH);
  for (const byte of buf) {
    const ok = byte === 0x09 || byte === 0x0a || (byte >= 0x20 && byte <= 0x7e);
    assert.ok(ok, `Byte 0x${byte.toString(16)} ausserhalb des erlaubten Bereichs gefunden`);
  }
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
