/**
 * Oberflaeche: schwebender Button, Buttonleisten an den Editoren, Panel
 * oeffnen/schliessen. Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Oberflaeche', { skip: !hasPlaywright }, function () {
  test('schwebender Button wird eingebaut', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 1);
    await page.close();
  });

  test('Buttonleiste erscheint an beiden Editoren', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.waitForSelector('.jmd-fieldbar');
    var count = await page.locator('.jmd-fieldbar').count();
    assert.strictEqual(count, 2, 'erwartet: Leiste an Textarea und Rich-Text-Editor, gefunden: ' + count);
    await page.close();
  });

  test('Suchfeld wird nicht als Ziel angeboten', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    var isTarget = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().some(function (element) {
        return element.id === 'quickSearchInput';
      });
    });
    assert.strictEqual(isTarget, false);
    await page.close();
  });

  test('Panel oeffnet und schliesst', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.click('.jmd-fab');
    assert.ok(await page.locator('.jmd-panel--open').count());
    await page.click('.jmd-panel [data-action="close"]');
    assert.strictEqual(await page.locator('.jmd-panel--open').count(), 0);
    await page.close();
  });
});
