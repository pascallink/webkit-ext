/**
 * Umschalter zwischen Rich-Text und Markup im JIRA912-Nachbau: der echte
 * Umschalter von Jira 9.12 (nav.editor-toggle-tabs, Button im li) muss
 * getroffen werden, nicht das umgebende <li>, und switchToMarkup() muss
 * wirklich in den Textmodus wechseln statt in den Timeout zu laufen.
 * Aufruf: npm run test:editors --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var JIRA912 = fixtures.JIRA912;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/**
 * Woertlich uebernommen aus test/modules/dialogs/browser/panel.test.js
 * (openDescriptionVisual) - kein require() auf die fremde Testdatei, das
 * wuerde deren Faelle hier ein zweites Mal ausfuehren. Beschreibungsfeld im
 * JIRA912-Nachbau oeffnen, Jira wechselt sofort in den visuellen Modus; nur
 * bis der Rahmen angehaengt ist warten, nicht auf die Feldleiste (die kommt
 * separat aus dem 400-ms-Scan in content.js).
 */
async function openDescriptionVisual(page) {
  await page.click('#description-val');
  await page.waitForSelector('#description-val.active iframe.tox-edit-area__iframe',
    { state: 'attached', timeout: 4000 });
}

describe('Umschalter von Jira 9.12 (JIRA912)', { skip: !hasPlaywright }, function () {
  test('findModeToggle trifft den Text-Button, nicht das li', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openDescriptionVisual(page);
    var found = await page.evaluate(function () {
      var toggle = window.JiraEditors.findModeToggle(document.querySelector('#description'));
      return toggle ? { tagName: toggle.tagName, parentMode: toggle.parentNode.getAttribute('data-mode') } : null;
    });
    assert.deepStrictEqual(found, { tagName: 'BUTTON', parentMode: 'source' });
    await page.close();
  });

  test('switchToMarkup schaltet den Nachbau in den Textmodus', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openDescriptionVisual(page);
    var ok = await page.evaluate(function () {
      return window.JiraEditors.switchToMarkup(document.querySelector('#description'));
    });
    assert.strictEqual(ok, true, 'switchToMarkup hat nicht umgeschaltet');
    var state = await page.evaluate(function () {
      var field = document.querySelector('#description');
      var selected = document.querySelector('.editor-toggle-tabs li[data-mode="source"]');
      return {
        richTextActive: window.JiraEditors.isRichTextActive(field),
        fieldVisible: window.JiraEditors.isVisible(field),
        hasCover: field.classList.contains('richeditor-cover'),
        sourceSelected: !!selected && selected.classList.contains('aui-nav-selected')
      };
    });
    assert.strictEqual(state.richTextActive, false, 'Rich-Text-Modus laeuft noch');
    assert.strictEqual(state.fieldVisible, true, 'Textarea ist nicht sichtbar');
    assert.strictEqual(state.hasCover, false, 'Textarea traegt noch richeditor-cover');
    assert.strictEqual(state.sourceSelected, true, 'li[data-mode="source"] ist nicht als gewaehlt markiert');
    await page.close();
  });

  test('ohne Umschalter bleibt der Rueckfall heil', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openDescriptionVisual(page);
    await page.evaluate(function () {
      var nav = document.querySelector('nav.editor-toggle-tabs');
      nav.parentNode.removeChild(nav);
    });
    var ok = await page.evaluate(function () {
      return window.JiraEditors.switchToMarkup(document.querySelector('#description'));
    });
    assert.strictEqual(ok, false, 'switchToMarkup haette ohne Umschalter false liefern muessen');
    await page.close();
  });
});
