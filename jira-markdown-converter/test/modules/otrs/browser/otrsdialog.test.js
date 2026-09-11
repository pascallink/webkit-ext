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
  // .jmd-dialog ist per default display: none - erst mit den Stylesheets
  // wird jmd-dialog--open sichtbar und der Fokus verhaelt sich wie im echten
  // Content-Script (relevant fuer die Fokus-Testfaelle unten).
  await page.addStyleTag({ content: browserLib.readSource('src/codedialog.css') });
  await page.addStyleTag({ content: browserLib.readSource('src/otrsdialog.css') });
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

  test('close() gibt den Fokus an handlers.opener zurueck', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      var opener = document.createElement('button');
      opener.id = 'opener-btn';
      opener.textContent = 'Oeffnen';
      document.body.appendChild(opener);
      window.JiraOtrsDialog.open({ opener: opener });
    });
    await page.evaluate(function () {
      window.JiraOtrsDialog.close();
    });
    var focusedId = await page.evaluate(function () {
      return document.activeElement && document.activeElement.id;
    });
    assert.strictEqual(focusedId, 'opener-btn', 'Fokus liegt nach close() nicht auf dem opener');
    await page.close();
  });

  test('onSubmit setzt den Fokus selbst, close() ueberschreibt ihn nicht mit dem opener', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      var opener = document.createElement('button');
      opener.id = 'opener-btn';
      document.body.appendChild(opener);
      var target = document.createElement('textarea');
      target.id = 'target-field';
      document.body.appendChild(target);
      window.JiraOtrsDialog.open({
        opener: opener,
        onSubmit: function () {
          document.getElementById('target-field').focus();
          return true;
        }
      });
    });
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    assert.strictEqual(await page.evaluate(function () { return window.JiraOtrsDialog.isOpen(); }), false,
      'Dialog haette nach erfolgreichem Absenden schliessen muessen');
    var focusedId = await page.evaluate(function () {
      return document.activeElement && document.activeElement.id;
    });
    assert.strictEqual(focusedId, 'target-field', 'Fokus muss im Zielfeld bleiben, nicht auf dem opener landen');
    await page.close();
  });

  test('onClose feuert genau einmal beim Abbruch und nach dem Absenden, ein zweiter close()-Aufruf feuert nicht erneut', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);

    var abbruch = await page.evaluate(function () {
      window.__closed = 0;
      window.JiraOtrsDialog.open({ onClose: function () { window.__closed++; } });
      window.JiraOtrsDialog.close();
      window.JiraOtrsDialog.close();
      return window.__closed;
    });
    assert.strictEqual(abbruch, 1, 'onClose muss beim Abbruch genau einmal feuern, auch bei doppeltem close()');

    await page.evaluate(function () {
      window.__closed = 0;
      window.JiraOtrsDialog.open({
        onSubmit: function () { return true; },
        onClose: function () { window.__closed++; }
      });
    });
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    await page.waitForFunction(function () { return window.JiraOtrsDialog.isOpen() === false; });
    var nachAbsenden = await page.evaluate(function () { return window.__closed; });
    assert.strictEqual(nachAbsenden, 1, 'onClose muss auch nach erfolgreichem Absenden genau einmal feuern');
    await page.close();
  });

  test('onError entprellt gleiche Fehlermeldungen, meldet sie aber nach gueltiger Zwischeneingabe wieder', async function () {
    var browser = await browserPromise;
    var page = await loadPage(browser);
    await page.evaluate(function () {
      window.__errors = [];
      window.JiraOtrsDialog.open({
        onError: function (message) { window.__errors.push(message); }
      });
    });
    await page.fill('#jmd-otrs-input', 'Text ohne jede URL');
    await page.fill('#jmd-otrs-input', 'Text ohne jede URL');
    var errors = await page.evaluate(function () { return window.__errors; });
    assert.strictEqual(errors.length, 1, 'dieselbe Fehlermeldung darf nicht doppelt gemeldet werden');

    await page.fill('#jmd-otrs-input', LINK);
    await page.fill('#jmd-otrs-input', 'Text ohne jede URL');
    errors = await page.evaluate(function () { return window.__errors; });
    assert.strictEqual(errors.length, 2, 'nach einer gueltigen Zwischeneingabe muss dieselbe Meldung erneut kommen');
    assert.strictEqual(errors[0], errors[1], 'beide Meldungen muessen denselben Wortlaut haben');
    await page.close();
  });
});
