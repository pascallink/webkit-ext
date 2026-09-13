/**
 * Optionsseite: Kunden-Schluessel-Zuordnung (Issue #32, Sub-Task 2) - Muster
 * validieren, Custom-Field-Name und Highlighting speichern, Tabelle als JSON
 * importieren/exportieren/zuruecksetzen.
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

describe('Optionsseite: Kunden-Schluessel', { skip: !hasPlaywright }, function () {
  test('ungueltiges Muster wird am Feld gemeldet, der gespeicherte Wert bleibt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, { customerKeyPattern: 'ROV-\\d+' });
    await page.fill('#customerKeyPattern', '(');
    await page.waitForFunction(function () {
      return document.getElementById('ckPatternError').textContent !== '';
    }, null, { timeout: 2000 });
    var error = await page.locator('#ckPatternError').innerText();
    assert.ok(/ungueltig/i.test(error), 'Fehlermeldung: ' + error);
    var hasErrorClass = await page.locator('#customerKeyPattern').evaluate(function (el) {
      return el.classList.contains('area--error');
    });
    assert.strictEqual(hasErrorClass, true);
    // scheduleSave() speichert 400 ms nach dem letzten input-Ereignis.
    await page.waitForTimeout(600);
    var stored = await page.evaluate(function () { return window.__settings.customerKeyPattern; });
    assert.strictEqual(stored, 'ROV-\\d+');
    await page.close();
  });

  test('gueltiges Muster wird gespeichert und ueberlebt ein Neuladen der Seite', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#customerKeyPattern', 'ROV-\\d+');
    await page.waitForFunction(function () {
      return window.__settings.customerKeyPattern === 'ROV-\\d+';
    }, null, { timeout: 2000 });
    var stored = await page.evaluate(function () {
      return Object.assign({}, window.__settings, window.__local);
    });
    await page.close();

    // chrome.storage waere im echten Browser persistent - eine frische Seite
    // mit genau diesem gespeicherten Stand als Ausgangswerte simuliert das
    // Neuladen fuer den Stub aus test/lib/page-stub.js.
    var reloaded = await browserLib.optionsPage(browser, stored);
    assert.strictEqual(await reloaded.inputValue('#customerKeyPattern'), 'ROV-\\d+');
    await reloaded.close();
  });

  test('Import einer gueltigen JSON-Tabelle fuellt ckCount und den Storage', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#ckJson', JSON.stringify({ 'ROV-1': ['JIRA-1'], 'REFI-2': ['JIRA-2'] }));
    await page.click('#ckImport');
    await page.waitForFunction(function () {
      return window.__local.customerKeyMap && Object.keys(window.__local.customerKeyMap).length === 2;
    }, null, { timeout: 2000 });
    assert.strictEqual(await page.locator('#ckCount').innerText(), '2 Zuordnungen gespeichert.');
    var stored = await page.evaluate(function () { return window.__local.customerKeyMap; });
    assert.deepStrictEqual(stored, { 'ROV-1': ['JIRA-1'], 'REFI-2': ['JIRA-2'] });
    await page.close();
  });

  test('Import von kaputtem JSON meldet den Fehler und aendert nichts', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, { customerKeyMap: { 'ROV-9': ['JIRA-9'] } });
    await page.fill('#ckJson', '{ kaputt');
    await page.click('#ckImport');
    await page.waitForFunction(function () {
      return document.getElementById('ckStatus').textContent !== '';
    }, null, { timeout: 2000 });
    var status = await page.locator('#ckStatus').innerText();
    assert.ok(status.length > 0, 'Statusmeldung: ' + status);
    var hasErrorClass = await page.locator('#ckStatus').evaluate(function (el) {
      return el.classList.contains('status--error');
    });
    assert.strictEqual(hasErrorClass, true);
    var stored = await page.evaluate(function () { return window.__local.customerKeyMap; });
    assert.deepStrictEqual(stored, { 'ROV-9': ['JIRA-9'] });
    await page.close();
  });

  test('Import mit String-Werten ergibt zwei Ziele', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#ckJson', JSON.stringify({ 'ROV-1': 'JIRA-1, JIRA-2' }));
    await page.click('#ckImport');
    await page.waitForFunction(function () {
      return !!(window.__local.customerKeyMap && window.__local.customerKeyMap['ROV-1']);
    }, null, { timeout: 2000 });
    var stored = await page.evaluate(function () { return window.__local.customerKeyMap['ROV-1']; });
    assert.deepStrictEqual(stored, ['JIRA-1', 'JIRA-2']);
    await page.close();
  });

  test('Export schreibt genau die normalisierte Tabelle in ckJson', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, {
      customerKeyMap: { 'rov-1': ['Jira-1', 'jira-1', 'JIRA-2'] }
    });
    await page.click('#ckExport');
    var expected = JSON.stringify({ 'ROV-1': ['Jira-1', 'JIRA-2'] }, null, 2);
    assert.strictEqual(await page.inputValue('#ckJson'), expected);
    await page.close();
  });

  test('Reset loescht erst beim zweiten Klick und laesst customerKeyPattern unveraendert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, {
      customerKeyPattern: 'ROV-\\d+',
      customerKeyMap: { 'ROV-1': ['JIRA-1'] }
    });
    await page.click('#ckReset');
    assert.strictEqual(await page.locator('#ckReset').innerText(), 'Wirklich loeschen?');
    var stillThere = await page.evaluate(function () { return window.__local.customerKeyMap; });
    assert.deepStrictEqual(stillThere, { 'ROV-1': ['JIRA-1'] });

    await page.click('#ckReset');
    await page.waitForFunction(function () {
      return window.__local.customerKeyMap && Object.keys(window.__local.customerKeyMap).length === 0;
    }, null, { timeout: 2000 });
    assert.strictEqual(await page.locator('#ckReset').innerText(), 'Tabelle zuruecksetzen');
    var pattern = await page.evaluate(function () { return window.__settings.customerKeyPattern; });
    assert.strictEqual(pattern, 'ROV-\\d+');
    await page.close();
  });
});
