/**
 * Optionsseite: Schalter otrsHelper und Textfeld otrsFieldName fuer den
 * OTRS-Link-Helfer - Start mit dem gespeicherten Zustand, Schreiben in den
 * Storage.
 * Aufruf: npm run test:options --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Optionsseite: OTRS-Link-Helfer', { skip: !hasPlaywright }, function () {
  test('Schalter und Feldname starten mit dem gespeicherten Zustand', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, { otrsHelper: false, otrsFieldName: 'Referenz' });
    assert.strictEqual(await page.isChecked('#otrsHelper'), false);
    assert.strictEqual(await page.inputValue('#otrsFieldName'), 'Referenz');
    await page.close();
  });

  test('Umschalten schreibt otrsHelper in den Storage', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    assert.strictEqual(await page.isChecked('#otrsHelper'), true);
    await page.click('#otrsToggleCard .switch__track');
    await page.waitForFunction(function () { return window.__settings.otrsHelper === false; });
    await page.close();
  });

  test('Feldname landet nach dem Speichern im Storage', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#otrsFieldName', 'Kundenreferenz Neu');
    await page.waitForFunction(function () {
      return window.__settings.otrsFieldName === 'Kundenreferenz Neu';
    }, null, { timeout: 2000 });
    await page.close();
  });
});
