/**
 * Tests fuer die CustomerKey-Zuordnung: Normalisierung der Tabelle,
 * Musterpruefung und Textanreicherung.
 * Aufruf: npm run test:mapping --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var Mapping = require(path.join(__dirname, '..', '..', '..', 'src', 'mapping.js'));

describe('Mapping.normalizeMap', function () {
  test('String-Werte werden an Komma und Leerraum zerlegt', function () {
    var result = Mapping.normalizeMap({ 'ROV-1': 'JIRA-1, JIRA-2  JIRA-3' });
    assert.deepStrictEqual(result, { 'ROV-1': ['JIRA-1', 'JIRA-2', 'JIRA-3'] });
  });

  test('Array-Werte werden als Strings getrimmt', function () {
    var result = Mapping.normalizeMap({ 'ROV-1': [' JIRA-1 ', 'JIRA-2'] });
    assert.deepStrictEqual(result, { 'ROV-1': ['JIRA-1', 'JIRA-2'] });
  });

  test('Schluessel werden getrimmt und grossgeschrieben', function () {
    var result = Mapping.normalizeMap({ ' rov-1 ': ['JIRA-1'] });
    assert.deepStrictEqual(result, { 'ROV-1': ['JIRA-1'] });
  });

  test('Duplikate innerhalb der Ziele fallen raus, Schreibweise bleibt die erste', function () {
    var result = Mapping.normalizeMap({ 'ROV-1': ['JIRA-1', 'jira-1', 'JIRA-1', 'JIRA-2'] });
    assert.deepStrictEqual(result, { 'ROV-1': ['JIRA-1', 'JIRA-2'] });
  });

  test('mehr als MAX_TARGETS Ziele werden abgeschnitten', function () {
    var viele = [];
    for (var i = 0; i < Mapping.MAX_TARGETS + 5; i++) {
      viele.push('JIRA-' + i);
    }
    var result = Mapping.normalizeMap({ 'ROV-1': viele });
    assert.strictEqual(result['ROV-1'].length, Mapping.MAX_TARGETS);
  });

  test('Schluessel ohne verbleibendes Ziel fallen raus', function () {
    var result = Mapping.normalizeMap({ 'ROV-1': '', 'ROV-2': [], 'ROV-3': [' ', ''] });
    assert.deepStrictEqual(result, {});
  });

  test('zu lange Schluessel fallen raus', function () {
    var langerSchluessel = new Array(Mapping.MAX_KEY_LENGTH + 5).join('x');
    var abgelehnt = {};
    abgelehnt[langerSchluessel] = ['JIRA-1'];
    assert.deepStrictEqual(Mapping.normalizeMap(abgelehnt), {});
  });

  test('Werte, die weder String noch Array sind, ergeben einen leeren Eintrag', function () {
    var result = Mapping.normalizeMap({ 'ROV-1': 42, 'ROV-2': null, 'ROV-3': true });
    assert.deepStrictEqual(result, {});
  });

  test('Muell-Eingaben (null, Array, String, Zahl) ergeben immer ein Objekt', function () {
    assert.deepStrictEqual(Mapping.normalizeMap(null), {});
    assert.deepStrictEqual(Mapping.normalizeMap(undefined), {});
    assert.deepStrictEqual(Mapping.normalizeMap([1, 2, 3]), {});
    assert.deepStrictEqual(Mapping.normalizeMap('ROV-1234'), {});
    assert.deepStrictEqual(Mapping.normalizeMap(42), {});
  });

  test('Prototype-Namen als Schluessel sind unschaedlich', function () {
    var result = Mapping.normalizeMap({ constructor: ['JIRA-1'], toString: ['JIRA-2'] });
    assert.deepStrictEqual(result, { CONSTRUCTOR: ['JIRA-1'], TOSTRING: ['JIRA-2'] });
  });

  test('hoechstens MAX_KEYS Eintraege', function () {
    var raw = {};
    for (var i = 0; i < Mapping.MAX_KEYS + 10; i++) {
      raw['KEY-' + i] = ['JIRA-' + i];
    }
    var result = Mapping.normalizeMap(raw);
    assert.strictEqual(Object.keys(result).length, Mapping.MAX_KEYS);
  });
});

describe('Mapping.compile', function () {
  test('gueltiges Muster wird kompiliert', function () {
    var regex = Mapping.compile('ROV-\\d+');
    assert.ok(regex instanceof RegExp);
    assert.strictEqual(regex.global, true);
    assert.deepStrictEqual('ROV-42'.match(regex), ['ROV-42']);
  });

  test('kaputtes Muster faellt auf den Default zurueck und wirft nicht', function () {
    var regex;
    assert.doesNotThrow(function () {
      regex = Mapping.compile('(');
    });
    assert.ok(regex instanceof RegExp);
    assert.deepStrictEqual('ROV-42'.match(regex), ['ROV-42']);
  });

  test('leeres, zu langes oder nicht-String-Muster faellt auf den Default zurueck', function () {
    assert.deepStrictEqual('REFI-9'.match(Mapping.compile('')), ['REFI-9']);
    assert.deepStrictEqual('REFI-9'.match(Mapping.compile(null)), ['REFI-9']);
    assert.deepStrictEqual('REFI-9'.match(Mapping.compile(undefined)), ['REFI-9']);
    var zuLang = new Array(Mapping.MAX_PATTERN_LENGTH + 10).join('a');
    assert.deepStrictEqual('REFI-9'.match(Mapping.compile(zuLang)), ['REFI-9']);
  });

  test('Muster mit verschachtelten Quantoren faellt auf den Default zurueck', function () {
    assert.deepStrictEqual('REFI-9'.match(Mapping.compile('(a+)+$')), ['REFI-9']);
  });

  test('jeder Aufruf liefert ein frisches RegExp (lastIndex haengt nicht)', function () {
    var erste = Mapping.compile('ROV-\\d+');
    erste.exec('ROV-1 ROV-2');
    assert.notStrictEqual(erste.lastIndex, 0);
    var zweite = Mapping.compile('ROV-\\d+');
    assert.strictEqual(zweite.lastIndex, 0);
  });
});

describe('Mapping.targetsFor', function () {
  var map = { 'ROV-1234': ['JIRA-567', 'JIRA-568'] };

  test('liefert die Ziele zu einem bekannten Schluessel', function () {
    assert.deepStrictEqual(Mapping.targetsFor(map, 'ROV-1234'), ['JIRA-567', 'JIRA-568']);
  });

  test('Gross-/Kleinschreibung spielt keine Rolle', function () {
    assert.deepStrictEqual(Mapping.targetsFor(map, 'rov-1234'), ['JIRA-567', 'JIRA-568']);
  });

  test('unbekannter Schluessel liefert ein leeres Array', function () {
    assert.deepStrictEqual(Mapping.targetsFor(map, 'ROV-9999'), []);
    assert.deepStrictEqual(Mapping.targetsFor({}, 'ROV-1234'), []);
    assert.deepStrictEqual(Mapping.targetsFor(null, 'ROV-1234'), []);
  });

  test('greift nur auf eigene Eigenschaften zu', function () {
    assert.deepStrictEqual(Mapping.targetsFor(map, 'constructor'), []);
    assert.deepStrictEqual(Mapping.targetsFor(map, 'toString'), []);
  });
});

describe('Mapping.findKeys', function () {
  test('findet alle Treffer ohne Duplikate, in Fundreihenfolge', function () {
    var text = 'ROV-1 und REFI-2 und nochmal ROV-1';
    assert.deepStrictEqual(Mapping.findKeys(text, null), ['ROV-1', 'REFI-2']);
  });

  test('leerer Text liefert ein leeres Array', function () {
    assert.deepStrictEqual(Mapping.findKeys('', null), []);
    assert.deepStrictEqual(Mapping.findKeys(null, null), []);
  });

  test('eigenes Muster wird verwendet', function () {
    assert.deepStrictEqual(Mapping.findKeys('KD-42 ROV-1', 'KD-\\d+'), ['KD-42']);
  });

  test('Treffer der Laenge 0 fallen raus', function () {
    assert.deepStrictEqual(Mapping.findKeys('abc 12', '[A-Z]*-?\\d*'), ['12']);
  });

  test('ein Muster mit verschachtelten Quantoren kehrt sofort zurueck', function () {
    var text = new Array(121).join('a');
    var start = Date.now();
    var result = Mapping.findKeys(text, '(a+)+$');
    assert.ok(Date.now() - start < 1000, 'findKeys darf nicht backtracken');
    assert.deepStrictEqual(result, []);
  });
});

describe('Mapping.enrich', function () {
  test('haengt die Ziele in Klammern an (Definition of Done)', function () {
    var result = Mapping.enrich('ROV-1234 offen', { 'ROV-1234': ['JIRA-567'] }, null);
    assert.strictEqual(result.text, 'ROV-1234 (JIRA-567) offen');
    assert.strictEqual(result.count, 1);
  });

  test('mehrere Ziele werden mit Komma getrennt', function () {
    var result = Mapping.enrich('ROV-1234 offen', { 'ROV-1234': ['JIRA-567', 'JIRA-568'] }, null);
    assert.strictEqual(result.text, 'ROV-1234 (JIRA-567, JIRA-568) offen');
    assert.strictEqual(result.count, 1);
  });

  test('zweiter Lauf ist idempotent (Definition of Done)', function () {
    var erster = Mapping.enrich('ROV-1234 offen', { 'ROV-1234': ['JIRA-567'] }, null);
    var zweiter = Mapping.enrich(erster.text, { 'ROV-1234': ['JIRA-567'] }, null);
    assert.strictEqual(zweiter.text, erster.text);
    assert.strictEqual(zweiter.count, 0);
  });

  test('ohne Klammer-Trenner (kein Leerzeichen davor) bleibt ebenfalls idempotent', function () {
    var map = { 'ROV-1234': ['JIRA-567'] };
    var erster = Mapping.enrich('siehe ROV-1234(JIRA-567) bitte', map, null);
    assert.strictEqual(erster.count, 0);
    assert.strictEqual(erster.text, 'siehe ROV-1234(JIRA-567) bitte');
  });

  test('mehrere Treffer im selben Text werden alle angereichert', function () {
    var map = { 'ROV-1': ['JIRA-1'], 'ROV-2': ['JIRA-2'] };
    var result = Mapping.enrich('ROV-1 und ROV-2', map, null);
    assert.strictEqual(result.text, 'ROV-1 (JIRA-1) und ROV-2 (JIRA-2)');
    assert.strictEqual(result.count, 2);
  });

  test('Treffer in {code}-Bloecken bleiben unangetastet', function () {
    var map = { 'ROV-1234': ['JIRA-567'] };
    var text = 'vorher ROV-1234 {code}ROV-1234{code} nachher';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.text, 'vorher ROV-1234 (JIRA-567) {code}ROV-1234{code} nachher');
  });

  test('Treffer in {code:sprache}-Bloecken bleiben unangetastet', function () {
    var map = { 'ROV-1234': ['JIRA-567'] };
    var text = '{code:java}ROV-1234{code} danach ROV-1234';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.text, '{code:java}ROV-1234{code} danach ROV-1234 (JIRA-567)');
  });

  test('Treffer in {noformat}-Bloecken bleiben unangetastet', function () {
    var map = { 'ROV-1234': ['JIRA-567'] };
    var text = '{noformat}ROV-1234{noformat} und ROV-1234';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.text, '{noformat}ROV-1234{noformat} und ROV-1234 (JIRA-567)');
  });

  test('Treffer in einem nicht geschlossenen {code}-Block bleiben unangetastet', function () {
    var map = { 'ROV-1': ['ABC-1'] };
    var text = '{code}\nROV-1 im Block\n';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.text, text);
  });

  test('ein geschlossener {code}-Block schuetzt weiterhin zuerst, danach greift der Treffer', function () {
    var map = { 'ROV-1': ['ABC-1'] };
    var text = '{code}\nROV-1\n{code}\nROV-1 danach';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.text, '{code}\nROV-1\n{code}\nROV-1 (ABC-1) danach');
  });

  test('Treffer in einem nicht geschlossenen {noformat}-Block bleiben unangetastet', function () {
    var map = { 'ROV-1': ['ABC-1'] };
    var text = '{noformat}\nROV-1 im Block\n';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.text, text);
  });

  test('Treffer in {{...}} (Inline-Monospace) bleiben unangetastet', function () {
    var map = { 'ROV-1234': ['JIRA-567'] };
    var text = '{{ROV-1234}} und ROV-1234';
    var result = Mapping.enrich(text, map, null);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.text, '{{ROV-1234}} und ROV-1234 (JIRA-567)');
  });

  test('ohne Mapping bleibt der Text unveraendert', function () {
    var result = Mapping.enrich('ROV-1234 offen', {}, null);
    assert.strictEqual(result.text, 'ROV-1234 offen');
    assert.strictEqual(result.count, 0);
  });

  test('Treffer ohne Eintrag in der Tabelle bleibt unveraendert', function () {
    var result = Mapping.enrich('ROV-9999 offen', { 'ROV-1234': ['JIRA-567'] }, null);
    assert.strictEqual(result.text, 'ROV-9999 offen');
    assert.strictEqual(result.count, 0);
  });

  test('leerer Text ergibt count 0 und wirft nicht', function () {
    assert.deepStrictEqual(Mapping.enrich('', { 'ROV-1': ['JIRA-1'] }, null), { text: '', count: 0 });
    assert.deepStrictEqual(Mapping.enrich(null, { 'ROV-1': ['JIRA-1'] }, null), { text: '', count: 0 });
  });

  test('ungueltiges Muster wirft nicht und liefert den Text unveraendert', function () {
    var result;
    assert.doesNotThrow(function () {
      result = Mapping.enrich('ROV-1234 offen', {}, '(');
    });
    assert.strictEqual(result.text, 'ROV-1234 offen');
    assert.strictEqual(result.count, 0);
  });
});

describe('Mapping.parseImport', function () {
  test('gueltiges JSON wird normalisiert uebernommen', function () {
    var result = Mapping.parseImport('{"ROV-1234": ["JIRA-567", "JIRA-568"], "REFI-99": "JIRA-12, JIRA-13"}');
    assert.strictEqual(result.error, '');
    assert.deepStrictEqual(result.map, {
      'ROV-1234': ['JIRA-567', 'JIRA-568'],
      'REFI-99': ['JIRA-12', 'JIRA-13']
    });
  });

  test('kaputtes JSON liefert eine Fehlermeldung ohne Umlaute', function () {
    var result = Mapping.parseImport('{kaputt');
    assert.strictEqual(result.map, null);
    assert.ok(result.error.length > 0);
    assert.ok(/^[\x00-\x7F]*$/.test(result.error), 'Fehlermeldung ohne Umlaute: ' + result.error);
  });

  test('ein JSON-Array wird abgelehnt', function () {
    var result = Mapping.parseImport('["ROV-1234"]');
    assert.strictEqual(result.map, null);
    assert.ok(result.error.length > 0);
  });

  test('ein JSON-Skalar wird abgelehnt', function () {
    var result = Mapping.parseImport('"ROV-1234"');
    assert.strictEqual(result.map, null);
    assert.ok(result.error.length > 0);
  });

  test('ein Objekt ohne gueltigen Eintrag wird abgelehnt', function () {
    var result = Mapping.parseImport('{"ROV-1234": []}');
    assert.strictEqual(result.map, null);
    assert.ok(result.error.length > 0);
  });

  test('leere Eingabe wird abgelehnt und wirft nicht', function () {
    assert.doesNotThrow(function () {
      var result = Mapping.parseImport('');
      assert.strictEqual(result.map, null);
    });
  });
});

describe('Mapping.toExportText', function () {
  test('liefert wieder parsebares JSON', function () {
    var map = { 'ROV-1234': ['JIRA-567', 'JIRA-568'] };
    var text = Mapping.toExportText(map);
    assert.deepStrictEqual(JSON.parse(text), map);
  });

  test('normalisiert vor dem Export (Grossschreibung, Duplikate)', function () {
    var text = Mapping.toExportText({ 'rov-1': ['JIRA-1', 'jira-1'] });
    assert.deepStrictEqual(JSON.parse(text), { 'ROV-1': ['JIRA-1'] });
  });

  test('Import und Export sind zueinander konsistent', function () {
    var original = '{"ROV-1234": ["JIRA-567"]}';
    var geparst = Mapping.parseImport(original);
    var exportiert = Mapping.toExportText(geparst.map);
    var reimportiert = Mapping.parseImport(exportiert);
    assert.deepStrictEqual(reimportiert.map, geparst.map);
  });
});
