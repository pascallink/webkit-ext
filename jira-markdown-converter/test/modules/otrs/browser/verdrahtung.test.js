/**
 * Verdrahtung des OTRS-Link-Helfers in content.js: Panel-Button und
 * Feldleisten-Eintrag oeffnen den Dialog, ein vollstaendiger Durchlauf gegen
 * den Nachbau von 9.12 (JIRA912) endet mit Erfolgs- bzw. Warn-Toast, der
 * Schalter otrsHelper blendet beide Einstiegspunkte aus, ein Fehler im Ablauf
 * zeigt die Fehlermeldung. Scheitert der Ablauf erst nach dem Ueberschreiben
 * der Referenz, bleibt zusaetzlich zur Fehlermeldung die sticky Warnung mit
 * dem alten Feldwert stehen und der Dialog offen.
 * Laeuft gegen fixtures.JIRA912 (mock-jira-912-issue-view.html), nicht gegen
 * die aeltere fixtures.OTRS (mock-jira-otrs.html): otrsflow.js/jiraui.js
 * wurden fuer Issue #26 auf die echten 9.12.2-Selektoren umgestellt
 * (#shifter-dialog, #modal-field-view, #wrap-labels, ui.submitForm() statt
 * Button-Klick) - das aeltere OTRS-Fixture bildet die noch nicht nach und
 * das JIRA912-Fixture ist bereits DOM-verifiziert (siehe otrsflow.test.js).
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

  test('vollstaendiger Durchlauf gegen den Nachbau von 9.12 endet mit dem Erfolgstoast', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.JIRA912);
    // customfield_10027 steht in der Fixture leer - nur der Erfolgstoast,
    // keine zusaetzliche Warnung, die ihn ueberschreiben wuerde.
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
    var page = await browserLib.newPage(browser, null, fixtures.JIRA912);
    // customfield_10027 startet leer in der Fixture - fuer diesen Fall vorbelegen.
    await page.evaluate(function () {
      document.getElementById('customfield_10027').value = 'Alter Wert';
    });
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
    var page = await browserLib.newPage(browser, null, fixtures.JIRA912);
    // Kuerzel 'l'/'.' in der Capture-Phase abfangen (wie otrsflow.test.js
    // "ohne Shortcuts") und beide Fallback-Trigger fuer Labels entfernen -
    // openLabelDialogFallback() findet dann keinen Weg mehr zum Dialog.
    await page.evaluate(function () {
      document.addEventListener('keydown', function (event) {
        if (event.key === 'l' || event.key === '.') {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      }, true);
      var wrap = document.querySelector('#wrap-labels .labels-wrap');
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      var editLabels = document.getElementById('edit-labels');
      if (editLabels && editLabels.parentNode) editLabels.parentNode.removeChild(editLabels);
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
    var page = await browserLib.newPage(browser, null, fixtures.JIRA912);
    // customfield_10027 vorbelegen wie otrsflow.test.js. submitForm() loest
    // in 9.12 ein 'submit'-Ereignis aus (kein Button-Klick mehr) - das wird
    // hier in der Capture-Phase abgefangen, bevor der Bubble-Handler der
    // Fixture #modal-field-view schliesst und die Referenz speichert:
    // Kennzeichen (Schritt 1) laeuft durch, das anschliessende waitForGone
    // auf #modal-field-view (Schritt 2) aber nicht.
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
    assert.match(state.text, /Kunden Referenz konnte nicht gesetzt werden/);
    assert.match(state.text, /Vorheriger Wert: Alter Wert/);
    assert.strictEqual(state.closeHidden, false, 'Warnung braucht eine Schliessen-Schaltflaeche');
    assert.strictEqual(state.dialogOpen, true, 'OTRS-Dialog haette nach dem Fehler offen bleiben muessen');
    await page.close();
  });
});
