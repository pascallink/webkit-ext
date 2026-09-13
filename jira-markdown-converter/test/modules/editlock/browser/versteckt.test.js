/**
 * Einfrieren gegen ein verstecktes Feld (Issue #89): `follow()` hielt bisher
 * jedes Feld, das noch `isConnected` war, ohne nach Bedienbarkeit zu fragen -
 * ein per `hidden` versteckt geschlossenes Formular blieb damit auf ewig
 * gesperrt. Getestet gegen den Nachbau der Jira-9.12.2-Vorgangsansicht
 * (test/fixtures/mock-jira-912-issue-view.html, JIRA912): das Verstecken
 * passiert per `page.evaluate`, keine neue Fixture noetig.
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

/** Kommentarformular oeffnen, in den Textmodus wechseln und das Feld fokussieren. */
async function openComment(page) {
  await page.click('#footer-comment-button');
  await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 4000 });
  await page.click('#addcomment li[data-mode="source"] button');
  await page.waitForTimeout(300);
  await page.click('#comment');
}

function isActive(page) {
  return page.evaluate(function () { return window.JiraEditLock.isActive(); });
}

describe('Einfrieren gegen ein verstecktes Feld (JIRA912)', { skip: !hasPlaywright }, function () {
  test('verstecktes Kommentarfeld gibt die Sperre ab', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openComment(page);
    await page.keyboard.type('Wichtiger Kommentar');
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });

    // Eigener Zaehler fuer Fall 2, bevor das Feld verschwindet: #assign-issue
    // liegt in der Werkzeugleiste, klar ausserhalb des Kommentarfelds, und
    // mousedown steht in GUARDED.
    await page.evaluate(function () {
      window.__fremdeKlicks = 0;
      document.getElementById('assign-issue').addEventListener('mousedown', function () {
        window.__fremdeKlicks++;
      });
    });

    // Das umschliessende Formular verstecken - der 400-ms-Scan aus
    // content.js beobachtet `hidden` bereits und stoesst cleanup() an.
    await page.evaluate(function () {
      document.getElementById('issue-comment-add').hidden = true;
    });
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });

    // Fall 2: ein focusout aus dem (weiterhin im DOM stehenden, nur
    // versteckten) Feld darf nicht mehr geschluckt werden - synthetisch
    // ausgeloest, damit der Fall unabhaengig davon greift, ob der Browser
    // beim Verstecken selbst blurt. Ein mousedown auf ein Ziel ausserhalb
    // erreicht sein Ziel wieder.
    var fokusVerloren = await page.evaluate(function () {
      var comment = document.getElementById('comment');
      var zaehler = 0;
      comment.addEventListener('focusout', function () { zaehler++; });
      comment.dispatchEvent(new Event('focusout', { bubbles: true, cancelable: true }));
      return zaehler;
    });
    assert.strictEqual(fokusVerloren, 1, 'focusout aus dem versteckten Feld wurde geschluckt');

    await page.click('#assign-issue');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.__fremdeKlicks; }), 1,
      'ein Klick daneben hat sein Ziel nicht erreicht');

    await page.close();
  });

  test('verstecktes, geaendertes Feld fragt beim Verlassen nicht mehr', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openComment(page);
    await page.keyboard.type('Wichtiger Kommentar');
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });

    await page.evaluate(function () {
      document.getElementById('issue-comment-add').hidden = true;
    });
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });

    var asked = await page.evaluate(function () {
      var event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(asked, false, 'ein verstecktes Feld haette nicht mehr fragen duerfen');
    await page.close();
  });

  test('geoeffnetes Kommentarfeld bleibt gesperrt, solange es sichtbar ist', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openComment(page);
    await page.keyboard.type('Wichtiger Kommentar');
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    // Der Scan laeuft alle 400ms - auch nach Wartezeit bleibt ein sichtbares
    // Feld gesperrt.
    await page.waitForTimeout(600);
    assert.strictEqual(await isActive(page), true, 'ein sichtbares Feld hat seine Sperre verloren');
    await page.close();
  });
});
