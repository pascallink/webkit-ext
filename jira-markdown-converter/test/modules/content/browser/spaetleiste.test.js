/**
 * Leiste an Feldern, die beim ersten Scan noch zu klein oder verdeckt waren
 * (Issue #101): vier Faelle sichern je einen Nachtrags-Pfad ab. `rows` prueft
 * den Attributpfad des MutationObserver, der Viewport-Wechsel ohne jeden
 * DOM-Eintrag den ResizeObserver, der Fokus-Fall das Zusammenspiel aus
 * focusin-Wachposten, Attributpfad und ResizeObserver, und der Rahmentausch
 * am Rich-Text-Feld (Issue #101-Nachtrag) denselben ResizeObserver-Pfad nach
 * einem TinyMCE-Rahmenwechsel. Alle vier duerfen dabei keinen Dauerscan
 * anstossen.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var SERVER = fixtures.SERVER;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

function anhaengen(page, id) {
  return page.evaluate(function (fieldId) {
    var group = document.createElement('div');
    group.className = 'field-group';
    var textarea = document.createElement('textarea');
    textarea.id = fieldId;
    textarea.setAttribute('rows', '1');
    group.appendChild(textarea);
    document.body.appendChild(group);
  }, id);
}

function hatLeiste(page, id) {
  return page.waitForFunction(function (fieldId) {
    var field = document.getElementById(fieldId);
    if (!field) return false;
    var bars = document.querySelectorAll('.jmd-fieldbar');
    for (var i = 0; i < bars.length; i++) {
      if (bars[i].__jmdField === field) return true;
    }
    return false;
  }, id, { timeout: 2000 });
}

function fuegeRTEFeldEin(page, id) {
  return page.evaluate(function (fieldId) {
    var group = document.createElement('div');
    group.className = 'field-group';
    var frame = document.createElement('iframe');
    frame.id = fieldId + '_ifr';
    frame.setAttribute('style', 'height: 4vh');
    var textarea = document.createElement('textarea');
    textarea.id = fieldId;
    textarea.setAttribute('style', 'display:none');
    group.appendChild(frame);
    group.appendChild(textarea);
    document.body.appendChild(group);

    var doc = frame.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><body contenteditable="true"></body></html>');
    doc.close();
  }, id);
}

function tauscheRahmen(page, id) {
  return page.evaluate(function (fieldId) {
    var alterRahmen = document.getElementById(fieldId + '_ifr');
    var group = alterRahmen.parentNode;
    alterRahmen.remove();

    var neuerRahmen = document.createElement('iframe');
    neuerRahmen.id = fieldId + '_ifr';
    neuerRahmen.setAttribute('style', 'height: 4vh');
    group.appendChild(neuerRahmen);

    var doc = neuerRahmen.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><body contenteditable="true"></body></html>');
    doc.close();
  }, id);
}

describe('Leiste an spaet gewachsenen Feldern', { skip: !hasPlaywright }, function () {
  test('Leiste erscheint, wenn rows von 1 auf 8 wechselt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');

    await anhaengen(page, 'jmd-spaet');
    await page.waitForTimeout(600);

    var vorZustand = await page.evaluate(function () {
      var field = document.getElementById('jmd-spaet');
      return !!(field && field.dataset.jmdButtonAttached);
    });
    assert.strictEqual(vorZustand, false, 'zu kleines Feld hat schon eine Markierung bekommen');

    await page.evaluate(function () {
      document.getElementById('jmd-spaet').setAttribute('rows', '8');
    });
    await hatLeiste(page, 'jmd-spaet');

    var zaehlerNachAnbau = await page.evaluate(function () {
      return document.querySelectorAll('.jmd-fieldbar').length;
    });
    await page.waitForTimeout(1000);
    var zaehlerNachWarten = await page.evaluate(function () {
      return document.querySelectorAll('.jmd-fieldbar').length;
    });
    assert.strictEqual(zaehlerNachWarten, zaehlerNachAnbau,
      'Leistenzahl ist nach dem Anbau nicht stabil geblieben - Dauerscan?');

    await page.close();
  });

  test('Uebersprungenes Feld bekommt die Leiste beim Arbeiten im Feld nach', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');

    await anhaengen(page, 'jmd-spaet-fokus');
    await page.waitForTimeout(600);

    // Hier laufen bewusst mehrere Pfade zusammen: der focusin-Wachposten,
    // der Attributpfad des MutationObserver ueber style und der
    // ResizeObserver am zu kleinen Feld. Der Fall sichert damit das
    // Zusammenspiel ab, nicht den focusin-Zweig allein.
    var vorZustand = await page.evaluate(function () {
      var field = document.getElementById('jmd-spaet-fokus');
      var bars = document.querySelectorAll('.jmd-fieldbar');
      var hatBar = false;
      for (var i = 0; i < bars.length; i++) {
        if (bars[i].__jmdField === field) {
          hatBar = true;
          break;
        }
      }
      return {
        button: !!(field && field.dataset.jmdButtonAttached),
        bar: hatBar
      };
    });
    assert.strictEqual(vorZustand.button, false, 'zu kleines Feld hat schon eine Markierung bekommen');
    assert.strictEqual(vorZustand.bar, false, 'zu kleines Feld hat schon eine Leiste - der Fall prueft dann nichts');

    await page.focus('#jmd-spaet-fokus');
    await page.evaluate(function () {
      document.getElementById('jmd-spaet-fokus').style.height = '160px';
    });
    await hatLeiste(page, 'jmd-spaet-fokus');

    await page.close();
  });

  test('Leiste erscheint nach Fensterwechsel ohne DOM-Aenderung', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');

    // Klein genug, dass 4vh sicher unter 48px bleibt.
    await page.setViewportSize({ width: 800, height: 400 });

    await page.evaluate(function () {
      var group = document.createElement('div');
      group.className = 'field-group';
      var textarea = document.createElement('textarea');
      textarea.id = 'jmd-vh';
      textarea.setAttribute('style', 'height: 4vh');
      group.appendChild(textarea);
      document.body.appendChild(group);
    });
    await page.waitForTimeout(600);

    var vorZustand = await page.evaluate(function () {
      var field = document.getElementById('jmd-vh');
      return !!(field && field.dataset.jmdButtonAttached);
    });
    assert.strictEqual(vorZustand, false, 'zu kleines Feld hat schon eine Markierung bekommen');

    // Grosser Sprung, kein einziger DOM-Eintrag - nur die Fensterhoehe wechselt.
    await page.setViewportSize({ width: 800, height: 2000 });
    await hatLeiste(page, 'jmd-vh');

    await page.close();
  });

  test('Leiste erscheint nach Rahmentausch am Rich-Text-Feld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.RTE);

    // Klein genug, dass 4vh sicher unter 48px bleibt.
    await page.setViewportSize({ width: 800, height: 400 });
    await page.waitForSelector('.jmd-fieldbar');

    await fuegeRTEFeldEin(page, 'jmd-rahmen');
    await page.waitForTimeout(600);

    var vorZustand = await page.evaluate(function () {
      var field = document.getElementById('jmd-rahmen');
      return {
        button: !!(field && field.dataset.jmdButtonAttached),
        beobachtet: !!(field && field.dataset.jmdGrowthWatched)
      };
    });
    assert.strictEqual(vorZustand.button, false, 'zu kleines Rich-Text-Feld hat schon eine Markierung bekommen');
    assert.strictEqual(vorZustand.beobachtet, true, 'zu kleines Feld wird nicht beobachtet');

    // Jira tauscht den TinyMCE-Rahmen aus, die Textarea bleibt - der Rahmen
    // ist weiter zu klein, es aendert sich sonst nichts am DOM.
    await tauscheRahmen(page, 'jmd-rahmen');
    await page.waitForTimeout(600);

    // Grosser Sprung, kein einziger DOM-Eintrag - nur die Fensterhoehe wechselt.
    await page.setViewportSize({ width: 800, height: 2000 });
    await hatLeiste(page, 'jmd-rahmen');

    await page.close();
  });
});
