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

  /**
   * Regressionsfall: ein ausgeblendeter, alter .aui-dialog2-Knoten mit
   * eigenem #web-link.active-pane steht schon vor dem Lauf im DOM - so wie
   * AUI ihn nach einem frueheren Oeffnen stehen laesst (siehe findMatch-
   * Kommentar in src/jiraui.js). Die Felder des stale-Knotens tragen eigene
   * ids, damit sich echter und stale Dialog eindeutig unterscheiden lassen:
   * schreibt addWebLink in den stale-Knoten, bleiben die echten ids
   * unbeschrieben und die stale-ids stattdessen befuellt.
   *
   * Die Fixture selbst schaltet das aktive Tab-Panel global ueber
   * document.getElementById('web-link') um - mit der doppelten id trifft
   * das nicht mehr zuverlaessig den echten Reiter, unabhaengig vom Fix in
   * addWebLink. Ein Capture-Phase-Listener (gleiches Muster wie im
   * Timeout-Testfall unten) uebernimmt das Umschalten deshalb vorher,
   * beschraenkt auf den echten Dialogknoten.
   */
  test('stale Dialog wird nicht bespielt', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await installCapture(page);
    await page.evaluate(function () {
      var stale = document.createElement('div');
      stale.className = 'aui-dialog2';
      stale.style.display = 'none';
      stale.innerHTML =
        '<div class="tabs-pane active-pane" id="web-link">' +
        '<input id="stale-weblink-url" type="text">' +
        '<input id="stale-weblink-linktext" type="text">' +
        '</div>';
      document.body.insertBefore(stale, document.body.firstChild);

      document.addEventListener('click', function (event) {
        var tab = event.target.closest ? event.target.closest('.aui-tabs .menu-item a[href="#web-link"]') : null;
        if (!tab) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        var dialog = tab.closest('.aui-dialog2');
        var panel = dialog ? dialog.querySelector('#web-link') : null;
        var jiraPanel = dialog ? dialog.querySelector('#jira-link-panel') : null;
        if (panel) panel.classList.add('active-pane');
        if (jiraPanel) jiraPanel.classList.remove('active-pane');
      }, true);
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.ok, true);
    var captured = await page.evaluate(function () { return window.__captured; });
    assert.strictEqual(captured.weblinkUrl, PARSED.url);
    assert.strictEqual(captured.weblinkLinktext, PARSED.linkText);
    var staleValues = await page.evaluate(function () {
      return {
        url: document.getElementById('stale-weblink-url').value,
        linktext: document.getElementById('stale-weblink-linktext').value
      };
    });
    assert.strictEqual(staleValues.url, '', 'der stale Knoten haette nicht beschrieben werden duerfen');
    assert.strictEqual(staleValues.linktext, '', 'der stale Knoten haette nicht beschrieben werden duerfen');
    await page.close();
  });

  /**
   * Regressionsfall: bei unterdrueckten Shortcuts muss die Fallback-Suche
   * ueber [data-field-name="Kunden Referenz"] input gehen, nicht ueber die
   * erstbeste .customfield input - ein fremdes Custom Field steht dazu vor
   * dem echten Referenzfeld im DOM.
   */
  test('Fallback trifft das richtige Custom Field', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__suppressShortcuts = true;
      var foreign = document.createElement('div');
      foreign.className = 'customfield';
      foreign.setAttribute('data-field-name', 'Anderes Feld');
      foreign.innerHTML = '<input id="fremdes-feld" type="text">';
      document.body.insertBefore(foreign, document.body.firstChild);
    });
    var result = await page.evaluate(function (parsed) {
      return window.JiraOtrsFlow.run(parsed, {});
    }, PARSED);
    assert.strictEqual(result.ok, true);
    var values = await page.evaluate(function () {
      return {
        fremd: document.getElementById('fremdes-feld').value,
        referenz: document.querySelector('[data-field-name="Kunden Referenz"] input').value
      };
    });
    assert.strictEqual(values.fremd, '', 'das fremde Feld haette nicht beschrieben werden duerfen');
    assert.strictEqual(values.referenz, PARSED.reference);
    await page.close();
  });

  /**
   * Regressionsfall: haengt der Dialog nach dem Bestaetigen (Klick auf den
   * Primaerbutton) trotzdem im DOM - Ersatz fuer einen ausbleibenden AJAX-
   * Rundtrip -, muss previousReference am abgelehnten Promise haengen. Der
   * capture-Listener laeuft vor dem Entfernen-Listener der Fixture (beide
   * auf document, aber dieser in der Capture-Phase) und stoppt ihn per
   * stopImmediatePropagation, sobald das Ziel im customfield-Dialog liegt.
   */
  test('Timeout nach dem Schreiben behaelt previousReference', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__setCustomFieldValue('Alter Wert');
      document.addEventListener('click', function (event) {
        var target = event.target;
        if (target && target.closest && target.closest('#customfield-dialog')) {
          event.stopImmediatePropagation();
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
