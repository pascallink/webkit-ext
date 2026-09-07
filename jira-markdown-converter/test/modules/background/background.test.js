/**
 * Nachrichtenbehandlung des Service-Workers (chrome.runtime.onMessage):
 * 'convert' und 'toggle-convert-on-paste'. Tastenkuerzel, Kontextmenue und
 * zusaetzliche Hosts sind Bedienoberflaeche ohne eigene Logik ausserhalb von
 * Settings/Converter - hier bewusst ausgespart.
 * Aufruf: npm run test:background --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var backgroundStub = require('../../lib/chrome-stub.js').backgroundStub;

var BACKGROUND_PATH = path.join(__dirname, '..', '..', '..', 'src', 'background.js');

/**
 * background.js ist ein Service-Worker ohne UMD-Export: es laedt seine
 * Abhaengigkeiten per importScripts() und liest sie ueber self.JiraMd* statt
 * per require(). Fuer den Node-Test wird global self = globalThis gesetzt,
 * settings.js/converter.js normal per require() geladen (ihre UMD-Huelle
 * haengt sich dabei selbst an self bzw. globalThis) und background.js danach
 * frisch requiret - der require-Cache wird vorher geleert, weil sein
 * chrome.runtime.onMessage.addListener(...) beim Laden auf den zu diesem
 * Zeitpunkt aktuellen chrome-Stub zeigt.
 */
function loadBackground(stub) {
  delete require.cache[require.resolve(BACKGROUND_PATH)];
  globalThis.self = globalThis;
  globalThis.chrome = stub;
  globalThis.importScripts = function () {};
  require(path.join(__dirname, '..', '..', '..', 'src', 'settings.js'));
  require(path.join(__dirname, '..', '..', '..', 'src', 'converter.js'));
  require(path.join(__dirname, '..', '..', '..', 'src', 'background.js'));
  delete globalThis.importScripts;
}

function sendMessage(stub, message) {
  return new Promise(function (resolve) {
    stub.runtime.onMessage.trigger(message, {}, resolve);
  });
}

describe('Nachrichtenbehandlung', function () {
  test('convert liefert das umgewandelte Markup', async function () {
    var stub = backgroundStub({ convertOnPaste: true }, {});
    loadBackground(stub);
    var response = await sendMessage(stub, { type: 'convert', text: '# Titel' });
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.text, 'h1. Titel');
  });

  test('convert nutzt die gespeicherten Konverter-Optionen', async function () {
    var stub = backgroundStub({ convertOnPaste: true, keepCodeLanguage: false }, {});
    loadBackground(stub);
    var response = await sendMessage(stub, { type: 'convert', text: '```js\ncode\n```' });
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.text.split('\n')[0], '{code}', 'Sprache haette entfernt werden muessen: ' + response.text);
  });

  test('toggle-convert-on-paste ohne value kehrt den Zustand um', async function () {
    var stub = backgroundStub({ convertOnPaste: true }, {});
    loadBackground(stub);
    var response = await sendMessage(stub, { type: 'toggle-convert-on-paste' });
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.convertOnPaste, false);
  });

  test('toggle-convert-on-paste mit value setzt den Zustand fest', async function () {
    var stub = backgroundStub({ convertOnPaste: false }, {});
    loadBackground(stub);
    var response = await sendMessage(stub, { type: 'toggle-convert-on-paste', value: true });
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.convertOnPaste, true);
  });

  test('toggle-convert-on-paste speichert den neuen Zustand', async function () {
    var syncStore = { convertOnPaste: true };
    var stub = backgroundStub(syncStore, {});
    loadBackground(stub);
    await sendMessage(stub, { type: 'toggle-convert-on-paste', value: false });
    assert.strictEqual(syncStore.convertOnPaste, false);
  });

  test('unbekannter Nachrichtentyp bekommt keine Antwort', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    var called = false;
    stub.runtime.onMessage.trigger({ type: 'was-anderes' }, {}, function () { called = true; });
    assert.strictEqual(called, false);
  });

  test('leere Nachricht wird ohne Fehler ignoriert', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    assert.doesNotThrow(function () {
      stub.runtime.onMessage.trigger(null, {}, function () {});
    });
  });
});
