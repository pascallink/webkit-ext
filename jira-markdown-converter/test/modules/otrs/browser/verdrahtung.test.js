/**
 * Verdrahtung des OTRS-Link-Helfers in content.js: Panel-Button und
 * Feldleisten-Eintrag oeffnen den Dialog, ein vollstaendiger Durchlauf gegen
 * die AUI-Fixture endet mit Erfolgs- bzw. Warn-Toast, der Schalter
 * otrsHelper blendet beide Einstiegspunkte aus, ein Fehler im Ablauf zeigt
 * die Fehlermeldung. Scheitert der Ablauf erst nach dem Ueberschreiben der
 * Referenz, bleibt zusaetzlich zur Fehlermeldung die sticky Warnung mit dem
 * alten Feldwert stehen und der Dialog offen.
 * Aufruf: npm run test:otrs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

var TITLE = 'Ticket#2026070710000078 - REFI PU 47.2 - Probleme mit ...';
var URL = 'https://support.inxire.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=15285;ArticleID=102557';
var LINK = '[' + TITLE + '](' + URL + ')';

function toastText(page) {
  return page.evaluate(function () {
    var node = document.querySelector('.jmd-toast__text');
    return node ? node.textContent : null;
  });
}

describe('OTRS-Link-Helfer - Verdrahtung im Content-Script', { skip: !hasPlaywright }, function () {
  test('Panel-Button oeffnet den OTRS-Dialog', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="otrs"]');
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'OTRS-Dialog wurde nicht geoeffnet');
    await page.close();
  });

  test('vollstaendiger Durchlauf gegen die AUI-Fixture endet mit dem Erfolgstoast', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.OTRS);
    // Leeres Referenzfeld: nur der Erfolgstoast, keine zusaetzliche Warnung,
    // die ihn ueberschreiben wuerde.
    await page.evaluate(function () { window.__setCustomFieldValue(''); });
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="otrs"]');
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    await page.waitForFunction(function () {
      var node = document.querySelector('.jmd-toast');
      return !!node && node.classList.contains('jmd-toast--visible') &&
        node.querySelector('.jmd-toast__text').textContent === 'OTRS Link im Ticket eingepflegt.';
    }, null, { timeout: 6000 });
    assert.strictEqual(await toastText(page), 'OTRS Link im Ticket eingepflegt.');
    await page.close();
  });

  test('belegtes Referenzfeld erzeugt zusaetzlich die Warnung samt altem Wert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.OTRS);
    // Fixture-Standard: das Referenzfeld ist mit 'Alter Wert' vorbelegt.
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="otrs"]');
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    await page.waitForFunction(function () {
      var node = document.querySelector('.jmd-toast');
      return !!node && node.classList.contains('jmd-toast--sticky');
    }, null, { timeout: 6000 });

    var state = await page.evaluate(function () {
      var node = document.querySelector('.jmd-toast');
      return {
        text: node.querySelector('.jmd-toast__text').textContent,
        error: node.classList.contains('jmd-toast--error'),
        closeHidden: node.querySelector('.jmd-toast__close').hidden,
        visible: node.classList.contains('jmd-toast--visible')
      };
    });
    assert.strictEqual(state.text, 'Achtung: Kundenreferenz wurde ueberschrieben. Vorheriger Wert: Alter Wert');
    assert.strictEqual(state.error, true, 'Warnung muss den Fehlerzweig von toast() nutzen');
    assert.strictEqual(state.closeHidden, false, 'Warnung braucht eine Schliessen-Schaltflaeche');
    assert.strictEqual(state.visible, true);

    // Steht laenger als die uebliche Standzeit (2,6 s) - mindestens 10 s
    // gefordert, hier reicht der Nachweis "verschwindet nicht von selbst".
    await page.waitForTimeout(3000);
    assert.strictEqual(await page.evaluate(function () {
      return document.querySelector('.jmd-toast').classList.contains('jmd-toast--visible');
    }), true, 'Warnung ist von selbst verschwunden');

    await page.click('.jmd-toast__close');
    assert.strictEqual(await page.evaluate(function () {
      return document.querySelector('.jmd-toast').classList.contains('jmd-toast--visible');
    }), false, 'Warnung liess sich nicht manuell schliessen');
    await page.close();
  });

  test('otrsHelper: false blendet Panel-Button und Feldleisten-Eintrag aus', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { otrsHelper: false }, fixtures.SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.click('.jmd-fab');
    assert.strictEqual(await page.locator('.jmd-panel [data-action="otrs"]').isHidden(), true,
      'Panel-Button haette ausgeblendet sein muessen');
    assert.strictEqual(await page.locator('.jmd-fieldbar__btn--otrs').first().isHidden(), true,
      'Feldleisten-Eintrag haette ausgeblendet sein muessen');
    await page.close();
  });

  test('Fehler im Ablauf zeigt die Fehlermeldung als Fehler-Toast', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.OTRS);
    await page.evaluate(function () {
      window.__suppressShortcuts = true;
      var trigger = document.getElementById('edit-labels');
      if (trigger && trigger.parentNode) trigger.parentNode.removeChild(trigger);
    });
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="otrs"]');
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    await page.waitForFunction(function () {
      var node = document.querySelector('.jmd-toast');
      return !!node && node.classList.contains('jmd-toast--visible') && node.classList.contains('jmd-toast--error');
    }, null, { timeout: 6000 });
    var text = await toastText(page);
    assert.ok(/Kennzeichen konnte nicht gesetzt werden/.test(text), 'Fehlermeldung: ' + text);
    await page.close();
  });

  test('Fehler nach dem Ueberschreiben der Referenz zeigt sticky Warnung und laesst den Dialog offen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.OTRS);
    // Fixture-Standard: das Referenzfeld ist mit 'Alter Wert' vorbelegt.
    // Klicks im Custom-Field-Dialog werden in der Capture-Phase abgefangen,
    // bevor der Bubble-Listener der Fixture den Dialog entfernt - Kennzeichen
    // (Schritt 1) und das Schreiben der Referenz (Schritt 2) laufen durch,
    // das anschliessende waitForGone auf #customfield-dialog (Schritt 3)
    // aber nicht.
    await page.evaluate(function () {
      document.addEventListener('click', function (event) {
        var target = event.target;
        if (target && target.closest && target.closest('#customfield-dialog')) {
          event.stopImmediatePropagation();
        }
      }, true);
    });
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="otrs"]');
    await page.fill('#jmd-otrs-input', LINK);
    await page.click('[data-otrs-action="submit"]');
    await page.waitForFunction(function () {
      var node = document.querySelector('.jmd-toast');
      return !!node && node.classList.contains('jmd-toast--sticky');
    }, null, { timeout: 9000 });

    var state = await page.evaluate(function () {
      var node = document.querySelector('.jmd-toast');
      return {
        text: node.querySelector('.jmd-toast__text').textContent,
        closeHidden: node.querySelector('.jmd-toast__close').hidden,
        dialogOpen: !!document.querySelector('.jmd-dialog--open')
      };
    });
    assert.strictEqual(state.text, 'Achtung: Kundenreferenz wurde ueberschrieben. Vorheriger Wert: Alter Wert');
    assert.strictEqual(state.closeHidden, false, 'Warnung braucht eine Schliessen-Schaltflaeche');
    assert.strictEqual(state.dialogOpen, true, 'OTRS-Dialog haette nach dem Fehler offen bleiben muessen');
    await page.close();
  });
});
