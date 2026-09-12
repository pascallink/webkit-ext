/**
 * Undo-Verhalten der Textarea nach dem automatischen Einfuegen: Strg+Z darf
 * nur die eingefuegte Umwandlung zuruecknehmen, nicht den zuvor getippten
 * Text loeschen (Issue #96).
 * Aufruf: npm run test:editors --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var SERVER = require('../../../lib/fixtures').SERVER;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

// Das Undo-Kommando des Browsers haengt an unterschiedlichen Tasten: auf
// macOS an Cmd+Z, auf Windows/Linux an Strg+Z. Nur die zur Plattform des
// Testlaufs passende Taste loest den echten Undo-Stack der Textarea aus.
var UNDO_KEY = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';

describe('Undo nach der Einfuege-Automatik', { skip: !hasPlaywright }, function () {
  test('Strg+Z nimmt nur die eingefuegte Umwandlung zurueck', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.keyboard.type('Vorher ');
    await page.evaluate(function () {
      var field = document.querySelector('#description');
      window.JiraEditors.insert(field, 'h1. Titel', 'insert');
    });
    await page.keyboard.press(UNDO_KEY);
    assert.strictEqual(await page.inputValue('#description'), 'Vorher ');
    await page.close();
  });

  test('Modus replace bleibt undo-faehig', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Alter Inhalt');
    await page.focus('#description');
    await page.evaluate(function () {
      var field = document.querySelector('#description');
      window.JiraEditors.insert(field, 'h1. Titel', 'replace');
    });
    await page.keyboard.press(UNDO_KEY);
    assert.strictEqual(await page.inputValue('#description'), 'Alter Inhalt');
    await page.close();
  });
});
