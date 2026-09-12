/**
 * Prueft das Manifest fuer sich: Version, Store-Vorgaben, referenzierte
 * Dateien, Berechtigungen und Icons. Dateiverweise in HTML/Service-Worker und
 * Quellcode-Regeln stehen in sources.test.js, Store-Artefakte in store.test.js.
 * Aufruf: npm run test:package --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;

var root = path.join(__dirname, '..', '..', '..');

function abs(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(abs(relative));
}

var manifest = JSON.parse(fs.readFileSync(abs('manifest.json'), 'utf8'));

describe('Manifest', function () {
  test('Manifest V3', function () {
    assert.strictEqual(manifest.manifest_version, 3);
    assert.ok(manifest.name);
    assert.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Version muss x.y.z sein');
  });

  test('Store-Vorgaben im Manifest', function () {
    // Der Store nimmt hoechstens 132 Zeichen und verlangt eine Support-Adresse.
    assert.ok(manifest.description.length <= 132,
      'description zu lang: ' + manifest.description.length + ' Zeichen');
    assert.ok(!/[\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]/.test(manifest.description),
      'description enthaelt Umlaute');
    assert.strictEqual(manifest.homepage_url, 'https://github.com/pascallink/webkit-ext');
  });

  test('Version steht in manifest.json und package.json gleich', function () {
    var pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8'));
    assert.strictEqual(manifest.version, pkg.version,
      'manifest.json ' + manifest.version + ' != package.json ' + pkg.version);
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
    assert.ok(js.indexOf('src/editlock.js') < js.indexOf('src/content.js'), 'editlock vor content');
    assert.ok(js.indexOf('src/editors.js') < js.indexOf('src/editlock.js'), 'editors vor editlock');
    assert.ok(js.indexOf('src/codedialog.js') < js.indexOf('src/templatedialog.js'), 'codedialog vor templatedialog');
    assert.ok(js.indexOf('src/templatedialog.js') < js.indexOf('src/editlock.js'), 'templatedialog vor editlock');
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
    // Jede Berechtigung kostet im Store eine Begruendung - ungenutzte fliegen raus.
    assert.ok(!manifest.optional_permissions,
      'optional_permissions ohne Anforderung im Code: ' + JSON.stringify(manifest.optional_permissions));
    assert.deepStrictEqual(manifest.optional_host_permissions, ['*://*/*'],
      'das breite Muster gehoert nach optional_host_permissions, siehe docs/store/permissions.md');
  });

  test('Tastenkuerzel definiert', function () {
    assert.ok(manifest.commands['convert-selection'], 'Kommando fehlt');
  });
});
