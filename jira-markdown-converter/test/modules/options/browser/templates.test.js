/**
 * Optionsseite: Eigene Vorlagen anlegen, bearbeiten und loeschen; Grenzen der
 * Platzhalterzahl und Hinweise bei abweichender Platzhalterliste.
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

describe('Optionsseite: Eigene Vorlagen', { skip: !hasPlaywright }, function () {
  test('Anlegen einer Vorlage erzeugt eine Zeile in der Liste', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#tplTitle', 'Bug-Report');
    await page.fill('#tplMarkup', 'h3. ${Titel}');
    await page.click('#tplSave');
    await page.waitForSelector('.tpl-item');
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    var title = await page.locator('.tpl-item__title').innerText();
    assert.strictEqual(title, 'Bug-Report');
    // Leer gelassene Platzhalterliste ist "keine Reihenfolge vorgegeben",
    // nicht "unvollstaendig" - darf keinen Hinweis ausloesen.
    assert.strictEqual(await page.locator('#tplError').innerText(), '');
    await page.close();
  });

  test('sechs Platzhalter erzeugen eine Fehlermeldung und legen nichts an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#tplTitle', 'Zu viele Platzhalter');
    await page.fill('#tplMarkup', '${A} ${B} ${C} ${D} ${E} ${F}');
    await page.click('#tplSave');
    var error = await page.locator('#tplError').innerText();
    assert.ok(/hoechstens 5/i.test(error), 'Fehlermeldung: ' + error);
    assert.strictEqual(await page.locator('.tpl-item').count(), 0);
    await page.close();
  });

  test('Bearbeiten aendert den Titel, ohne die id zu wechseln', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, {
      customTemplates: [{ id: 'tpl-fix', title: 'Alt', templateMarkup: 'Text', placeholders: [] }]
    });
    await page.waitForSelector('.tpl-item');
    await page.click('[data-tpl-action="edit"]');
    await page.fill('#tplTitle', 'Neu');
    await page.click('#tplSave');
    await page.waitForTimeout(150);
    var local = await page.evaluate(function () { return window.__local.customTemplates; });
    assert.strictEqual(local.length, 1);
    assert.strictEqual(local[0].id, 'tpl-fix');
    assert.strictEqual(local[0].title, 'Neu');
    await page.close();
  });

  test('Loeschen entfernt die Zeile', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser, {
      customTemplates: [{ id: 'tpl-del', title: 'Weg damit', templateMarkup: 'Text', placeholders: [] }]
    });
    await page.waitForSelector('.tpl-item');
    await page.evaluate(function () { window.confirm = function () { return true; }; });
    await page.click('[data-tpl-action="delete"]');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('.tpl-item').count(), 0);
    var local = await page.evaluate(function () { return window.__local.customTemplates; });
    assert.deepStrictEqual(local, []);
    await page.close();
  });

  test('eine angelegte Vorlage landet in local, nicht in sync', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#tplTitle', 'Nur lokal');
    await page.fill('#tplMarkup', 'Text ohne Platzhalter');
    await page.click('#tplSave');
    await page.waitForTimeout(150);
    var local = await page.evaluate(function () { return window.__local.customTemplates; });
    var sync = await page.evaluate(function () { return window.__settings.customTemplates; });
    assert.strictEqual(local.length, 1);
    assert.strictEqual(sync, undefined);
    await page.close();
  });

  test('Platzhaltername "constructor" laesst sich speichern', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#tplTitle', 'Proto');
    await page.fill('#tplMarkup', 'h3. ${constructor} und ${Datum}');
    await page.fill('#tplPlaceholders', 'constructor, Datum');
    await page.click('#tplSave');
    var error = await page.locator('#tplError').innerText();
    assert.strictEqual(error, '');
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    await page.close();
  });

  test('fehlender Platzhalter in der Liste ist nur eine Warnung', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#tplTitle', 'Unvollstaendige Liste');
    await page.fill('#tplMarkup', 'h3. ${Titel} ${Datum}');
    await page.fill('#tplPlaceholders', 'Titel');
    await page.click('#tplSave');
    var hint = await page.locator('#tplError').innerText();
    assert.ok(/Datum/.test(hint), 'Hinweis: ' + hint);
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    await page.close();
  });

  test('Tippfehler in der Platzhalterliste ist nur eine Warnung', async function () {
    var browser = await browserPromise;
    var page = await browserLib.optionsPage(browser);
    await page.fill('#tplTitle', 'Tippfehler');
    await page.fill('#tplMarkup', 'h3. ${Titel}');
    await page.fill('#tplPlaceholders', 'Titel, Tippfehler');
    await page.click('#tplSave');
    var hint = await page.locator('#tplError').innerText();
    assert.ok(/Tippfehler/.test(hint), 'Hinweis: ' + hint);
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    await page.close();
  });
});
