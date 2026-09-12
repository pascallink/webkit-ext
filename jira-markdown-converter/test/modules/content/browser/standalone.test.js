/**
 * Standalone-Modus auf einer fremden Seite (kein Jira): keine Feldleiste,
 * kein schwebender Button, kein Einfrieren - nur das Panel bleibt ueber die
 * Nachricht des Kontextmenues erreichbar. Aufruf:
 * npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Standalone-Modus', { skip: !hasPlaywright }, function () {
  test('Standalone-Seite bekommt keine Feldleiste und kein Einfrieren', async function () {
    var browser = await browserPromise;
    var page = await browserLib.standalonePage(browser, null, fixtures.FOREIGN);

    assert.strictEqual(await page.locator('.jmd-fab').count(), 0, 'kein schwebender Button erwartet');
    assert.strictEqual(await page.locator('.jmd-fieldbar').count(), 0, 'keine Feldleiste erwartet');

    // editlock.js wird auf fremden Seiten gar nicht erst eingespielt - damit
    // steht auch dessen beforeunload-Wachposten nirgends.
    assert.strictEqual(await page.evaluate(function () { return window.JiraEditLock; }), undefined);

    // Textarea fokussieren - in Jira wuerde das Feld jetzt einfrieren.
    await page.focus('#notiz');

    // Klick auf Link und Schaltflaeche muessen bei der Seite ankommen, nichts
    // faengt sie ab.
    await page.click('#link');
    await page.click('#knopf');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__clicks; }),
      ['link', 'knopf']);

    // Escape erreicht die Seite ungehindert.
    await page.focus('#notiz');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(function () { return !!window.__escapeSeen; }), true);

    // Das Panel bleibt erreichbar - ueber dieselbe Nachricht, die das
    // Kontextmenue aus dem Standalone-Pfad heraus schickt - und wandelt um.
    await page.evaluate(function () {
      window.__onMessage({ type: 'open-panel', text: '# Titel' }, {}, function () {});
    });
    assert.ok(await page.locator('.jmd-panel--open').count());
    assert.strictEqual(await page.inputValue('#jmd-output'), 'h1. Titel');

    await page.close();
  });
});
