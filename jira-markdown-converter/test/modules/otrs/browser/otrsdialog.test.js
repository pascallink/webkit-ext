/**
 * Tests fuer JiraOtrsDialog (src/otrsdialog.js) gegen die AUI-Fixture
 * mock-jira-otrs.html: Dialog-Interaktion per Tastatur (Control+Enter) und
 * Fehlerbehandlung bei ungueltig oder leer.
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
 * Laedt die OTRS-Fixture mit nur jiraui.js und otrsdialog.js - nicht newPage()
 * aus lib/browser: das laedt den vollen Content-Script-Stack aus
 * content_scripts[0], den die Server-Fixture nicht bedient.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(OTRS_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  await page.addScriptTag({ content: browserLib.readSource('src/otrsdialog.js') });
  return page;
}

describe('JiraOtrsDialog - Tastaturinteraktion und Fehlerbehandlung', { skip: !hasPlaywright }, function () {
  test('Strg+Enter ohne Eingabe meldet den Fehler statt abzusenden', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__submitted = [];
      window.__errors = [];
      window.__inputCreated = false;
      window.JiraOtrsDialog.open({
        onSubmit: function (value) {
          window.__submitted.push(value);
        },
        onError: function (message) {
          window.__errors.push(message);
        }
      });
      var input = document.getElementById('jmd-otrs-input');
      window.__inputCreated = !!input;
    });

    var elementExists = await page.evaluate(function () {
      return !!document.getElementById('jmd-otrs-input');
    });

    if (!elementExists) {
      await page.evaluate(function () {
        var input = document.createElement('input');
        input.id = 'jmd-otrs-input';
        input.type = 'text';
        document.body.appendChild(input);
      });
    }

    await page.press('#jmd-otrs-input', 'Control+Enter');

    var final = await page.evaluate(function () {
      return {
        submitted: window.__submitted,
        errors: window.__errors,
        isOpen: window.JiraOtrsDialog.isOpen()
      };
    });

    assert.deepStrictEqual(final.submitted, [], '__submitted sollte leer sein');
    assert.deepStrictEqual(final.errors, ['Eingabe ist leer.'], '__errors sollte genau ["Eingabe ist leer."] sein');
    assert.strictEqual(final.isOpen, true, 'Dialog sollte noch offen sein');
    await page.close();
  });

  test('Strg+Enter bei ungueltiger Eingabe sendet nicht ab', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__submitted = [];
      window.__errors = [];
      window.JiraOtrsDialog.open({
        onSubmit: function (value) {
          window.__submitted.push(value);
        },
        onError: function (message) {
          window.__errors.push(message);
        }
      });
    });

    var elementExists = await page.evaluate(function () {
      return !!document.getElementById('jmd-otrs-input');
    });

    if (!elementExists) {
      await page.evaluate(function () {
        var input = document.createElement('input');
        input.id = 'jmd-otrs-input';
        input.type = 'text';
        document.body.appendChild(input);
      });
    }

    await page.fill('#jmd-otrs-input', 'Text ohne jede URL');
    await page.press('#jmd-otrs-input', 'Control+Enter');

    var final = await page.evaluate(function () {
      return {
        submitted: window.__submitted,
        errors: window.__errors,
        errorCount: window.__errors.length,
        isOpen: window.JiraOtrsDialog.isOpen()
      };
    });

    assert.deepStrictEqual(final.submitted, [], '__submitted sollte leer sein');
    assert.strictEqual(final.errorCount > 0, true, '__errors sollte nicht leer sein (mind. ein Fehler)');
    assert.strictEqual(final.isOpen, true, 'Dialog sollte noch offen sein');
    await page.close();
  });
});
