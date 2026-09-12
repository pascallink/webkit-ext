/**
 * Popup: Vorschau der Umwandlung beim Tippen und der Schalter fuer die
 * Einfuege-Automatik. Rest der Bedienung (Einfuegen in Jira, Freigabe
 * weiterer Hosts) braucht einen echten Tab und bleibt hier aussen vor.
 * Aufruf: npm run test:popup --prefix jira-markdown-converter
 *
 * Tests klicken auf .switch__track statt #convertOnPaste, weil popup.css:184
 * die Checkbox mit 1x1 px und opacity: 0 versteckt - der Klick auf das
 * sichtbare Gleis ist der Nutzerpfad, waehrend ein Klick auf die versteckte
 * Checkbox von Playwrights Sichtbarkeitspruefung abhaengig waere und damit fragil.
 * Seit dem OTRS-Schalter gibt es zwei .switch__track im Popup - der Klick
 * scopet darum auf #toggleCard bzw. #otrsToggleCard.
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Popup', { skip: !hasPlaywright }, function () {
  test('Vorschau wandelt eingefuegtes Markdown sofort um', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser);
    await page.fill('#input', '# Titel');
    assert.strictEqual(await page.inputValue('#output'), 'h1. Titel');
    await page.close();
  });

  test('geleerte Eingabe leert auch die Vorschau', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser);
    await page.fill('#input', '# Titel');
    await page.fill('#input', '');
    assert.strictEqual(await page.inputValue('#output'), '');
    await page.close();
  });

  test('Schalter startet mit dem gespeicherten Zustand', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser, { convertOnPaste: false });
    assert.strictEqual(await page.isChecked('#convertOnPaste'), false);
    var label = await page.locator('#toggleLabel').innerText();
    assert.ok(/aus$/.test(label), 'Beschriftung: ' + label);
    await page.close();
  });

  test('Umschalten schreibt convertOnPaste in den Storage', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser);
    await page.click('#toggleCard .switch__track');
    await page.waitForFunction(function () { return window.__settings.convertOnPaste === false; });
    assert.strictEqual(await page.isChecked('#convertOnPaste'), false);
    var label = await page.locator('#toggleLabel').innerText();
    assert.ok(/aus$/.test(label), 'Beschriftung: ' + label);
    await page.close();
  });

  test('erneutes Umschalten setzt convertOnPaste wieder auf an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser, { convertOnPaste: false });
    await page.click('#toggleCard .switch__track');
    await page.waitForFunction(function () { return window.__settings.convertOnPaste === true; });
    assert.strictEqual(await page.isChecked('#convertOnPaste'), true);
    await page.close();
  });

  test('Schalter otrsHelper startet mit dem gespeicherten Zustand', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser, { otrsHelper: false });
    assert.strictEqual(await page.isChecked('#otrsHelper'), false);
    await page.close();
  });

  test('Umschalten schreibt otrsHelper in den Storage', async function () {
    var browser = await browserPromise;
    var page = await browserLib.popupPage(browser);
    assert.strictEqual(await page.isChecked('#otrsHelper'), true);
    await page.click('#otrsToggleCard .switch__track');
    await page.waitForFunction(function () { return window.__settings.otrsHelper === false; });
    assert.strictEqual(await page.isChecked('#otrsHelper'), false);
    await page.close();
  });
});
