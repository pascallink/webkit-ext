/**
 * Platzhalter-Dialog fuer eigene Vorlagen: Feldzahl, Einfuegen, Escape und
 * Fokusrueckgabe, Strg+Enter - sowie das Haerten der Vorlagen-Einfuegung
 * selbst (Cursorposition, Auswahl ersetzen, Zeilenumbrueche, Rich-Text).
 * Aufruf: npm run test:dialogs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var SERVER = fixtures.SERVER;
var RTE = fixtures.RTE;
var TEMPLATES_BUTTON = '.jmd-fieldbar__btn--templates';
var TEMPLATE_DIALOG = '.jmd-dialog[data-jmd-ui="template-dialog"]';

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Platzhalter-Dialog', { skip: !hasPlaywright }, function () {
  test('Vorlage mit zwei Platzhaltern oeffnet den Dialog mit zwei Feldern', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-two',
          title: 'Bug-Report',
          templateMarkup: 'h3. ${Titel}\n${Beschreibung}',
          placeholders: ['Titel', 'Beschreibung']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-two"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    var labels = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-role="tpl-fields"] label'), function (label) {
        return label.textContent;
      });
    });
    assert.deepStrictEqual(labels, ['Titel', 'Beschreibung']);
    assert.strictEqual(await page.locator('[data-role="tpl-fields"] input').count(), 2);
    await page.close();
  });

  test('Vorlage mit fuenf Platzhaltern zeigt fuenf Felder', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-five',
          title: 'Viele Platzhalter',
          templateMarkup: '${A} ${B} ${C} ${D} ${E}',
          placeholders: ['A', 'B', 'C', 'D', 'E']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-five"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    assert.strictEqual(await page.locator('[data-role="tpl-fields"] input').count(), 5);
    await page.close();
  });

  test('Eingabe und "Einfuegen" schreibt die Werte ins Feld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-insert',
          title: 'Bug-Report',
          templateMarkup: 'h3. ${Titel}\n${Beschreibung}',
          placeholders: ['Titel', 'Beschreibung']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-insert"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Titel"]', 'Login schlaegt fehl');
    await page.fill('[data-role="tpl-fields"] input[data-name="Beschreibung"]', 'Fehler nach dem Absenden');
    await page.click('[data-tpl-action="insert"]');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0);
    var value = await page.inputValue('#description');
    assert.strictEqual(value, 'h3. Login schlaegt fehl\nFehler nach dem Absenden');
    var focusedId = await page.evaluate(function () {
      return document.activeElement && document.activeElement.id;
    });
    assert.strictEqual(focusedId, 'description', 'Fokus liegt nach dem Einfuegen nicht mehr im Zielfeld');
    await page.close();
  });

  test('Escape schliesst den Dialog ohne einzufuegen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-escape', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-escape"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0);
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  test('Escape gibt den Fokus an den Vorlagen-Button zurueck', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-escape-focus', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-escape-focus"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.keyboard.press('Escape');
    var focusReturned = await page.evaluate(function () {
      var bar = document.querySelectorAll('.jmd-fieldbar')[0];
      var button = bar.querySelector('.jmd-fieldbar__btn--templates');
      return document.activeElement === button;
    });
    assert.strictEqual(focusReturned, true, 'Fokus ist nach Escape nicht auf den Vorlagen-Button zurueckgekehrt');
    await page.close();
  });

  test('Strg+Enter fuegt die Vorlage ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-ctrl-enter', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-ctrl-enter"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Titel"]', 'Schnelltest');
    await page.keyboard.press('Control+Enter');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0);
    assert.strictEqual(await page.inputValue('#description'), 'h3. Schnelltest');
    await page.close();
  });
});

describe('Eigene Vorlagen haerten', { skip: !hasPlaywright }, function () {
  test('Vorlage fuegt an der zuletzt gesetzten Cursorposition ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-caret', title: 'Status', templateMarkup: 'Status: Erledigt', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-caret"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben\nStatus: Erledigt\nunten');
    await page.close();
  });

  test('Vorlage ersetzt eine bestehende Auswahl', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-replace', title: 'Ersatz', templateMarkup: 'ERSATZ', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'oben ALT unten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 8);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-replace"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben ERSATZ unten');
    await page.close();
  });

  test('Einzeilige Vorlage erzeugt keine zusaetzliche Leerzeile', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-oneline', title: 'Einzeiler', templateMarkup: 'MITTE', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-oneline"]');
    assert.strictEqual(await page.inputValue('#description'), 'AMITTEB');
    await page.close();
  });

  test('Listen-Vorlage bekommt trotz Cursor mitten in der Zeile eigene Zeilen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-list', title: 'Liste', templateMarkup: '* Punkt eins', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-list"]');
    assert.strictEqual(await page.inputValue('#description'), 'A\n* Punkt eins\nB');
    await page.close();
  });

  test('Mehrzeilige Vorlage ohne Blockzeichen behaelt ihre Randumbrueche', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-multiline',
          title: 'Mehrzeilig',
          templateMarkup: 'Zeile eins\n{code}\nx\n{code}',
          placeholders: []
        }
      ]
    }, SERVER);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-multiline"]');
    assert.strictEqual(await page.inputValue('#description'), 'A\nZeile eins\n{code}\nx\n{code}\nB');
    await page.close();
  });

  test('Rich-Text mit switchToMarkup schaltet um und fuegt Markup ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      switchToMarkup: true,
      customTemplates: [
        { id: 'tpl-rte-switch', title: 'Status', templateMarkup: 'Status: Erledigt', placeholders: [] }
      ]
    }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-rte-switch"]');
    await page.waitForFunction(function () {
      return window.__mode === 'markup';
    }, null, { timeout: 4000 });
    assert.strictEqual(await page.inputValue('#description'), 'Status: Erledigt');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  test('Rich-Text ohne switchToMarkup fuegt Markup als Text ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-rte-plain', title: 'Status', templateMarkup: 'h3. Status: Erledigt', placeholders: [] }
      ]
    }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-rte-plain"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes[0].text.indexOf('Status: Erledigt') !== -1, true, 'Markup fehlt: ' + pastes[0].text);
    assert.ok(!pastes[0].html, 'Rich-Text haette kein HTML bekommen duerfen');
    assert.strictEqual(await page.evaluate(function () { return window.__mode; }), 'rich');
    await page.close();
  });

  test('Dialogwert mit Sonderzeichen landet maskiert im Feld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, {
      customTemplates: [
        { id: 'tpl-value-escape', title: 'Mit Wert', templateMarkup: 'h3. ${Wert}', placeholders: ['Wert'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-value-escape"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Wert"]', 'A{B}C|D[E]F');
    await page.click('[data-tpl-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'h3. A\\{B\\}C\\|D\\[E\\]F');
    await page.close();
  });
});
