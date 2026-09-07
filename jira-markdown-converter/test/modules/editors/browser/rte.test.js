/**
 * Rich-Text-Editor (jira.rte.enabled): Erkennung trotz versteckter Textarea,
 * Buttonleistenposition, formatiertes Einfuegen und die Einstellungen dazu,
 * Umschalten in den Markup-Modus.
 * Aufruf: npm run test:editors --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var pasteInto = require('../../../lib/dom').pasteInto;
var RTE = require('../../../lib/fixtures').RTE;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Rich-Text-Editor (jira.rte.enabled)', { skip: !hasPlaywright }, function () {
  test('Feld wird trotz versteckter Textarea erkannt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    var found = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().map(function (element) {
        return element.id;
      });
    });
    assert.deepStrictEqual(found, ['description']);
    var active = await page.evaluate(function () {
      return window.JiraEditors.isRichTextActive(document.querySelector('#description'));
    });
    assert.strictEqual(active, true, 'Rich-Text-Modus nicht erkannt');
    await page.close();
  });

  test('Buttonleiste sitzt ueber dem Editor, nicht an der versteckten Textarea', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    var ok = await page.evaluate(function () {
      var bar = document.querySelector('.jmd-fieldbar');
      return bar.nextElementSibling && bar.nextElementSibling.id === 'mce-container';
    });
    assert.strictEqual(ok, true);
    await page.close();
  });

  test('formatiert einfuegen: HTML statt Markup', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await pasteInto(page, '#description', '# Titel\n\nMit **fett** und `code`.');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Einfuegen im Editor angekommen');
    assert.ok(/<h1>Titel<\/h1>/.test(pastes[0].html), 'HTML fehlt: ' + pastes[0].html);
    assert.ok(/<strong>fett<\/strong>/.test(pastes[0].html), 'Fettdruck fehlt: ' + pastes[0].html);
    // Als Rueckfalltext liegt weiterhin Jira-Markup bereit.
    assert.ok(/^h1\. Titel/.test(pastes[0].text), 'Klartext fehlt: ' + pastes[0].text);
    var rendered = await page.frameLocator('#description_ifr').locator('h1').textContent();
    assert.strictEqual(rendered, 'Titel');
    await page.close();
  });

  test('Einstellung "Jira-Markup einfuegen" schickt kein HTML', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { richEditorFormat: 'jira' }, RTE);
    await pasteInto(page, '#description', '# Titel');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes[0].html, '');
    assert.strictEqual(pastes[0].text, 'h1. Titel');
    await page.close();
  });

  test('Umschalten auf Markup-Modus vor dem Einfuegen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { switchToMarkup: true }, RTE);
    await pasteInto(page, '#description', '# Titel\n\n- eins');
    await page.waitForFunction(function () {
      return window.__mode === 'markup';
    }, null, { timeout: 4000 });
    await page.waitForFunction(function () {
      return document.querySelector('#description').value.indexOf('h1. Titel') !== -1;
    }, null, { timeout: 4000 });
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel\n\n* eins');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  test('Umschalter wird ueber die Beschriftung gefunden', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    var label = await page.evaluate(function () {
      var toggle = window.JiraEditors.findModeToggle(document.querySelector('#description'));
      return toggle ? toggle.id : null;
    });
    assert.strictEqual(label, 'toggle');
    await page.close();
  });

  test('ohne Umschalter wird formatiert eingefuegt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { switchToMarkup: true }, RTE);
    await page.evaluate(function () {
      // Umschalter entfernen: Jira benennt ihn je nach Version anders.
      document.getElementById('toggle').remove();
    });
    await pasteInto(page, '#description', '# Titel');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Rueckfall auf formatiertes Einfuegen');
    assert.ok(/<h1>Titel<\/h1>/.test(pastes[0].html));
    assert.strictEqual(await page.evaluate(function () { return window.__mode; }), 'rich');
    await page.close();
  });
});
