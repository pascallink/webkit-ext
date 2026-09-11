/**
 * Bearbeitungsmodus einfrieren: das Schloss zeigt und aendert den Zustand,
 * Speichern/Escape bleiben funktionsfaehig, Blur/Focusout des gesperrten
 * Feldes rutscht nicht durch. Dieses Mock schliesst - anders als die
 * realistischeren Nachbauten ISSUE und JIRA912 - rein ueber einen
 * click-Handler in der Bubble-Phase (Kommentar in der Fixture); seit dem
 * Fix zu #112 blockiert die Erweiterung click/dblclick bewusst nicht mehr,
 * daher schuetzt das Einfrieren hier nicht vor dem Schliessen selbst.
 * Aufruf: npm run test:editlock --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var INLINE = fixtures.INLINE;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/** Inline-Bearbeitung oeffnen und warten, bis unsere Leiste dranhaengt. */
async function startEditing(page) {
  await page.click('#description-val');
  await page.waitForSelector('.jmd-fieldbar', { timeout: 4000 });
}

async function clickBeside(page) {
  await page.click('#daneben');
  await page.waitForTimeout(150);
}

function editing(page) {
  return page.evaluate(function () {
    return !!document.getElementById('description-wiki-edit');
  });
}

describe('Bearbeitungsmodus einfrieren', { skip: !hasPlaywright }, function () {
  test('ohne Einfrieren schliesst Jira das Feld beim Klick daneben', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { freezeEditMode: false }, INLINE);
    await startEditing(page);
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'das Feld haette schliessen muessen');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__closed; }),
      ['klick-daneben']);
    await page.close();
  });

  test('eingefroren schuetzt nicht vor einem Mock, das nur ueber Klick schliesst', async function () {
    // Dieses Mock schliesst rein ueber einen click-Handler in der
    // Bubble-Phase (siehe Kommentar in der Fixture) - genau das Ereignis,
    // das der Fix zu #112 bewusst nicht mehr abfaengt, damit Toolbar-Links
    // und Dialoge wieder normal oeffnen (GUARDED in editlock.js laesst
    // click/dblclick seither durch). Echtes Jira 9.12 schliesst stattdessen
    // ueber mousedown in der Erfassungsphase - das bleibt geschuetzt, siehe
    // description.test.js "Textmodus: das Feld bleibt beim Klick daneben offen".
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.fill('#description', 'Wichtige Aenderung');
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'das Feld haette schliessen muessen');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__closed; }), ['klick-daneben']);
    await page.close();
  });

  test('blockiert Blur auch nach erneutem Fokussieren, wenn der Editor den Knoten austauscht', async function () {
    // Issue #63: Rich-Text-Editoren bauen ihr Feld beim Fokuswechsel neu auf
    // (gleiche id, neuer Knoten). Die Sperre zeigte danach noch auf den alten,
    // entfernten Knoten - ein Blur/Focusout des neuen Knotens rutschte durch,
    // bevor die naechste Bereinigung (MutationObserver-Debounce) das nachzog.
    // Der Fokuswechsel laeuft hier bewusst ueber page.focus() statt ueber
    // einen Klick auf "#daneben": seit dem Fix zu #112 laesst die Erweiterung
    // click/dblclick unangetastet durch, und dieses Mock schliesst das Feld
    // ueber genau so einen Klick (Bubble-Phase, siehe Fixture-Kommentar) -
    // das wuerde den Knoten hier vorzeitig entfernen. Das Durchsickern von
    // Blur wird darum direkt am Blur-Ereignis gemessen, unabhaengig vom Mock.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.evaluate(function () {
      window.__blurLeaked = 0;
      document.getElementById('description').addEventListener('blur', function () {
        window.__blurLeaked++;
      });
    });
    await page.focus('#fremder-knopf');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.__blurLeaked; }), 0,
      'das Blur des ersten Knotens ist schon durchgesickert');

    await page.click('#description');
    await page.evaluate(function () {
      // Der Editor tauscht den Knoten aus, noch bevor unsere Bereinigung
      // (400ms-Debounce ueber den MutationObserver) laufen konnte.
      var old = document.getElementById('description');
      var fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
      fresh.addEventListener('blur', function () {
        window.__blurLeaked++;
      });
      fresh.focus();
    });
    await page.waitForTimeout(50);

    await page.focus('#fremder-knopf');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.__blurLeaked; }), 0,
      'das Blur des ausgetauschten Knotens ist durchgesickert');
    await page.close();
  });

  test('das Schloss zeigt den Zustand an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    var view = await page.evaluate(function () {
      var button = document.querySelector('.jmd-fieldbar__btn--lock');
      return {
        pressed: button.getAttribute('aria-pressed'),
        text: button.textContent,
        hidden: button.hidden
      };
    });
    assert.strictEqual(view.hidden, false);
    assert.strictEqual(view.pressed, 'true');
    assert.ok(/Eingefroren/.test(view.text), 'Beschriftung: ' + view.text);
    await page.close();
  });

  test('geoeffnetes Schloss stellt Jiras Verhalten wieder her', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('.jmd-fieldbar__btn--lock');
    var view = await page.evaluate(function () {
      var button = document.querySelector('.jmd-fieldbar__btn--lock');
      return { pressed: button.getAttribute('aria-pressed'), text: button.textContent };
    });
    assert.strictEqual(view.pressed, 'false');
    assert.ok(/Einfrieren/.test(view.text), 'Beschriftung: ' + view.text);
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'Jira haette schliessen duerfen');
    await page.close();
  });

  test('Escape bricht das eingefrorene Feld nicht ab', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.press('#description', 'Escape');
    await page.waitForTimeout(150);
    assert.strictEqual(await editing(page), true, 'Escape hat das Feld geschlossen');
    await page.click('.jmd-fieldbar__btn--lock');
    await page.press('#description', 'Escape');
    await page.waitForTimeout(150);
    assert.strictEqual(await editing(page), false, 'nach dem Oeffnen muss Escape wieder greifen');
    await page.close();
  });

  test('ein geoeffnetes Schloss friert nicht von selbst wieder ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('.jmd-fieldbar__btn--lock');
    // Zurueck ins Feld: der Fokus darf die Sperre nicht wieder setzen.
    await page.click('#description');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.JiraEditLock.isActive(); }), false);
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'Jira haette schliessen duerfen');
    await page.close();
  });

  test('Speichern im Feld funktioniert weiter', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.fill('#description', 'Neuer Stand');
    await page.click('#speichern');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.__saved; }), 'Neuer Stand');
    await page.close();
  });

  test('vor dem Verlassen der Seite wird gefragt, solange eingefroren ist', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    var asks = function () {
      return page.evaluate(function () {
        var event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    };
    assert.strictEqual(await asks(), true, 'es wurde nicht nachgefragt');
    await page.click('.jmd-fieldbar__btn--lock');
    assert.strictEqual(await asks(), false, 'nach dem Oeffnen darf nichts mehr fragen');
    await page.close();
  });

  test('geschlossenes Feld gibt seine Sperre wieder ab', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('.jmd-fieldbar__btn--lock');
    await clickBeside(page);
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    var asked = await page.evaluate(function () {
      var event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(asked, false);
    await page.close();
  });

  test('abgeschaltet gibt es weder Schloss noch Einfrieren', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { freezeEditMode: false }, INLINE);
    await startEditing(page);
    var hidden = await page.evaluate(function () {
      return document.querySelector('.jmd-fieldbar__btn--lock').hidden;
    });
    assert.strictEqual(hidden, true, 'das Schloss haette versteckt sein muessen');
    assert.strictEqual(await page.evaluate(function () { return window.JiraEditLock.isActive(); }), false);
    await page.close();
  });

  test('eingefroren erreichen Klicks daneben ihr Ziel', async function () {
    // Seit dem Fix zu #112 blockiert die Erweiterung click/dblclick nicht
    // mehr - ein fremder Knopf bekommt seinen Klick, obwohl das Feld
    // eingefroren ist (sonst blieben Toolbar-Links und Dialoge unbedienbar).
    // Geschuetzt bleibt nur, was Jira wirklich zum Schliessen des Feldes
    // bringt: Pointer-/Maus-Runter und Fokuswechsel (siehe GUARDED in
    // editlock.js). Dieses Mock schliesst ausserdem selbst per Klick
    // daneben (Bubble-Phase, siehe Fixture-Kommentar) - darum nur ein
    // fremder Klick pro Sitzung, danach ist die Leiste schon wieder weg.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.click('#fremder-knopf');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(function () { return window.__fremdeKlicks; }), 1,
      'der fremde Klick ist trotz Sperre nicht angekommen');
    await page.close();
  });
});
