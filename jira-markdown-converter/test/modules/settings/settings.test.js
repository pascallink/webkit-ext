/**
 * Tests fuer die Einstellungen, vor allem die Hosterkennung fuer
 * Jira Server / Data Center, Voreinstellungen, Panel- und eigene Vorlagen.
 * Der geteilte Storage (sync/local, onChange) steht in storage.test.js.
 * Aufruf: npm run test:settings --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var Settings = require(path.join(__dirname, '..', '..', '..', 'src', 'settings.js'));

describe('Hosterkennung', function () {
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
});

describe('Match-Pattern', function () {
  test('Pattern deckt http und https ab', function () {
    // Jira Server steht im Firmennetz oft nur auf http bereit.
    assert.strictEqual(Settings.hostPattern('jira.firma.de'), '*://jira.firma.de/*');
  });
});

describe('Voreinstellungen', function () {
  test('Standardwerte sind vollstaendig', function () {
    var defaults = Settings.withDefaults(null);
    assert.strictEqual(defaults.convertOnPaste, true);
    // Im Rich-Text-Editor kommt der Text formatiert an statt als Markup.
    assert.strictEqual(defaults.richEditorFormat, 'html');
    assert.strictEqual(defaults.switchToMarkup, false);
    // Das Einfrieren ist an: sonst schliesst Jira das Feld beim Klick daneben.
    assert.strictEqual(defaults.freezeEditMode, true);
    assert.deepStrictEqual(defaults.extraHosts, []);
  });
  test('Einfrieren laesst sich abschalten', function () {
    assert.strictEqual(Settings.withDefaults({ freezeEditMode: false }).freezeEditMode, false);
    assert.strictEqual(Settings.withDefaults({}).freezeEditMode, true);
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
});

describe('Schalter fuer die Einfuege-Automatik', function () {
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
});

describe('Vorlagen fuer Panels', function () {
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
});

describe('Eigene Vorlagen', function () {
  test('DEFAULTS.customTemplates ist ein leeres Array', function () {
    assert.deepStrictEqual(Settings.DEFAULTS.customTemplates, []);
  });
  test('withDefaults(null).customTemplates ist leer', function () {
    assert.deepStrictEqual(Settings.withDefaults(null).customTemplates, []);
  });
  test('kaputte customTemplates werden abgefangen', function () {
    assert.deepStrictEqual(Settings.withDefaults({ customTemplates: 'kaputt' }).customTemplates, []);
  });
  test('Eintrag ohne Titel oder ohne Markup faellt raus', function () {
    assert.strictEqual(Settings.normalizeTemplate({ title: '', templateMarkup: 'x' }), null);
    assert.strictEqual(Settings.normalizeTemplate({ title: 'x', templateMarkup: '' }), null);
    assert.strictEqual(Settings.normalizeTemplate({ title: '', templateMarkup: '' }), null);
  });
  test('mehr als 5 Platzhalter im Markup werden auf 5 gekuerzt', function () {
    var entry = Settings.normalizeTemplate({
      title: 'Viele Platzhalter',
      templateMarkup: '${A}${B}${C}${D}${E}${F}${G}'
    });
    assert.strictEqual(entry.placeholders.length, 5);
    assert.deepStrictEqual(entry.placeholders, ['A', 'B', 'C', 'D', 'E']);
  });
  test('doppelte Platzhalternamen werden entfernt', function () {
    var entry = Settings.normalizeTemplate({
      title: 'Duplikate',
      templateMarkup: '${A} ${A} ${B}',
      placeholders: ['A', 'A', 'B']
    });
    assert.deepStrictEqual(entry.placeholders, ['A', 'B']);
  });
  test('placeholders im Eintrag sind nur ein Reihenfolge-Hinweis', function () {
    // Markup entscheidet, welche Namen es gibt; die alte Liste ordnet nur.
    var entry = Settings.normalizeTemplate({
      title: 'Reihenfolge',
      templateMarkup: '${A} ${B} ${C}',
      placeholders: ['C', 'A']
    });
    assert.deepStrictEqual(entry.placeholders, ['C', 'A', 'B']);
  });
  test('Platzhalter mit Prototype-Namen ueberleben die Normalisierung', function () {
    var entry = Settings.normalizeTemplate({
      title: 'T',
      templateMarkup: '${toString} ${constructor}',
      placeholders: ['toString', 'constructor']
    });
    assert.deepStrictEqual(entry.placeholders, ['toString', 'constructor']);
  });
  test('mehr als MAX_TEMPLATES Eintraege werden gekuerzt', function () {
    var list = [];
    for (var i = 0; i < Settings.MAX_TEMPLATES + 5; i++) {
      list.push({ title: 'Vorlage ' + i, templateMarkup: 'x' });
    }
    assert.strictEqual(Settings.normalizeTemplates(list).length, Settings.MAX_TEMPLATES);
  });
  test('doppelte id bekommt eine neue Kennung statt zu verschwinden', function () {
    var list = Settings.normalizeTemplates([
      { id: 'gleich', title: 'Erste', templateMarkup: 'x' },
      { id: 'gleich', title: 'Zweite', templateMarkup: 'y' }
    ]);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, 'gleich');
    assert.notStrictEqual(list[1].id, 'gleich');
    assert.strictEqual(list[1].title, 'Zweite');
  });
  test('Vorlage mit id __proto__ ueberlebt', function () {
    var list = Settings.normalizeTemplates([
      { id: '__proto__', title: 'A', templateMarkup: 'x' },
      { id: 'b', title: 'B', templateMarkup: 'y' }
    ]);
    assert.strictEqual(list.length, 2);
  });
  test('lange id wird auf 64 Zeichen gekappt', function () {
    var entry = Settings.normalizeTemplate({ id: 'x'.repeat(5000), title: 'T', templateMarkup: 'y' });
    assert.strictEqual(entry.id.length, 64);
  });
  test('leere oder reine Whitespace-id bekommt eine neue Kennung', function () {
    var leer = Settings.normalizeTemplate({ id: '', title: 'T', templateMarkup: 'y' });
    var blank = Settings.normalizeTemplate({ id: '   ', title: 'T', templateMarkup: 'y' });
    assert.strictEqual(leer.id.indexOf('tpl-'), 0);
    assert.strictEqual(blank.id.indexOf('tpl-'), 0);
  });
  test('fillPlaceholders ersetzt einen einzelnen Platzhalter', function () {
    assert.strictEqual(Settings.fillPlaceholders('h3. ${Titel}', { Titel: 'Login' }), 'h3. Login');
  });
  test('fillPlaceholders ersetzt mehrfache Vorkommen', function () {
    assert.strictEqual(Settings.fillPlaceholders('${A} ${A}', { A: 'x' }), 'x x');
  });
  test('unbelegter Platzhalter faellt auf den Namen zurueck', function () {
    assert.strictEqual(Settings.fillPlaceholders('${Datum}', {}), 'Datum');
  });
  test('unbelegtes ${toString} liefert keinen Funktionsrumpf', function () {
    assert.strictEqual(Settings.fillPlaceholders('${toString}', {}), 'toString');
    assert.strictEqual(Settings.fillPlaceholders('${constructor}', {}), 'constructor');
    assert.strictEqual(Settings.fillPlaceholders('${valueOf}', {}), 'valueOf');
    assert.strictEqual(Settings.fillPlaceholders('${hasOwnProperty}', {}), 'hasOwnProperty');
  });
  test('unbelegter Platzhalter wird maskiert', function () {
    assert.strictEqual(Settings.fillPlaceholders('${a|b}', {}), 'a\\|b');
  });
  test('numerischer Platzhalterwert 0 bleibt erhalten', function () {
    assert.strictEqual(Settings.fillPlaceholders('N=${N}', { N: 0 }), 'N=0');
    assert.strictEqual(Settings.fillPlaceholders('B=${B}', { B: false }), 'B=false');
  });
  test('escapeValue maskiert alle fuenf Sonderzeichen', function () {
    assert.strictEqual(Settings.escapeValue('a{b}c|d[e]'), 'a\\{b\\}c\\|d\\[e\\]');
  });
  test('escapeValue entfernt Zeilenumbrueche', function () {
    assert.ok(Settings.escapeValue('erste\nzweite').indexOf('\n') === -1);
  });
  test('escapeValue maskiert den Backslash genau einmal', function () {
    assert.strictEqual(Settings.escapeValue('C:\\tmp'), 'C:\\\\tmp');
  });
  test('escapeValue behaelt falsy Werte wie 0 und false', function () {
    assert.strictEqual(Settings.escapeValue(0), '0');
    assert.strictEqual(Settings.escapeValue(false), 'false');
    assert.strictEqual(Settings.escapeValue(undefined), '');
    assert.strictEqual(Settings.escapeValue(null), '');
  });
  test('placeholdersInMarkup findet Namen ohne Duplikate', function () {
    assert.deepStrictEqual(Settings.placeholdersInMarkup('${A} ${B} ${A}'), ['A', 'B']);
  });
  test('escapeValue laesst ein einzelnes Ausrufezeichen stehen', function () {
    assert.strictEqual(Settings.escapeValue('Fertig!'), 'Fertig!');
  });
  test('escapeValue maskiert zwei oder mehr Ausrufezeichen', function () {
    assert.strictEqual(Settings.escapeValue('!bild.png!'), '\\!bild.png\\!');
    assert.strictEqual(Settings.escapeValue('!!!'), '\\!\\!\\!');
  });
  test('fillPlaceholders ersetzt nicht rekursiv', function () {
    // Der Wert sieht selbst wie ein Platzhalter aus - das darf nicht zu einem
    // zweiten Ersetzungsdurchlauf fuehren, sonst waere Nutzereingabe Markup.
    assert.strictEqual(Settings.fillPlaceholders('${A}', { A: '${B}' }), '$\\{B\\}');
  });
});
