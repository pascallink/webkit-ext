#!/usr/bin/env node
/**
 * Errechnet die Kosten der laufenden Claude-Session aus dem Transcript-JSONL
 * und pflegt stats/costs.csv (Session-Summe) sowie stats/tokens.csv
 * (Aufschluesselung je Modell). Laeuft ohne Dependencies auf Node-Bordmitteln.
 *
 * Harte Regel: dieses Skript darf nie einen Commit oder Turn blockieren.
 * Jeder Fehlerpfad (kein Git-Repo, detached HEAD, fehlendes Transcript,
 * unbekanntes Modell, kaputtes JSON) endet sauber mit Exit 0.
 */

import fs, { createReadStream, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';

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
  console.error(`costs-update: ${message}`);
}

function isoNowUtc() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// --- Git-Kontext ---------------------------------------------------------

function resolveRepoRoot() {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function currentBranch(repoRoot) {
  try {
    const out = execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// --- Session aufloesen -----------------------------------------------------

function claudeProjectsDir(cwd) {
  const slug = path.resolve(cwd).replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', slug);
}

function sessionIdFromPath(transcriptPath) {
  return path.basename(transcriptPath, '.jsonl');
}

function newestJsonl(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  let best = null;
  let bestMtime = -Infinity;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const full = path.join(dir, entry.name);
    let mtime;
    try {
      mtime = fs.statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (mtime > bestMtime) {
      bestMtime = mtime;
      best = full;
    }
  }
  return best;
}

function listJsonlFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(dir, entry.name));
}

function subagentDir(transcriptPath) {
  const dir = path.dirname(transcriptPath);
  const base = sessionIdFromPath(transcriptPath);
  return path.join(dir, base, 'subagents');
}

const STDIN_TIMEOUT_MS = 2000;

/**
 * JSON-Payload eines Claude-Code-Hooks von stdin lesen, falls vorhanden.
 * Liest nur bei explizitem --stdin-Schalter und wenn stdin kein
 * interaktives Terminal ist (kein Character-Device) - Pipe, Socket und
 * Datei sind erlaubt, denn ein Elternprozess kann stdin ueber
 * verschiedene Deskriptortypen anlegen (z. B. meldet child_process.spawn
 * mit stdio 'pipe' unter Linux einen Socket, keine FIFO).
 *
 * Gelesen wird ueber den Stream statt fs.readFileSync(0), weil ein
 * blockierender Read einer offenen Pipe ohne Daten (oder einer spaet
 * geschlossenen Pipe) sonst unbegrenzt haengt. Der Schutz gegen Blockieren
 * steckt im Zeitlimit, nicht im Dateityp: ein hartes Zeitlimit bricht den
 * Lesevorgang notfalls ab; der Timer haelt den Prozess dabei nicht am
 * Leben (unref).
 */
async function readStdinJson(argv) {
  if (!argv.includes('--stdin')) return null;
  let stat;
  try {
    stat = fs.fstatSync(0);
  } catch {
    return null;
  }
  if (stat.isCharacterDevice()) return null;

  const chunks = [];
  const readAll = (async () => {
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  })();
  // Verhindert einen unhandled rejection, falls der Read nach dem Timeout
  // (durch das destroy() unten) noch mit einem Fehler abschliesst.
  readAll.catch(() => {});

  let timer;
  const timedOut = await new Promise((resolve) => {
    timer = setTimeout(() => resolve(true), STDIN_TIMEOUT_MS);
    timer.unref();
    readAll.then(
      () => resolve(false),
      () => resolve(false),
    );
  });
  clearTimeout(timer);

  if (timedOut) {
    process.stdin.destroy();
    // Bis zum Timeout bereits vollstaendig empfangene Chunks nicht
    // verwerfen - manche Hooks schreiben ihren Payload und schliessen
    // stdin erst verzoegert.
    const partial = Buffer.concat(chunks).toString('utf8');
    if (partial && partial.trim()) {
      try {
        return JSON.parse(partial);
      } catch {
        // Faellt durch zur Warnung unten.
      }
    }
    warn('stdin lieferte binnen 2s keinen vollstaendigen Payload - uebersprungen.');
    return null;
  }

  const raw = await readAll;
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    warn('Stdin ist kein gueltiges JSON - ignoriert.');
    return null;
  }
}

/**
 * Aufloesungsreihenfolge: --transcript <pfad> -> stdin-JSON (Claude-Code-Hook,
 * nur mit --stdin und FIFO) -> neuestes .jsonl unter
 * ~/.claude/projects/<cwd-slug>/.
 */
async function resolveSession(argv) {
  const flagIndex = argv.indexOf('--transcript');
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    const transcriptPath = argv[flagIndex + 1];
    return { transcriptPath, sessionId: sessionIdFromPath(transcriptPath) };
  }

  const stdinPayload = await readStdinJson(argv);
  if (stdinPayload) {
    const cwd = stdinPayload.cwd || process.cwd();
    let transcriptPath = stdinPayload.transcript_path || null;
    let sessionId = stdinPayload.session_id || null;
    if (!transcriptPath && sessionId) {
      transcriptPath = path.join(claudeProjectsDir(cwd), `${sessionId}.jsonl`);
    }
    if (transcriptPath) {
      return { transcriptPath, sessionId: sessionId || sessionIdFromPath(transcriptPath) };
    }
  }

  const transcriptPath = newestJsonl(claudeProjectsDir(process.cwd()));
  if (!transcriptPath) return null;
  return { transcriptPath, sessionId: sessionIdFromPath(transcriptPath) };
}

// --- Preistabelle ----------------------------------------------------------

function loadPricing(repoRoot) {
  const file = path.join(repoRoot, 'stats', 'pricing.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return { models: data.models || {}, meta: data._meta || {} };
  } catch (err) {
    warn(`Preistabelle ${file} nicht lesbar - alle Kosten werden mit 0 gewertet (${err.message}).`);
    return { models: {}, meta: {} };
  }
}

function defaultCacheTtl(meta) {
  return meta.default_cache_ttl === '5m' ? '5m' : '1h';
}

function ratesFor(pricing, model, speed) {
  const base = pricing[model];
  if (!base) return null;
  if (speed === 'fast' && base.fast) {
    return { ...base, input: base.fast.input, output: base.fast.output };
  }
  return base;
}

// --- Transcript einlesen -----------------------------------------------------

function addUsageLine(state, model, usage) {
  let bucket = state.perModel.get(model);
  if (!bucket) {
    bucket = { input: 0, output: 0, cache_read: 0, cache_write: 0, costUsd: 0 };
    state.perModel.set(model, bucket);
  }

  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  let cacheWrite5m = 0;
  let cacheWrite1h = 0;
  const cc = usage.cache_creation;
  const ephemeral5m = (cc && cc.ephemeral_5m_input_tokens) || 0;
  const ephemeral1h = (cc && cc.ephemeral_1h_input_tokens) || 0;
  if (ephemeral5m + ephemeral1h > 0) {
    cacheWrite5m = ephemeral5m;
    cacheWrite1h = ephemeral1h;
  } else if (usage.cache_creation_input_tokens) {
    // Aeltere Transcript-Form ohne 5m/1h-Aufschluesselung (oder leeres
    // cache_creation-Objekt) - TTL kommt aus der Preistabelle, Default 1h.
    const ttl = defaultCacheTtl(state.pricingMeta);
    if (ttl === '5m') {
      cacheWrite5m = usage.cache_creation_input_tokens;
    } else {
      cacheWrite1h = usage.cache_creation_input_tokens;
    }
    if (!state.warnedCacheFallback) {
      state.warnedCacheFallback = true;
      warn(
        `cache_creation ohne 5m/1h-Aufschluesselung - cache_creation_input_tokens ` +
          `nach Default-TTL "${ttl}" aus stats/pricing.json gebucht.`,
      );
    }
  }

  bucket.input += input;
  bucket.output += output;
  bucket.cache_read += cacheRead;
  bucket.cache_write += cacheWrite5m + cacheWrite1h;

  const rates = ratesFor(state.pricing, model, usage.speed);
  if (!rates) {
    if (!state.warnedModels.has(model)) {
      state.warnedModels.add(model);
      warn(`Unbekanntes Modell "${model}" - Kosten werden mit 0 USD gewertet.`);
    }
    return;
  }

  bucket.costUsd +=
    (input * rates.input +
      output * rates.output +
      cacheRead * rates.cache_read +
      cacheWrite5m * rates.cache_write_5m +
      cacheWrite1h * rates.cache_write_1h) /
    1_000_000;
}

async function collectUsage(filePath, state) {
  if (!filePath || !existsSync(filePath)) return;

  let rl;
  try {
    rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
  } catch {
    return;
  }

  let lineNumber = 0;
  try {
    for await (const line of rl) {
      lineNumber++;
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.type !== 'assistant') continue;
      const usage = entry.message && entry.message.usage;
      if (!usage) continue;

      // Dedupe: Retries und Streaming erzeugen sonst Doppel derselben Antwort.
      // Fehlen requestId und message.id beide, macht Dateipfad + Zeilennummer
      // den Schluessel eindeutig statt alle auf denselben leeren String
      // kollidieren zu lassen.
      const requestId = entry.requestId || '';
      const messageId = entry.message.id || '';
      const key =
        requestId || messageId ? `${requestId}:${messageId}` : `${filePath}:${lineNumber}`;
      if (state.seen.has(key)) continue;
      state.seen.add(key);

      addUsageLine(state, entry.message.model || 'unbekannt', usage);
    }
  } catch (err) {
    warn(`Transcript ${filePath} konnte nicht vollstaendig gelesen werden (${err.message}).`);
  }
}

// --- CSV-Ein-/Ausgabe --------------------------------------------------------

function csvEscape(field) {
  const value = String(field);
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields) {
  return fields.map(csvEscape).join(',');
}

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

function readCsvRows(filePath) {
  if (!existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  return lines.slice(1).map(parseCsvLine);
}

function writeCsvAtomic(filePath, header, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = [csvRow(header), ...rows.map(csvRow)].join('\n') + '\n';
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function compareRows(a, b, keyCount) {
  for (let i = 0; i < keyCount; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function upsertCosts(repoRoot, branch, sessionId, totalCost, updatedAt) {
  const filePath = path.join(repoRoot, 'stats', 'costs.csv');
  const map = new Map();
  for (const row of readCsvRows(filePath)) {
    const key = `${row[0]}\u0000${row[1]}`;
    const existing = map.get(key);
    // Bei doppeltem Schluessel gewinnt die Zeile mit dem groesseren
    // updated_at (ISO-8601 sortiert lexikalisch chronologisch), nicht
    // einfach die zuletzt gelesene - relevant nach einem Union-Merge.
    if (!existing || row[2] > existing[2]) {
      map.set(key, row);
    }
  }
  map.set(`${branch}\u0000${sessionId}`, [branch, sessionId, updatedAt, totalCost.toFixed(4)]);
  const rows = [...map.values()].sort((a, b) => compareRows(a, b, 2));
  writeCsvAtomic(filePath, COSTS_HEADER, rows);
}

function upsertTokens(repoRoot, branch, sessionId, perModel) {
  const filePath = path.join(repoRoot, 'stats', 'tokens.csv');
  const map = new Map();
  for (const row of readCsvRows(filePath)) {
    map.set(`${row[0]}\u0000${row[1]}\u0000${row[2]}`, row);
  }
  for (const [model, bucket] of perModel) {
    map.set(`${branch}\u0000${sessionId}\u0000${model}`, [
      branch,
      sessionId,
      model,
      String(bucket.input),
      String(bucket.output),
      String(bucket.cache_read),
      String(bucket.cache_write),
      bucket.costUsd.toFixed(4),
    ]);
  }
  const rows = [...map.values()].sort((a, b) => compareRows(a, b, 3));
  writeCsvAtomic(filePath, TOKENS_HEADER, rows);
}

// --- Main --------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);

  const repoRoot = resolveRepoRoot();
  if (!repoRoot) {
    warn('Kein Git-Repository gefunden - uebersprungen.');
    return;
  }

  const branch = currentBranch(repoRoot);
  if (!branch) {
    // Detached HEAD oder kein Branch: sauber beenden, nichts schreiben.
    return;
  }

  const session = await resolveSession(argv);
  if (!session || !session.sessionId || !session.transcriptPath) {
    warn('Keine Session ermittelbar - uebersprungen.');
    return;
  }

  const pricing = loadPricing(repoRoot);
  const state = {
    seen: new Set(),
    perModel: new Map(),
    pricing: pricing.models,
    pricingMeta: pricing.meta,
    warnedModels: new Set(),
  };

  await collectUsage(session.transcriptPath, state);
  for (const subagentFile of listJsonlFiles(subagentDir(session.transcriptPath))) {
    await collectUsage(subagentFile, state);
  }

  // Je Modell zuerst auf vier Nachkommastellen runden - die Session-Summe
  // entsteht aus diesen gerundeten Werten, damit costs.csv exakt der Summe
  // der tokens.csv-Zeilen derselben Session entspricht.
  for (const bucket of state.perModel.values()) {
    bucket.costUsd = Number(bucket.costUsd.toFixed(4));
  }
  const totalCost = [...state.perModel.values()].reduce((sum, bucket) => sum + bucket.costUsd, 0);

  upsertCosts(repoRoot, branch, session.sessionId, totalCost, isoNowUtc());
  upsertTokens(repoRoot, branch, session.sessionId, state.perModel);
}

main()
  .catch((err) => {
    warn(`Unerwarteter Fehler - Lauf uebersprungen (${err && err.message}).`);
  })
  .finally(() => {
    process.exit(0);
  });
