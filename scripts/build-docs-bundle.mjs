#!/usr/bin/env node
/**
 * Erzeugt das Diagramm-Buendel einer Erweiterung: aus jeder Spezifikation
 * unter <projekt>/docs/architecture/ wird eine eigenstaendige HTML-Datei,
 * dazu eine index.html als Einstieg.
 *
 * Gedacht fuer release.yml - der Kunde soll die Diagramme herunterladen
 * koennen, statt sie selbst erzeugen zu muessen. Im Repo liegt weiterhin
 * nur die JSON; das HTML ist reines Ergebnis (rund 800 KB je Datei).
 *
 * Teilnahme ist eine Entscheidung des Projekts, wie bei stableZipAlias:
 * ohne "docsBundle" in der package.json entsteht nichts. Als Objekt nimmt
 * das Feld zusaetzlich "exclude" - Dateinamen, die draussen bleiben.
 *
 *   node scripts/build-docs-bundle.mjs <projekt> <zielordner>
 *
 * Ohne Teilnahme endet der Lauf mit Code 0 und leerem Zielordner, damit der
 * Workflow ihn bedingungslos aufrufen kann.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Nur architecture prueft Quellverweise und nimmt darum --repo-root. */
const REPO_ROOT_TYPES = new Set(['architecture']);

const TYPES = new Set(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle']);

function fail(message) {
  console.error(`Fehler: ${message}`);
  process.exit(1);
}

/** "markdown-umwandlung.dataflow.json" -> "dataflow" */
function typeOf(file) {
  const type = path.basename(file, '.json').split('.').pop();
  return TYPES.has(type) ? type : null;
}

/** package.json.docsBundle auswerten: true oder { exclude: [...] }. */
function bundleConfig(projectDir) {
  const pkgFile = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgFile)) return null;
  const { docsBundle } = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (!docsBundle) return null;
  const exclude = Array.isArray(docsBundle.exclude) ? docsBundle.exclude : [];
  return { exclude: new Set(exclude) };
}

function specs(projectDir, config) {
  const dir = path.join(projectDir, 'docs', 'architecture');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !config.exclude.has(f) && typeOf(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Ueberschrift der Spezifikation, Rueckfall auf den Dateinamen. */
function titleOf(spec) {
  try {
    const { meta } = JSON.parse(fs.readFileSync(spec, 'utf8'));
    if (meta && typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim();
  } catch {
    /* Titel ist Beiwerk - deliver haette eine kaputte JSON laengst gemeldet. */
  }
  return path.basename(spec, '.json');
}

function deliver(spec, target) {
  const type = typeOf(spec);
  const args = [
    process.env.ARCHIFY_BIN || path.join(REPO_ROOT, '.claude', 'skills', 'archify', 'bin', 'archify.mjs'),
    'deliver',
    type,
    spec,
    target,
    '--quality',
    'showcase',
    '--json',
  ];
  if (REPO_ROOT_TYPES.has(type)) args.push('--repo-root', REPO_ROOT);

  const run = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    // Ohne den Schalter ruft der Skill unaufgefordert einen Fremdhost an.
    env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' },
  });
  if (run.status !== 0) {
    fail(`deliver ${type} ${path.basename(spec)} fehlgeschlagen:\n${run.stderr || run.stdout}`);
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function writeIndex(outDir, project, version, entries) {
  const rows = entries
    .map((e) => `    <li><a href="${escapeHtml(e.file)}">${escapeHtml(e.title)}</a></li>`)
    .join('\n');
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(project)} ${escapeHtml(version)} - Architekturdiagramme</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; padding: 2rem 1rem; max-width: 42rem;
         font: 16px/1.6 system-ui, sans-serif; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  p { color: #666; }
  ul { padding-left: 1.2rem; }
  li { margin: .4rem 0; }
</style>
</head>
<body>
  <h1>${escapeHtml(project)} ${escapeHtml(version)}</h1>
  <p>Architekturdiagramme zu dieser Version. Jede Datei ist eigenstaendig und
     laeuft ohne Internetzugang.</p>
  <ul>
${rows}
  </ul>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

function main() {
  const [project, outDir] = process.argv.slice(2);
  if (!project || !outDir) fail('Aufruf: build-docs-bundle.mjs <projekt> <zielordner>');

  const projectDir = path.resolve(REPO_ROOT, project);
  if (!fs.existsSync(projectDir)) fail(`Projektordner fehlt: ${project}`);

  fs.mkdirSync(outDir, { recursive: true });

  const config = bundleConfig(projectDir);
  if (!config) {
    console.log(`${project}: kein docsBundle in der package.json - kein Buendel.`);
    return;
  }

  const found = specs(projectDir, config);
  if (!found.length) fail(`${project}: docsBundle gesetzt, aber keine Spezifikation gefunden.`);

  const version = JSON.parse(
    fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
  ).version;

  const entries = [];
  for (const spec of found) {
    const file = `${path.basename(spec, '.json')}.html`;
    deliver(spec, path.join(outDir, file));
    entries.push({ file, title: titleOf(spec) });
    console.log(`${project}: ${path.basename(spec)} -> ${file}`);
  }

  writeIndex(outDir, project, version, entries);
  console.log(`${project}: ${entries.length} Diagramme und index.html in ${outDir}.`);
}

main();
