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

console.log('\nSchalter fuer die Einfuege-Automatik');
test('an: gruen mit passender Beschriftung', function () {
  var state = Settings.toggleState({ convertOnPaste: true });
  assert.strictEqual(state.color, '#36b37e');
  assert.strictEqual(state.badge, 'AN');
  assert.ok(/an$/.test(state.label), 'Beschriftung: ' + state.label);
});
test('aus: grau mit passender Beschriftung', function () {
  var state = Settings.toggleState({ convertOnPaste: false });
  assert.strictEqual(state.color, '#8993a4');
  assert.strictEqual(state.badge, 'AUS');
  assert.ok(/aus$/.test(state.label), 'Beschriftung: ' + state.label);
});
test('fehlende Einstellungen gelten als aus', function () {
  assert.strictEqual(Settings.toggleState(null).badge, 'AUS');
  assert.strictEqual(Settings.toggleState({}).badge, 'AUS');
});
test('beide Zustaende sind unterscheidbar', function () {
  assert.notStrictEqual(Settings.TOGGLE.on.color, Settings.TOGGLE.off.color);
  assert.notStrictEqual(Settings.TOGGLE.on.badge, Settings.TOGGLE.off.badge);
  assert.notStrictEqual(Settings.TOGGLE.on.label, Settings.TOGGLE.off.label);
});
test('Zustand folgt der gespeicherten Einstellung', function () {
  var stored = Settings.withDefaults({ convertOnPaste: false });
  assert.strictEqual(Settings.toggleState(stored).badge, 'AUS');
});

console.log('\nVorlagen fuer Panels');
test('vier Vorlagen in fester Reihenfolge', function () {
  assert.deepStrictEqual(Settings.PANEL_TEMPLATES.map(function (entry) {
    return entry.id;
  }), ['info', 'note', 'warning', 'plain']);
  assert.deepStrictEqual(Settings.PANEL_TEMPLATES.map(function (entry) {
    return entry.label;
  }), ['Info', 'Hinweis', 'Warnung', 'Standard']);
});
test('Farben im Atlassian-Ton', function () {
  var info = Settings.panelTemplate('info');
  assert.strictEqual(info.borderColor, '#0052cc');
  assert.strictEqual(info.bgColor, '#deebff');
  var note = Settings.panelTemplate('note');
  assert.strictEqual(note.borderColor, '#ff8b00');
  assert.strictEqual(note.bgColor, '#fffae6');
  var warning = Settings.panelTemplate('warning');
  assert.strictEqual(warning.borderColor, '#de350b');
  assert.strictEqual(warning.bgColor, '#ffebe6');
  var plain = Settings.panelTemplate('plain');
  assert.strictEqual(plain.borderColor, '#dfe1e6');
  assert.strictEqual(plain.bgColor, '#f4f5f7');
});
test('jede Vorlage ist vollstaendig und in Hex angegeben', function () {
  Settings.PANEL_TEMPLATES.forEach(function (entry) {
    ['id', 'label', 'hint', 'title', 'body'].forEach(function (key) {
      assert.ok(entry[key], entry.id + ': ' + key + ' fehlt');
    });
    assert.ok(/^#[0-9a-f]{6}$/.test(entry.borderColor), entry.id + ': ' + entry.borderColor);
    assert.ok(/^#[0-9a-f]{6}$/.test(entry.bgColor), entry.id + ': ' + entry.bgColor);
  });
});
test('Vorlagen sind unterscheidbar', function () {
  var ids = {};
  var colors = {};
  Settings.PANEL_TEMPLATES.forEach(function (entry) {
    assert.ok(!ids[entry.id], 'doppelte Kennung: ' + entry.id);
    ids[entry.id] = true;
    assert.ok(!colors[entry.borderColor], 'doppelte Farbe: ' + entry.borderColor);
    colors[entry.borderColor] = true;
  });
});
test('UI-Texte kommen ohne Umlaute aus', function () {
  Settings.PANEL_TEMPLATES.forEach(function (entry) {
    var text = [entry.label, entry.hint, entry.title, entry.body].join(' ');
    assert.ok(/^[\x00-\x7F]*$/.test(text), entry.id + ': ' + text);
  });
});
test('Vorlage wird ueber die Kennung gefunden', function () {
  assert.strictEqual(Settings.panelTemplate('warning').title, 'Warnung');
  assert.strictEqual(Settings.panelTemplate('gibtsnicht'), null);
  assert.strictEqual(Settings.panelTemplate(''), null);
});

console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
process.exit(failed === 0 ? 0 : 1);
