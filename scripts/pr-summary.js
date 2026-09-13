#!/usr/bin/env node
/**
 * Haelt den Stand-Abschnitt im PR-Body aktuell: liest den PR-Diff, laesst das
 * Modell daraus eine knappe Stichpunktliste bauen und ersetzt damit den Block
 * zwischen den Markern. Laeuft ohne Dependencies auf Node >= 18 (global fetch).
 *
 * Nur bei Aenderungen am PR (pull_request: synchronize). Beim Oeffnen traegt
 * .github/pull_request_template.md die Beschreibung - dort waere jeder Lauf
 * derselbe Text ein zweites Mal.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { askClaude, isModelUnavailable } = require('./lib/anthropic');
const { get, mergeIntoBody, patchBody } = require('./lib/github');

// Token-Bremsen: kleiner Diff rein, kurze Antwort raus. Die Liste ersetzt
// keine Beschreibung, sie haelt sie aktuell - darum knapper als frueher.
const MAX_DIFF_CHARS = 40000;
const MAX_TOKENS = 250;

const MARKER = 'haiku-summary';

// Rauschen, das nichts erklaert, aber Tokens frisst.
const EXCLUDES = [
  ':(exclude)**/package-lock.json',
  ':(exclude)**/yarn.lock',
  ':(exclude)**/pnpm-lock.yaml',
  ':(exclude)**/*.min.js',
  ':(exclude)**/*.map',
  ':(exclude)**/*.svg',
  ':(exclude)**/*.png',
  ':(exclude)**/*.jpg',
  ':(exclude)**/*.zip',
  ':(exclude)**/dist/**',
];

// Der Block erfasst den Stand des PR, er wiederholt die Beschreibung nicht.
// Stil und Kuerze folgen .github/pull_request_template.md: Stichpunkte, keine
// Saetze. ASCII, weil das Repo Deutsch ohne Umlaute schreibt - die Regel gilt
// auch fuer erzeugten Text.
const SYSTEM_PROMPT = [
  'Du fuehrst den Stand-Abschnitt einer PR-Beschreibung nach, aus einem Git-Diff.',
  'Die Beschreibung selbst steht schon im PR - wiederhole sie nicht und bewerte sie nicht.',
  'Antworte nur mit einer Markdown-Liste, kein Vorwort, keine Ueberschrift, keine Codebloecke.',
  'Hoechstens 5 Stichpunkte, je hoechstens 8 Woerter, Form "- `datei`: Aenderung".',
  'Nur was der Diff belegt. Keine Vermutungen, kein Lob, keine Review-Hinweise.',
  'Schreibe Deutsch in reinem ASCII: ue, ae, oe statt Umlauten, ss statt Eszett.',
].join(' ');

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function collectDiff(baseSha, headSha) {
  const range = `${baseSha}...${headSha}`;
  const stat = git(['diff', '--stat', range, '--', '.', ...EXCLUDES]).trim();
  let diff = git(['diff', '--unified=1', '--no-color', range, '--', '.', ...EXCLUDES]);

  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS);
    truncated = true;
  }
  return { stat, diff, truncated };
}

async function generateSummary({ title, stat, diff, truncated }) {
  const userContent = [
    `PR-Titel: ${title}`,
    '',
    'Diffstat:',
    stat || '(leer)',
    '',
    truncated ? 'Diff (gekuerzt):' : 'Diff:',
    diff || '(leer)',
  ].join('\n');

  return askClaude({
    system: SYSTEM_PROMPT,
    user: userContent,
    maxTokens: MAX_TOKENS,
  });
}

function summaryBlock(summary) {
  return `**Stand (automatisch nachgefuehrt):**\n\n${summary}`;
}

async function main() {
  const repo = env('GITHUB_REPOSITORY');
  const prNumber = env('PR_NUMBER');
  const title = process.env.PR_TITLE || '';

  const { stat, diff, truncated } = collectDiff(env('BASE_SHA'), env('HEAD_SHA'));
  if (!diff.trim()) {
    console.log('Kein relevanter Diff - uebersprungen.');
    return;
  }

  const summary = await generateSummary({ title, stat, diff, truncated });

  env('GITHUB_TOKEN');
  const pr = await get(repo, prNumber, 'pulls');
  const nextBody = mergeIntoBody(pr.body, summaryBlock(summary), MARKER);
  if (nextBody === (pr.body || '')) {
    console.log('PR-Body unveraendert.');
    return;
  }

  await patchBody(repo, prNumber, nextBody, 'pulls');
  console.log(`PR #${prNumber} aktualisiert.`);
}

module.exports = { summaryBlock, SYSTEM_PROMPT, MAX_DIFF_CHARS, MAX_TOKENS, MARKER };

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err) => {
    // Ein fehlender Stand-Block ist Beiwerk. Steht das Modell nicht zur
    // Verfuegung - kein Schluessel, kein Guthaben, Ratsperre, Stoerung -, ist
    // das nichts, was dieser PR loesen kann: warnen und den Lauf gruen lassen,
    // statt ein rotes X an jeden PR zu haengen. Fehler im eigenen Code
    // scheitern weiter hart.
    if (isModelUnavailable(err)) {
      console.log(`::warning title=PR-Stand nicht nachgefuehrt::${err.message}`);
      return;
    }
    console.error(err.message);
    process.exit(1);
  });
}
