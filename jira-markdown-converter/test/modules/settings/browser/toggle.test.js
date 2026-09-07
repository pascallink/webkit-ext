/**
 * Schalter fuer die Einfuege-Automatik: Panel, schwebender Button und die
 * Leisten an den Feldern zeigen und aendern denselben Zustand.
 * Aufruf: npm run test:settings --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');
var pasteInto = require('../../../lib/dom').pasteInto;

var SERVER = fixtures.SERVER;
var RTE = fixtures.RTE;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/** Zustand aller Schalter, die in Leisten am Feld haengen. */
function barToggles(page) {
  return page.evaluate(function () {
    var buttons = document.querySelectorAll('.jmd-fieldbar__btn--auto');
    return Array.prototype.map.call(buttons, function (button) {
      return {
        label: button.querySelector('.jmd-fieldbar__caption').textContent,
        color: button.querySelector('.jmd-fieldbar__dot').style.background,
        pressed: button.getAttribute('aria-pressed')
      };
    });
  });
}

describe('Schalter fuer die Einfuege-Automatik', { skip: !hasPlaywright }, function () {
  test('Schalter im Panel zeigt den Zustand an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.click('.jmd-fab');
    var view = await page.evaluate(function () {
      var card = document.querySelector('[data-role="toggle-card"]');
      return {
        checked: document.querySelector('.jmd-panel [data-option="convertOnPaste"]').checked,
        label: document.querySelector('[data-role="toggle-label"]').textContent,
        color: card.style.getPropertyValue('--jmd-switch-color')
      };
    });
    assert.strictEqual(view.checked, true);
    assert.ok(/an$/.test(view.label), 'Beschriftung: ' + view.label);
    assert.strictEqual(view.color, '#36b37e', 'aktiv muss gruen sein');
    await page.close();
  });

  test('Ausschalten faerbt grau und stoppt die Automatik', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');

    var view = await page.evaluate(function () {
      return {
        checked: document.querySelector('.jmd-panel [data-option="convertOnPaste"]').checked,
        label: document.querySelector('[data-role="toggle-label"]').textContent,
        color: document.querySelector('[data-role="toggle-card"]').style.getPropertyValue('--jmd-switch-color'),
        stored: window.__settings.convertOnPaste
      };
    });
    assert.strictEqual(view.checked, false);
    assert.ok(/aus$/.test(view.label), 'Beschriftung: ' + view.label);
    assert.strictEqual(view.color, '#8993a4', 'inaktiv muss grau sein');
    assert.strictEqual(view.stored, false, 'Einstellung wurde nicht gespeichert');

    // Und der eigentliche Zweck: Einfuegen bleibt jetzt unveraendert.
    await page.close();
  });

  test('nach dem Ausschalten wird nichts mehr umgewandelt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');
    await page.click('.jmd-panel [data-action="close"]');

    var prevented = await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(prevented, false, 'das Einfuegen wurde weiterhin abgefangen');
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  test('Zustandspunkt am schwebenden Button folgt dem Schalter', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser);
    var on = await page.evaluate(function () {
      return document.querySelector('.jmd-fab__dot').style.background;
    });
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');
    var off = await page.evaluate(function () {
      return document.querySelector('.jmd-fab__dot').style.background;
    });
    assert.notStrictEqual(on, off, 'der Punkt aendert seine Farbe nicht');
    assert.ok(/54, 179, 126/.test(on), 'aktiv nicht gruen: ' + on);
    await page.close();
  });

  test('ausgeschalteter Zustand wird beim Laden uebernommen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { convertOnPaste: false });
    await page.click('.jmd-fab');
    var view = await page.evaluate(function () {
      return {
        checked: document.querySelector('.jmd-panel [data-option="convertOnPaste"]').checked,
        color: document.querySelector('[data-role="toggle-card"]').style.getPropertyValue('--jmd-switch-color')
      };
    });
    assert.strictEqual(view.checked, false);
    assert.strictEqual(view.color, '#8993a4');
    await page.close();
  });

  test('Schalter sitzt auch in der Leiste am Feld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    var view = await barToggles(page);
    assert.ok(view.length >= 2, 'nicht an jeder Leiste ein Schalter: ' + view.length);
    view.forEach(function (button) {
      assert.ok(/an$/.test(button.label), 'Beschriftung: ' + button.label);
      assert.ok(/54, 179, 126/.test(button.color), 'aktiv nicht gruen: ' + button.color);
      assert.strictEqual(button.pressed, 'true');
    });
    await page.close();
  });

  test('Umschalten in der Leiste zieht alle Leisten nach', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    var view = await barToggles(page);
    view.forEach(function (button) {
      assert.ok(/aus$/.test(button.label), 'Beschriftung: ' + button.label);
      assert.ok(/137, 147, 164/.test(button.color), 'inaktiv nicht grau: ' + button.color);
      assert.strictEqual(button.pressed, 'false');
    });
    assert.strictEqual(await page.evaluate(function () { return window.__settings.convertOnPaste; }),
      false, 'Einstellung wurde nicht gespeichert');
    await page.close();
  });

  test('in der Leiste ausgeschaltet wird beim Einfuegen nichts umgewandelt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    await pasteInto(page, '#description', '# Titel');
    assert.strictEqual(await page.inputValue('#description'), '',
      'das Einfuegen wurde weiterhin abgefangen');

    // Gegenprobe: wieder an, und die Automatik greift erneut.
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    await pasteInto(page, '#description', '# Titel');
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel');
    await page.close();
  });

  test('Umschalten im Panel zieht in der Leiste nach', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');
    var view = await barToggles(page);
    view.forEach(function (button) {
      assert.ok(/aus$/.test(button.label), 'Beschriftung: ' + button.label);
      assert.strictEqual(button.pressed, 'false');
    });
    await page.close();
  });

  test('auch im Rich-Text-Editor hat die Leiste den Schalter', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    var before = await barToggles(page);
    assert.ok(before.length >= 1, 'kein Schalter an der Leiste');
    assert.ok(/an$/.test(before[0].label), 'Beschriftung: ' + before[0].label);
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    var after = await barToggles(page);
    assert.ok(/aus$/.test(after[0].label), 'Beschriftung: ' + after[0].label);
    assert.notStrictEqual(before[0].color, after[0].color, 'der Punkt aendert seine Farbe nicht');
    await page.close();
  });
});
