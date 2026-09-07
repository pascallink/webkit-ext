/**
 * Robustheit: keine Konsolenfehler beim Laden, kein doppelter Einbau bei
 * doppeltem Laden der Quellen.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var path = require('path');
var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

var root = path.join(__dirname, '..', '..', '..', '..');

describe('Robustheit', { skip: !hasPlaywright }, function () {
  test('kein Fehler in der Konsole beim Laden', async function () {
    var browser = await browserPromise;
    var context = await browser.newContext();
    var page = await context.newPage();
    var errors = [];
    page.on('pageerror', function (error) {
      errors.push(String(error));
    });
    page.on('console', function (message) {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('file://' + path.join(root, 'test', 'fixtures', fixtures.CLOUD));
    await page.addScriptTag({ content: browserLib.CHROME_STUB });
    for (var i = 0; i < browserLib.SOURCES.length; i++) {
      await page.addScriptTag({ content: browserLib.readSource(browserLib.SOURCES[i]) });
    }
    await page.waitForSelector('.jmd-fab');
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Test');
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  test('doppeltes Laden baut nichts doppelt ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    for (var i = 0; i < browserLib.SOURCES.length; i++) {
      await page.addScriptTag({ content: browserLib.readSource(browserLib.SOURCES[i]) });
    }
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 1);
    assert.strictEqual(await page.locator('.jmd-fieldbar').count(), 2);
    await page.close();
  });
});
