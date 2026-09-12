/**
 * Gate fuer den schwebenden Button (Issue #102): kein Ziel, kein Button - ein
 * Dashboard ohne Eingabefeld bekommt keinen FAB. Sobald ein Feld oder
 * #issue-content nachgereicht wird (spaet ladende Vorgangsseite), holt der
 * naechste Scan den Button nach. Die Loginseite bleibt zusaetzlich auch mit
 * Eingabefeld unberuehrt (Sub-Task 2): kein FAB, keine Feldleiste, kein
 * Einfrieren. Aufruf:
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

function anhaengenTextfeld(page, id) {
  return page.evaluate(function (fieldId) {
    var textarea = document.createElement('textarea');
    textarea.id = fieldId;
    textarea.setAttribute('rows', '8');
    document.body.appendChild(textarea);
  }, id);
}

function anhaengenIssueContent(page) {
  return page.evaluate(function () {
    var div = document.createElement('div');
    div.id = 'issue-content';
    document.body.appendChild(div);
  });
}

describe('Gate fuer den schwebenden Button', { skip: !hasPlaywright }, function () {
  test('Dashboard ohne Feld bekommt keinen schwebenden Button', async function () {
    var browser = await browserPromise;
    var page = await browserLib.pageOhneFab(browser, null, fixtures.DASHBOARD);

    // Zeit fuer einen moeglichen (falschen) Scan lassen, statt nur den
    // Zustand direkt nach dem Laden zu pruefen.
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 0);

    await page.close();
  });

  test('nachgereichtes Feld holt den Button nach', async function () {
    var browser = await browserPromise;
    var page = await browserLib.pageOhneFab(browser, null, fixtures.DASHBOARD);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 0);

    await anhaengenTextfeld(page, 'jmd-dashboard-feld');
    await page.waitForSelector('.jmd-fab', { timeout: 2000 });
    assert.strictEqual(await page.locator('.jmd-fab').count(), 1);

    await page.close();
  });

  test('nachgereichtes #issue-content holt den Button nach', async function () {
    var browser = await browserPromise;
    var page = await browserLib.pageOhneFab(browser, null, fixtures.DASHBOARD);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 0);

    await anhaengenIssueContent(page);
    await page.waitForSelector('.jmd-fab', { timeout: 2000 });
    assert.strictEqual(await page.locator('.jmd-fab').count(), 1);

    await page.close();
  });

  test('Loginseite bekommt keine Oberflaeche', async function () {
    var browser = await browserPromise;
    var page = await browserLib.pageOhneFab(browser, null, fixtures.LOGIN);

    // Zeit fuer einen moeglichen (falschen) Scan lassen, statt nur den
    // Zustand direkt nach dem Laden zu pruefen - die Koeder-Textarea wuerde
    // ohne die Loginregel als Ziel durchgehen (Gate aus Sub-Task 1).
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 0);
    assert.strictEqual(await page.locator('.jmd-fieldbar').count(), 0);

    // Das Feld darf nicht einfrieren - der Klick auf den Submit-Knopf muss
    // bei der Seite ankommen (Zaehler im Fixture).
    await page.focus('#login-form-username');
    await page.click('#login-form-submit');
    assert.strictEqual(await page.evaluate(function () { return window.__submits; }), 1);

    await page.close();
  });
});
