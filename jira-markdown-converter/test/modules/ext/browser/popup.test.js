/**
 * Popup gegen einen echten Tab: test/modules/popup/browser/popup.test.js
 * deckt nur die Vorschau und den Automatik-Schalter ab und spart "Einfuegen
 * in Jira" bewusst aus ("braucht einen echten Tab"). Hier laeuft genau das -
 * chrome.tabs.sendMessage (popup/popup.js:100) an den Fixture-Tab, der Text
 * landet im echten Wiki-Feld ueber Editors.insert().
 * Aufruf: npm run test:ext --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var after = nodeTest.after;
var extLib = require('../../../lib/extension');
var fixtures = require('../../../lib/fixtures');

var INSERT_TIMEOUT = 5000;

describe('Popup gegen einen echten Tab', function () {
  var readyPromise = extLib.canRunExtension();
  var ready = null;

  after(async function () {
    if (ready && ready.ok) await ready.teardown();
  });

  test('"In Jira einfuegen" schickt den Text an den Fixture-Tab', async function (t) {
    ready = await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var fixturePage = ready.context.pages()[0] || await ready.context.newPage();
    // Textmodus statt des RTE-Rahmens (Standard der Fixture ist 'wysiwyg') -
    // damit landet der Text in der echten <textarea>, wie im Struktur-Ueberblick
    // von CLAUDE.md fuer 9.12 LTS beschrieben, nicht im TinyMCE-Iframe.
    await fixturePage.addInitScript(function () {
      try { window.localStorage.setItem('jira.editor.mode', 'source'); } catch (error) { /* egal */ }
    });
    await fixturePage.goto('http://127.0.0.1:' + ready.port + '/' + fixtures.JIRA912);
    await fixturePage.waitForSelector('.jmd-fab', { timeout: 10000 });

    await fixturePage.click('#description-val');
    await fixturePage.waitForSelector('.jmd-fieldbar', { timeout: 10000 });
    await fixturePage.waitForSelector('#description', { timeout: 10000 });

    var popupPage = await extLib.extensionPage(ready.context, ready.extensionId, 'popup/popup.html');
    await popupPage.fill('#input', '# Titel');
    assert.strictEqual(await popupPage.inputValue('#output'), 'h1. Titel');

    // chrome.tabs.query({active: true, currentWindow: true}) in popup.js
    // (withActiveTab()) braucht den Fixture-Tab als aktiven Tab des Fensters -
    // die Erweiterungsseite selbst ist als neuer Tab davor aktiv geworden.
    await fixturePage.bringToFront();
    await popupPage.click('#insert');

    // Editors.insert() mit mode 'insert' setzt am Cursor an (editors.js:573ff)
    // - die Fixture setzt den Feldinhalt beim Oeffnen per .value, das schiebt
    // den Cursor selbst ans Ende, der umgewandelte Text landet darum hinten.
    var expectedSuffix = 'h1. Titel';
    await fixturePage.waitForFunction(function (suffix) {
      var field = document.getElementById('description');
      return !!field && field.value.slice(-suffix.length) === suffix;
    }, expectedSuffix, { timeout: INSERT_TIMEOUT });

    var fieldValue = await fixturePage.inputValue('#description');
    assert.ok(fieldValue.slice(-expectedSuffix.length) === expectedSuffix, 'Wiki-Feld: ' + fieldValue);

    // popup.js schliesst sich beim Erfolg selbst (window.close(), popup.js:107) -
    // die Seite ist an dieser Stelle bereits weg, nur noch der Fixture-Tab
    // wird hier aufgeraeumt.
    await fixturePage.close();
  });

  // chrome.permissions.request() (popup/popup.js:145, Klick auf #grant) oeffnet
  // eine native Chrome-Berechtigungsanfrage ausserhalb des Seiteninhalts -
  // Playwright kann sie nicht ansteuern, und ein Attrappen-Klick wuerde nur
  // simulieren, dass die Freigabe erteilt wurde, ohne den echten Dialog je zu
  // sehen. Bewusst dokumentiert statt nachgestellt.
  test('Freigabe weiterer Jira-Hosts oeffnet einen nativen Dialog', { skip: 'chrome.permissions.request() zeigt eine native ' +
    'Browser-UI ausserhalb der Seite - von Playwright weder ansteuerbar noch ' +
    'sinnvoll simulierbar (siehe popup/popup.js:145).' }, function () {});
});
