/**
 * Tests fuer JiraOtrsFlow (src/otrsflow.js) gegen den Nachbau von Jira 9.12.2
 * (JIRA912): die drei Schritte (Label, Kunden Referenz, Web-Link) laufen
 * ueber den Shifter (Taste '.') bzw. das Label-Kuerzel (Taste 'l'), bei
 * unterdruecktem Kuerzel ueber die sichtbaren Trigger der Werkzeugleiste.
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

var JIRA912_FIXTURE = 'file://' + path.join(__dirname, '..', '..', '..', 'fixtures', fixtures.JIRA912);

var TITLE = 'Ticket#2026070710000078 - REFI PU 47.2 - Probleme mit ...';
var URL = 'https://support.inxire.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=15285;ArticleID=102557';
var PARSED = OtrsLink.parse('[' + TITLE + '](' + URL + ')');

/**
 * Laedt den Nachbau von 9.12 (JIRA912) mit nur jiraui.js und otrsflow.js -
 * nicht newPage() aus lib/browser, wie schon in jiraui.test.js: das laedt
 * den vollen Content-Script-Stack aus content_scripts[0], den diese Fixture
 * nicht bedient.
 */
async function loadPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(JIRA912_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  await page.addScriptTag({ content: browserLib.readSource('src/otrsflow.js') });
  return page;
}

describe('JiraOtrsFlow.run - Ablauf gegen den Nachbau von 9.12', { skip: !hasPlaywright }, function () {
  test('kompletter Durchlauf setzt Label, Kunden Referenz und Web-Link', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.steps, ['label', 'reference', 'link']);
    var saved = await page.evaluate(function () { return window.__mock.saved; });
    assert.strictEqual(saved.labels, PARSED.label);
    assert.strictEqual(saved.kundenReferenz, PARSED.reference);
    assert.deepStrictEqual(saved.weblink, { url: PARSED.url, title: PARSED.linkText });
    await page.close();
  });

  test('previousReference liefert den alten Wert', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      document.getElementById('customfield_10027').value = 'Alter Wert';
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.previousReference, 'Alter Wert');
    var saved = await page.evaluate(function () { return window.__mock.saved.kundenReferenz; });
    assert.strictEqual(saved, PARSED.reference);
    await page.close();
  });

  /**
   * Regressionsfall: ein fremdes Skript (oder eine andere Erweiterung)
   * unterdrueckt die AUI-Tastaturkuerzel 'l' und '.' - ein Capture-Listener
   * auf document stoppt sie vor der eigenen Bubble-Phase-Behandlung der
   * Fixture. Label und Web-Link muessen dann ueber ihre sichtbaren Trigger
   * laufen (#wrap-labels .labels-wrap.editable-field bzw.
   * #opsbar-operations_more -> #link-issue). Kunden Referenz ist in 9.12
   * ausschliesslich ueber den Shifter erreichbar - ein inline stehendes
   * Feld deckt hier nur locateReferenceFallback ab und ist nicht
   * Pruefgegenstand dieses Falls.
   */
  test('ohne Shortcuts laufen Label und Web-Link ueber die sichtbaren Trigger', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      document.addEventListener('keydown', function (event) {
        if (event.key === 'l' || event.key === '.') {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      }, true);
      var inline = document.createElement('div');
      inline.className = 'customfield';
      inline.setAttribute('data-field-name', 'Kunden Referenz');
      inline.innerHTML = '<input type="text" value="">';
      document.body.appendChild(inline);
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.ok, true);
    var saved = await page.evaluate(function () { return window.__mock.saved; });
    assert.strictEqual(saved.labels, PARSED.label);
    assert.deepStrictEqual(saved.weblink, { url: PARSED.url, title: PARSED.linkText });
    await page.close();
  });

  test('fehlender Link-Dialog lehnt mit error.step === "link" ab', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      var dialog = document.getElementById('link-issue-dialog');
      if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog);
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

  /**
   * Regressionsfall: bleibt #modal-field-view nach dem Bestaetigen trotzdem
   * sichtbar im DOM - Ersatz fuer einen ausbleibenden Rundtrip -, muss
   * previousReference am abgelehnten Promise haengen. Der Capture-Listener
   * fuer 'submit' laeuft vor dem Bubble-Phase-Handler der Fixture (beide auf
   * document bzw. dem Formular, dieser aber in der Capture-Phase) und stoppt
   * ihn, sobald das Ziel im modal-field-view-Dialog liegt - so wie
   * ui.submitForm() ueber form.requestSubmit() das submit-Ereignis ausloest,
   * nicht ueber einen Klick.
   */
  test('Timeout nach dem Schreiben behaelt previousReference', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      document.getElementById('customfield_10027').value = 'Alter Wert';
      document.addEventListener('submit', function (event) {
        var target = event.target;
        if (target && target.closest && target.closest('#modal-field-view')) {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      }, true);
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, { timeout: 300 }).then(function () {
        return { rejected: false };
      }, function (error) {
        return { rejected: true, step: error.step, previousReference: error.previousReference };
      });
    }, PARSED);
    assert.strictEqual(result.rejected, true);
    assert.strictEqual(result.step, 'reference');
    assert.strictEqual(result.previousReference, 'Alter Wert');
    await page.close();
  });
});
