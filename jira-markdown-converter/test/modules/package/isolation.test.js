/**
 * Erzwingt die Modultrennung aus test/run.js: liest alle Dateien unter
 * test/modules/, wertet jeden require()-Pfad aus und laesst nur zu: eigener
 * Modulordner, test/lib/, test/fixtures/, Projektquellen (src/, options/,
 * popup/), Node-Builtins und playwright. Zusaetzlich muss jedes Modul ein
 * test:<modul>-Skript in package.json haben und umgekehrt.
 * Aufruf: npm run test:package --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var nodeModule = require('module');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;

var ROOT = path.join(__dirname, '..', '..', '..');
var TEST_DIR = path.join(__dirname, '..', '..');
var MODULES_DIR = path.join(TEST_DIR, 'modules');
var LIB_DIR = path.join(TEST_DIR, 'lib');
var FIXTURES_DIR = path.join(TEST_DIR, 'fixtures');
var SOURCE_DIRS = ['src', 'options', 'popup'].map(function (name) {
  return path.join(ROOT, name);
});

// Skript-Suffixe, die den Laufmodus waehlen statt ein Modul zu benennen -
// test:node/test:browser/test:all/test:module aus dem package.json-Vorbild.
var META_SCRIPT_SUFFIXES = ['node', 'browser', 'all', 'module'];

function listModules() {
  return fs.readdirSync(MODULES_DIR).filter(function (name) {
    return fs.statSync(path.join(MODULES_DIR, name)).isDirectory();
  }).sort();
}

function listJsFiles(dir) {
  var result = [];
  fs.readdirSync(dir).forEach(function (name) {
    var full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      result = result.concat(listJsFiles(full));
    } else if (/\.js$/.test(name)) {
      result.push(full);
    }
  });
  return result;
}

/**
 * Extrahiert den Argument-Text jedes require(...)-Aufrufs ueber Klammer-Tiefe
 * statt eines einzelnen Regex - require(path.join(...)) verschachtelt selbst
 * runde Klammern, ein einfacher /require\(([^)]*)\)/ wuerde dort zu frueh
 * abschneiden.
 */
/**
 * Entfernt Block- und Zeilenkommentare, damit ein Wort wie "require()" in
 * einem Kommentar (z. B. dieser Datei) nicht als echter Aufruf zaehlt. Fuer
 * dieses ES5/CommonJS-Projekt genuegt eine einfache Regex - Stringliterale
 * mit "//" oder "/*" kommen in den Testdateien nicht vor.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function findRequireArgs(source) {
  var args = [];
  var callRegex = /require\s*\(/g;
  var match;
  source = stripComments(source);
  while ((match = callRegex.exec(source)) !== null) {
    var start = match.index + match[0].length;
    var depth = 1;
    var i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    args.push(source.slice(start, i - 1));
  }
  return args;
}

function stringLiteral(text) {
  var match = /^['"]([^'"]*)['"]$/.exec(text.trim());
  return match ? match[1] : null;
}

/**
 * Loest ein require()-Argument in eine pruefbare Form auf: eine Modul-
 * Kennung (String-Literal) oder einen absoluten Pfad (String-Literal oder
 * path.join(__dirname, ...) - die einzigen zwei Formen im Projekt, siehe
 * .github/TESTS.md). Alles andere gilt als nicht auswertbar und faellt
 * durch die Pruefung, statt uebersehen zu werden.
 */
function resolveRequireArg(raw, fileDir) {
  var trimmed = raw.trim();

  var literal = stringLiteral(trimmed);
  if (literal !== null) {
    return { kind: 'specifier', value: literal };
  }

  var joinMatch = /^path\.join\(([\s\S]*)\)$/.exec(trimmed);
  if (joinMatch) {
    var parts = joinMatch[1].split(',').map(function (part) { return part.trim(); });
    var resolvedParts = [];
    for (var p = 0; p < parts.length; p++) {
      if (parts[p] === '__dirname') {
        resolvedParts.push(fileDir);
        continue;
      }
      var partLiteral = stringLiteral(parts[p]);
      if (partLiteral === null) return { kind: 'unknown', value: trimmed };
      resolvedParts.push(partLiteral);
    }
    return { kind: 'path', value: path.join.apply(path, resolvedParts) };
  }

  return { kind: 'unknown', value: trimmed };
}

function isBuiltinModule(specifier) {
  if (typeof nodeModule.isBuiltin === 'function') return nodeModule.isBuiltin(specifier);
  var name = specifier.replace(/^node:/, '');
  return nodeModule.builtinModules.indexOf(name) !== -1 || nodeModule.builtinModules.indexOf(specifier) !== -1;
}

/** true, wenn target in dir liegt (oder dir selbst ist). */
function isInside(target, dir) {
  var relative = path.relative(dir, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isAllowedPath(resolvedPath, moduleName) {
  var normalized = path.normalize(resolvedPath);
  if (isInside(normalized, path.join(MODULES_DIR, moduleName))) return true;
  if (isInside(normalized, LIB_DIR)) return true;
  if (isInside(normalized, FIXTURES_DIR)) return true;
  return SOURCE_DIRS.some(function (dir) { return isInside(normalized, dir); });
}

function isAllowedRequire(target, fileDir, moduleName) {
  if (target.kind === 'specifier') {
    if (target.value === 'playwright') return true;
    if (isBuiltinModule(target.value)) return true;
    if (target.value.charAt(0) === '.') {
      return isAllowedPath(path.resolve(fileDir, target.value), moduleName);
    }
    return false;
  }
  if (target.kind === 'path') {
    return isAllowedPath(target.value, moduleName);
  }
  return false;
}

describe('Isolation der Testmodule', function () {
  var moduleNames = listModules();
  // Die eigene Datei enthaelt den Text "require(" in Regex-Quelltext -
  // eine reine Textsuche wuerde sich sonst selbst melden.
  var OWN_FILE = path.join(MODULES_DIR, 'package', 'isolation.test.js');
  var files = listJsFiles(MODULES_DIR).filter(function (file) { return file !== OWN_FILE; });

  test('require() bleibt im eigenen Modulordner, in test/lib, test/fixtures, den Projektquellen oder ist Node-Builtin/playwright', function () {
    var violations = [];
    files.forEach(function (file) {
      var moduleName = path.relative(MODULES_DIR, file).split(path.sep)[0];
      var fileDir = path.dirname(file);
      var source = fs.readFileSync(file, 'utf8');
      findRequireArgs(source).forEach(function (raw) {
        var target = resolveRequireArg(raw, fileDir);
        if (!isAllowedRequire(target, fileDir, moduleName)) {
          violations.push(path.relative(ROOT, file) + ': require(' + raw.trim() + ')');
        }
      });
    });
    assert.deepStrictEqual(violations, [],
      'unerlaubte require()-Pfade (fremder Modulordner oder unbekannte Form):\n' + violations.join('\n'));
  });

  test('jedes Modul hat ein test:<modul>-Skript und umgekehrt', function () {
    var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    var scripts = pkg.scripts || {};

    var missing = moduleNames.filter(function (name) {
      return !Object.prototype.hasOwnProperty.call(scripts, 'test:' + name);
    });
    assert.deepStrictEqual(missing, [],
      'Modul ohne test:<modul>-Skript in package.json: ' + missing.join(', '));

    var orphaned = Object.keys(scripts).filter(function (name) {
      var match = /^test:(.+)$/.exec(name);
      if (!match) return false;
      var suffix = match[1];
      if (META_SCRIPT_SUFFIXES.indexOf(suffix) !== -1) return false;
      return moduleNames.indexOf(suffix) === -1;
    });
    assert.deepStrictEqual(orphaned, [],
      'test:<modul>-Skript ohne zugehoerigen Ordner unter test/modules/: ' + orphaned.join(', '));
  });
});
