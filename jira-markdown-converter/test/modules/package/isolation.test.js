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
 * Klassifiziert jedes Zeichen des Quelltexts als 'code', 'string' oder
 * 'comment' (Zustaende: Code, ', ", `, Zeilenkommentar, Blockkommentar;
 * Escapes mit \ werden dabei mit uebersprungen). Damit haelt der Scanner
 * "//" bzw. Anfuehrungszeichen innerhalb eines Stringliterals auseinander
 * von echten Kommentaren bzw. Zustandswechseln im Code.
 */
function scanStates(source) {
  var states = new Array(source.length);
  var mode = 'code';
  var quoteChar = '';
  var i = 0;
  while (i < source.length) {
    var ch = source[i];
    var next = source[i + 1];
    if (mode === 'code') {
      if (ch === '\'' || ch === '"' || ch === '`') {
        mode = 'string';
        quoteChar = ch;
        states[i] = 'string';
        i++;
      } else if (ch === '/' && next === '/') {
        mode = 'linecomment';
        states[i] = 'comment';
        states[i + 1] = 'comment';
        i += 2;
      } else if (ch === '/' && next === '*') {
        mode = 'blockcomment';
        states[i] = 'comment';
        states[i + 1] = 'comment';
        i += 2;
      } else {
        states[i] = 'code';
        i++;
      }
    } else if (mode === 'string') {
      if (ch === '\\') {
        states[i] = 'string';
        if (i + 1 < source.length) states[i + 1] = 'string';
        i += 2;
      } else if (ch === quoteChar) {
        states[i] = 'string';
        mode = 'code';
        i++;
      } else {
        states[i] = 'string';
        i++;
      }
    } else if (mode === 'linecomment') {
      if (ch === '\n') {
        mode = 'code';
        states[i] = 'code';
      } else {
        states[i] = 'comment';
      }
      i++;
    } else {
      if (ch === '*' && next === '/') {
        states[i] = 'comment';
        states[i + 1] = 'comment';
        mode = 'code';
        i += 2;
      } else {
        states[i] = 'comment';
        i++;
      }
    }
  }
  return states;
}

/**
 * Blendet Block- und Zeilenkommentare aus, damit ein Wort wie "require()" in
 * einem Kommentar (z. B. dieser Datei) nicht als echter Aufruf zaehlt.
 * Stringinhalte bleiben unveraendert - ein "//" in einer URL innerhalb eines
 * Stringliterals (siehe z. B. converter.test.js, html.test.js,
 * robustheit.test.js, description.test.js) ist kein Kommentaranfang. Eine
 * einfache Regex ohne Zustands-Scan koennte diese Unterscheidung nicht
 * treffen und hat den Zeilenrest hinter so einem "//" faelschlich entfernt.
 */
function stripComments(source) {
  var states = scanStates(source);
  var result = '';
  for (var i = 0; i < source.length; i++) {
    result += states[i] === 'comment' ? ' ' : source[i];
  }
  return result;
}

/**
 * Extrahiert den Argument-Text jedes echten require(...)-Aufrufs ueber
 * Klammer-Tiefe statt eines einzelnen Regex - require(path.join(...))
 * verschachtelt selbst runde Klammern, ein einfacher /require\(([^)]*)\)/
 * wuerde dort zu frueh abschneiden. Ein "require(" innerhalb eines
 * Stringliterals (z. B. ein Fixture-String) ist kein Aufruf, und Klammern
 * innerhalb eines Stringliterals zaehlen nicht in die Tiefe hinein.
 */
function findRequireArgs(source) {
  var args = [];
  var stripped = stripComments(source);
  var states = scanStates(stripped);
  var callRegex = /require\s*\(/g;
  var match;
  while ((match = callRegex.exec(stripped)) !== null) {
    if (states[match.index] === 'string') continue;
    var start = match.index + match[0].length;
    var depth = 1;
    var i = start;
    while (i < stripped.length && depth > 0) {
      if (states[i] !== 'string') {
        if (stripped[i] === '(') depth++;
        else if (stripped[i] === ')') depth--;
      }
      i++;
    }
    args.push(stripped.slice(start, i - 1));
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
  // Diese Datei enthaelt "require(" auch als Regex-Literal (/require\s*\(/g).
  // Ein eigener Scanner-Zustand nur fuer Regex-Literale lohnt sich fuer eine
  // einzelne Testdatei nicht - sie bleibt darum wie bisher per OWN_FILE
  // ausgenommen, statt vom Zustands-Scan selbst erkannt zu werden.
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

  test('findRequireArgs beruecksichtigt Stringliterale', function () {
    var urlVorRequire = "var u = 'https://x.de';\n" +
      "var b = require('../../content/browser/panel.test.js');\n";
    assert.deepStrictEqual(findRequireArgs(urlVorRequire), [
      "'../../content/browser/panel.test.js'"
    ]);

    var requireInString = "var s = \"require('../../content/x.js')\";\n";
    assert.deepStrictEqual(findRequireArgs(requireInString), []);
  });
});
