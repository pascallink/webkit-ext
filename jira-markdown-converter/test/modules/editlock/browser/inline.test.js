/**
 * Bearbeitungsmodus einfrieren: Inline-Bearbeitung bleibt beim Klick daneben
 * offen, das Schloss zeigt und aendert den Zustand, Speichern/Escape bleiben
 * funktionsfaehig.
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

  test('eingefroren bleibt das Feld beim Klick daneben offen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.fill('#description', 'Wichtige Aenderung');
    await clickBeside(page);
    assert.strictEqual(await editing(page), true, 'das Feld wurde geschlossen');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__closed; }), []);
    assert.strictEqual(await page.inputValue('#description'), 'Wichtige Aenderung',
      'der Text ist verloren gegangen');
    await page.close();
  });

  test('blockiert Blur auch nach erneutem Fokussieren, wenn der Editor den Knoten austauscht', async function () {
    // Issue #63: Rich-Text-Editoren bauen ihr Feld beim Fokuswechsel neu auf
    // (gleiche id, neuer Knoten). Die Sperre zeigte danach noch auf den alten,
    // entfernten Knoten - ein Blur/Focusout des neuen Knotens rutschte durch,
    // bevor die naechste Bereinigung (MutationObserver-Debounce) das nachzog.
    // Das hiesige Mock schliesst per Klick-Delegation, nicht per Blur - darum
    // wird das Durchsickern hier direkt am Blur-Ereignis gemessen.
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
    await clickBeside(page);
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

    await page.click('#daneben');
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

  test('eingefroren bleiben Klicks daneben ohne Wirkung', async function () {
    // Bewusst so: das Feld ist eingefroren, die Seite reagiert daneben nicht
    // mehr auf Klicks. Das Schloss oeffnen gibt sie wieder frei.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('#fremder-knopf');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(function () { return window.__fremdeKlicks; }), 0);
    await page.click('.jmd-fieldbar__btn--lock');
    await page.click('#fremder-knopf');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(function () { return window.__fremdeKlicks; }), 1);
    await page.close();
  });
});
