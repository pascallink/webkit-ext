/**
 * Vorschau und Einfuegen ueber das Panel: Vorschau, die vier Einfuegewege
 * (insert/replace/from-field/pick) und die beiden Kopierknoepfe.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var stubClipboard = require('../../../lib/dom').stubClipboard;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Vorschau und Einfuegen ueber das Panel', { skip: !hasPlaywright }, function () {
  test('Vorschau zeigt Jira-Markup', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel\n\n- **fett**');
    assert.strictEqual(await page.inputValue('#jmd-output'), 'h1. Titel\n\n* *fett*');
    await page.close();
  });

  test('Einfuegen schreibt in die Textarea', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.focus('#description');
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '## Schritte\n\n1. eins\n2. zwei');
    await page.click('.jmd-panel [data-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'h2. Schritte\n\n# eins\n# zwei');
    await page.close();
  });

  test('Feld ersetzen ueberschreibt vorhandenen Inhalt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.fill('#description', 'alter Inhalt');
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Neu');
    await page.click('.jmd-panel [data-action="pick"]');
    await page.click('#description');
    await page.click('.jmd-panel [data-action="replace"]');
    assert.strictEqual(await page.inputValue('#description'), 'h1. Neu');
    await page.close();
  });

  test('Aus Zielfeld uebernimmt den Feldinhalt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.fill('#description', '# Aus dem Feld');
    await page.focus('#description');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="from-field"]');
    assert.strictEqual(await page.inputValue('#jmd-input'), '# Aus dem Feld');
    assert.strictEqual(await page.inputValue('#jmd-output'), 'h1. Aus dem Feld');
    await page.close();
  });

  test('Panel kopiert das Jira-Markup', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await stubClipboard(page);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel');
    await page.click('.jmd-panel [data-action="copy"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied[0]; }),
      { kind: 'text', text: 'h1. Titel' });
    await page.close();
  });

  test('Panel kopiert formatiert mit Markup als Rueckfalltext', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await stubClipboard(page);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel\n\n- **fett**');
    await page.click('.jmd-panel [data-action="copy-html"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    var copied = await page.evaluate(function () { return window.__copied[0]; });
    assert.strictEqual(copied.kind, 'html', 'nicht als text/html kopiert');
    assert.strictEqual(copied.html, '<h1>Titel</h1>\n\n<ul><li><strong>fett</strong></li></ul>');
    assert.strictEqual(copied.text, 'h1. Titel\n\n* *fett*');
    await page.close();
  });

  test('leeres Panel kopiert nichts', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await stubClipboard(page);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="copy-html"]');
    await page.click('.jmd-panel [data-action="copy"]');
    await page.waitForTimeout(200);
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied; }), []);
    await page.close();
  });
});
