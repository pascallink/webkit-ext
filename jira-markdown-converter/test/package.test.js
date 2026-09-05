/**
 * Prueft, dass das Erweiterungspaket in sich stimmig ist:
 * Manifest gueltig, alle referenzierten Dateien vorhanden, Icons echte PNGs.
 *
 * Aufruf: node test/package.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + (error && error.message ? error.message : error));
  }
}

function abs(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(abs(relative));
}

var manifest = JSON.parse(fs.readFileSync(abs('manifest.json'), 'utf8'));

console.log('\nManifest');
test('Manifest V3', function () {
  assert.strictEqual(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Version muss x.y.z sein');
});

test('Service-Worker vorhanden', function () {
  assert.ok(exists(manifest.background.service_worker), manifest.background.service_worker + ' fehlt');
});

test('Content-Script-Dateien vorhanden', function () {
  manifest.content_scripts.forEach(function (entry) {
    entry.js.forEach(function (file) {
      assert.ok(exists(file), file + ' fehlt');
    });
    (entry.css || []).forEach(function (file) {
      assert.ok(exists(file), file + ' fehlt');
    });
  });
});

test('Content-Script laedt Abhaengigkeiten in richtiger Reihenfolge', function () {
  var js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf('src/settings.js') < js.indexOf('src/content.js'), 'settings vor content');
  assert.ok(js.indexOf('src/converter.js') < js.indexOf('src/content.js'), 'converter vor content');
  assert.ok(js.indexOf('src/editors.js') < js.indexOf('src/content.js'), 'editors vor content');
  assert.ok(js.indexOf('src/codedialog.js') < js.indexOf('src/content.js'), 'codedialog vor content');
  assert.ok(js.indexOf('src/converter.js') < js.indexOf('src/codedialog.js'), 'converter vor codedialog');
});

test('Popup und Optionsseite vorhanden', function () {
  assert.ok(exists(manifest.action.default_popup), 'Popup fehlt');
  assert.ok(exists(manifest.options_ui.page), 'Optionsseite fehlt');
});

test('Icons vorhanden und echte PNGs', function () {
  var sizes = Object.keys(manifest.icons);
  assert.ok(sizes.length >= 4, 'mindestens vier Groessen');
  sizes.forEach(function (size) {
    var file = manifest.icons[size];
    assert.ok(exists(file), file + ' fehlt');
    var head = fs.readFileSync(abs(file)).subarray(0, 8);
    assert.strictEqual(head.toString('binary'), '\x89PNG\r\n\x1a\n', file + ' ist kein PNG');
  });
});

test('Berechtigungen bleiben sparsam', function () {
  var allowed = ['activeTab', 'storage', 'contextMenus', 'scripting'];
  manifest.permissions.forEach(function (permission) {
    assert.ok(allowed.indexOf(permission) !== -1, 'unerwartete Berechtigung: ' + permission);
  });
  assert.deepStrictEqual(manifest.host_permissions, ['https://*.atlassian.net/*']);
});

test('Tastenkuerzel definiert', function () {
  assert.ok(manifest.commands['convert-selection'], 'Kommando fehlt');
});

console.log('\nDateiverweise in HTML');
['popup/popup.html', 'options/options.html'].forEach(function (page) {
  test(page + ' verweist nur auf vorhandene Dateien', function () {
    var html = fs.readFileSync(abs(page), 'utf8');
    var dir = path.dirname(page);
    var references = [];
    var pattern = /(?:src|href)="([^"#][^"]*)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      references.push(match[1]);
    }
    assert.ok(references.length, 'keine Verweise gefunden');
    references.forEach(function (reference) {
      var resolved = path.normalize(path.join(dir, reference));
      assert.ok(exists(resolved), reference + ' -> ' + resolved + ' fehlt');
    });
  });
});

console.log('\nService-Worker');
test('importScripts verweist auf vorhandene Dateien', function () {
  var source = fs.readFileSync(abs('src/background.js'), 'utf8');
  var match = /importScripts\(([^)]*)\)/.exec(source);
  assert.ok(match, 'kein importScripts gefunden');
  var files = match[1].split(',').map(function (part) {
    return part.trim().replace(/^['"]|['"]$/g, '');
  });
  files.forEach(function (file) {
    assert.ok(exists(path.join('src', file)), 'src/' + file + ' fehlt');
  });
});

test('Content-Dateien im Service-Worker stimmen mit dem Manifest ueberein', function () {
  var source = fs.readFileSync(abs('src/background.js'), 'utf8');
  var match = /var CONTENT_FILES = \[([^\]]*)\]/.exec(source);
  assert.ok(match, 'CONTENT_FILES nicht gefunden');
  var files = match[1].split(',').map(function (part) {
    return part.trim().replace(/^['"]|['"]$/g, '');
  }).filter(Boolean);
  assert.deepStrictEqual(files, manifest.content_scripts[0].js);
});

console.log('\nQuellcode');
test('keine console-Ausgaben im Auslieferungscode', function () {
  ['src/content.js', 'src/editors.js', 'src/converter.js', 'src/codedialog.js', 'src/settings.js', 'src/background.js'].forEach(function (file) {
    var source = fs.readFileSync(abs(file), 'utf8');
    assert.ok(!/console\.(log|debug|info)\(/.test(source), file + ' enthaelt console-Ausgaben');
  });
});

test('kein innerHTML mit Fremddaten', function () {
  var templates = { 'src/content.js': /PANEL_HTML/, 'src/codedialog.js': /DIALOG_HTML/ };
  Object.keys(templates).forEach(function (file) {
    var source = fs.readFileSync(abs(file), 'utf8');
    var matches = source.match(/\.innerHTML\s*=\s*([^;]+);/g) || [];
    matches.forEach(function (line) {
      assert.ok(templates[file].test(line), file + ': innerHTML nur mit fester Vorlage erlaubt: ' + line);
    });
  });
});

test('Schalter ist an allen Oberflaechen vorhanden', function () {
  // Popup, Optionsseite und Panel muessen dieselbe Einstellung anbieten.
  ['popup/popup.html', 'options/options.html'].forEach(function (page) {
    var html = fs.readFileSync(abs(page), 'utf8');
    assert.ok(/id="convertOnPaste"/.test(html), page + ' hat keinen Schalter');
    assert.ok(/switch__track/.test(html), page + ' nutzt nicht die Schalter-Optik');
  });
  var content = fs.readFileSync(abs('src/content.js'), 'utf8');
  assert.ok(/data-option="convertOnPaste"/.test(content), 'Panel hat keinen Schalter');
  assert.ok(/jmd-switch__track/.test(content), 'Panel nutzt nicht die Schalter-Optik');
});

test('Schalter sitzt auch am Erweiterungssymbol', function () {
  var source = fs.readFileSync(abs('src/background.js'), 'utf8');
  assert.ok(/contexts:\s*\[[^\]]*'action'/.test(source),
    'kein Kontextmenue-Eintrag am Symbol');
  assert.ok(/type:\s*'checkbox'/.test(source), 'Eintrag ist kein Haken-Eintrag');
  assert.ok(/setBadgeText/.test(source), 'kein Badge am Symbol');
  assert.ok(/setBadgeBackgroundColor/.test(source), 'Badge ohne Farbe');
});

test('Code einfuegen ist an Feldleiste und Panel vorhanden', function () {
  var content = fs.readFileSync(abs('src/content.js'), 'utf8');
  assert.ok(/data-action="code"/.test(content), 'Panel hat keinen Knopf fuer Code');
  assert.ok(/openCodeDialog\(field\)/.test(content), 'Feldleiste hat keinen Knopf fuer Code');
  var dialog = fs.readFileSync(abs('src/codedialog.js'), 'utf8');
  assert.ok(/codeLanguages/.test(dialog), 'Sprachliste wird nicht aus dem Konverter geholt');
  assert.ok(/data-code-action="copy-jira"/.test(dialog), 'kein Knopf zum Kopieren des Markups');
  assert.ok(/data-code-action="copy-html"/.test(dialog), 'kein Knopf zum formatierten Kopieren');
  assert.ok(!/actionscript/.test(dialog), 'Sprachliste ist im Dialog dupliziert');
});

test('Kopieren gibt es als Markup und formatiert', function () {
  var content = fs.readFileSync(abs('src/content.js'), 'utf8');
  assert.ok(/data-action="copy"/.test(content), 'Panel kopiert kein Markup');
  assert.ok(/data-action="copy-html"/.test(content), 'Panel kopiert nicht formatiert');
  var dialog = fs.readFileSync(abs('src/codedialog.js'), 'utf8');
  assert.ok(/data-code-action="copy-jira"/.test(dialog), 'Dialog kopiert kein Markup');
  assert.ok(/data-code-action="copy-html"/.test(dialog), 'Dialog kopiert nicht formatiert');
});

console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
process.exit(failed === 0 ? 0 : 1);
