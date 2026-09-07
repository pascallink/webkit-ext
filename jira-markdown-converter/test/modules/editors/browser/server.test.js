/**
 * Jira Server / Data Center 9.x: Felderkennung, Buttonleistenposition,
 * Umwandeln und Einfuegen, Events fuer Jiras eigene Aenderungserkennung,
 * nachtraeglich eingeblendete Felder.
 * Aufruf: npm run test:editors --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var pasteInto = require('../../../lib/dom').pasteInto;
var SERVER = require('../../../lib/fixtures').SERVER;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Jira Server / Data Center 9.x', { skip: !hasPlaywright }, function () {
  test('Wiki-Felder (Beschreibung und Kommentar) werden erkannt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    var ids = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().map(function (element) {
        return element.id;
      });
    });
    assert.deepStrictEqual(ids.sort(), ['comment', 'description']);
    await page.close();
  });

  test('Schnellsuche wird nicht angefasst', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    var ids = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().map(function (element) {
        return element.id;
      });
    });
    assert.ok(ids.indexOf('searcher-query') === -1, 'Suchfeld wurde als Ziel angeboten');
    await page.close();
  });

  test('Buttonleiste sitzt direkt ueber dem Textfeld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var ok = await page.evaluate(function () {
      var textarea = document.querySelector('#description');
      var previous = textarea.previousElementSibling;
      return previous && previous.classList.contains('jmd-fieldbar');
    });
    assert.strictEqual(ok, true, 'Leiste steht nicht unmittelbar vor der Textarea');
    await page.close();
  });

  test('Umwandeln im Kommentarfeld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#comment', '## Analyse\n\n- **Ursache**: Timeout\n- Fix folgt');
    await page.focus('#comment');
    await page.evaluate(function () {
      window.__onMessage({ type: 'convert-selection' }, {}, function () {});
    });
    assert.strictEqual(await page.inputValue('#comment'), 'h2. Analyse\n\n* *Ursache*: Timeout\n* Fix folgt');
    await page.close();
  });

  test('Einfuegen mit Strg+V in die Beschreibung', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await pasteInto(page, '#description', '# Fehler\n\n| Feld | Wert |\n| --- | --- |\n| OS | Windows |');
    assert.strictEqual(await page.inputValue('#description'),
      'h1. Fehler\n\n||Feld||Wert||\n|OS|Windows|');
    await page.close();
  });

  test('input- und change-Event feuern (Jira merkt die Aenderung)', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.evaluate(function () {
      window.__events = [];
      var textarea = document.querySelector('#description');
      ['input', 'change'].forEach(function (name) {
        textarea.addEventListener(name, function () { window.__events.push(name); });
      });
    });
    await pasteInto(page, '#description', '# Titel');
    var events = await page.evaluate(function () { return window.__events; });
    assert.ok(events.indexOf('input') !== -1, 'kein input-Event');
    assert.ok(events.indexOf('change') !== -1, 'kein change-Event');
    await page.close();
  });

  test('nachtraeglich eingeblendetes Feld bekommt eine Leiste', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.evaluate(function () { window.__addInlineField(); });
    await page.waitForFunction(function () {
      var textarea = document.querySelector('#environment');
      return textarea && textarea.previousElementSibling &&
        textarea.previousElementSibling.classList.contains('jmd-fieldbar');
    }, null, { timeout: 4000 });
    await page.close();
  });

  test('Leiste verschwindet mit dem Feld', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.evaluate(function () { window.__addInlineField(); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('.jmd-fieldbar').length === 3;
    }, null, { timeout: 4000 });
    await page.evaluate(function () { window.__removeInlineField(); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('.jmd-fieldbar').length === 2;
    }, null, { timeout: 4000 });
    await page.close();
  });
});
