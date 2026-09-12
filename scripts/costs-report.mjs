#!/usr/bin/env node
/**
 * Erzeugt den Tagesreport der Session-Kosten.
 *
 * Liest stats/costs.csv, stats/tokens.csv, stats/history.csv und
 * stats/history-models.csv und schreibt stats/report.html komplett neu -
 * der Report wird nie fortgeschrieben, jeder Lauf ersetzt die Datei.
 *
 * Ablauf von main(): erst Prune (verwaiste Branches nach history.csv
 * verschieben), dann Report aus den bereinigten Daten - so erscheinen frisch
 * geprunte Branches sofort als "abandoned" in der Historie des Reports.
 *
 * Ein Branch ist verwaist, wenn er am Remote nicht mehr existiert ODER sein
 * juengstes updated_at aelter als 30 Tage ist. Ist der Remote-Abgleich nicht
 * moeglich (kein Netz, kein Remote, leere Antwort), greift nur die
 * Altersregel und eine Warnung geht auf stderr - ein fehlendes Netz darf nie
 * lebende Zeilen loeschen.
 *
 * Ohne Dependencies, Node >= 18, ESM.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { aggregate, modelsByCost, formatUsd } from './costs-merge.mjs';

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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function warn(message) {
  console.error(`costs-report: ${message}`);
}

function log(message) {
  console.log(`costs-report: ${message}`);
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

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyBucket() {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0, costUsd: 0 };
}

/** ISO-8601-UTC, sekundengenau, mit Z - wie updated_at/merged_at in den CSVs. */
export function isoSeconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// --- HTML-Escaping -------------------------------------------------------------

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Prune: verwaiste Branches ------------------------------------------------

/** Juengstes updated_at eines Branches in costs.csv, oder null ohne Zeilen. */
function branchNewestUpdatedAt(costsRows, branch) {
  let newest = null;
  for (const row of costsRows) {
    if (row[0] !== branch) continue;
    if (newest === null || row[2] > newest) newest = row[2];
  }
  return newest;
}

/**
 * Ist ein updated_at aelter als 30 Tage? Ein nicht parsbares Datum zaehlt
 * bewusst als "nicht stale" - kaputte Einzelzeilen duerfen nie eine Loeschung
 * ausloesen, die niemand beabsichtigt hat.
 */
function isStale(updatedAt, now) {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return false;
  return now.getTime() - ts > THIRTY_DAYS_MS;
}

/** Existiert fuer diesen Branch schon eine abandoned-Zeile in history.csv? */
export function hasAbandonedEntry(historyRows, branch) {
  return historyRows.some((row) => row[0] === branch && row[5] === 'abandoned');
}

/**
 * Branches aus costs.csv, die verwaist sind: am Remote nicht mehr vorhanden
 * (remoteBranches !== null und ohne den Branch) oder aelter als 30 Tage.
 * remoteBranches ist ein Set der Remote-Branchnamen oder null, wenn der
 * Abgleich nicht moeglich war (kein Netz/Remote/leere Antwort) - dann greift
 * nur die Altersregel. Bereits als abandoned verbuchte Branches werden nicht
 * erneut ausgewaehlt (Idempotenz), auch wenn ihre Zeilen aus irgendeinem
 * Grund wieder in costs.csv stehen (z. B. Union-Merge-Nachbehandlung).
 */
export function selectAbandoned(costsRows, historyRows, remoteBranches, now) {
  const branches = [...new Set(costsRows.map((row) => row[0]))];
  const result = [];
  for (const branch of branches) {
    if (hasAbandonedEntry(historyRows, branch)) continue;
    const remoteGone = remoteBranches !== null && !remoteBranches.has(branch);
    const stale = isStale(branchNewestUpdatedAt(costsRows, branch), now);
    if (remoteGone || stale) result.push(branch);
  }
  return result;
}

/**
 * Verwaiste Branches aus costs.csv/tokens.csv loesen und mit reason=abandoned
 * nach history.csv/history-models.csv verschieben. Reine Funktion - keine
 * Dateizugriffe, damit sie ohne Git-Repo und ohne temporaere Dateien testbar
 * ist. merged_at der neuen history.csv-Zeile ist der Erzeugungszeitpunkt
 * dieses Laufs (now), nicht der letzte Session-Zeitstempel.
 */
export function pruneAbandoned(costsRows, tokensRows, historyRows, historyModelRows, remoteBranches, now) {
  const abandoned = selectAbandoned(costsRows, historyRows, remoteBranches, now);
  const abandonedSet = new Set(abandoned);
  const nowIso = isoSeconds(now);

  const newHistoryRows = [...historyRows];
  const newHistoryModelRows = [...historyModelRows];
  for (const branch of abandoned) {
    const agg = aggregate(costsRows, tokensRows, branch);
    newHistoryRows.push([
      branch,
      '',
      nowIso,
      agg.totalUsd.toFixed(4),
      String(agg.sessions),
      'abandoned',
    ]);
    for (const [model, bucket] of modelsByCost(agg.perModel)) {
      newHistoryModelRows.push([
        nowIso,
        branch,
        model,
        String(bucket.input),
        String(bucket.output),
        String(bucket.cache_read),
        String(bucket.cache_write),
        bucket.costUsd.toFixed(4),
      ]);
    }
  }

  return {
    abandoned,
    costsRows: costsRows.filter((row) => !abandonedSet.has(row[0])),
    tokensRows: tokensRows.filter((row) => !abandonedSet.has(row[0])),
    historyRows: newHistoryRows,
    historyModelRows: newHistoryModelRows,
  };
}

/** Remote-Branches per `git ls-remote --heads origin`, oder null wenn nicht ermittelbar. */
function listRemoteBranches(root) {
  let out;
  try {
    out = execFileSync('git', ['ls-remote', '--heads', 'origin'], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch (err) {
    warn(`git ls-remote fehlgeschlagen (${err.message}) - nur die Altersregel greift.`);
    return null;
  }
  const branches = new Set();
  for (const line of out.split(/\r?\n/)) {
    const match = line.trim().match(/refs\/heads\/(.+)$/);
    if (match) branches.add(match[1]);
  }
  if (branches.size === 0) {
    warn('git ls-remote lieferte keine Branches - Remote-Abgleich nicht ermittelbar, nur die Altersregel greift.');
    return null;
  }
  return branches;
}

/** IO-Verdrahtung: liest, prunt und schreibt costs.csv/tokens.csv/history*.csv. */
function runPrune(root, now) {
  const costsFile = path.join(root, 'stats', 'costs.csv');
  const tokensFile = path.join(root, 'stats', 'tokens.csv');
  const historyFile = path.join(root, 'stats', 'history.csv');
  const historyModelsFile = path.join(root, 'stats', 'history-models.csv');

  const costsRows = readCsvRows(costsFile);
  const tokensRows = readCsvRows(tokensFile);
  const historyRows = readCsvRows(historyFile);
  const historyModelRows = readCsvRows(historyModelsFile);

  const remoteBranches = listRemoteBranches(root);
  const result = pruneAbandoned(costsRows, tokensRows, historyRows, historyModelRows, remoteBranches, now);

  writeCsvAtomic(costsFile, COSTS_HEADER, result.costsRows);
  writeCsvAtomic(tokensFile, TOKENS_HEADER, result.tokensRows);
  writeCsvAtomic(historyFile, HISTORY_HEADER, result.historyRows);
  writeCsvAtomic(historyModelsFile, HISTORY_MODELS_HEADER, result.historyModelRows);

  if (result.abandoned.length > 0) {
    log(`${result.abandoned.length} verwaiste Branch(es) aufgeraeumt: ${result.abandoned.join(', ')}.`);
  }

  return result;
}

// --- Aufbereitung fuer den Report ----------------------------------------------

/**
 * Offene Branches (aus costs.csv) mit ihrer Aggregation. Nutzt aggregate()
 * aus costs-merge.mjs, damit Dedupe-Regeln und Rundung an genau einer Stelle
 * gepflegt werden.
 */
export function openBranches(costsRows, tokensRows) {
  const branches = [...new Set(costsRows.map((row) => row[0]))];
  return branches.map((branch) => {
    const agg = aggregate(costsRows, tokensRows, branch);
    return {
      branch,
      sessions: agg.sessions,
      totalUsd: agg.totalUsd,
      perModel: agg.perModel,
      lastActivity: branchNewestUpdatedAt(costsRows, branch),
    };
  });
}

/** Verbuchte Branches (aus history.csv), samt ihrer Modelle aus history-models.csv. */
export function bookedBranches(historyRows, historyModelRows) {
  return historyRows.map((row) => {
    const [branch, pr, mergedAt, totalUsd, sessions, reason] = row;
    const models = historyModelRows
      .filter((model) => model[1] === branch && model[0] === mergedAt)
      .map((model) => model[2]);
    return {
      branch,
      pr,
      mergedAt,
      totalUsd: num(totalUsd),
      sessions: num(sessions),
      reason,
      models,
    };
  });
}

/**
 * Sessions je Modell zaehlen. Zaehlt nur offene Sessions aus tokens.csv, bei
 * denen die Session auch in costs.csv bekannt ist - history-models.csv fuehrt
 * keine Session-ID mehr (der Branch ist beim Verbuchen bereits geloescht),
 * verbuchte Modellzeilen tragen deshalb bewusst nichts zur Sessions-Spalte
 * bei. Eine erfundene Zahl waere schlimmer als eine fehlende.
 */
export function modelSessionCounts(costsRows, tokensRows) {
  const validSessions = new Set(costsRows.map((row) => `${row[0]} ${row[1]}`));
  const perModel = new Map();
  for (const row of tokensRows) {
    const sessionKey = `${row[0]} ${row[1]}`;
    if (!validSessions.has(sessionKey)) continue;
    const model = row[2];
    if (!perModel.has(model)) perModel.set(model, new Set());
    perModel.get(model).add(sessionKey);
  }
  const counts = new Map();
  for (const [model, sessions] of perModel) counts.set(model, sessions.size);
  return counts;
}

/** Modellsummen aus offenen Branches (aggregate) und history-models.csv addiert. */
export function modelSummary(costsRows, tokensRows, historyModelRows) {
  const perModel = new Map();
  for (const { perModel: branchModels } of openBranches(costsRows, tokensRows)) {
    for (const [model, bucket] of branchModels) {
      const acc = perModel.get(model) || emptyBucket();
      acc.input += bucket.input;
      acc.output += bucket.output;
      acc.cache_read += bucket.cache_read;
      acc.cache_write += bucket.cache_write;
      acc.costUsd += bucket.costUsd;
      perModel.set(model, acc);
    }
  }
  for (const row of historyModelRows) {
    const [, , model, input, output, cacheRead, cacheWrite, costUsd] = row;
    const acc = perModel.get(model) || emptyBucket();
    acc.input += num(input);
    acc.output += num(output);
    acc.cache_read += num(cacheRead);
    acc.cache_write += num(cacheWrite);
    acc.costUsd += num(costUsd);
    perModel.set(model, acc);
  }
  for (const bucket of perModel.values()) bucket.costUsd = Number(bucket.costUsd.toFixed(4));
  return perModel;
}

/**
 * Trend aus der Historie: gestern (UTC-Kalendertag vor now), 7 und 30 Tage
 * rollierend bis now. "Gestern" ist ein fester Kalendertag
 * [00:00, 24:00) UTC; die 7/30-Tage-Fenster sind rollierend
 * [now - N Tage, now]. Merged- und abandoned-Zeilen zaehlen beide, beide
 * tragen echte Kosten.
 */
export function trend(historyRows, now) {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const yesterdayStart = dayStart - 24 * 60 * 60 * 1000;
  const rolling7Start = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const rolling30Start = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  let yesterday = 0;
  let days7 = 0;
  let days30 = 0;
  for (const row of historyRows) {
    const ts = Date.parse(row[2]);
    if (!Number.isFinite(ts)) continue;
    const amount = num(row[3]);
    if (ts >= yesterdayStart && ts < dayStart) yesterday += amount;
    if (ts >= rolling7Start && ts <= now.getTime()) days7 += amount;
    if (ts >= rolling30Start && ts <= now.getTime()) days30 += amount;
  }
  return {
    yesterday: Number(yesterday.toFixed(4)),
    days7: Number(days7.toFixed(4)),
    days30: Number(days30.toFixed(4)),
  };
}

/**
 * Baut alle Daten fuer renderHtml() aus den (bereits gepruneten) CSV-Zeilen.
 * Autoritativ fuer die Gesamtsumme sind die Branch-Summen (costs.csv/
 * history.csv). Weicht die Modellsumme davon ab (fehlende oder
 * inkonsistente tokens.csv-Zeilen), haengt die Modelltabelle eine Restzeile
 * "ohne Modellzuordnung" mit der Differenz an - nur wenn die Differenz
 * betragsmaessig mindestens 0.0001 ist.
 */
export function buildReportData(costsRows, tokensRows, historyRows, historyModelRows, now) {
  const open = openBranches(costsRows, tokensRows);
  const booked = bookedBranches(historyRows, historyModelRows);

  const openTotal = open.reduce((sum, entry) => sum + entry.totalUsd, 0);
  const bookedTotal = booked.reduce((sum, entry) => sum + entry.totalUsd, 0);
  const totalUsd = Number((openTotal + bookedTotal).toFixed(4));

  const perModel = modelSummary(costsRows, tokensRows, historyModelRows);
  const sessionCounts = modelSessionCounts(costsRows, tokensRows);

  let modelSum = 0;
  const modelRows = modelsByCost(perModel).map(([model, bucket]) => {
    modelSum += bucket.costUsd;
    return {
      model,
      input: bucket.input,
      output: bucket.output,
      cacheRead: bucket.cache_read,
      cacheWrite: bucket.cache_write,
      sessions: sessionCounts.get(model) || 0,
      costUsd: bucket.costUsd,
      pct: totalUsd === 0 ? 0 : (bucket.costUsd / totalUsd) * 100,
    };
  });
  modelSum = Number(modelSum.toFixed(4));

  const remainder = Number((totalUsd - modelSum).toFixed(4));
  if (Math.abs(remainder) >= 0.0001) {
    modelRows.push({
      model: 'ohne Modellzuordnung',
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      sessions: 0,
      costUsd: remainder,
      pct: totalUsd === 0 ? 0 : (remainder / totalUsd) * 100,
    });
  }

  const openBranchRows = [...open]
    .sort((a, b) => b.totalUsd - a.totalUsd || a.branch.localeCompare(b.branch))
    .map((entry) => ({
      branch: entry.branch,
      sessions: entry.sessions,
      models: modelsByCost(entry.perModel).map(([model]) => model),
      lastActivity: entry.lastActivity || '',
      costUsd: entry.totalUsd,
    }));

  const bookedBranchRows = [...booked]
    .sort((a, b) => (a.mergedAt < b.mergedAt ? 1 : a.mergedAt > b.mergedAt ? -1 : 0))
    .map((entry) => ({
      branch: entry.branch,
      sessions: entry.sessions,
      models: entry.models,
      lastActivity: entry.mergedAt,
      costUsd: entry.totalUsd,
      reason: entry.reason,
    }));

  return {
    generatedAt: now,
    totalUsd,
    modelRows,
    openBranchRows,
    bookedBranchRows,
    trend: trend(historyRows, now),
  };
}

// --- Rendering -----------------------------------------------------------------

function formatInt(value) {
  return String(Math.round(num(value)));
}

function formatPct(value) {
  return `${num(value).toFixed(1)} %`;
}

const STYLE = `
:root { color-scheme: light dark; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  margin: 2rem;
  background: #ffffff;
  color: #111111;
}
h1, h2 { font-weight: 600; }
p.hinweis-kopf { color: #444444; }
table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #dddddd; text-align: left; }
th.num, td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
tbody tr:nth-child(even) { background: #f6f6f6; }
tr.gruppe th { background: #e0e0e0; font-weight: 600; }
td.hinweis, tr.gruppe + tr td.hinweis { font-style: italic; color: #555555; }
span.reason { color: #666666; font-style: italic; }
@media (prefers-color-scheme: dark) {
  body { background: #1b1b1b; color: #eeeeee; }
  p.hinweis-kopf { color: #bbbbbb; }
  th, td { border-bottom-color: #333333; }
  tbody tr:nth-child(even) { background: #262626; }
  tr.gruppe th { background: #333333; }
  td.hinweis { color: #aaaaaa; }
  span.reason { color: #999999; }
}
`.trim();

function renderModelTable(modelRows) {
  if (modelRows.length === 0) {
    return '<table>\n<tbody>\n<tr><td class="hinweis" colspan="8">Keine Kostendaten vorhanden.</td></tr>\n</tbody>\n</table>';
  }
  const rows = modelRows
    .map(
      (row) => `<tr>
<td>${escapeHtml(row.model)}</td>
<td class="num">${formatInt(row.input)}</td>
<td class="num">${formatInt(row.output)}</td>
<td class="num">${formatInt(row.cacheRead)}</td>
<td class="num">${formatInt(row.cacheWrite)}</td>
<td class="num">${formatInt(row.sessions)}</td>
<td class="num">${formatUsd(row.costUsd)}</td>
<td class="num">${formatPct(row.pct)}</td>
</tr>`,
    )
    .join('\n');
  return `<table>
<thead>
<tr>
<th>Modell</th>
<th class="num">Input</th>
<th class="num">Output</th>
<th class="num">Cache-Read</th>
<th class="num">Cache-Write</th>
<th class="num">Sessions</th>
<th class="num">Kosten USD</th>
<th class="num">Anteil</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>`;
}

function renderBranchGroup(label, rows) {
  const header = `<tr class="gruppe"><th colspan="5">${escapeHtml(label)}</th></tr>`;
  if (rows.length === 0) {
    return `${header}\n<tr><td class="hinweis" colspan="5">Keine Branches in dieser Gruppe.</td></tr>`;
  }
  return [
    header,
    ...rows.map((row) => {
      const reasonTag =
        row.reason === 'abandoned' ? ' <span class="reason">(abandoned)</span>' : '';
      return `<tr>
<td>${escapeHtml(row.branch)}${reasonTag}</td>
<td class="num">${formatInt(row.sessions)}</td>
<td>${escapeHtml(row.models.join(', '))}</td>
<td>${escapeHtml(row.lastActivity)}</td>
<td class="num">${formatUsd(row.costUsd)}</td>
</tr>`;
    }),
  ].join('\n');
}

function renderBranchTable(openBranchRows, bookedBranchRows) {
  if (openBranchRows.length === 0 && bookedBranchRows.length === 0) {
    return '<table>\n<tbody>\n<tr><td class="hinweis" colspan="5">Keine Branch-Daten vorhanden.</td></tr>\n</tbody>\n</table>';
  }
  return `<table>
<thead>
<tr>
<th>Branch</th>
<th class="num">Sessions</th>
<th>Modelle</th>
<th>Letzte Aktivitaet</th>
<th class="num">Kosten USD</th>
</tr>
</thead>
<tbody>
${renderBranchGroup('Offene Branches', openBranchRows)}
</tbody>
<tbody>
${renderBranchGroup('Verbuchte Branches', bookedBranchRows)}
</tbody>
</table>`;
}

function renderTrendTable(trendData) {
  return `<table>
<thead>
<tr><th>Zeitraum</th><th class="num">Kosten USD</th></tr>
</thead>
<tbody>
<tr><td>Gestern</td><td class="num">${formatUsd(trendData.yesterday)}</td></tr>
<tr><td>7 Tage</td><td class="num">${formatUsd(trendData.days7)}</td></tr>
<tr><td>30 Tage</td><td class="num">${formatUsd(trendData.days30)}</td></tr>
</tbody>
</table>`;
}

/**
 * Baut die vollstaendige, eigenstaendige HTML-Seite - kein JavaScript, keine
 * externe URL, keine Webfonts. Eingebettetes CSS im <style>-Block deckt
 * Dark Mode und Zebra-Streifen ab.
 */
export function renderHtml(data) {
  const generated = isoSeconds(data.generatedAt);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Kostenreport</title>
<style>
${STYLE}
</style>
</head>
<body>
<h1>Kostenreport</h1>
<p class="hinweis-kopf">Erzeugt am ${escapeHtml(generated)} - Schaetzung zu Listenpreisen, keine Rechnung.</p>
<p>Gesamtsumme: <strong>${formatUsd(data.totalUsd)}</strong></p>

<h2>Kosten je Modell</h2>
${renderModelTable(data.modelRows)}

<h2>Kosten je Branch</h2>
${renderBranchTable(data.openBranchRows, data.bookedBranchRows)}

<h2>Trend</h2>
${renderTrendTable(data.trend)}
</body>
</html>
`;
}

// --- Umgebung und Main ----------------------------------------------------------

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

/**
 * Erzeugungszeitpunkt des Laufs. COSTS_REPORT_NOW (ISO-Zeitstempel) ist ein
 * Hintertuer-Parameter nur fuer Tests und manuelle Laeufe, kein regulaerer
 * Schalter - ohne die Variable zaehlt immer die echte Systemzeit.
 */
function resolveNow() {
  const raw = process.env.COSTS_REPORT_NOW;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    warn(`COSTS_REPORT_NOW nicht parsbar (${raw}) - verwende die Systemzeit.`);
  }
  return new Date();
}

function main() {
  const root = repoRoot();
  const now = resolveNow();

  const pruned = runPrune(root, now);
  const data = buildReportData(
    pruned.costsRows,
    pruned.tokensRows,
    pruned.historyRows,
    pruned.historyModelRows,
    now,
  );
  const html = renderHtml(data);
  writeFileAtomic(path.join(root, 'stats', 'report.html'), html);

  log(`Report geschrieben - Gesamtsumme ${formatUsd(data.totalUsd)}.`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(`costs-report: ${err && err.message}`);
    process.exit(1);
  }
}
