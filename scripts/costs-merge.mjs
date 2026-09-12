#!/usr/bin/env node
/**
 * Verbucht die Session-Kosten eines gemergten Branches.
 *
 * Summiert stats/costs.csv und stats/tokens.csv fuer den Branch des PR und
 * schreibt das Ergebnis an vier Stellen:
 *   1. Job Summary und ein PR-Kommentar
 *   2. Markerblock in PR-Beschreibung und verlinktem Issue
 *   3. Zeile unter "### Kosten" im CHANGELOG.md jedes beruehrten Projekts
 *   4. stats/history.csv und stats/history-models.csv, danach fallen die
 *      Branch-Zeilen aus costs.csv und tokens.csv heraus
 *
 * Jeder dieser Schritte ist idempotent: ein Re-Run des Jobs doppelt weder
 * Markerblock noch Changelog-Zeile noch Historien-Eintrag.
 *
 * Ohne Dependencies, Node >= 18 (globales fetch ueber scripts/lib/github.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import gh from './lib/github.js';

const COST_MARKER = 'cost-summary';
// Unsichtbarer Marker im Kommentartext - daran erkennt ein zweiter Lauf den
// eigenen Kommentar wieder, statt ihn noch einmal zu posten.
const COMMENT_MARKER = '<!-- cost-summary:comment -->';

const HISTORY_HEADER = ['branch', 'pr', 'merged_at', 'total_usd', 'sessions', 'reason'];
const HISTORY_MODELS_HEADER = [
  'merged_at',
  'branch',
  'model',
  'input',
  'output',
  'cache_read',
  'cache_write',
  'cost_usd',
];
const COSTS_HEADER = ['branch', 'session_id', 'updated_at', 'cost_usd'];
const TOKENS_HEADER = [
  'branch',
  'session_id',
  'model',
  'input',
  'output',
  'cache_read',
  'cache_write',
  'cost_usd',
];

function warn(message) {
  console.error(`costs-merge: ${message}`);
}

function log(message) {
  console.log(`costs-merge: ${message}`);
}

// --- CSV ---------------------------------------------------------------------

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function csvEscape(field) {
  const value = String(field);
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function readCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  return lines.slice(1).map(parseCsvLine);
}

function writeCsvAtomic(filePath, header, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// --- Aggregation -------------------------------------------------------------

function emptyBucket() {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0, costUsd: 0 };
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Kosten eines Branches aus costs.csv und tokens.csv zusammenfassen.
 *
 * costs.csv: Dedupe auf (branch, session_id), juengstes updated_at gewinnt.
 * tokens.csv fuehrt kein updated_at; dort gewinnt bei doppeltem
 * (session_id, model) die Zeile mit der hoechsten Token-Summe (input +
 * output + cache_read + cache_write) - anders als cost_usd wachsen die
 * Token-Zahlen unabhaengig von spaeteren Preiskorrekturen monoton, also ist
 * das zuverlaessig die juengste Zeile. Bei Gleichstand bleibt die zuerst
 * gelesene Zeile. Gezaehlt werden nur Modellzeilen zu Sessions, die
 * costs.csv kennt, damit die Modellsummen die Gesamtsumme nicht sprengen.
 *
 * @param {string[][]} costsRows
 * @param {string[][]} tokensRows
 * @param {string} branch
 */
export function aggregate(costsRows, tokensRows, branch) {
  const sessions = new Map();
  for (const row of costsRows) {
    if (row[0] !== branch) continue;
    const previous = sessions.get(row[1]);
    if (!previous || row[2] > previous[2]) sessions.set(row[1], row);
  }

  let totalUsd = 0;
  for (const row of sessions.values()) totalUsd += num(row[3]);

  const newest = new Map();
  for (const row of tokensRows) {
    if (row[0] !== branch) continue;
    if (!sessions.has(row[1])) continue;
    const key = `${row[1]}\u0000${row[2]}`;
    const previous = newest.get(key);
    const tokenSum = num(row[3]) + num(row[4]) + num(row[5]) + num(row[6]);
    if (!previous) {
      newest.set(key, row);
    } else {
      const previousTokenSum =
        num(previous[3]) + num(previous[4]) + num(previous[5]) + num(previous[6]);
      if (tokenSum > previousTokenSum) newest.set(key, row);
    }
  }

  const perModel = new Map();
  for (const row of newest.values()) {
    const bucket = perModel.get(row[2]) || emptyBucket();
    bucket.input += num(row[3]);
    bucket.output += num(row[4]);
    bucket.cache_read += num(row[5]);
    bucket.cache_write += num(row[6]);
    bucket.costUsd += num(row[7]);
    perModel.set(row[2], bucket);
  }
  for (const bucket of perModel.values()) {
    bucket.costUsd = Number(bucket.costUsd.toFixed(4));
  }

  return { totalUsd: Number(totalUsd.toFixed(4)), sessions: sessions.size, perModel };
}

/** Modelle nach Kosten absteigend, bei Gleichstand alphabetisch. */
export function modelsByCost(perModel) {
  return [...perModel.entries()].sort(
    (a, b) => b[1].costUsd - a[1].costUsd || a[0].localeCompare(b[0]),
  );
}

export function formatUsd(value) {
  return `$${num(value).toFixed(4)}`;
}

const HEADING_PR = '### Kosten dieses PR';

function sessionWord(count) {
  return count === 1 ? 'Session' : 'Sessions';
}

/**
 * Inhalt des Markerblocks fuer PR- und Issue-Beschreibung.
 * @param {{totalUsd: number, sessions: number, perModel: Map}} agg
 * @param {string} [heading] Ueberschrift; im Issue nennt sie den PR, weil
 *   dort die Bloecke mehrerer Sub-Task-PRs nebeneinander stehen.
 */
export function summaryBlock({ totalUsd, sessions, perModel }, heading = HEADING_PR) {
  const parts = modelsByCost(perModel).map(
    ([model, bucket]) => `${model} ${formatUsd(bucket.costUsd)}`,
  );
  const tail = parts.length ? ` - ${parts.join(', ')}` : '';
  return [
    heading,
    '',
    `**${formatUsd(totalUsd)}** aus ${sessions} ${sessionWord(sessions)}${tail}.`,
  ].join('\n');
}

/** Eine Zeile fuer den Changelog-Abschnitt "### Kosten". */
export function changelogLine({ pr, title, totalUsd, sessions, perModel }) {
  const models = modelsByCost(perModel).map(([model]) => model);
  const detail = models.length ? `, ${models.join(', ')}` : '';
  const clean = String(title || '')
    .replace(/\s+/g, ' ')
    .trim();
  const count = `${sessions} ${sessionWord(sessions)}`;
  return `- PR #${pr} "${clean}": ${formatUsd(totalUsd)} (${count}${detail})`;
}

// --- Changelog ---------------------------------------------------------------

const UNRELEASED_RE = /^##\s+\[Unveroeffentlicht\]/i;
const VERSION_RE = /^##\s+/;
const KOSTEN_RE = /^###\s+Kosten\s*$/i;

/**
 * Kostenzeile unter "## [Unveroeffentlicht]" -> "### Kosten" einpflegen.
 * Fehlt eine der beiden Ueberschriften, wird sie angelegt; existiert schon
 * eine Zeile zu derselben PR-Nummer, wird sie ersetzt statt ergaenzt. Die
 * kuratierten Abschnitte (Hinzugefuegt/Geaendert/Behoben/Entfernt) bleiben
 * unberuehrt.
 *
 * @param {string} content Inhalt der CHANGELOG.md
 * @param {number|string} pr PR-Nummer
 * @param {string} line Fertige Zeile
 * @returns {string} Neuer Inhalt
 */
export function insertChangelogLine(content, pr, line) {
  const lines = content.split('\n');

  let unreleased = lines.findIndex((entry) => UNRELEASED_RE.test(entry));
  if (unreleased === -1) {
    let at = lines.findIndex((entry) => VERSION_RE.test(entry));
    if (at === -1) at = lines.length;
    const spacer = at > 0 && lines[at - 1].trim() !== '' ? [''] : [];
    lines.splice(at, 0, ...spacer, '## [Unveroeffentlicht]', '');
    unreleased = at + spacer.length;
  }

  let sectionEnd = lines.length;
  for (let i = unreleased + 1; i < lines.length; i++) {
    if (VERSION_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  let kosten = -1;
  for (let i = unreleased + 1; i < sectionEnd; i++) {
    if (KOSTEN_RE.test(lines[i])) {
      kosten = i;
      break;
    }
  }

  if (kosten === -1) {
    let insertAt = sectionEnd;
    while (insertAt > unreleased + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, '', '### Kosten', '', line);
    return lines.join('\n');
  }

  let kostenEnd = sectionEnd;
  for (let i = kosten + 1; i < sectionEnd; i++) {
    if (/^###\s+/.test(lines[i])) {
      kostenEnd = i;
      break;
    }
  }

  const prefix = `- PR #${pr} `;
  for (let i = kosten + 1; i < kostenEnd; i++) {
    if (lines[i].startsWith(prefix)) {
      lines[i] = line;
      return lines.join('\n');
    }
  }

  let insertAt = kostenEnd;
  while (insertAt > kosten + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  lines.splice(insertAt, 0, line);
  return lines.join('\n');
}

// --- Projekte und verlinkte Issues -------------------------------------------

/** Oberste Ordner mit manifest.json - das sind die Projekte des Monorepos. */
export function projectDirs(repoRoot) {
  let entries;
  try {
    entries = fs.readdirSync(repoRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(repoRoot, entry.name, 'manifest.json')),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Projekte, deren Dateien der PR angefasst hat.
 * @param {string[]} files Pfade relativ zur Repo-Wurzel
 * @param {string[]} projects
 */
export function touchedProjects(files, projects) {
  const known = new Set(projects);
  const hit = new Set();
  for (const file of files) {
    const segment = String(file).split('/')[0];
    if (known.has(segment)) hit.add(segment);
  }
  return [...hit].sort();
}

const LINK_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s+#(\d+)/gi;

/**
 * Issue-Nummern aus "Closes|Fixes|Resolves #N" im PR-Body.
 * @param {string} body
 * @param {number|string} [self] Eigene PR-Nummer, wird ausgelassen
 */
export function linkedIssues(body, self) {
  const found = new Set();
  const text = String(body || '');
  LINK_RE.lastIndex = 0;
  let match = LINK_RE.exec(text);
  while (match) {
    if (String(match[1]) !== String(self)) found.add(match[1]);
    match = LINK_RE.exec(text);
  }
  return [...found];
}

// --- Historie ----------------------------------------------------------------

function historyPath(repoRoot) {
  return path.join(repoRoot, 'stats', 'history.csv');
}

function historyModelsPath(repoRoot) {
  return path.join(repoRoot, 'stats', 'history-models.csv');
}

/** Ist dieser Branch mit dieser PR-Nummer schon verbucht? */
export function historyHasEntry(repoRoot, branch, pr, reason) {
  return readCsvRows(historyPath(repoRoot)).some(
    (row) => row[0] === branch && row[1] === String(pr) && row[5] === reason,
  );
}

function appendHistory(repoRoot, { branch, pr, mergedAt, totalUsd, sessions, reason, perModel }) {
  const rows = readCsvRows(historyPath(repoRoot));
  rows.push([branch, String(pr), mergedAt, totalUsd.toFixed(4), String(sessions), reason]);
  writeCsvAtomic(historyPath(repoRoot), HISTORY_HEADER, rows);

  const modelRows = readCsvRows(historyModelsPath(repoRoot));
  const seen = new Set(modelRows.map((row) => `${row[0]}\u0000${row[1]}\u0000${row[2]}`));
  for (const [model, bucket] of modelsByCost(perModel)) {
    const key = `${mergedAt}\u0000${branch}\u0000${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    modelRows.push([
      mergedAt,
      branch,
      model,
      String(bucket.input),
      String(bucket.output),
      String(bucket.cache_read),
      String(bucket.cache_write),
      bucket.costUsd.toFixed(4),
    ]);
  }
  writeCsvAtomic(historyModelsPath(repoRoot), HISTORY_MODELS_HEADER, modelRows);
}

function pruneBranch(repoRoot, branch) {
  const costsFile = path.join(repoRoot, 'stats', 'costs.csv');
  const tokensFile = path.join(repoRoot, 'stats', 'tokens.csv');
  writeCsvAtomic(
    costsFile,
    COSTS_HEADER,
    readCsvRows(costsFile).filter((row) => row[0] !== branch),
  );
  writeCsvAtomic(
    tokensFile,
    TOKENS_HEADER,
    readCsvRows(tokensFile).filter((row) => row[0] !== branch),
  );
}

// --- Umgebung ----------------------------------------------------------------

function repoRoot() {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
    if (out) return out;
  } catch {
    // Faellt auf das Arbeitsverzeichnis zurueck.
  }
  return process.cwd();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function appendStepSummary(text) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    fs.appendFileSync(file, `${text}\n`, 'utf8');
  } catch (err) {
    warn(`Job Summary nicht schreibbar (${err.message}).`);
  }
}

/**
 * Dateien des PR. CHANGED_FILES (Zeilen- oder Kommaliste) hat Vorrang - das
 * ist der Weg fuer Tests und manuelle Laeufe; sonst fragt der Lauf die
 * GitHub-API, die unabhaengig von der Merge-Strategie antwortet.
 */
async function changedFiles(repo, pr) {
  const raw = process.env.CHANGED_FILES;
  if (raw !== undefined) {
    return raw
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await gh.api(`/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    files.push(...batch.map((entry) => entry.filename));
    if (batch.length < 100) break;
  }
  return files;
}

// --- Schritte ----------------------------------------------------------------

async function postComment(repo, pr, block) {
  const existing = await gh.listComments(repo, pr);
  if (existing.some((entry) => String(entry.body || '').includes(COMMENT_MARKER))) {
    log('Kostenkommentar existiert bereits - nicht erneut gepostet.');
    return;
  }
  await gh.comment(repo, pr, `${COMMENT_MARKER}\n${block}`);
  log(`Kommentar an PR #${pr} geschrieben.`);
}

async function patchDescriptions(repo, pr, prBody, block, issueBlock) {
  // Aktuellen PR-Body per API holen statt der Ereignis-Nutzlast zu vertrauen -
  // sonst macht ein Re-Run zwischenzeitliche Body-Aenderungen rueckgaengig.
  // Nur wenn der Abruf scheitert, faellt der Lauf auf PR_BODY zurueck.
  let currentPrBody = prBody;
  try {
    const current = await gh.get(repo, pr, 'pulls');
    currentPrBody = current.body || '';
  } catch (err) {
    warn(`PR #${pr} nicht lesbar, verwende Ereignis-Body (${err.message}).`);
  }

  const nextPrBody = gh.mergeIntoBody(currentPrBody, block, COST_MARKER);
  if (nextPrBody !== (currentPrBody || '')) {
    await gh.patchBody(repo, pr, nextPrBody, 'pulls');
    log(`PR-Beschreibung #${pr} gepatcht.`);
  } else {
    log('PR-Beschreibung unveraendert.');
  }

  // Die Verlinkung ("Closes #N") liest weiterhin die Ereignis-Nutzlast - die
  // steht beim Merge fest und soll nicht von zwischenzeitlichen Body-Edits
  // abhaengen.
  const issueMarker = `${COST_MARKER}-pr-${pr}`;
  for (const issue of linkedIssues(prBody, pr)) {
    // Ein fehlgeschlagener Issue-Patch (etwa fehlendes issues:write) darf die
    // Verbuchung nicht kippen - der Kostenblock im PR steht dann trotzdem.
    try {
      const current = await gh.get(repo, issue, 'issues');
      // Eigener Marker je PR: mehrere Sub-Task-PRs auf dasselbe Issue duerfen
      // sich nicht gegenseitig den Kostenblock ueberschreiben.
      const nextBody = gh.mergeIntoBody(current.body, issueBlock, issueMarker);
      if (nextBody === (current.body || '')) {
        log(`Issue #${issue} unveraendert.`);
        continue;
      }
      await gh.patchBody(repo, issue, nextBody, 'issues');
      log(`Issue #${issue} gepatcht.`);
    } catch (err) {
      warn(`Issue #${issue} nicht patchbar (${err.message}).`);
    }
  }
}

function updateChangelogs(root, projects, pr, line) {
  const written = [];
  for (const project of projects) {
    const file = path.join(root, project, 'CHANGELOG.md');
    if (!fs.existsSync(file)) {
      warn(`${project}/CHANGELOG.md fehlt - Eintrag uebersprungen.`);
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    const after = insertChangelogLine(before, pr, line);
    if (after === before) {
      log(`${project}/CHANGELOG.md unveraendert.`);
      continue;
    }
    fs.writeFileSync(file, after, 'utf8');
    written.push(project);
  }
  return written;
}

// --- Main --------------------------------------------------------------------

async function main() {
  const root = repoRoot();
  const branch = requiredEnv('HEAD_REF');
  const pr = requiredEnv('PR_NUMBER');
  const title = process.env.PR_TITLE || '';
  const prBody = process.env.PR_BODY || '';
  const mergedAt = process.env.MERGED_AT || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const repo = process.env.GITHUB_REPOSITORY || '';
  const online = Boolean(repo && process.env.GITHUB_TOKEN);

  // Erster und wichtigster Idempotenz-Riegel: was in der Historie steht, ist
  // verbucht. Die Historie wird als Letztes geschrieben, ein abgebrochener
  // Lauf laeuft also beim Re-Run vollstaendig neu - jeder Einzelschritt
  // haelt das aus.
  if (historyHasEntry(root, branch, pr, 'merged')) {
    log(`Branch ${branch} (PR #${pr}) ist bereits verbucht - nichts zu tun.`);
    return;
  }

  const costsRows = readCsvRows(path.join(root, 'stats', 'costs.csv'));
  const tokensRows = readCsvRows(path.join(root, 'stats', 'tokens.csv'));
  const agg = aggregate(costsRows, tokensRows, branch);

  if (agg.sessions === 0) {
    log(`Keine Kostenzeilen fuer Branch ${branch} - nichts zu verbuchen.`);
    appendStepSummary(`${HEADING_PR}\n\nKeine Sessions fuer \`${branch}\` erfasst.`);
    return;
  }

  const block = summaryBlock(agg);
  // Im Issue steht die Ueberschrift neben denen anderer Sub-Task-PRs und muss
  // deshalb sagen, zu welchem PR die Zahl gehoert.
  const issueBlock = summaryBlock(agg, `### Kosten aus PR #${pr}`);
  appendStepSummary(block);

  if (online) {
    await postComment(repo, pr, block);
    await patchDescriptions(repo, pr, prBody, block, issueBlock);
  } else {
    warn('GITHUB_REPOSITORY oder GITHUB_TOKEN fehlt - GitHub-Schritte uebersprungen.');
  }

  const files =
    online || process.env.CHANGED_FILES !== undefined ? await changedFiles(repo, pr) : [];
  const projects = touchedProjects(files, projectDirs(root));
  if (projects.length === 0) log('Kein Projekt beruehrt - kein Changelog-Eintrag.');
  const written = updateChangelogs(root, projects, pr, changelogLine({ pr, title, ...agg }));

  appendHistory(root, {
    branch,
    pr,
    mergedAt,
    totalUsd: agg.totalUsd,
    sessions: agg.sessions,
    reason: 'merged',
    perModel: agg.perModel,
  });
  pruneBranch(root, branch);

  log(
    `${formatUsd(agg.totalUsd)} aus ${agg.sessions} ${sessionWord(agg.sessions)} verbucht` +
      `${written.length ? ` (Changelog: ${written.join(', ')})` : ''}.`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`costs-merge: ${err && err.message}`);
    process.exit(1);
  });
}
