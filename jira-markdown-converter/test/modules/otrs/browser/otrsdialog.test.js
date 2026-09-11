/**
 * Tests fuer JiraOtrsDialog (src/otrsdialog.js) gegen die AUI-Fixture
 * mock-jira-otrs.html: Dialog oeffnen, Eingabe verarbeiten, Tastatursteuerung.
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
 * Laedt die OTRS-Fixture mit Dialogen und otrsdialog.js - nicht newPage()
 * aus lib/browser, wie in jiraui.test.js und otrsflow.test.js.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(OTRS_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/otrslink.js') });
  await page.addScriptTag({ content: browserLib.readSource('src/otrsdialog.js') });
  return page;
}

describe('JiraOtrsDialog - Tastatursteuerung Control+Enter', { skip: !hasPlaywright }, function () {
  test('Strg+Enter ohne Eingabe meldet den Fehler statt abzusenden', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__submitted = [];
      window.__errors = [];
      window.JiraOtrsDialog.open({
        onSubmit: function (parsed) {
          window.__submitted.push(parsed);
        },
        onError: function (msg) {
          window.__errors.push(msg);
        }
      });
    });
    await page.press('#jmd-otrs-input', 'Control+Enter');
    var submitted = await page.evaluate(function () { return window.__submitted; });
    var errors = await page.evaluate(function () { return window.__errors; });
    var isOpen = await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); });
    assert.strictEqual(submitted.length, 0, '__submitted haette leer sein sollen');
    assert.deepStrictEqual(errors, ['Eingabe ist leer.'], '__errors haette genau eine Nachricht sein sollen');
    assert.strictEqual(isOpen, true, 'Dialog haette offen bleiben sollen');
    await page.close();
  });

  test('Strg+Enter bei ungueltiger Eingabe sendet nicht ab', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__submitted = [];
      window.__errors = [];
      window.JiraOtrsDialog.open({
        onSubmit: function (parsed) {
          window.__submitted.push(parsed);
        },
        onError: function (msg) {
          window.__errors.push(msg);
        }
      });
    });
    await page.fill('#jmd-otrs-input', 'Text ohne jede URL');
    await page.press('#jmd-otrs-input', 'Control+Enter');
    var submitted = await page.evaluate(function () { return window.__submitted; });
    var errors = await page.evaluate(function () { return window.__errors; });
    var isOpen = await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); });
    assert.strictEqual(submitted.length, 0, '__submitted haette leer sein sollen');
    assert.ok(errors.length > 0, '__errors haette nicht leer sein sollen');
    assert.strictEqual(isOpen, true, 'Dialog haette offen bleiben sollen');
    await page.close();
  });
});
