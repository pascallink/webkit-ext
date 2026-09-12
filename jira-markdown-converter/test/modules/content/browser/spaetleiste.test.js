/**
 * Leiste an Feldern, die beim ersten Scan noch zu klein oder verdeckt waren
 * (Issue #101): Attributaenderung (rows) und Klick in ein zunaechst
 * uebersprungenes Feld muessen die Leiste nachtraeglich anbauen, ohne dass
 * dabei ein Dauerscan entsteht.
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

  test('Klick in ein uebersprungenes Feld holt die Leiste nach', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');

    await anhaengen(page, 'jmd-spaet-fokus');
    await page.waitForTimeout(600);

    await page.focus('#jmd-spaet-fokus');
    await page.evaluate(function () {
      document.getElementById('jmd-spaet-fokus').style.height = '160px';
    });
    await hatLeiste(page, 'jmd-spaet-fokus');

    await page.close();
  });
});
