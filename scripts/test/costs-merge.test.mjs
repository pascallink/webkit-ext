// Tests fuer scripts/costs-merge.mjs. Die reinen Funktionen werden direkt
// importiert, der Gesamtlauf laeuft als Kindprozess in einem temporaeren
// Git-Repo - ohne GITHUB_TOKEN, damit kein Test das Netz braucht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  aggregate,
  changelogLine,
  historyHasEntry,
  insertChangelogLine,
  linkedIssues,
  summaryBlock,
  touchedProjects,
} from '../costs-merge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, '..', 'costs-merge.mjs');

const COSTS_HEADER = 'branch,session_id,updated_at,cost_usd';
const TOKENS_HEADER = 'branch,session_id,model,input,output,cache_read,cache_write,cost_usd';

const CHANGELOG_FIXTURE = [
  '# Changelog',
  '',
  'Einleitung.',
  '',
  '## [1.4.0] - 2026-09-12',
  '',
  '### Hinzugefuegt',
  '',
  '- Irgendein Feature.',
  '',
].join('\n');

function csv(header, rows) {
  return [header, ...rows].join('\n') + '\n';
}

function initRepo({ withProject = true, changelog = CHANGELOG_FIXTURE } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-merge-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'stats', 'costs.csv'),
    csv(COSTS_HEADER, [
      'feature/x,sess-a,2026-09-01T10:00:00Z,0.1000',
      'feature/x,sess-b,2026-09-01T11:00:00Z,0.0420',
      'feature/andere,sess-c,2026-09-01T12:00:00Z,9.9999',
    ]),
  );
  fs.writeFileSync(
    path.join(dir, 'stats', 'tokens.csv'),
    csv(TOKENS_HEADER, [
      'feature/x,sess-a,claude-opus-5,100,200,300,400,0.0800',
      'feature/x,sess-a,claude-haiku-4-5,10,20,30,40,0.0200',
      'feature/x,sess-b,claude-opus-5,50,60,70,80,0.0420',
      'feature/andere,sess-c,claude-opus-5,1,1,1,1,9.9999',
    ]),
  );
  if (withProject) {
    const project = path.join(dir, 'jira-markdown-converter');
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'manifest.json'), '{ "name": "test" }\n');
    fs.writeFileSync(path.join(project, 'CHANGELOG.md'), changelog);
  }
  return dir;
}

function run(dir, env = {}) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      GITHUB_REPOSITORY: '',
      GITHUB_STEP_SUMMARY: '',
      HEAD_REF: 'feature/x',
      PR_NUMBER: '44',
      PR_TITLE: 'Vorlagen-Editor',
      PR_BODY: 'Closes #49',
      MERGED_AT: '2026-09-12T08:00:00Z',
      CHANGED_FILES: 'jira-markdown-converter/src/app.js\nREADME.md',
      ...env,
    },
  });
}

function read(dir, ...parts) {
  return fs.readFileSync(path.join(dir, ...parts), 'utf8');
}

// --- Idempotenz: der Punkt, an dem dieser Sub-Task scheitert ------------------

test('zweiter Lauf doppelt weder Changelog noch Historie noch Prune', () => {
  const dir = initRepo();

  const first = run(dir);
  assert.equal(first.status, 0, first.stderr);

  const afterFirst = {
    changelog: read(dir, 'jira-markdown-converter', 'CHANGELOG.md'),
    history: read(dir, 'stats', 'history.csv'),
    historyModels: read(dir, 'stats', 'history-models.csv'),
    costs: read(dir, 'stats', 'costs.csv'),
    tokens: read(dir, 'stats', 'tokens.csv'),
  };

  assert.match(
    afterFirst.changelog,
    /- PR #44 "Vorlagen-Editor": \$0\.1420 \(2 Sessions, claude-opus-5, claude-haiku-4-5\)/,
  );
  assert.equal(afterFirst.history.trim().split('\n').length, 2);
  assert.match(afterFirst.history, /feature\/x,44,2026-09-12T08:00:00Z,0\.1420,2,merged/);
  assert.equal(afterFirst.historyModels.trim().split('\n').length, 3);
  // Branch-Zeilen sind weg, fremde Branches bleiben.
  assert.doesNotMatch(afterFirst.costs, /feature\/x,/);
  assert.doesNotMatch(afterFirst.tokens, /feature\/x,/);
  assert.match(afterFirst.costs, /feature\/andere,sess-c/);
  assert.match(afterFirst.tokens, /feature\/andere,sess-c/);

  const second = run(dir);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /bereits verbucht/);

  assert.equal(read(dir, 'jira-markdown-converter', 'CHANGELOG.md'), afterFirst.changelog);
  assert.equal(read(dir, 'stats', 'history.csv'), afterFirst.history);
  assert.equal(read(dir, 'stats', 'history-models.csv'), afterFirst.historyModels);
  assert.equal(read(dir, 'stats', 'costs.csv'), afterFirst.costs);
  assert.equal(read(dir, 'stats', 'tokens.csv'), afterFirst.tokens);
});

test('Changelog-Zeile wird ersetzt, wenn dieselbe PR-Nummer schon dasteht', () => {
  const dir = initRepo();
  const changelogFile = path.join(dir, 'jira-markdown-converter', 'CHANGELOG.md');

  assert.equal(run(dir).status, 0);
  // Historie leeren: derselbe PR wird noch einmal verbucht, diesmal teurer.
  fs.writeFileSync(path.join(dir, 'stats', 'history.csv'), 'branch,pr,merged_at,total_usd,sessions,reason\n');
  fs.writeFileSync(
    path.join(dir, 'stats', 'costs.csv'),
    csv(COSTS_HEADER, ['feature/x,sess-a,2026-09-02T10:00:00Z,0.5000']),
  );
  fs.writeFileSync(
    path.join(dir, 'stats', 'tokens.csv'),
    csv(TOKENS_HEADER, ['feature/x,sess-a,claude-opus-5,1,2,3,4,0.5000']),
  );

  assert.equal(run(dir).status, 0);
  const content = fs.readFileSync(changelogFile, 'utf8');
  assert.equal((content.match(/- PR #44 /g) || []).length, 1);
  assert.match(content, /\$0\.5000 \(1 Session, claude-opus-5\)/);
});

test('kein beruehrtes Projekt heisst kein Changelog-Eintrag, aber Historie', () => {
  const dir = initRepo();
  const result = run(dir, { CHANGED_FILES: 'scripts/costs-merge.mjs\n.github/workflows/ci.yml' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(read(dir, 'jira-markdown-converter', 'CHANGELOG.md'), /PR #44/);
  assert.match(read(dir, 'stats', 'history.csv'), /feature\/x,44/);
});

test('Branch ohne Kostenzeilen schreibt nichts', () => {
  const dir = initRepo();
  const result = run(dir, { HEAD_REF: 'feature/leer' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Keine Kostenzeilen/);
  assert.equal(fs.existsSync(path.join(dir, 'stats', 'history.csv')), false);
  assert.match(read(dir, 'stats', 'costs.csv'), /feature\/x,sess-a/);
});

test('Job Summary bekommt den Kostenblock', () => {
  const dir = initRepo();
  const summaryFile = path.join(dir, 'summary.md');
  fs.writeFileSync(summaryFile, '');
  assert.equal(run(dir, { GITHUB_STEP_SUMMARY: summaryFile }).status, 0);
  const summary = fs.readFileSync(summaryFile, 'utf8');
  assert.match(summary, /### Kosten dieses PR/);
  assert.match(summary, /\*\*\$0\.1420\*\* aus 2 Sessions/);
});

test('fehlende Pflicht-Variable beendet den Lauf mit Fehler', () => {
  const dir = initRepo();
  const result = run(dir, { HEAD_REF: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing env var: HEAD_REF/);
});

// --- Aggregation --------------------------------------------------------------

test('aggregate dedupliziert auf (branch, session_id), juengstes gewinnt', () => {
  const costs = [
    ['feature/x', 'sess-a', '2026-09-01T10:00:00Z', '0.1000'],
    ['feature/x', 'sess-a', '2026-09-01T12:00:00Z', '0.3000'],
    ['feature/x', 'sess-b', '2026-09-01T11:00:00Z', '0.0420'],
    ['feature/y', 'sess-c', '2026-09-01T11:00:00Z', '5.0000'],
  ];
  const tokens = [
    ['feature/x', 'sess-a', 'claude-opus-5', '1', '2', '3', '4', '0.1000'],
    ['feature/x', 'sess-a', 'claude-opus-5', '9', '9', '9', '9', '0.3000'],
    ['feature/x', 'sess-b', 'claude-haiku-4-5', '5', '5', '5', '5', '0.0420'],
    ['feature/y', 'sess-c', 'claude-opus-5', '1', '1', '1', '1', '5.0000'],
  ];
  const result = aggregate(costs, tokens, 'feature/x');
  assert.equal(result.sessions, 2);
  assert.equal(result.totalUsd, 0.342);
  assert.equal(result.perModel.get('claude-opus-5').costUsd, 0.3);
  assert.equal(result.perModel.get('claude-opus-5').input, 9);
  assert.equal(result.perModel.get('claude-haiku-4-5').costUsd, 0.042);
});

test('aggregate: Modellsummen ergeben die Gesamtsumme', () => {
  const costs = [['b', 's1', '2026-01-01T00:00:00Z', '0.1230']];
  const tokens = [
    ['b', 's1', 'm1', '0', '0', '0', '0', '0.1000'],
    ['b', 's1', 'm2', '0', '0', '0', '0', '0.0230'],
  ];
  const result = aggregate(costs, tokens, 'b');
  const sum = [...result.perModel.values()].reduce((acc, bucket) => acc + bucket.costUsd, 0);
  assert.equal(Number(sum.toFixed(4)), result.totalUsd);
});

test('aggregate ignoriert Token-Zeilen ohne passende Session in costs.csv', () => {
  const costs = [['b', 's1', '2026-01-01T00:00:00Z', '0.1000']];
  const tokens = [
    ['b', 's1', 'm1', '0', '0', '0', '0', '0.1000'],
    ['b', 'verwaist', 'm1', '0', '0', '0', '0', '7.0000'],
  ];
  const result = aggregate(costs, tokens, 'b');
  assert.equal(result.perModel.get('m1').costUsd, 0.1);
});

test('summaryBlock listet Modelle nach Kosten absteigend', () => {
  const perModel = new Map([
    ['klein', { ...{ input: 0, output: 0, cache_read: 0, cache_write: 0 }, costUsd: 0.01 }],
    ['gross', { ...{ input: 0, output: 0, cache_read: 0, cache_write: 0 }, costUsd: 0.2 }],
  ]);
  const block = summaryBlock({ totalUsd: 0.21, sessions: 1, perModel });
  assert.equal(
    block,
    '### Kosten dieses PR\n\n**$0.2100** aus 1 Session - gross $0.2000, klein $0.0100.',
  );
});

test('summaryBlock nimmt eine eigene Ueberschrift fuer das Issue', () => {
  const perModel = new Map([['m', { costUsd: 0.1 }]]);
  const block = summaryBlock({ totalUsd: 0.1, sessions: 1, perModel }, '### Kosten aus PR #44');
  assert.match(block, /^### Kosten aus PR #44\n\n/);
  assert.match(block, /\*\*\$0\.1000\*\* aus 1 Session - m \$0\.1000\./);
});

test('changelogLine haelt das vorgegebene Format ein', () => {
  const perModel = new Map([['claude-opus-5', { costUsd: 0.142 }]]);
  assert.equal(
    changelogLine({ pr: 44, title: 'Vorlagen-Editor', totalUsd: 0.142, sessions: 3, perModel }),
    '- PR #44 "Vorlagen-Editor": $0.1420 (3 Sessions, claude-opus-5)',
  );
});

// --- Changelog ------------------------------------------------------------------

test('insertChangelogLine legt Unveroeffentlicht und Kosten an', () => {
  const result = insertChangelogLine(CHANGELOG_FIXTURE, 44, '- PR #44 "T": $0.1 (1 Session)');
  assert.match(result, /## \[Unveroeffentlicht\]/);
  assert.match(result, /### Kosten/);
  assert.ok(result.indexOf('## [Unveroeffentlicht]') < result.indexOf('## [1.4.0]'));
  assert.ok(result.indexOf('### Kosten') < result.indexOf('## [1.4.0]'));
});

test('insertChangelogLine haelt genau eine Leerzeile zur naechsten Version', () => {
  const result = insertChangelogLine(CHANGELOG_FIXTURE, 44, '- PR #44 "T": $0.1 (1 Session)');
  assert.match(
    result,
    /## \[Unveroeffentlicht\]\n\n### Kosten\n\n- PR #44 "T": \$0\.1 \(1 Session\)\n\n## \[1\.4\.0\]/,
  );
  assert.doesNotMatch(result, /\n\n\n/);
});

test('insertChangelogLine fasst die kuratierten Abschnitte nicht an', () => {
  const source = [
    '# Changelog',
    '',
    '## [Unveroeffentlicht]',
    '',
    '### Hinzugefuegt',
    '',
    '- Neues Ding.',
    '',
    '### Behoben',
    '',
    '- Alter Fehler.',
    '',
    '## [1.0.0] - 2026-01-01',
    '',
    '- Start.',
    '',
  ].join('\n');
  const result = insertChangelogLine(source, 7, '- PR #7 "X": $0.0100 (1 Session)');
  assert.match(result, /### Hinzugefuegt\n\n- Neues Ding\./);
  assert.match(result, /### Behoben\n\n- Alter Fehler\./);
  // Kosten steht hinter den kuratierten Abschnitten, aber noch vor 1.0.0.
  assert.ok(result.indexOf('### Behoben') < result.indexOf('### Kosten'));
  assert.ok(result.indexOf('### Kosten') < result.indexOf('## [1.0.0]'));
});

test('insertChangelogLine haengt eine zweite PR-Zeile an, ersetzt aber dieselbe', () => {
  const base = insertChangelogLine(CHANGELOG_FIXTURE, 1, '- PR #1 "A": $0.0100 (1 Session)');
  const zwei = insertChangelogLine(base, 2, '- PR #2 "B": $0.0200 (1 Session)');
  assert.match(zwei, /- PR #1 "A"/);
  assert.match(zwei, /- PR #2 "B"/);

  const ersetzt = insertChangelogLine(zwei, 1, '- PR #1 "A": $0.9900 (2 Sessions)');
  assert.equal((ersetzt.match(/- PR #1 /g) || []).length, 1);
  assert.match(ersetzt, /- PR #1 "A": \$0\.9900/);
  assert.match(ersetzt, /- PR #2 "B"/);
});

test('insertChangelogLine ist beim zweiten identischen Aufruf stabil', () => {
  const once = insertChangelogLine(CHANGELOG_FIXTURE, 44, '- PR #44 "T": $0.1 (1 Session)');
  const twice = insertChangelogLine(once, 44, '- PR #44 "T": $0.1 (1 Session)');
  assert.equal(twice, once);
});

// --- Verlinkte Issues und Projekte ------------------------------------------------

test('linkedIssues findet Closes/Fixes/Resolves und laesst den PR selbst aus', () => {
  const body = 'Text\n\nCloses #49\nfixes #12\nResolves: #7\nSiehe #999\nCloses #44';
  assert.deepEqual(linkedIssues(body, 44), ['49', '12', '7']);
});

test('linkedIssues liefert bei leerem Body nichts', () => {
  assert.deepEqual(linkedIssues('', 1), []);
  assert.deepEqual(linkedIssues(null, 1), []);
});

test('touchedProjects erkennt nur oberste Projektordner', () => {
  const projects = ['jira-markdown-converter', 'anderes-projekt'];
  const files = [
    'jira-markdown-converter/src/a.js',
    'scripts/costs-merge.mjs',
    'README.md',
    'anderes-projekt/manifest.json',
  ];
  assert.deepEqual(touchedProjects(files, projects), [
    'anderes-projekt',
    'jira-markdown-converter',
  ]);
  assert.deepEqual(touchedProjects(['docs/jira-markdown-converter/x.md'], projects), []);
});

test('historyHasEntry unterscheidet Branch, PR und Grund', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-merge-hist-'));
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'stats', 'history.csv'),
    csv('branch,pr,merged_at,total_usd,sessions,reason', [
      'feature/x,44,2026-09-12T08:00:00Z,0.1420,2,merged',
    ]),
  );
  assert.equal(historyHasEntry(dir, 'feature/x', 44, 'merged'), true);
  assert.equal(historyHasEntry(dir, 'feature/x', 45, 'merged'), false);
  assert.equal(historyHasEntry(dir, 'feature/y', 44, 'merged'), false);
  assert.equal(historyHasEntry(dir, 'feature/x', 44, 'abandoned'), false);
});
