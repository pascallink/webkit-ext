/**
 * Eigene Vorlagen in der Feldleiste: Menue aus customTemplates aufbauen,
 * Vorlagen ohne und mit Platzhaltern einfuegen, Menue schliessen.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var SERVER = fixtures.SERVER;
var TEMPLATES_BUTTON = '.jmd-fieldbar__btn--templates';
var TEMPLATE_DIALOG = '.jmd-dialog[data-jmd-ui="template-dialog"]';

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Eigene Vorlagen in der Feldleiste', { skip: !hasPlaywright }, function () {
  test('ohne Vorlagen ist der Button deaktiviert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON);
    assert.strictEqual(await button.isDisabled(), true);
    await page.close();
  });

  test('mit zwei Vorlagen oeffnet der Klick ein Menue mit zwei Eintraegen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-1', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] },
        { id: 'tpl-2', title: 'Ohne Platzhalter', templateMarkup: 'Text', placeholders: [] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON);
    assert.strictEqual(await button.isDisabled(), false);
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    var labels = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.jmd-panelmenu__item'), function (item) {
        return item.textContent;
      });
    });
    assert.deepStrictEqual(labels, ['Bug-Report', 'Ohne Platzhalter']);
    await page.close();
  });

  test('Vorlage ohne Platzhalter landet vollstaendig im Feld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-plain', title: 'Ohne Platzhalter', templateMarkup: 'h3. Fixer Text', placeholders: [] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-plain"]');
    assert.strictEqual(await page.inputValue('#description'), 'h3. Fixer Text');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0,
      'Vorlage ohne Platzhalter hat den Dialog geoeffnet');
    await page.close();
  });

  test('Vorlage mit Platzhaltern schreibt Markup ohne ${ nach dem Dialog', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-ph',
          title: 'Mit Platzhaltern',
          templateMarkup: 'h3. ${Titel}\n${Beschreibung}',
          placeholders: ['Titel', 'Beschreibung']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-ph"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Titel"]', 'Titel');
    await page.fill('[data-role="tpl-fields"] input[data-name="Beschreibung"]', 'Beschreibung');
    await page.click('[data-tpl-action="insert"]');
    var value = await page.inputValue('#description');
    assert.strictEqual(value, 'h3. Titel\nBeschreibung');
    assert.ok(value.indexOf('${') === -1, 'Platzhalter ist unersetzt geblieben: ' + value);
    await page.close();
  });

  test('Platzhalter mit Sonderzeichen wird nach dem Dialog maskiert markiert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-special',
          title: 'Sonderzeichen',
          templateMarkup: 'h3. ${Modul [Bereich]}',
          placeholders: ['Modul [Bereich]']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-special"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Modul [Bereich]"]', 'Modul [Bereich]');
    await page.click('[data-tpl-action="insert"]');
    var selection = await page.evaluate(function () {
      var field = document.querySelector('#description');
      return {
        value: field.value,
        selected: field.value.substring(field.selectionStart, field.selectionEnd)
      };
    });
    assert.strictEqual(selection.value, 'h3. Modul \\[Bereich\\]');
    assert.strictEqual(selection.selected, 'Modul \\[Bereich\\]');
    await page.close();
  });

  test('Escape und ein zweiter Klick schliessen das Menue', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-1', title: 'Bug-Report', templateMarkup: 'Text', placeholders: [] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON);
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.jmd-panelmenu').count(), 0, 'Escape hat nicht geschlossen');
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    await button.click();
    assert.strictEqual(await page.locator('.jmd-panelmenu').count(), 0, 'zweiter Klick hat nicht geschlossen');
    await page.close();
  });
});
