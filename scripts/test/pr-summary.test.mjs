// Tests fuer scripts/pr-summary.js. Nur die reinen Teile - main() braucht Git,
// die GitHub-API und das Modell und laeuft darum nicht mit. Das Skript ruft
// main() nur bei direktem Start auf (require.main), der Import hier ist still.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import prSummary from '../pr-summary.js';
import gh from '../lib/github.js';

const { summaryBlock, SYSTEM_PROMPT, MAX_TOKENS, MARKER } = prSummary;
const { mergeIntoBody } = gh;

const TEMPLATE = '.github/pull_request_template.md';
const WORKFLOW = '.github/workflows/haiku-pr-summary.yml';

test('der Stand-Block traegt die Ueberschrift und den Text', () => {
  const block = summaryBlock('- `a.js`: Schleife entfernt');
  assert.match(block, /^\*\*Stand/);
  assert.match(block, /- `a\.js`: Schleife entfernt$/);
});

test('ein zweiter Lauf ersetzt den Block, statt ihn zu doppeln', () => {
  const body = '**Why:**\n- Grund';
  const einmal = mergeIntoBody(body, summaryBlock('- alt'), MARKER);
  const zweimal = mergeIntoBody(einmal, summaryBlock('- neu'), MARKER);

  assert.strictEqual(zweimal.match(/Stand \(automatisch/g).length, 1);
  assert.ok(zweimal.includes('- neu'));
  assert.ok(!zweimal.includes('- alt'));
  assert.ok(zweimal.startsWith('**Why:**'), 'die Beschreibung wurde angetastet');
});

test('der Prompt ist reines ASCII - das Repo schreibt Deutsch ohne Umlaute', () => {
  // eslint-disable-next-line no-control-regex
  const nichtAscii = SYSTEM_PROMPT.match(/[^\x00-\x7F]/g);
  assert.strictEqual(nichtAscii, null, `Nicht-ASCII im Prompt: ${nichtAscii}`);
});

test('der Prompt verlangt Stichpunkte und verbietet das Wiederholen', () => {
  assert.match(SYSTEM_PROMPT, /Stichpunkte/);
  assert.match(SYSTEM_PROMPT, /wiederhole sie nicht/i);
  assert.ok(MAX_TOKENS <= 250, 'Token-Bremse zu locker fuer einen Stand-Block');
});

test('die Action laeuft nur bei Aenderungen am PR, nicht beim Oeffnen', () => {
  const yml = readFileSync(WORKFLOW, 'utf8');
  const types = yml.match(/types:\s*\[([^\]]*)\]/);
  assert.ok(types, 'kein types-Eintrag im Workflow');

  const liste = types[1].split(',').map((t) => t.trim());
  assert.deepStrictEqual(liste, ['synchronize']);
});

test('die Vorlage liefert die Beschreibung, die der Block nicht doppeln soll', () => {
  // Faellt die Vorlage weg oder verliert sie ihre Abschnitte, ist die
  // Begruendung fuer den synchronize-Trigger hinfaellig - dann hier stolpern
  // statt stillschweigend halbe Beschreibungen zu erzeugen.
  const vorlage = readFileSync(TEMPLATE, 'utf8');
  assert.match(vorlage, /\*\*Why:\*\*/);
  assert.match(vorlage, /\*\*What:\*\*/);
});
