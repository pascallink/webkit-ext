/**
 * Service-Worker mit echten chrome-APIs statt dem Stub aus
 * test/modules/background/background.test.js: Badge (background.js:64),
 * Kontextmenue-Update (background.js:82) und chrome.scripting.
 * registerContentScripts (background.js:210). Der Node-Test dort spart das
 * bewusst aus ("Bedienoberflaeche ohne eigene Logik ausserhalb von
 * Settings/Converter") - hier laufen dieselben Aufrufe gegen den echten
 * Browser.
 *
 * background.js ist ein klassisches Service-Worker-Skript ohne UMD-Export
 * (siehe CLAUDE.md) - seine Top-Level-Funktionen und -Variablen haengen
 * darum am globalen self und sind aus worker.evaluate() heraus erreichbar,
 * ohne dass ein Test-Hook in den Quelltext muss.
 * Aufruf: npm run test:ext --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var after = nodeTest.after;
var extLib = require('../../../lib/extension');

// Deckt den 50-ms-Debounce aus settings.js (CHANGE_DEBOUNCE_MS) plus reale
// IPC-Laufzeit im Service-Worker ab.
var SETTLE_TIMEOUT = 5000;

function badgeText(worker) {
  return worker.evaluate(function () {
    return new Promise(function (resolve) {
      chrome.action.getBadgeText({}, resolve);
    });
  });
}

/**
 * Wartet, bis das Badge den erwarteten Text zeigt - kein waitForFunction()
 * auf worker: Playwrights ServiceWorker-Objekt (anders als Page) kennt nur
 * evaluate()/evaluateHandle(), kein eigenes Warten. Pollt darum von hier aus.
 */
function waitForBadge(worker, expected, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  function attempt() {
    return badgeText(worker).then(function (text) {
      if (text === expected) return text;
      if (Date.now() > deadline) return text;
      return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(attempt);
    });
  }
  return attempt();
}

describe('Service-Worker mit echten chrome-APIs', function () {
  var readyPromise = extLib.canRunExtension();
  var ready = null;

  after(async function () {
    if (ready && ready.ok) await ready.teardown();
  });

  test('Badge und Kontextmenue folgen der Einfuege-Automatik', async function (t) {
    ready = await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var worker = ready.context.serviceWorkers()[0];
    assert.ok(worker, 'der Service-Worker sollte nach canRunExtension() noch laufen');

    // convertOnPaste ist per Default an (settings.js DEFAULTS) -> Badge 'AN'.
    // refreshIndicators() beim Start (background.js) laedt die Settings noch
    // asynchron - canRunExtension() wartet nur auf den Service-Worker selbst,
    // nicht auf dessen eigenen Startup, darum hier abwarten statt einmalig
    // pruefen.
    assert.strictEqual(await waitForBadge(worker, 'AN', SETTLE_TIMEOUT), 'AN');

    // toggleConvertOnPaste ist eine Top-Level-Funktion in background.js -
    // real am Service-Worker erreichbar, kein Stub dazwischen.
    await worker.evaluate(function () { return self.toggleConvertOnPaste(false); });
    assert.strictEqual(await waitForBadge(worker, 'AUS', SETTLE_TIMEOUT), 'AUS');

    // background.js verwirft chrome.runtime.lastError beim eigenen
    // contextMenus.update()-Aufruf (background.js:82-86, "void
    // chrome.runtime.lastError") - ein Fehler dort bliebe unbemerkt. Der
    // gleiche Aufruf aus dem Test heraus deckt auf, ob der Menuepunkt im
    // echten Chrome ueberhaupt existiert (createMenus() lief durch).
    var menuUpdateOk = await worker.evaluate(function () {
      return new Promise(function (resolve) {
        chrome.contextMenus.update(self.TOGGLE_MENU_ID, { checked: false }, function () {
          resolve(!chrome.runtime.lastError);
        });
      });
    });
    assert.strictEqual(menuUpdateOk, true, 'TOGGLE_MENU_ID sollte im echten Kontextmenue existieren');

    // Zustand fuer nachfolgende Tests wieder auf die Vorgabe zuruecksetzen.
    await worker.evaluate(function () { return self.toggleConvertOnPaste(true); });
    assert.strictEqual(await waitForBadge(worker, 'AN', SETTLE_TIMEOUT), 'AN');
  });

  test('syncExtraHosts registriert ein Content-Script ueber chrome.scripting', async function (t) {
    ready = ready || await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var worker = ready.context.serviceWorkers()[0];
    assert.ok(worker, 'der Service-Worker sollte nach canRunExtension() noch laufen');

    // chrome.permissions.request() braucht eine echte Nutzergeste und einen
    // sichtbaren Dialog (siehe popup.test.js) - fuer diesen Test reicht die
    // schon erteilte Freigabe nicht (sie gilt nur dem Fixture-Host mit
    // Port). syncExtraHosts() selbst fragt nur chrome.permissions.contains()
    // ab (background.js:189) - ein Test-lokaler Stub dieser einen Abfrage
    // (nur innerhalb dieses worker.evaluate(), background.js bleibt
    // unberuehrt) reicht, um den echten chrome.scripting-Aufruf dahinter zu
    // pruefen.
    var result = await worker.evaluate(function () {
      var originalContains = chrome.permissions.contains;
      chrome.permissions.contains = function (permissions, callback) { callback(true); };

      function registered() {
        return new Promise(function (resolve) {
          chrome.scripting.getRegisteredContentScripts({ ids: [self.CONTENT_SCRIPT_ID] }, resolve);
        });
      }
      function setSync(values) {
        return new Promise(function (resolve) { chrome.storage.sync.set(values, resolve); });
      }
      function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
      }

      return registered().then(function (before) {
        return setSync({ extraHosts: ['beispiel.invalid'] })
          .then(function () { return wait(150); })
          .then(registered)
          .then(function (afterRegister) {
            return setSync({ extraHosts: [] })
              .then(function () { return wait(150); })
              .then(registered)
              .then(function (afterRemove) {
                return { before: before, afterRegister: afterRegister, afterRemove: afterRemove };
              });
          });
      }).then(function (out) {
        chrome.permissions.contains = originalContains;
        return out;
      }, function (error) {
        chrome.permissions.contains = originalContains;
        throw error;
      });
    });

    assert.strictEqual(result.before.length, 0, 'vor der Freigabe darf nichts registriert sein');
    assert.strictEqual(result.afterRegister.length, 1,
      'chrome.scripting.registerContentScripts haette real ausgefuehrt werden sollen');
    assert.strictEqual(result.afterRegister[0].matches[0], '*://beispiel.invalid/*');
    assert.strictEqual(result.afterRemove.length, 0,
      'chrome.scripting.unregisterContentScripts haette bei leeren extraHosts laufen sollen');
  });
});
