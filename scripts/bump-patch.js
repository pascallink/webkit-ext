#!/usr/bin/env node
/**
 * Hebt nach einem Merge auf main die Patch-Stelle (z in x.y.z) jeder
 * Erweiterung an, deren Dateien sich in diesem Push geaendert haben.
 *
 * Uebersprungen wird, wo die Version im selben Push bereits von Hand
 * geaendert wurde - sonst wuerde ein bewusster Minor-Bump auf 1.3.0
 * sofort zu 1.3.1 weitergedreht.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ZERO_SHA = '0000000000000000000000000000000000000000';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function isExtension(dir) {
  return fs.existsSync(path.join(dir, 'manifest.json'));
}

/** Top-Level-Ordner, die in before..after beruehrt wurden und Erweiterungen sind. */
function changedExtensions(before, after) {
  const range = before && before !== ZERO_SHA ? `${before}..${after}` : `${after}~1..${after}`;
  const files = git(['diff', '--name-only', range]).split('\n').filter(Boolean);
  const dirs = new Set(
    files.map((f) => f.split('/')[0]).filter((d) => d && !d.startsWith('.')),
  );
  return [...dirs].filter(isExtension).sort();
}

/** Wurde die manifest-Version in diesem Push schon angefasst? */
function versionTouched(dir, before, after) {
  if (!before || before === ZERO_SHA) return false;
  const file = `${dir}/manifest.json`;
  const read = (ref) => {
    try {
      return JSON.parse(git(['show', `${ref}:${file}`])).version;
    } catch {
      return null;
    }
  };
  const from = read(before);
  const to = read(after);
  return from !== null && to !== null && from !== to;
}

function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`Version nicht im Format x.y.z: ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function writeJsonVersion(file, next) {
  const raw = fs.readFileSync(file, 'utf8');
  // Nur das erste "version"-Feld ersetzen, Formatierung bleibt unangetastet.
  const patched = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
  if (patched === raw) throw new Error(`Kein version-Feld ersetzt in ${file}`);
  fs.writeFileSync(file, patched);
}

/**
 * package-lock.json fuehrt die Version doppelt: top-level und unter
 * packages[""]. Beide muessen mit, sonst meckert npm ci beim naechsten Lauf.
 */
function writeLockVersion(file, next) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.version = next;
  if (data.packages && data.packages['']) data.packages[''].version = next;
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const before = process.env.BEFORE_SHA || '';
  const after = process.env.AFTER_SHA || 'HEAD';

  const bumped = [];
  for (const dir of changedExtensions(before, after)) {
    if (versionTouched(dir, before, after)) {
      console.log(`${dir}: Version wurde im Push bereits geaendert - kein Bump.`);
      continue;
    }

    const manifest = path.join(dir, 'manifest.json');
    const current = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    const next = bumpPatch(current);

    writeJsonVersion(manifest, next);
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) writeJsonVersion(pkg, next);
    const lock = path.join(dir, 'package-lock.json');
    if (fs.existsSync(lock)) writeLockVersion(lock, next);

    console.log(`${dir}: ${current} -> ${next}`);
    bumped.push(`${dir}@${next}`);
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `bumped=${bumped.join(' ')}\n`);
  }
  if (!bumped.length) console.log('Keine Erweiterung betroffen - nichts zu tun.');
}

main();
