// Tests fuer scripts/build-docs-bundle.mjs. Der eigentliche Renderer wird
// ueber ARCHIFY_BIN durch einen Platzhalter ersetzt - geprueft wird die
// Auswahl der Spezifikationen, nicht das Zeichnen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-docs-bundle.mjs');

/** Platzhalter statt archify: legt die Zieldatei an, sonst nichts. */
const STUB_OK = `import fs from 'node:fs';
fs.writeFileSync(process.argv[5], '<html><body>stub</body></html>');
`;

/** Platzhalter, der scheitert - wie eine Spezifikation mit kaputten Quellen. */
const STUB_FAIL = `console.error('deliver abgelehnt');
process.exit(1);
`;

function spec(title) {
  return JSON.stringify({ schema_version: 1, meta: { title } });
}

/**
 * Wegwerf-Projekt: package.json plus Spezifikationen unter
 * docs/architecture/. docsBundle undefiniert lassen heisst "kein Buendel".
 */
function makeProject({ docsBundle, files }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-bundle-'));
  const pkg = { name: 'demo', version: '9.9.9' };
  if (docsBundle !== undefined) pkg.docsBundle = docsBundle;
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));

  const archDir = path.join(dir, 'docs', 'architecture');
  fs.mkdirSync(archDir, { recursive: true });
  for (const [name, title] of Object.entries(files || {})) {
    fs.writeFileSync(path.join(archDir, name), spec(title));
  }
  return dir;
}

function run(projectDir, { stub = STUB_OK } = {}) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-bundle-out-'));
  const stubFile = path.join(outDir, '..', `stub-${path.basename(outDir)}.mjs`);
  fs.writeFileSync(stubFile, stub);

  const result = spawnSync(process.execPath, [SCRIPT, projectDir, outDir], {
    encoding: 'utf8',
    env: { ...process.env, ARCHIFY_BIN: stubFile },
  });
  return { ...result, outDir };
}

test('ohne docsBundle entsteht kein Buendel, der Lauf bleibt gruen', () => {
  const project = makeProject({ files: { 'a.dataflow.json': 'A' } });
  const { status, stdout, outDir } = run(project);

  assert.equal(status, 0);
  assert.match(stdout, /kein docsBundle/);
  assert.deepEqual(fs.readdirSync(outDir), []);
});

test('docsBundle: true nimmt alle Spezifikationen', () => {
  const project = makeProject({
    docsBundle: true,
    files: { 'a.dataflow.json': 'A', 'b.workflow.json': 'B' },
  });
  const { status, outDir } = run(project);

  assert.equal(status, 0);
  assert.deepEqual(
    fs.readdirSync(outDir).sort(),
    ['a.dataflow.html', 'b.workflow.html', 'index.html'],
  );
});

test('exclude haelt einzelne Spezifikationen heraus', () => {
  const project = makeProject({
    docsBundle: { exclude: ['intern.architecture.json'] },
    files: { 'a.dataflow.json': 'A', 'intern.architecture.json': 'Intern' },
  });
  const { status, outDir } = run(project);

  assert.equal(status, 0);
  const produced = fs.readdirSync(outDir);
  assert.ok(produced.includes('a.dataflow.html'));
  assert.ok(!produced.includes('intern.architecture.html'));

  const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.ok(
    !index.includes('intern.architecture.html'),
    'Ausgeschlossenes darf nicht im Index verlinkt sein',
  );
});

test('Dateien ohne bekannten Typ im Namen werden uebergangen', () => {
  const project = makeProject({
    docsBundle: true,
    files: { 'a.dataflow.json': 'A', 'notizen.json': 'Notizen' },
  });
  const { status, outDir } = run(project);

  assert.equal(status, 0);
  assert.ok(!fs.readdirSync(outDir).some((f) => f.startsWith('notizen')));
});

test('index.html verlinkt jeden Titel aus der Spezifikation', () => {
  const project = makeProject({
    docsBundle: true,
    files: { 'a.dataflow.json': 'Datenweg A', 'b.sequence.json': 'Ablauf B' },
  });
  const { outDir } = run(project);
  const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

  assert.ok(index.includes('href="a.dataflow.html">Datenweg A<'));
  assert.ok(index.includes('href="b.sequence.html">Ablauf B<'));
  assert.ok(index.includes('9.9.9'), 'Version des Projekts gehoert in den Index');
});

test('ein gescheitertes deliver bricht den Lauf ab', () => {
  const project = makeProject({ docsBundle: true, files: { 'a.dataflow.json': 'A' } });
  const { status, stderr } = run(project, { stub: STUB_FAIL });

  assert.equal(status, 1);
  assert.match(stderr, /deliver dataflow a\.dataflow\.json fehlgeschlagen/);
});

test('docsBundle ohne jede Spezifikation ist ein Fehler, kein stiller Erfolg', () => {
  const project = makeProject({ docsBundle: true, files: {} });
  const { status, stderr } = run(project);

  assert.equal(status, 1);
  assert.match(stderr, /keine Spezifikation gefunden/);
});
