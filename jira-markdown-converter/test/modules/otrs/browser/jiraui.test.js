/**
 * Tests fuer JiraUi (src/jiraui.js) gegen die AUI-Fixture mock-jira-otrs.html:
 * Elemente werden per MutationObserver statt Polling gefunden, auch wenn sie
 * erst verzoegert (setTimeout 120 ms) ins DOM kommen.
 * Aufruf: npm run test:otrs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

var OTRS_FIXTURE = 'file://' + path.join(__dirname, '..', '..', '..', 'fixtures', fixtures.OTRS);

/**
 * Laedt die OTRS-Fixture mit nur settings.js und jiraui.js - nicht newPage()
 * aus lib/browser: das laedt den vollen Content-Script-Stack aus
 * content_scripts[0] und wartet auf .jmd-fab, beides fuer diesen reinen
 * DOM-Helfer unnoetig und auf der Server-Fixture auch nicht vorhanden.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(OTRS_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  return page;
}

describe('JiraUi - DOM-Helfer gegen AUI-Dialoge', { skip: !hasPlaywright }, function () {
  test('waitForElement findet ein sofort vorhandenes Element', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var text = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#key-val', { timeout: 500 }).then(function (element) {
        return element.textContent;
      });
    });
    assert.strictEqual(text, 'PROJ-123');
    await page.close();
  });

  test('waitForElement findet ein nach 120 ms eingefuegtes Element', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var found = await page.evaluate(function () {
      window.JiraUi.sendKey(document.body, '.');
      return window.JiraUi.waitForElement('#quick-search-dialog', { timeout: 1000 }).then(function () {
        return true;
      });
    });
    assert.strictEqual(found, true);
    await page.close();
  });

  test('waitForElement laeuft bei timeout: 200 auf einen Fehler', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var message = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#nie-vorhanden', { timeout: 200 }).then(function () {
        return 'aufgeloest statt abgelehnt';
      }, function (error) {
        return error.message;
      });
    });
    assert.strictEqual(message, 'Element nicht gefunden: #nie-vorhanden');
    await page.close();
  });

  test('setValue schreibt den Wert und loest genau ein input-Ereignis aus', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__openCustomFieldDialog();
    });
    var result = await page.evaluate(function () {
      return window.JiraUi.waitForElement('#customfield_11000', { timeout: 1000 }).then(function (field) {
        var inputEvents = 0;
        field.addEventListener('input', function () {
          inputEvents++;
        });
        window.JiraUi.setValue(field, 'Neuer Wert');
        return { value: field.value, inputEvents: inputEvents };
      });
    });
    assert.strictEqual(result.value, 'Neuer Wert');
    assert.strictEqual(result.inputEvents, 1);
    await page.close();
  });

  test("sendKey(document.body, 'l') blendet das Label-Modal ein", async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var found = await page.evaluate(function () {
      window.JiraUi.sendKey(document.body, 'l');
      return window.JiraUi.waitForElement('#edit-labels-dialog', { timeout: 1000 }).then(function () {
        return true;
      });
    });
    assert.strictEqual(found, true);
    await page.close();
  });
});
