/**
 * Kunden-Schluessel in der Feldleiste anreichern (Issue #32, Sub-Task 3):
 * Knopf "Keys" oeffnet seit Sub-Task 4 ein Dropdown (erweitertes
 * Editor-Dropdown) - der Eintrag "Im Feld ergaenzen" durchsucht den
 * Feldinhalt und haengt hinter jeden Treffer mit Mapping-Eintrag die
 * zugeordneten Jira-Keys in Klammern an - Textarea und Rich-Text-Editor. Der
 * zweite Eintrag "Aus Beschreibung uebernehmen" steht in
 * test/modules/mapping/browser/keysync.test.js und der dortigen
 * Content-Verdrahtung.
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
var RTE = fixtures.RTE;
var CLOUD = fixtures.CLOUD;
var KEYS_BUTTON = '.jmd-fieldbar__btn--keys';

var CUSTOMER_KEY_MAP = { 'ROV-1234': ['JIRA-567'] };

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/**
 * Oeffnet das Keys-Dropdown und waehlt "Im Feld ergaenzen" - seit Sub-Task 4
 * loest ein Klick auf den Knopf selbst nicht mehr direkt die Anreicherung
 * aus, siehe toggleMenu()/customerKeyMenuItems() in src/content.js.
 */
async function pickEnrich(page, button) {
  await button.click();
  await page.click('.jmd-panelmenu__item[data-template="enrich"]');
}

describe('Kunden-Schluessel in der Feldleiste', { skip: !hasPlaywright }, function () {
  test('ohne Zuordnungen ist der Knopf deaktiviert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().locator(KEYS_BUTTON);
    assert.strictEqual(await button.isDisabled(), true);
    await page.close();
  });

  test('mit Zuordnung reichert ein Klick den Textarea-Inhalt an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyMap: CUSTOMER_KEY_MAP }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.fill('#description', 'ROV-1234 offen');
    var button = page.locator('.jmd-fieldbar').first().locator(KEYS_BUTTON);
    assert.strictEqual(await button.isDisabled(), false);
    await pickEnrich(page, button);
    assert.strictEqual(await page.inputValue('#description'), 'ROV-1234 (JIRA-567) offen');
    await page.close();
  });

  test('ein zweiter Klick aendert den Text nicht mehr', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyMap: CUSTOMER_KEY_MAP }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.fill('#description', 'ROV-1234 offen');
    var button = page.locator('.jmd-fieldbar').first().locator(KEYS_BUTTON);
    await pickEnrich(page, button);
    assert.strictEqual(await page.inputValue('#description'), 'ROV-1234 (JIRA-567) offen');
    await pickEnrich(page, button);
    assert.strictEqual(await page.inputValue('#description'), 'ROV-1234 (JIRA-567) offen');
    await page.close();
  });

  test('ein Treffer ohne Mapping-Eintrag bleibt unveraendert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyMap: CUSTOMER_KEY_MAP }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.fill('#description', 'REFI-77 offen');
    var button = page.locator('.jmd-fieldbar').first().locator(KEYS_BUTTON);
    await pickEnrich(page, button);
    assert.strictEqual(await page.inputValue('#description'), 'REFI-77 offen');
    await page.close();
  });

  test('im Rich-Text-Editor wird nur nodeValue angefasst, Auszeichnung bleibt erhalten', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyMap: CUSTOMER_KEY_MAP }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      doc.body.innerHTML = '<p>Ticket <strong>ROV-1234</strong> offen</p>';
    });
    var before = await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      return {
        elementCount: doc.body.querySelectorAll('*').length,
        strongCount: doc.body.querySelectorAll('strong').length
      };
    });
    var button = page.locator('.jmd-fieldbar').first().locator(KEYS_BUTTON);
    assert.strictEqual(await button.isDisabled(), false);
    await pickEnrich(page, button);
    var after = await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      return {
        elementCount: doc.body.querySelectorAll('*').length,
        strongCount: doc.body.querySelectorAll('strong').length,
        text: doc.body.textContent
      };
    });
    assert.strictEqual(after.elementCount, before.elementCount,
      'die Zahl der Elemente im Editorkoerper hat sich veraendert');
    assert.strictEqual(after.strongCount, before.strongCount, 'die Auszeichnung <strong> ist verschwunden');
    assert.strictEqual(after.text, 'Ticket ROV-1234 (JIRA-567) offen');
    await page.close();
  });

  test('im nativen contenteditable-Feld (ProseMirror) meldet ein Klick eine Warnung', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyMap: CUSTOMER_KEY_MAP }, CLOUD);
    await page.waitForSelector('.jmd-fieldbar');
    await page.evaluate(function () {
      document.querySelector('.ProseMirror').textContent = 'Ticket ROV-1234 offen';
    });
    // CLOUD-Fixture in Dokumentreihenfolge: erst die Textarea "description",
    // danach der ProseMirror-Editor - dieselbe Reihenfolge, in der
    // Editors.findAllTargets() die Feldleisten anlegt.
    var button = page.locator('.jmd-fieldbar').nth(1).locator(KEYS_BUTTON);
    assert.strictEqual(await button.isDisabled(), false);
    await pickEnrich(page, button);
    var toastText = await page.textContent('.jmd-toast__text');
    assert.strictEqual(toastText, 'Dieses Feld kann nicht angereichert werden.');
    assert.strictEqual(await page.textContent('.ProseMirror'), 'Ticket ROV-1234 offen');
    await page.close();
  });
});
