/**
 * Einfrieren im visuellen Modus (Rich-Text-Rahmen) gegen den Nachbau der
 * Jira-9.12.2-Vorgangsansicht (test/fixtures/mock-jira-912-issue-view.html,
 * JIRA912): der Nachbau fokussiert den Rahmen 50 ms nach dem Mounten, die
 * Instanz sofort - vor dem Fix zu #107 haengt EditLock.lock() erst am
 * 400-ms-Scan, der Fokus ist da laengst durch (Issue #107).
 * Aufruf: npm run test:editlock --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var JIRA912 = fixtures.JIRA912;

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/**
 * Beschreibungsfeld oeffnen, Jira wechselt per Voreinstellung sofort in den
 * visuellen Modus. Bewusst nicht auf die Leiste (.jmd-fieldbar) warten - die
 * kommt erst mit dem 400-ms-Scan aus content.js und wuerde den Fehler
 * zudecken. Stattdessen nur bis der Nachbau den Rahmen fokussiert hat.
 */
async function openDescriptionVisual(page) {
  await page.click('#description-val');
  // Der Rahmen bleibt waehrend der Initialisierung auf visibility:hidden (wie
  // der echte Editor) - nur auf das Anhaengen warten, nicht auf Sichtbarkeit.
  await page.waitForSelector('#description-val.active iframe.tox-edit-area__iframe',
    { state: 'attached', timeout: 4000 });
  await page.waitForFunction(function () {
    return !!document.activeElement && document.activeElement.tagName === 'IFRAME';
  }, null, { timeout: 4000 });
}

describe('Einfrieren im visuellen Modus (JIRA912)', { skip: !hasPlaywright }, function () {
  test('Beschreibung friert im visuellen Modus schon beim ersten Oeffnen ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openDescriptionVisual(page);
    // Die 100 ms sind die Zusage aus dem Issue und liegen bewusst unter den
    // 400 ms des Scans - ein waitForFunction mit langem Timeout wuerde den
    // Fehler verdecken.
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(function () { return window.JiraEditLock.isActive(); }),
      'die Beschreibung ist im visuellen Modus nicht sofort eingefroren');
    await page.close();
  });

  test('Klick daneben speichert die halb getippte Beschreibung nicht', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openDescriptionVisual(page);
    await page.keyboard.type('Halbfertiger Text');
    // ausserhalb des Feldes, kein [data-jmd-ui]
    await page.click('#details-module');
    await page.waitForTimeout(150);

    assert.strictEqual(await page.evaluate(function () { return window.__mock.saved.description; }), undefined,
      'Klick daneben hat den halb getippten Text gespeichert');
    var log = await page.evaluate(function () { return window.__mock.log.slice(); });
    var savedByClickOutside = log.some(function (entry) {
      return entry.indexOf('description SAVED by click outside') !== -1;
    });
    assert.strictEqual(savedByClickOutside, false,
      'Log enthaelt einen Eintrag ueber das Speichern per Klick daneben: ' + JSON.stringify(log));
    assert.strictEqual(await page.evaluate(function () {
      return document.getElementById('description-val').classList.contains('active');
    }), true, 'das Feld wurde beim Klick daneben geschlossen');
    await page.close();
  });

  test('ohne Einfrieren bleibt isActive() im visuellen Modus false', async function () {
    // Absicherung gegen Ueberreaktion: die Einstellung muss weiterhin
    // greifen, auch wenn der Fokus sofort im Rahmen landet.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { freezeEditMode: false }, JIRA912);
    await openDescriptionVisual(page);
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(function () { return window.JiraEditLock.isActive(); }), false,
      'ohne Einfrieren haette isActive() false bleiben muessen');
    await page.close();
  });
});
