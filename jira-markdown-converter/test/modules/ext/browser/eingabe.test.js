/**
 * Echte Eingabe: die Testebene ext deckt bislang nur DOM-Beweise, Storage,
 * Service-Worker und das Popup ab (welt-, storage-, worker-, popup.test.js).
 * Hier kommt echte Zwischenablage (context.grantPermissions) und echte
 * Tastatur (page.keyboard) dazu - das synthetische ClipboardEvent aus
 * test/lib/dom.js (pasteInto()) haette Issue #09 nicht gesehen, weil es den
 * nativen Undo-Verlauf der Textarea nie anfasst. dom.js bleibt darum
 * unveraendert, dieser Test laeuft nur ueber die echte Erweiterung.
 * Aufruf: npm run test:ext --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var after = nodeTest.after;
var extLib = require('../../../lib/extension');
var fixtures = require('../../../lib/fixtures');

var WAIT_TIMEOUT = 10000;
var LOCK_TIMEOUT = 4000;

// Das Undo-Kommando und "Alles auswaehlen" haengen an unterschiedlichen
// Tasten: macOS Cmd, Windows/Linux Strg (wie test/modules/editors/browser/
// undo.test.js schon fuer Undo vormacht).
var PASTE_KEY = process.platform === 'darwin' ? 'Meta+v' : 'Control+v';
var UNDO_KEY = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
var SELECT_ALL_KEY = process.platform === 'darwin' ? 'Meta+a' : 'Control+a';

/** Setzt vor dem Laden den Textmodus, wie popup.test.js es fuer #description vormacht. */
function useSourceMode(page) {
  return page.addInitScript(function () {
    try { window.localStorage.setItem('jira.editor.mode', 'source'); } catch (error) { /* egal */ }
  });
}

/**
 * Ein unerwarteter Dialog (alert/confirm/beforeunload) ist in jeder Datei
 * dieser Ebene ein Fehler - registriert direkt auf der Seite, damit ein
 * haengenbleibender Dialog den Lauf nie blockiert (dismiss() schliesst ihn
 * sofort, die Assertion meldet ihn trotzdem als Fehler).
 */
function watchForUnexpectedDialogs(page) {
  var seen = [];
  page.on('dialog', function (dialog) {
    seen.push(dialog.type() + ': ' + dialog.message());
    dialog.dismiss();
  });
  return seen;
}

/**
 * Probiert reload() in kurzen Schritten (300 ms), solange ein Versuch an
 * einem beforeunload-Dialog scheitert - der Zielzustand (Sperre abgegeben)
 * laesst sich hier nicht ueber das DOM ablesen: das Feld reisst seine eigene
 * Feldleiste beim Abbrechen synchron mit sich aus dem DOM, lange bevor
 * EditLock.cleanup() die Sperre tatsaechlich freigibt. Ein kurzer
 * Reload-Versuch prueft darum direkt den echten Vorgang: loest er einen
 * beforeunload-Dialog aus, war die Sperre noch aktiv, nur dieser Eintrag
 * wird aus dem `dialogs`-Log entfernt (andere Dialoge bleiben fuer die
 * Assertion des Aufrufers stehen) und der naechste Versuch startet.
 * Scheitert ein Versuch dagegen ohne neuen Dialog, war er vermutlich nur
 * langsam - auf einem belasteten Runner der Normalfall, nicht der Fehler.
 * Ein letzter Versuch mit grosszuegigem Budget (WAIT_TIMEOUT) entscheidet
 * dann, sein Ergebnis (auch ein Fehlschlag) gilt unveraendert. Laeuft
 * stattdessen die Gesamtfrist ab, waehrend weiter beforeunload-Dialoge
 * auftreten, scheitert die Funktion mit einer eigenen Fehlermeldung statt
 * dem rohen Playwright-Timeout des letzten Kurzversuchs.
 */
async function reloadWhenUnlocked(page, dialogs, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  var attempts = 0;
  for (;;) {
    var before = dialogs.length;
    attempts += 1;
    try {
      await page.reload({ timeout: 300 });
      return;
    } catch (error) {
      if (dialogs.length === before) {
        // Kein neuer Dialog: der Versuch war nur langsam, die Sperre war
        // vermutlich schon abgegeben. Ein letzter Versuch mit grosszuegigem
        // Budget entscheidet - sein Ergebnis gilt unveraendert, auch ein
        // Timeout dieses Versuchs darf weiterhin scheitern.
        return await page.reload({ timeout: WAIT_TIMEOUT });
      }
      // Nur den beforeunload-Eintrag zuruecksetzen: alles ab `before`, was
      // nicht mit 'beforeunload' beginnt (alert/confirm), bleibt stehen.
      var keptDialogs = dialogs.slice(before).filter(function (entry) {
        return entry.indexOf('beforeunload') !== 0;
      });
      dialogs.length = before;
      Array.prototype.push.apply(dialogs, keptDialogs);
      if (Date.now() >= deadline) {
        throw new Error('Sperre wurde innerhalb von ' + timeoutMs +
          ' ms nicht abgegeben (' + attempts + ' Versuch(e) mit beforeunload-Dialog)');
      }
    }
  }
}

describe('Echte Eingabe: Zwischenablage, Tastatur, Dialoge', function () {
  var readyPromise = extLib.canRunExtension();
  var ready = null;

  after(async function () {
    if (ready && ready.ok) await ready.teardown();
  });

  test('Strg+Z nimmt die Einfuege-Automatik zurueck', async function (t) {
    ready = await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var origin = 'http://127.0.0.1:' + ready.port;
    await ready.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origin });

    var fixturePage = ready.context.pages()[0] || await ready.context.newPage();
    var dialogs = watchForUnexpectedDialogs(fixturePage);
    await useSourceMode(fixturePage);
    await fixturePage.goto(origin + '/' + fixtures.JIRA912);
    await fixturePage.waitForSelector('.jmd-fab', { timeout: WAIT_TIMEOUT });

    await fixturePage.click('#description-val');
    await fixturePage.waitForSelector('.jmd-fieldbar', { timeout: WAIT_TIMEOUT });
    await fixturePage.waitForSelector('#description', { timeout: WAIT_TIMEOUT });

    // Zwischenablage echt fuellen (kein Stub aus test/lib/dom.js) - das
    // Content-Script sieht nachher ein echtes browserseitiges paste-Event.
    await fixturePage.evaluate(function (text) {
      return window.navigator.clipboard.writeText(text);
    }, '# Titel');

    // Sauberer Ausgangszustand fuer den Undo-Vergleich, ueber echte Tasten
    // geleert statt per fill()/.value - beides wuerde den Undo-Verlauf der
    // Textarea wie der native Setter aus Issue #09 loeschen.
    await fixturePage.click('#description');
    await fixturePage.keyboard.press(SELECT_ALL_KEY);
    await fixturePage.keyboard.press('Delete');
    await fixturePage.keyboard.type('Vorher ');
    assert.strictEqual(await fixturePage.inputValue('#description'), 'Vorher ');

    await fixturePage.keyboard.press(PASTE_KEY);

    // Automatik konvertiert "# Titel" -> "h1. Titel" und fuegt es als
    // eigenen Block ein (insertModeFor() in content.js: h1. matched Block).
    var afterPaste = 'Vorher \nh1. Titel';
    await fixturePage.waitForFunction(function (expected) {
      var field = document.getElementById('description');
      return !!field && field.value === expected;
    }, afterPaste, { timeout: WAIT_TIMEOUT });
    assert.strictEqual(await fixturePage.inputValue('#description'), afterPaste);

    await fixturePage.keyboard.press(UNDO_KEY);

    // Issue #09: vorher sprang Undo bis vor das Getippte zurueck und leerte
    // das Feld komplett - execCommand('insertText') haelt die eingefuegte
    // Umwandlung jetzt als eigenen Schritt im echten Undo-Verlauf.
    await fixturePage.waitForFunction(function (expected) {
      var field = document.getElementById('description');
      return !!field && field.value === expected;
    }, 'Vorher ', { timeout: WAIT_TIMEOUT });
    assert.strictEqual(await fixturePage.inputValue('#description'), 'Vorher ',
      'Strg+Z haette nur die Umwandlung zuruecknehmen sollen, nicht das Getippte');

    assert.deepStrictEqual(dialogs, [], 'unerwarteter Dialog waehrend des Einfuegens/Undo');
    await fixturePage.close();
  });

  test('Sperre und Wegnavigieren hinterlassen keinen haengenden beforeunload-Dialog', async function (t) {
    ready = ready || await readyPromise;
    if (!ready.ok) {
      t.skip(ready.reason);
      return;
    }

    var origin = 'http://127.0.0.1:' + ready.port;
    var fixturePage = await ready.context.newPage();
    var dialogs = watchForUnexpectedDialogs(fixturePage);
    await useSourceMode(fixturePage);

    // window.JiraEditLock laeuft in der isolierten Welt des Content-Scripts -
    // page.evaluate() sieht nur die Hauptwelt der Seite (siehe welt.test.js).
    // Die Sperre kommt darum ausschliesslich ueber das DOM zum Vorschein:
    // das Schloss an der Feldleiste (aria-pressed, editlock.js:416).
    await fixturePage.goto(origin + '/' + fixtures.JIRA912);
    await fixturePage.waitForSelector('.jmd-fab', { timeout: WAIT_TIMEOUT });

    await fixturePage.click('#description-val');
    await fixturePage.waitForSelector('.jmd-fieldbar', { timeout: WAIT_TIMEOUT });
    await fixturePage.waitForSelector('#description', { timeout: WAIT_TIMEOUT });
    await fixturePage.waitForSelector('.jmd-fieldbar__btn--lock[aria-pressed="true"]', { timeout: LOCK_TIMEOUT });

    // Issue #02: in 9.12.2 entfernt Jira das Formular beim Abbrechen ganz
    // aus dem DOM (statt es nur zu verstecken) - EditLock.cleanup() gibt die
    // Sperre damit ueber den naechsten Scan ab, kein hidden-Feld bleibt haengen.
    await fixturePage.click('.save-options .cancel');
    await fixturePage.waitForFunction(function () {
      return !document.getElementById('description');
    }, null, { timeout: LOCK_TIMEOUT });

    // Das Entfernen aus dem DOM ist sofort da, die Sperre faellt erst mit dem
    // naechsten Scan (scheduleScan()-Debounce, 400 ms, content.js). Jira
    // ersetzt beim Abbrechen das ganze Formular synchron mit dem Klick und
    // reisst die eigene Feldleiste (in genau diesem Formular verankert)
    // gleich mit aus dem DOM - lange bevor EditLock.cleanup() beim naechsten
    // Scan die Sperre tatsaechlich freigibt. Ein Selektor auf die Leiste
    // zeigt darum nur, dass Jira aufgeraeumt hat, nicht dass die Sperre weg
    // ist - kein DOM-Signal bleibt stehen, an dem sich der richtige
    // Zeitpunkt ablesen liesse. Gewartet wird darum auf den eigentlichen
    // Zielzustand direkt: ein Reload versucht es in kurzen Schritten, bis er
    // ohne beforeunload-Dialog durchlaeuft (Sperre wirklich abgegeben) - der
    // Watcher unten sieht nur den letzten, tatsaechlich sauberen Versuch.
    await reloadWhenUnlocked(fixturePage, dialogs, LOCK_TIMEOUT);
    await fixturePage.waitForSelector('.jmd-fab', { timeout: WAIT_TIMEOUT });

    assert.deepStrictEqual(dialogs, [], 'unerwarteter Dialog beim Wegnavigieren nach dem Abbrechen');
    await fixturePage.close();
  });
});
