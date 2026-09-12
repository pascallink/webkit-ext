/**
 * Gemerkte Cursorposition: das Panel fuegt an der zuletzt gesetzten Stelle
 * in der Textarea ein, ersetzt eine Auswahl und ueberlebt den Wechsel ins
 * Panel auch im Rich-Text-Editor.
 * Aufruf: npm run test:editors --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var dom = require('../../../lib/dom');
var fixtures = require('../../../lib/fixtures');

var setCaret = dom.setCaret;
var SERVER = fixtures.SERVER;
var RTE = fixtures.RTE;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Gemerkte Cursorposition', { skip: !hasPlaywright }, function () {
  test('Panel fuegt an der zuletzt gesetzten Cursorposition ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    // Cursor in die Leerzeile setzen, dann ins Panel wechseln.
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel');
    await page.click('.jmd-panel [data-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben\nh1. Titel\nunten');
    await page.close();
  });

  test('Auswahl wird durch das Einfuegen ersetzt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'oben ERSETZEN unten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 13);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '**neu**');
    await page.click('.jmd-panel [data-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben *neu* unten');
    await page.close();
  });

  test('Position im Rich-Text-Editor ueberlebt den Wechsel ins Panel', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    // Zwei Absaetze anlegen und den Cursor in den ersten setzen.
    await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      doc.body.innerHTML = '<p id="a">AAA</p><p id="b">BBB</p>';
      var range = doc.createRange();
      range.setStart(doc.getElementById('a').firstChild, 3);
      range.collapse(true);
      var selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new Event('selectionchange'));
    });
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '**hier**');
    await page.click('.jmd-panel [data-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var wasCollapsedInA = await page.evaluate(function () {
      return window.__caretParagraph;
    });
    assert.strictEqual(wasCollapsedInA, 'a', 'Einfuegemarke lag nicht mehr im ersten Absatz');
    await page.close();
  });

  test('Einfuegen merkt die neue Position sofort', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Zeile1\nZeile2');
    await setCaret(page, 6);
    await page.evaluate(function () {
      var field = document.querySelector('#description');
      window.JiraEditors.insert(field, '{code}\nx\n{code}', 'block');
      // Fokus weg vom Feld nehmen (eigener Tick, damit der Fokuswechsel
      // wirklich greift) - die zweite Einfuegung muss trotzdem hinter dem
      // Codeblock landen, nicht an der Stelle von vor dem ersten Einfuegen.
      field.blur();
    });
    await page.waitForTimeout(50);
    await page.evaluate(function () {
      var field = document.querySelector('#description');
      window.JiraEditors.insert(field, 'ZWEI', 'insert');
    });
    assert.strictEqual(await page.inputValue('#description'),
      'Zeile1\n{code}\nx\n{code}ZWEI\nZeile2');
    await page.close();
  });
});
