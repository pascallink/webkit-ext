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
 *
 * Der Scanner kennt keinen eigenen Regex-Zustand: ein Anfuehrungszeichen in
 * einem Regex-Literal (z. B. /["']/ oder /don't/) oeffnet faelschlich einen
 * String-Zustand, der erst am naechsten Anfuehrungszeichen im Quelltext
 * wieder schliesst - alles dazwischen wird falsch klassifiziert. Das ist
 * erkennbar: sauberer Quelltext endet immer im Zustand 'code'. `balanced`
 * ist genau diese Pruefung, damit ein Aufrufer so einen Desync statt eines
 * stillen Fehlers melden kann.
 *
 * Bekannte, bewusst offene Grenze: `balanced` prueft nur Paritaet - ein
 * Anfuehrungszeichen im Regex-Literal, das sich zufaellig selbst neutralisiert
 * (gerade Anzahl des stoerenden Zeichens), wuerden als Desync unentdeckt bleiben.
 * Die Konvention aus .github/TESTS.md (keine rohen Anfuehrungszeichen in
 * Regex-Literalen unter test/modules/) ist darum die eigentliche Absicherung,
 * nicht balanced.
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
  return { states: states, balanced: mode === 'code' };
}

/**
 * Blendet Block- und Zeilenkommentare aus, damit ein Wort wie "require()" in
 * einem Kommentar (z. B. dieser Datei) nicht als echter Aufruf zaehlt.
 * Stringinhalte bleiben unveraendert - ein "//" in einer URL innerhalb eines
 * Stringliterals (siehe z. B. converter.test.js, html.test.js,
 * robustheit.test.js, description.test.js) ist kein Kommentaranfang. Eine
 * einfache Regex ohne Zustands-Scan koennte diese Unterscheidung nicht
 * treffen und hat den Zeilenrest hinter so einem "//" faelschlich entfernt.
 * Gibt zusaetzlich das balanced-Flag aus scanStates() durch, damit ein
 * Regex-Desync (siehe dort) beim Aufrufer ankommt statt verloren zu gehen.
 */
function stripComments(source) {
  var scan = scanStates(source);
  var result = '';
  for (var i = 0; i < source.length; i++) {
    result += scan.states[i] === 'comment' ? ' ' : source[i];
  }
  return { source: result, balanced: scan.balanced };
}

/**
 * Extrahiert den Argument-Text jedes echten require(...)-Aufrufs ueber
 * Klammer-Tiefe statt eines einzelnen Regex - require(path.join(...))
 * verschachtelt selbst runde Klammern, ein einfacher /require\(([^)]*)\)/
 * wuerde dort zu frueh abschneiden. Ein "require(" innerhalb eines
 * Stringliterals (z. B. ein Fixture-String) ist kein Aufruf, und Klammern
 * innerhalb eines Stringliterals zaehlen nicht in die Tiefe hinein.
 * Liefert { args, balanced } statt nur der Argumente - bei balanced: false
 * ist die Datei wegen eines Zustands-Desyncs (siehe scanStates()) nicht
 * zuverlaessig auswertbar und args darf nicht als vollstaendig gelten.
 */
function findRequireArgs(source) {
  var args = [];
  var stripped = stripComments(source);
  var states = scanStates(stripped.source).states;
  var callRegex = /require\s*\(/g;
  var match;
  while ((match = callRegex.exec(stripped.source)) !== null) {
    if (states[match.index] === 'string') continue;
    var start = match.index + match[0].length;
    var depth = 1;
    var i = start;
    while (i < stripped.source.length && depth > 0) {
      if (states[i] !== 'string') {
        if (stripped.source[i] === '(') depth++;
        else if (stripped.source[i] === ')') depth--;
      }
      i++;
    }
    args.push(stripped.source.slice(start, i - 1));
  }
  return { args: args, balanced: stripped.balanced };
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
  // Regex-Literale sind kein eigener Zustand in scanStates() - das betrifft
  // nicht nur diese Datei, sondern jede Datei unter test/modules/. Diese
  // Datei enthaelt "require(" zusaetzlich noch als Regex-Literal selbst
  // (/require\s*\(/g); ein eigener Scanner-Zustand nur dafuer lohnt sich
  // nicht, darum bleibt sie hier per OWN_FILE ausgenommen. Fuer alle anderen
  // Dateien faengt die balanced-Pruefung aus scanStates() den allgemeinen
  // Fall ab (ein Anfuehrungszeichen in einem Regex-Literal): sie werden
  // dann als "nicht auswertbar" gemeldet statt still durchzurutschen.
  // Bekannte, bewusst offene Grenze: require() innerhalb einer Template-
  // Interpolation (${require("x")}) wird nicht erkannt - die ES5-Regel der
  // Projekt-CLAUDE.md schliesst Template-Literale ohnehin aus, ein
  // Zustand fuer ${} lohnt sich fuer dieses Projekt nicht.
  var OWN_FILE = path.join(MODULES_DIR, 'package', 'isolation.test.js');
  var files = listJsFiles(MODULES_DIR).filter(function (file) { return file !== OWN_FILE; });

  test('require() bleibt im eigenen Modulordner, in test/lib, test/fixtures, den Projektquellen oder ist Node-Builtin/playwright', function () {
    var violations = [];
    files.forEach(function (file) {
      var moduleName = path.relative(MODULES_DIR, file).split(path.sep)[0];
      var fileDir = path.dirname(file);
      var source = fs.readFileSync(file, 'utf8');
      var found = findRequireArgs(source);
      if (!found.balanced) {
        violations.push(path.relative(ROOT, file) +
          ': nicht auswertbar (unbalancierter String-/Kommentarzustand, evtl. Regex-Literal mit Anfuehrungszeichen)');
        return;
      }
      found.args.forEach(function (raw) {
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

  test('findRequireArgs beruecksichtigt Stringliterale und meldet Zustands-Desyncs', function () {
    var urlVorRequire = "var u = 'https://x.de';\n" +
      "var b = require('../../content/browser/panel.test.js');\n";
    assert.deepStrictEqual(findRequireArgs(urlVorRequire), {
      args: ["'../../content/browser/panel.test.js'"],
      balanced: true
    });

    var requireInString = "var s = \"require('../../content/x.js')\";\n";
    assert.deepStrictEqual(findRequireArgs(requireInString), { args: [], balanced: true });

    // Escape direkt vor dem Stringende: 'C:\\' ist ein Backslash gefolgt vom
    // echten schliessenden Anfuehrungszeichen, keine Escape-Sequenz fuer das
    // Anfuehrungszeichen selbst - der String darf hier nicht offen bleiben.
    var escapeVorStringende = "var s = 'C:\\\\';\nvar a = require('assert');\n";
    assert.deepStrictEqual(findRequireArgs(escapeVorStringende), {
      args: ["'assert'"],
      balanced: true
    });

    // Escaptes Anfuehrungszeichen im String: 'it\'s require(x)' bleibt ein
    // einziges Stringliteral, "require(x)" darin ist kein echter Aufruf.
    var escapetesQuoteImString = "var s = 'it\\'s require(x)';\n";
    assert.deepStrictEqual(findRequireArgs(escapetesQuoteImString), { args: [], balanced: true });

    // Regex-Literal mit Anfuehrungszeichen desynchronisiert den Scanner -
    // muss als nicht auswertbar erkannt werden statt still durchzurutschen.
    var regexDesync = "var re = /[\"']/;\nvar b = require('../../content/browser/panel.test.js');\n";
    assert.strictEqual(findRequireArgs(regexDesync).balanced, false);
  });
});
