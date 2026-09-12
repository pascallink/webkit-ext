/**
 * Fundament der Testebene ext: die echte, aus dem Manifest geladene
 * Erweiterung im echten Browser - kein addScriptTag-Stub mehr. Zeigt den
 * Unterschied zur Ebene der anderen Module: dort laeuft das Content-Script
 * per addScriptTag in der Hauptwelt der Seite (test/lib/browser.js), hier
 * laedt Chromium die Kopie der echten Erweiterung mit --load-extension - das
 * Content-Script haengt damit tatsaechlich in der isolierten Welt.
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

describe('Erweiterung in eigener Welt', function () {
  var readyPromise = extLib.canRunExtension();
  var ready = null;

  after(async function () {
    if (ready && ready.ok) await ready.teardown();
  });

  test('Seiten-Skript sieht die Erweiterung nicht, das DOM aber schon', async function (t) {
    ready = await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var page = ready.context.pages()[0] || await ready.context.newPage();
    await page.goto('http://127.0.0.1:' + ready.port + '/' + fixtures.JIRA912);

    // .jmd-fab steht nur, wenn das Content-Script tatsaechlich angekommen
    // ist und seine Settings geladen hat - der DOM-Beweis, dass die Kopie
    // der Erweiterung auf dem 127.0.0.1-Host wirklich laeuft.
    await page.waitForSelector('.jmd-fab', { timeout: 10000 });

    // Beschreibungsfeld oeffnen, damit eine echte Feldleiste mit dem
    // __jmdField-Expando entsteht - dasselbe Vorgehen wie in den
    // editlock-Browsertests (#description-val -> .jmd-fieldbar).
    await page.click('#description-val');
    await page.waitForSelector('.jmd-fieldbar', { timeout: 10000 });

    var seenFromPage = await page.evaluate(function () {
      var bar = document.querySelector('.jmd-fieldbar');
      return {
        jiraMarkdown: typeof window.JiraMarkdown,
        loadedFlag: typeof window.__jiraMarkdownConverterLoaded,
        jmdField: bar ? bar.__jmdField : 'kein-bar'
      };
    });

    assert.strictEqual(seenFromPage.jiraMarkdown, 'undefined',
      'Hauptwelt der Seite darf JiraMarkdown der isolierten Welt nicht sehen');
    assert.strictEqual(seenFromPage.loadedFlag, 'undefined',
      'Hauptwelt der Seite darf den Lade-Guard der isolierten Welt nicht sehen');
    assert.strictEqual(seenFromPage.jmdField, undefined,
      'Hauptwelt der Seite darf das __jmdField-Expando der isolierten Welt nicht sehen');

    await page.close();
  });
});
