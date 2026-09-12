/**
 * Automatik beim Einfuegen und Umwandeln an Ort und Stelle (Buttonleiste,
 * Tastenkuerzel, Nachricht insert-text). Beide Abschnitte teilen sich das
 * Ziel: Markdown wird beim Einfuegen bzw. auf Anforderung im Feld selbst
 * umgewandelt, ohne ueber das Panel zu gehen.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var pasteInto = require('../../../lib/dom').pasteInto;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

// Das Undo-Kommando des Browsers haengt an unterschiedlichen Tasten: auf
// macOS an Cmd+Z, auf Windows/Linux an Strg+Z. Nur die zur Plattform des
// Testlaufs passende Taste loest den echten Undo-Stack der Textarea aus.
var UNDO_KEY = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';

describe('Automatik beim Einfuegen', { skip: !hasPlaywright }, function () {
  test('Markdown wird beim Einfuegen in die Textarea umgewandelt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await pasteInto(page, '#description', '# Titel\n\n- eins\n- zwei');
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel\n\n* eins\n* zwei');
    await page.close();
  });

  test('Klartext ohne Markdown wird nicht angefasst', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    var handled = await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', 'Ein ganz normaler Satz.');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(handled, false, 'das Einfuegen haette nicht abgefangen werden duerfen');
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  test('Vorhandenes Jira-Markup wird beim Einfuegen nicht umgewandelt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    var repro = 'h2. Titel\n* punkt\n{code:java}\nint x = 1;\n{code}';
    var handled = await page.evaluate(function (text) {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', text);
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, repro);
    assert.strictEqual(handled, false, 'das Einfuegen haette nicht abgefangen werden duerfen');
    assert.strictEqual(await page.inputValue('#description'), '');
    var toastText = await page.textContent('.jmd-toast');
    assert.ok(/Jira-Markup/.test(toastText), 'Hinweis auf vorhandenes Jira-Markup fehlt: ' + toastText);
    await page.close();
  });

  test('Einfuegen an der Cursorposition erhaelt den Rest', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
    });
    await pasteInto(page, '#description', '**x**');
    assert.strictEqual(await page.inputValue('#description'), 'A*x*B');
    await page.close();
  });

  test('Rich-Text-Editor bekommt konvertiertes Markup als Paste', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await pasteInto(page, '.ProseMirror', '# Titel\n\n- eins');
    var pastes = await page.evaluate(function () {
      return window.__pastes;
    });
    assert.deepStrictEqual(pastes, ['h1. Titel\n\n* eins'], 'erhalten: ' + JSON.stringify(pastes));
    var text = await page.textContent('.ProseMirror');
    assert.ok(text.indexOf('h1. Titel') !== -1, 'Editor-Inhalt: ' + text);
    await page.close();
  });

  test('Einstellung "Markdown durchreichen" laesst den Rich-Text-Editor in Ruhe', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { richEditorFormat: 'markdown' });
    var handled = await page.evaluate(function () {
      var element = document.querySelector('.ProseMirror');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return window.__pastes;
    });
    assert.deepStrictEqual(handled, ['# Titel'], 'das Markdown haette unveraendert ankommen muessen');
    await page.close();
  });

  test('Fehler im Konverter laesst das Einfuegen durch', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    var pageErrors = [];
    page.on('pageerror', function (error) { pageErrors.push(error.message); });

    var result = await page.evaluate(function () {
      // Das Content-Script haelt dieselbe Objektreferenz (src/content.js:11) -
      // der Stub wirkt sofort auf den laufenden Code.
      window.JiraMarkdown.convert = function () {
        throw new Error('kaputt');
      };
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      return element.dispatchEvent(event);
    });
    // Ein nicht abgefangener Fehler wuerde erst mit Verzoegerung als
    // pageerror ankommen - kurz abwarten, bevor pageErrors geprueft wird.
    await page.waitForTimeout(200);

    assert.strictEqual(result, true, 'defaultPrevented haette nicht gesetzt sein duerfen');
    assert.deepStrictEqual(pageErrors, [], 'der Konverterfehler haette abgefangen werden muessen');
    assert.strictEqual(await page.inputValue('#description'), '', 'das Feld haette unveraendert bleiben muessen');
    await page.close();
  });

  test('Automatik laesst sich abschalten', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { convertOnPaste: false });
    var prevented = await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(prevented, false);
    await page.close();
  });

  test('Strg+Z nach der Automatik laesst das Getippte stehen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.focus('#description');
    await page.keyboard.type('Vorher ');
    await pasteInto(page, '#description', '# Titel\n\n- a');
    // Blockmakro auf eigener Zeile: da 'Vorher ' nicht mit Zeilenumbruch
    // endet, schiebt insertIntoTextarea() vor dem Titel einen Umbruch ein.
    assert.strictEqual(await page.inputValue('#description'), 'Vorher \nh1. Titel\n\n* a');
    await page.keyboard.press(UNDO_KEY);
    assert.strictEqual(await page.inputValue('#description'), 'Vorher ');
    await page.close();
  });

  // insertIntoRich() ist wegen #107-#109 ausdruecklich eingefroren (siehe
  // editors.js) - hier nur der Ist-Stand festgehalten: das synthetische
  // paste-Event traegt bereits einen Undo-Eintrag, ein eigener Undo-Test
  // dafuer bleibt fuer #96 ausser Scope.
  test('Undo im Rich-Text-Editor bleibt wie gehabt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await pasteInto(page, '.ProseMirror', '# Titel\n\n- eins');
    var text = await page.textContent('.ProseMirror');
    assert.ok(text.indexOf('h1. Titel') !== -1, 'Editor-Inhalt: ' + text);
    await page.close();
  });
});

describe('Umwandeln an Ort und Stelle', { skip: !hasPlaywright }, function () {
  test('Buttonleiste wandelt den Feldinhalt um', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.fill('#description', '# Titel\n\n**fett**');
    await page.locator('.jmd-fieldbar').first().getByText('Umwandeln').click();
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel\n\n*fett*');
    await page.close();
  });

  test('Tastenkuerzel wandelt nur die Auswahl um', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.fill('#description', 'oben\n# Titel\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 13);
      window.__onMessage({ type: 'convert-selection' }, {}, function () {});
    });
    assert.strictEqual(await page.inputValue('#description'), 'oben\nh1. Titel\nunten');
    await page.close();
  });

  test('Nachricht insert-text fuegt Text ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.focus('#description');
    var response = await page.evaluate(function () {
      var result = null;
      window.__onMessage({ type: 'insert-text', text: 'h1. Von aussen', mode: 'replace' }, {}, function (value) {
        result = value;
      });
      return result;
    });
    assert.deepStrictEqual(response, { ok: true });
    assert.strictEqual(await page.inputValue('#description'), 'h1. Von aussen');
    await page.close();
  });

  test('Umwandeln zeigt bei vorhandenem Jira-Markup einen Hinweis', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    var repro = 'h2. Titel\n* punkt\n{code:java}\nint x = 1;\n{code}';
    await page.fill('#description', repro);
    await page.locator('.jmd-fieldbar').first().getByText('Umwandeln').click();
    var toastText = await page.textContent('.jmd-toast');
    assert.ok(/schon nach Jira-Markup aus/.test(toastText), 'Hinweis auf vorhandenes Jira-Markup fehlt: ' + toastText);
    await page.close();
  });
});
