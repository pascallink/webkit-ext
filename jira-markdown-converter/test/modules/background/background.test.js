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

/**
 * sendToTab() greift nur bei einem fehlgeschlagenen ersten tabs.sendMessage
 * (kein Content-Script im Tab) ueberhaupt zur Injektion - antwortet der Tab,
 * bleibt alles wie es ist. Ausloeser durchgehend ein Kontextmenue-Klick auf
 * 'open-panel', weil das den vollen Pfad durch sendToTab() nimmt.
 */
describe('Injektion nach Seitenart', function () {
  function filesOf(stub, api) {
    var call = stub.calls.filter(function (entry) {
      return entry.api === api && entry.options.files;
    })[0];
    return call ? call.options.files : null;
  }

  test('Nicht-Jira-Seite bekommt editlock.js nicht eingespielt', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    stub.probeResult = false;
    stub.failNextSendMessage();
    stub.contextMenus.onClicked.trigger({ menuItemId: 'open-panel' }, { id: 7 });

    var files = filesOf(stub, 'scripting.executeScript');
    assert.ok(files, 'keine Datei-Injektion protokolliert');
    assert.strictEqual(files.indexOf('src/editlock.js'), -1, 'editlock.js haette nicht injiziert werden duerfen');
    ['src/otrslink.js', 'src/jiraui.js', 'src/otrsflow.js', 'src/otrsdialog.js'].forEach(function (file) {
      assert.strictEqual(files.indexOf(file), -1, file + ' haette nicht injiziert werden duerfen');
    });
    assert.notStrictEqual(files.indexOf('src/content.js'), -1, 'content.js fehlt in der Standalone-Liste');
    assert.notStrictEqual(files.indexOf('src/converter.js'), -1, 'converter.js fehlt in der Standalone-Liste');
  });

  test('Jira-Seite bekommt CONTENT_FILES vollstaendig eingespielt', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    stub.probeResult = true;
    stub.failNextSendMessage();
    stub.contextMenus.onClicked.trigger({ menuItemId: 'open-panel' }, { id: 7 });

    var files = filesOf(stub, 'scripting.executeScript');
    assert.ok(files, 'keine Datei-Injektion protokolliert');
    assert.notStrictEqual(files.indexOf('src/editlock.js'), -1, 'editlock.js fehlt auf der Jira-Seite');
    assert.notStrictEqual(files.indexOf('src/otrsdialog.js'), -1, 'otrsdialog.js fehlt auf der Jira-Seite');
  });

  test('CONTENT_CSS wird in beiden Faellen eingespielt', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    stub.probeResult = false;
    stub.failNextSendMessage();
    stub.contextMenus.onClicked.trigger({ menuItemId: 'open-panel' }, { id: 7 });

    var css = filesOf(stub, 'scripting.insertCSS');
    assert.ok(css, 'kein CSS eingespielt');
    assert.notStrictEqual(css.indexOf('src/content.css'), -1);
  });

  test('die Sondierung laeuft nur im Hauptrahmen', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    stub.probeResult = false;
    stub.failNextSendMessage();
    stub.contextMenus.onClicked.trigger({ menuItemId: 'open-panel' }, { id: 7 });

    var probe = stub.calls.filter(function (entry) {
      return entry.api === 'scripting.executeScript' && entry.options.func;
    })[0];
    assert.ok(probe, 'keine Sondierung protokolliert');
    assert.ok(!probe.options.target.allFrames, 'Sondierung lief in allen Frames statt nur im Hauptrahmen');
  });

  test('antwortet das Content-Script, wird nicht injiziert', function () {
    var stub = backgroundStub({}, {});
    loadBackground(stub);
    stub.contextMenus.onClicked.trigger({ menuItemId: 'open-panel' }, { id: 7 });

    var injected = stub.calls.some(function (entry) {
      return entry.api === 'scripting.executeScript' || entry.api === 'scripting.insertCSS';
    });
    assert.strictEqual(injected, false, 'es haette nichts injiziert werden duerfen');
  });
});
