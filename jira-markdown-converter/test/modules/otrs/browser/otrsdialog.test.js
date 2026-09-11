/**
 * Tests fuer JiraOtrsDialog (src/otrsdialog.js): Oeffnen/Schliessen, die
 * Live-Vorschau ueber JiraOtrsLink.parse() und die Weitergabe des Ergebnisses
 * per handlers.onSubmit. Der Dialog kennt Jira nicht - die AUI-Fixture dient
 * hier nur als Trageseite fuer document.body, keine ihrer Dialoge wird
 * angefasst.
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
var OtrsLink = require(path.join(__dirname, '..', '..', '..', '..', 'src', 'otrslink.js'));

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

var OTRS_FIXTURE = 'file://' + path.join(__dirname, '..', '..', '..', 'fixtures', fixtures.OTRS);

var TITLE = 'Ticket#2026070710000078 - REFI PU 47.2 - Probleme mit ...';
var URL = 'https://support.inxire.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=15285;ArticleID=102557';
var LINK = '[' + TITLE + '](' + URL + ')';
var PARSED = OtrsLink.parse(LINK);

/**
 * Laedt die OTRS-Fixture mit nur otrslink.js und otrsdialog.js - nicht
 * newPage() aus lib/browser, wie schon in jiraui.test.js: das laedt den
 * vollen Content-Script-Stack aus content_scripts[0], den die Server-Fixture
 * nicht bedient. Die Fixture liefert hier nur ein document.body, keine ihrer
 * eigenen Dialoge kommt zum Einsatz.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(OTRS_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/otrslink.js') });
  await page.addScriptTag({ content: browserLib.readSource('src/otrsdialog.js') });
  return page;
}

describe('JiraOtrsDialog - Eingabedialog', { skip: !hasPlaywright }, function () {
  test('Dialog oeffnet und schliesst wieder', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.JiraOtrsDialog.open({});
    });
    assert.strictEqual(await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); }), true);
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog nicht offen');
    await page.evaluate(function () {
      window.JiraOtrsDialog.close();
    });
    assert.strictEqual(await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); }), false);
    assert.strictEqual(await page.locator('.jmd-dialog--open').count(), 0);
    await page.close();
  });

  test('Eingabe des Beispiels fuellt alle drei Vorschauzeilen', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.JiraOtrsDialog.open({});
    });
    await page.fill('#jmd-otrs-input', LINK);
    var preview = await page.evaluate(function () {
      return {
        label: document.querySelector('[data-role="preview-label"]').textContent,
        reference: document.querySelector('[data-role="preview-reference"]').textContent,
        link: document.querySelector('[data-role="preview-link"]').textContent,
        error: document.querySelector('[data-role="otrs-error"]').textContent,
        disabled: document.querySelector('[data-otrs-action="submit"]').disabled
      };
    });
    assert.strictEqual(preview.label, PARSED.label);
    assert.strictEqual(preview.reference, PARSED.reference);
    assert.strictEqual(preview.link, PARSED.linkText + ' (' + PARSED.url + ')');
    assert.strictEqual(preview.error, '');
    assert.strictEqual(preview.disabled, false);
    await page.close();
  });

  test('unbrauchbare Eingabe zeigt den Fehlertext und sperrt Absenden', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.JiraOtrsDialog.open({});
    });
    await page.fill('#jmd-otrs-input', 'Text ohne jede URL');
    var state = await page.evaluate(function () {
      return {
        error: document.querySelector('[data-role="otrs-error"]').textContent,
        disabled: document.querySelector('[data-otrs-action="submit"]').disabled
      };
    });
    assert.ok(state.error.length > 0, 'kein Fehlertext angezeigt');
    assert.strictEqual(state.disabled, true, 'Absenden ist nicht gesperrt');
    await page.close();
  });

  test('onSubmit bekommt das Objekt aus JiraOtrsLink.parse', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__submitted = [];
      window.JiraOtrsDialog.open({
        onSubmit: function (parsed) { window.__submitted.push(parsed); }
      });
    });
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    var submitted = await page.evaluate(function () { return window.__submitted; });
    assert.strictEqual(submitted.length, 1, 'onSubmit wurde nicht (genau einmal) aufgerufen');
    assert.deepStrictEqual(submitted[0], PARSED);
    assert.strictEqual(await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); }), false,
      'Dialog haette nach erfolgreichem Absenden schliessen muessen');
    await page.close();
  });

  test('Escape schliesst den Dialog', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.JiraOtrsDialog.open({});
    });
    await page.press('#jmd-otrs-input', 'Escape');
    assert.strictEqual(await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); }), false);
    await page.close();
  });
});
