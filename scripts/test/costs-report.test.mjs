// Tests fuer scripts/costs-report.mjs. Reine Funktionen werden direkt
// importiert, ein Gesamtlauf zusaetzlich als Kindprozess in einem
// temporaeren Git-Repo ohne Remote - COSTS_REPORT_NOW macht die
// Erzeugungszeit deterministisch, ohne dass ein Test das Netz braucht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  escapeHtml,
  isoSeconds,
  selectAbandoned,
  hasAbandonedEntry,
  pruneAbandoned,
  buildReportData,
  renderHtml,
} from '../costs-report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, '..', 'costs-report.mjs');

const COSTS_HEADER = 'branch,session_id,updated_at,cost_usd';
const TOKENS_HEADER = 'branch,session_id,model,input,output,cache_read,cache_write,cost_usd';
const HISTORY_HEADER = 'branch,pr,merged_at,total_usd,sessions,reason';
const HISTORY_MODELS_HEADER =
  'merged_at,branch,model,input,output,cache_read,cache_write,cost_usd';

const EXTERNAL_RE = /https?:\/\/|<script|<link|<img/i;

function csv(header, rows) {
  return [header, ...rows].join('\n') + '\n';
}

function daysAgoIso(now, days) {
  return isoSeconds(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

function sumCosts(rows) {
  return Number(rows.reduce((sum, row) => sum + row.costUsd, 0).toFixed(4));
}

// --- Summenkonsistenz -----------------------------------------------------------

test('Summe je Modell == Summe je Branch == Gesamtsumme, offen und verbucht gemischt', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  const costsRows = [
    ['feature/a', 's1', '2026-09-10T10:00:00Z', '0.1000'],
    ['feature/a', 's2', '2026-09-10T11:00:00Z', '0.0500'],
  ];
  const tokensRows = [
    ['feature/a', 's1', 'claude-opus-5', '10', '20', '30', '40', '0.0700'],
    ['feature/a', 's1', 'claude-sonnet-5', '1', '2', '3', '4', '0.0300'],
    ['feature/a', 's2', 'claude-opus-5', '5', '5', '5', '5', '0.0500'],
  ];
  const historyRows = [['feature/b', '7', '2026-09-01T00:00:00Z', '0.5000', '1', 'merged']];
  const historyModelRows = [
    ['2026-09-01T00:00:00Z', 'feature/b', 'claude-haiku-4-5', '100', '200', '300', '400', '0.5000'],
  ];

  const data = buildReportData(costsRows, tokensRows, historyRows, historyModelRows, now);

  assert.equal(data.totalUsd, 0.65);
  assert.equal(sumCosts(data.modelRows), data.totalUsd);
  assert.equal(
    sumCosts(data.openBranchRows) + sumCosts(data.bookedBranchRows),
    data.totalUsd,
  );
  assert.ok(!data.modelRows.some((row) => row.model === 'ohne Modellzuordnung'));
});

test('fehlende tokens.csv-Zeilen erzeugen die Restzeile "ohne Modellzuordnung"', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  const costsRows = [
    ['feature/a', 's1', '2026-09-10T10:00:00Z', '0.1000'],
    ['feature/a', 's2', '2026-09-10T11:00:00Z', '0.0500'],
  ];
  // Die claude-sonnet-5-Zeile zu s1 fehlt bewusst - 0.0300 USD bleiben ohne
  // Modellzuordnung.
  const tokensRows = [
    ['feature/a', 's1', 'claude-opus-5', '10', '20', '30', '40', '0.0700'],
    ['feature/a', 's2', 'claude-opus-5', '5', '5', '5', '5', '0.0500'],
  ];
  const data = buildReportData(costsRows, tokensRows, [], [], now);

  const remainder = data.modelRows.find((row) => row.model === 'ohne Modellzuordnung');
  assert.ok(remainder, 'Restzeile fehlt');
  assert.equal(remainder.costUsd, 0.03);
  assert.equal(sumCosts(data.modelRows), data.totalUsd);
});

// --- Prune -----------------------------------------------------------------------

test('Prune greift ab 30 Tagen, 29 Tage mit Remote-Branch bleibt unangetastet', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const costsRows = [
    ['feature/old', 's1', daysAgoIso(now, 31), '1.2340'],
    ['feature/fresh', 's2', daysAgoIso(now, 29), '0.5000'],
  ];
  const tokensRows = [
    ['feature/old', 's1', 'claude-opus-5', '1', '1', '1', '1', '1.2340'],
    ['feature/fresh', 's2', 'claude-opus-5', '1', '1', '1', '1', '0.5000'],
  ];
  // Beide Branches existieren am Remote - nur die Altersregel darf greifen.
  const remoteBranches = new Set(['feature/old', 'feature/fresh']);

  const result = pruneAbandoned(costsRows, tokensRows, [], [], remoteBranches, now);

  assert.deepEqual(result.abandoned, ['feature/old']);
  assert.ok(!result.costsRows.some((row) => row[0] === 'feature/old'));
  assert.ok(!result.tokensRows.some((row) => row[0] === 'feature/old'));
  assert.ok(result.costsRows.some((row) => row[0] === 'feature/fresh'));
  assert.ok(result.tokensRows.some((row) => row[0] === 'feature/fresh'));

  const historyRow = result.historyRows.find((row) => row[0] === 'feature/old');
  assert.ok(historyRow, 'History-Zeile fuer feature/old fehlt');
  assert.equal(historyRow[5], 'abandoned');
  assert.equal(historyRow[2], isoSeconds(now));
  assert.ok(result.historyModelRows.some((row) => row[1] === 'feature/old'));
});

test('Prune bei nicht ermittelbarer Remote-Liste: nur die Altersregel greift', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const costsRows = [
    ['feature/old', 's1', daysAgoIso(now, 31), '1.0000'],
    ['feature/live', 's2', daysAgoIso(now, 1), '0.2000'],
  ];
  const tokensRows = [
    ['feature/old', 's1', 'claude-opus-5', '1', '1', '1', '1', '1.0000'],
    ['feature/live', 's2', 'claude-opus-5', '1', '1', '1', '1', '0.2000'],
  ];

  // remoteBranches === null: der Remote-Abgleich war nicht moeglich, ein
  // fehlendes Netz darf feature/live nicht loeschen.
  const result = pruneAbandoned(costsRows, tokensRows, [], [], null, now);

  assert.deepEqual(result.abandoned, ['feature/old']);
  assert.ok(result.costsRows.some((row) => row[0] === 'feature/live'));
});

test('Prune ist idempotent: zweiter Lauf schreibt keine zweite abandoned-Zeile', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const costsRows = [['feature/old', 's1', daysAgoIso(now, 40), '1.0000']];
  const tokensRows = [['feature/old', 's1', 'claude-opus-5', '1', '1', '1', '1', '1.0000']];

  const first = pruneAbandoned(costsRows, tokensRows, [], [], null, now);
  assert.equal(first.abandoned.length, 1);
  assert.equal(first.historyRows.length, 1);

  const second = pruneAbandoned(
    first.costsRows,
    first.tokensRows,
    first.historyRows,
    first.historyModelRows,
    null,
    now,
  );
  assert.deepEqual(second.abandoned, []);
  assert.equal(second.historyRows.length, 1);
  assert.deepEqual(second.historyRows, first.historyRows);
});

test('hasAbandonedEntry verhindert eine zweite Zeile, selbst wenn der Branch wieder auftaucht', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  // Simuliert eine durch Rebase/Union-Merge wiederhergestellte Zeile - schon
  // als abandoned verbucht, taucht der Branch trotzdem wieder in costs.csv
  // auf. selectAbandoned() darf ihn nicht ein zweites Mal auswaehlen.
  const historyRows = [
    ['feature/old', '', '2026-09-01T00:00:00Z', '1.0000', '1', 'abandoned'],
  ];
  assert.equal(hasAbandonedEntry(historyRows, 'feature/old'), true);
  const costsRows = [['feature/old', 's1', daysAgoIso(now, 40), '1.0000']];
  assert.deepEqual(selectAbandoned(costsRows, historyRows, null, now), []);
});

// --- HTML: keine externen Ressourcen, Escaping ------------------------------------

test('renderHtml enthaelt keine externe URL und kein <script>', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const data = buildReportData(
    [['feature/a', 's1', '2026-09-10T00:00:00Z', '0.1000']],
    [['feature/a', 's1', 'claude-opus-5', '1', '1', '1', '1', '0.1000']],
    [['feature/b', '7', '2026-09-01T00:00:00Z', '0.5000', '1', 'merged']],
    [['2026-09-01T00:00:00Z', 'feature/b', 'claude-haiku-4-5', '1', '1', '1', '1', '0.5000']],
    now,
  );
  const html = renderHtml(data);
  assert.doesNotMatch(html, EXTERNAL_RE);
  assert.match(html, /Kostenreport/);
});

test('renderHtml entsteht auch ohne jegliche Daten, mit Hinweis statt leerer Tabellen', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const data = buildReportData([], [], [], [], now);
  assert.equal(data.totalUsd, 0);
  const html = renderHtml(data);
  assert.doesNotMatch(html, EXTERNAL_RE);
  assert.match(html, /Keine Kostendaten vorhanden\./);
  assert.match(html, /Keine Branch-Daten vorhanden\./);
  assert.match(html, /0\.0 %|\$0\.0000/);
});

test('escapeHtml escaped alle fuenf Sonderzeichen', () => {
  assert.equal(escapeHtml(`<script>&"'</script>`), '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
});

test('ein Branchname mit <script> und & landet escaped im Report', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const branch = 'feature/<script>alert(1)</script>&x';
  const data = buildReportData(
    [[branch, 's1', '2026-09-10T00:00:00Z', '0.1000']],
    [[branch, 's1', 'claude-opus-5', '1', '1', '1', '1', '0.1000']],
    [],
    [],
    now,
  );
  const html = renderHtml(data);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /feature\/&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;x/);
});

// --- Kindprozess: kompletter Lauf -------------------------------------------------

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-report-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'stats', 'costs.csv'),
    csv(COSTS_HEADER, ['feature/x,sess-a,2026-09-10T10:00:00Z,0.1200']),
  );
  fs.writeFileSync(
    path.join(dir, 'stats', 'tokens.csv'),
    csv(TOKENS_HEADER, ['feature/x,sess-a,claude-opus-5,10,20,30,40,0.1200']),
  );
  fs.writeFileSync(path.join(dir, 'stats', 'history.csv'), csv(HISTORY_HEADER, []));
  fs.writeFileSync(
    path.join(dir, 'stats', 'history-models.csv'),
    csv(HISTORY_MODELS_HEADER, []),
  );
  return dir;
}

test('Kindprozess-Lauf in einem Temp-Git-Repo ohne Remote erzeugt stats/report.html', () => {
  const dir = initRepo();
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, COSTS_REPORT_NOW: '2026-09-12T00:00:00Z' },
  });
  assert.equal(result.status, 0, result.stderr);
  const reportPath = path.join(dir, 'stats', 'report.html');
  assert.equal(fs.existsSync(reportPath), true);
  const html = fs.readFileSync(reportPath, 'utf8');
  assert.doesNotMatch(html, EXTERNAL_RE);
  assert.match(html, /feature\/x/);
  assert.match(html, /Erzeugt am 2026-09-12T00:00:00Z/);
});
