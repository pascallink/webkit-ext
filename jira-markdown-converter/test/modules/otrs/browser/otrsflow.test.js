/**
 * Tests fuer JiraOtrsFlow (src/otrsflow.js) gegen die AUI-Fixture
 * mock-jira-otrs.html: die drei Schritte (Label, Kunden Referenz, Web-Link)
 * laufen zuerst per Tastatur-Shortcut, bei Timeout ueber die DOM-Fallback-
 * Ebene.
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
var PARSED = OtrsLink.parse('[' + TITLE + '](' + URL + ')');

/**
 * Laedt die OTRS-Fixture mit nur jiraui.js und otrsflow.js - nicht newPage()
 * aus lib/browser, wie schon in jiraui.test.js: das laedt den vollen
 * Content-Script-Stack aus content_scripts[0], den die Server-Fixture nicht
 * bedient.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(OTRS_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  await page.addScriptTag({ content: browserLib.readSource('src/otrsflow.js') });
  return page;
}

/**
 * Zeichnet auf, welche Felder tatsaechlich per input-Ereignis beschrieben
 * wurden - noetig, weil die Dialoge nach dem Bestaetigen aus dem DOM
 * entfernt werden und ihr Wert danach nicht mehr abfragbar ist.
 */
async function installCapture(page) {
  await page.evaluate(function () {
    window.__captured = {};
    document.addEventListener('input', function (event) {
      var target = event.target;
      if (!target) return;
      if (target.id === 'labels-textarea') window.__captured.label = target.value;
      if (target.id === 'customfield_11000') window.__captured.referenceDialog = target.value;
      if (target.matches && target.matches('.customfield input')) window.__captured.referenceInline = target.value;
      if (target.id === 'weblink-url') window.__captured.weblinkUrl = target.value;
      if (target.id === 'weblink-linktext') window.__captured.weblinkLinktext = target.value;
    });
  });
}

describe('JiraOtrsFlow.run - Ablauf gegen die AUI-Fixture', { skip: !hasPlaywright }, function () {
  test('kompletter Durchlauf: Label, Kunden Referenz und Web-Link werden gesetzt', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await installCapture(page);
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.steps, ['label', 'reference', 'link']);
    var captured = await page.evaluate(function () { return window.__captured; });
    assert.strictEqual(captured.label, PARSED.label);
    assert.strictEqual(captured.referenceDialog, PARSED.reference);
    assert.strictEqual(captured.weblinkUrl, PARSED.url);
    assert.strictEqual(captured.weblinkLinktext, PARSED.linkText);
    await page.close();
  });

  test('previousReference liefert den alten Wert, wenn das Feld belegt war', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__setCustomFieldValue('Alter Wert');
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.previousReference, 'Alter Wert');
    await page.close();
  });

  test('previousReference ist leer, wenn das Feld leer war', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__setCustomFieldValue('');
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.previousReference, '');
    await page.close();
  });

  test('Fallback greift: unterdrueckter Tastendruck laeuft trotzdem ueber die DOM-Selektoren', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await installCapture(page);
    await page.evaluate(function () {
      window.__suppressShortcuts = true;
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.ok, true);
    var captured = await page.evaluate(function () { return window.__captured; });
    assert.strictEqual(captured.label, PARSED.label);
    assert.strictEqual(captured.referenceInline, PARSED.reference);
    assert.strictEqual(captured.referenceDialog, undefined, 'der Dialog-Pfad haette bei unterdrueckter Tastatur nicht laufen duerfen');
    assert.strictEqual(captured.weblinkUrl, PARSED.url);
    await page.close();
  });

  test('fehlender Link-Dialog: Promise wird abgelehnt und error.step ist link', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__openLinkDialog = function () {};
      var trigger = document.getElementById('link-issue');
      if (trigger && trigger.parentNode) trigger.parentNode.removeChild(trigger);
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, { timeout: 300 }).then(function () {
        return { rejected: false };
      }, function (error) {
        return { rejected: true, step: error.step, message: error.message };
      });
    }, PARSED);
    assert.strictEqual(result.rejected, true);
    assert.strictEqual(result.step, 'link');
    await page.close();
  });
});
