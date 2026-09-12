/**
 * Kopieren und Einfuegen auf http-Instanzen: dort fehlt navigator.clipboard
 * komplett, Panel und Feldleiste muessen trotzdem funktionieren.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');
var stubLegacyClipboard = require('../../../lib/dom').stubLegacyClipboard;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Zwischenablage ohne Clipboard-API', { skip: !hasPlaywright }, function () {
  test('Panel kopiert Markup ohne Clipboard-API', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.SERVER);
    await stubLegacyClipboard(page);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel');
    await page.click('.jmd-panel [data-action="copy"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied[0]; }),
      { kind: 'text', text: 'h1. Titel' });
    var toastText = await page.textContent('.jmd-toast');
    assert.strictEqual(toastText, 'Jira-Markup kopiert.');
    await page.close();
  });

  test('Panel kopiert formatiert ohne Clipboard-API', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.SERVER);
    await stubLegacyClipboard(page);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel\n\n- **fett**');
    await page.click('.jmd-panel [data-action="copy-html"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    var copied = await page.evaluate(function () { return window.__copied[0]; });
    assert.strictEqual(copied.kind, 'html', 'nicht ueber execCommand als html kopiert');
    assert.strictEqual(copied.html, '<h1>Titel</h1>\n\n<ul><li><strong>fett</strong></li></ul>');
    assert.strictEqual(copied.text, 'h1. Titel\n\n* *fett*');
    var toastText = await page.textContent('.jmd-toast');
    assert.strictEqual(toastText, 'Formatiert kopiert.');
    await page.close();
  });
});
