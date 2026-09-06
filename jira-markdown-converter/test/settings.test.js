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

/** Wie test(), aber fuer Faelle, deren Pruefung ueber ein Promise laeuft. */
function asyncTest(name, fn) {
  return Promise.resolve().then(fn).then(function () {
    passed++;
    console.log('  ok   ' + name);
  }, function (error) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + (error && error.message ? error.message.split('\n').join('\n       ') : error));
  });
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

console.log('\nEigene Vorlagen');
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

console.log('\nGeteilter Storage');

/**
 * Setzt globalThis.chrome fuer die Dauer von fn und macht das danach wieder
 * rueckgaengig. fn wird sofort aufgerufen (kein Umweg ueber ein weiteres
 * Promise), damit chrome beim tatsaechlichen Lesen/Schreiben feststeht -
 * die Faelle laufen ohnehin nacheinander, nicht parallel.
 */
async function withChromeStub(stub, fn) {
  var previous = globalThis.chrome;
  globalThis.chrome = stub;
  try {
    return await fn();
  } finally {
    globalThis.chrome = previous;
  }
}

/** Sammelt registrierte Listener, damit ein Test onChanged-Events simulieren kann. */
function onChangedStub() {
  var listeners = [];
  return {
    addListener: function (fn) { listeners.push(fn); },
    trigger: function (changes, area) {
      listeners.forEach(function (fn) { fn(changes, area); });
    }
  };
}

function storageStub(syncStore, localStore) {
  return {
    runtime: { lastError: null },
    storage: {
      sync: {
        get: function (defaults, cb) {
          cb(Object.assign({}, defaults, syncStore));
        },
        set: function (values, cb) {
          Object.assign(syncStore, values);
          if (cb) cb();
        }
      },
      local: {
        get: function (defaults, cb) {
          cb(Object.assign({}, defaults, localStore));
        },
        set: function (values, cb) {
          Object.assign(localStore, values);
          if (cb) cb();
        }
      },
      onChanged: onChangedStub()
    }
  };
}

async function runStorageTests() {
  await asyncTest('save() legt customTemplates nur in local ab', async function () {
    var syncStore = {};
    var localStore = {};
    await withChromeStub(storageStub(syncStore, localStore), function () {
      return Settings.save({ customTemplates: [{ title: 'T', templateMarkup: 'x' }] });
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(syncStore, 'customTemplates'));
    assert.strictEqual(localStore.customTemplates.length, 1);
  });

  await asyncTest('save() legt convertOnPaste nur in sync ab', async function () {
    var syncStore = {};
    var localStore = {};
    await withChromeStub(storageStub(syncStore, localStore), function () {
      return Settings.save({ convertOnPaste: false });
    });
    assert.strictEqual(syncStore.convertOnPaste, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(localStore, 'convertOnPaste'));
  });

  await asyncTest('load() fuehrt beide Bereiche zusammen', async function () {
    var syncStore = { convertOnPaste: false };
    var localStore = { customTemplates: [{ id: 'a', title: 'T', templateMarkup: 'x', placeholders: [] }] };
    var settings = await withChromeStub(storageStub(syncStore, localStore), function () {
      return Settings.load();
    });
    assert.strictEqual(settings.convertOnPaste, false);
    assert.strictEqual(settings.customTemplates.length, 1);
    assert.strictEqual(settings.customTemplates[0].title, 'T');
  });

  await asyncTest('ein lastError in local laesst die uebrigen Einstellungen unberuehrt', async function () {
    var stub = storageStub({ convertOnPaste: false }, {});
    stub.storage.local.get = function (defaults, cb) {
      stub.runtime.lastError = { message: 'kaputt' };
      cb(defaults);
      stub.runtime.lastError = null;
    };
    var settings = await withChromeStub(stub, function () {
      return Settings.load();
    });
    assert.strictEqual(settings.convertOnPaste, false);
    assert.deepStrictEqual(settings.customTemplates, []);
  });

  await asyncTest('ohne chrome liefert load() weiterhin die Defaults', async function () {
    var previous = globalThis.chrome;
    delete globalThis.chrome;
    var settings;
    try {
      settings = await Settings.load();
    } finally {
      globalThis.chrome = previous;
    }
    assert.strictEqual(settings.convertOnPaste, true);
    assert.deepStrictEqual(settings.customTemplates, []);
  });

  await asyncTest('fehlender local-Bereich laesst sync trotzdem schreiben', async function () {
    var syncStore = {};
    var stub = storageStub(syncStore, {});
    delete stub.storage.local;
    await withChromeStub(stub, function () {
      return Settings.save({ convertOnPaste: false, customTemplates: [{ title: 'T', templateMarkup: 'x' }] });
    });
    assert.strictEqual(syncStore.convertOnPaste, false);
  });

  await asyncTest('fehlender sync-Bereich laesst local trotzdem schreiben', async function () {
    var localStore = {};
    var stub = storageStub({}, localStore);
    delete stub.storage.sync;
    await withChromeStub(stub, function () {
      return Settings.save({ customTemplates: [{ title: 'T', templateMarkup: 'x' }] });
    });
    assert.strictEqual(localStore.customTemplates.length, 1);
  });

  await asyncTest('zwei onChanged-Events pro save() loesen nur ein load() aus', async function () {
    var stub = storageStub({}, {});
    var calls = 0;
    await withChromeStub(stub, function () {
      return new Promise(function (resolve) {
        Settings.onChange(function () {
          calls++;
        });
        stub.storage.onChanged.trigger({}, 'sync');
        stub.storage.onChanged.trigger({}, 'local');
        setTimeout(function () {
          assert.strictEqual(calls, 1);
          resolve();
        }, 150);
      });
    });
  });

  await asyncTest('onChanged-Events in getrennten Macrotasks loesen ein load aus', async function () {
    // sync und local sind zwei getrennte IPC-Runden - die Events treffen
    // im Browser regelmaessig einige Millisekunden auseinander ein, nicht
    // im selben Macrotask. Genau das bildet dieser Test nach.
    var stub = storageStub({}, {});
    var calls = 0;
    await withChromeStub(stub, function () {
      return new Promise(function (resolve) {
        Settings.onChange(function () {
          calls++;
        });
        stub.storage.onChanged.trigger({}, 'sync');
        setTimeout(function () {
          stub.storage.onChanged.trigger({}, 'local');
        }, 5);
        setTimeout(function () {
          assert.strictEqual(calls, 1);
          resolve();
        }, 150);
      });
    });
  });

  await asyncTest('ein einzelnes onChanged-Event loest genau ein load() aus', async function () {
    var stub = storageStub({}, {});
    var calls = 0;
    await withChromeStub(stub, function () {
      return new Promise(function (resolve) {
        Settings.onChange(function () {
          calls++;
        });
        stub.storage.onChanged.trigger({}, 'local');
        setTimeout(function () {
          assert.strictEqual(calls, 1);
          resolve();
        }, 150);
      });
    });
  });
}

runStorageTests().then(function () {
  console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
  process.exit(failed === 0 ? 0 : 1);
});
