/**
 * Tests fuer die Einstellungen, vor allem die Hosterkennung fuer
 * Jira Server / Data Center.
 *
 * Aufruf: node test/settings.test.js
 */
'use strict';

var assert = require('assert');
var path = require('path');
var Settings = require(path.join(__dirname, '..', 'src', 'settings.js'));

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
    console.log('       ' + (error && error.message ? error.message.split('\n').join('\n       ') : error));
  }
}

console.log('\nHosterkennung');
test('einfacher Hostname', function () {
  assert.strictEqual(Settings.normalizeHost('jira.firma.de'), 'jira.firma.de');
});
test('vollstaendige URL', function () {
  assert.strictEqual(Settings.normalizeHost('https://jira.firma.de/browse/ABC-1'), 'jira.firma.de');
  assert.strictEqual(Settings.normalizeHost('http://jira.firma.de/secure/Dashboard.jspa'), 'jira.firma.de');
});
test('Port wird entfernt', function () {
  // Match-Pattern kennen keine Ports; '*://host/*' gilt fuer jeden Port.
  assert.strictEqual(Settings.normalizeHost('http://jira.firma.de:8080/browse/ABC-1'), 'jira.firma.de');
});
test('Intranet-Name ohne Punkt', function () {
  assert.strictEqual(Settings.normalizeHost('http://jira:8080/'), 'jira');
  assert.strictEqual(Settings.normalizeHost('jira'), 'jira');
});
test('Grossschreibung und Leerzeichen', function () {
  assert.strictEqual(Settings.normalizeHost('  JIRA.Firma.DE  '), 'jira.firma.de');
});
test('Platzhalter fuer Subdomains', function () {
  assert.strictEqual(Settings.normalizeHost('*.firma.de'), '*.firma.de');
});
test('unbrauchbare Eingaben werden verworfen', function () {
  assert.strictEqual(Settings.normalizeHost(''), '');
  assert.strictEqual(Settings.normalizeHost('   '), '');
  assert.strictEqual(Settings.normalizeHost(null), '');
  assert.strictEqual(Settings.normalizeHost('jira firma de'), '');
  assert.strictEqual(Settings.normalizeHost('<script>'), '');
});
test('blankes Sternchen wird abgelehnt', function () {
  // Sonst waere jede Seite im Netz freigegeben.
  assert.strictEqual(Settings.normalizeHost('*'), '');
  assert.strictEqual(Settings.normalizeHost('*.*'), '');
  assert.strictEqual(Settings.normalizeHost('http://*/*'), '');
});

console.log('\nMatch-Pattern');
test('Pattern deckt http und https ab', function () {
  // Jira Server steht im Firmennetz oft nur auf http bereit.
  assert.strictEqual(Settings.hostPattern('jira.firma.de'), '*://jira.firma.de/*');
});

console.log('\nVoreinstellungen');
test('Standardwerte sind vollstaendig', function () {
  var defaults = Settings.withDefaults(null);
  assert.strictEqual(defaults.convertOnPaste, true);
  // Im Rich-Text-Editor kommt der Text formatiert an statt als Markup.
  assert.strictEqual(defaults.richEditorFormat, 'html');
  assert.strictEqual(defaults.switchToMarkup, false);
  assert.deepStrictEqual(defaults.extraHosts, []);
});
test('gespeicherte Werte gewinnen', function () {
  var merged = Settings.withDefaults({ convertOnPaste: false, extraHosts: ['jira.firma.de'] });
  assert.strictEqual(merged.convertOnPaste, false);
  assert.deepStrictEqual(merged.extraHosts, ['jira.firma.de']);
  assert.strictEqual(merged.showFloatingButton, true, 'nicht gesetzte Werte bleiben Standard');
});
test('alle drei Zielformate bleiben erhalten', function () {
  assert.strictEqual(Settings.withDefaults({ richEditorFormat: 'html' }).richEditorFormat, 'html');
  assert.strictEqual(Settings.withDefaults({ richEditorFormat: 'jira' }).richEditorFormat, 'jira');
  assert.strictEqual(Settings.withDefaults({ richEditorFormat: 'markdown' }).richEditorFormat, 'markdown');
});
test('unbekanntes Zielformat faellt auf html zurueck', function () {
  assert.strictEqual(Settings.withDefaults({ richEditorFormat: 'quatsch' }).richEditorFormat, 'html');
});
test('kaputte extraHosts werden abgefangen', function () {
  assert.deepStrictEqual(Settings.withDefaults({ extraHosts: 'jira.firma.de' }).extraHosts, []);
});
test('Konverter-Optionen enthalten nur Konverter-Schluessel', function () {
  var options = Settings.converterOptions(Settings.withDefaults(null));
  assert.deepStrictEqual(Object.keys(options).sort(),
    ['convertAlerts', 'convertHtml', 'escapeBraces', 'keepCodeLanguage']);
});

console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
process.exit(failed === 0 ? 0 : 1);
