/**
 * Einfrieren im Beschreibungsfeld des Vorgangs: Textmodus, visueller Modus,
 * Moduswechsel, Speichern/Abbrechen und der schwebende Editor daneben.
 * Aufruf: npm run test:editlock --prefix jira-markdown-converter
 */
'use strict';

var path = require('path');
var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var ISSUE = fixtures.ISSUE;
var root = path.join(__dirname, '..', '..', '..', '..');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/** Beschreibungsfeld oeffnen und warten, bis unsere Leiste dranhaengt. */
async function openDescription(page) {
  await page.click('#description-val');
  await page.waitForSelector('.jmd-fieldbar', { timeout: 4000 });
}

function locked(page) {
  return page.evaluate(function () { return window.JiraEditLock.isActive(); });
}

function open(page) {
  return page.evaluate(function () {
    return document.getElementById('description-val').classList.contains('active');
  });
}

function closedBy(page) {
  return page.evaluate(function () { return window.__closed; });
}

describe('Einfrieren im Beschreibungsfeld des Vorgangs', { skip: !hasPlaywright }, function () {
  test('Textmodus: das Feld bleibt beim Klick daneben offen', async function () {
    // Jira schliesst hier in der Erfassungsphase am Dokument - vor unserem
    // eigenen Wachposten, wenn der nur am Dokument haengt.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.fill('#description', 'Wichtige Aenderung');
    await page.click('#daneben');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), [], 'Jira hat das Feld geschlossen');
    assert.strictEqual(await open(page), true, 'das Feld wurde geschlossen');
    assert.strictEqual(await page.inputValue('#description'), 'Wichtige Aenderung');
    await page.close();
  });

  test('Speichern neben dem Wiki-Feld funktioniert weiter', async function () {
    // Die Knoepfe liegen im Feldblock, aber ausserhalb des Wiki-Felds.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.fill('#description', 'Neuer Stand');
    await page.click('#speichern');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.__saved; }), 'Neuer Stand');
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.close();
  });

  test('Abbrechen funktioniert weiter', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.click('#abbrechen');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), ['abbrechen']);
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.close();
  });

  test('nach dem Moduswechsel bleibt das Feld eingefroren', async function () {
    // Jira baut den Feldblock beim Wechsel neu auf - die Sperre muss auf die
    // neue Textarea uebergehen.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.click('#visuell');
    await page.waitForTimeout(300);
    await page.click('#textmodus');
    await page.waitForTimeout(300);
    assert.strictEqual(await locked(page), true, 'die Sperre ist beim Umbau verloren gegangen');
    assert.strictEqual(await page.evaluate(function () {
      return document.querySelector('.jmd-fieldbar__btn--lock').getAttribute('aria-pressed');
    }), 'true', 'das Schloss an der neuen Leiste zeigt den falschen Zustand');
    await page.click('#daneben');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), [], 'Jira hat das Feld geschlossen');
    await page.close();
  });

  test('visueller Modus: auch der Editorrahmen friert das Feld ein', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.click('#visuell');
    await page.waitForTimeout(300);
    await page.frameLocator('#description_ifr').locator('body').click();
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.click('#daneben');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), [], 'Jira hat das Feld geschlossen');
    assert.strictEqual(await open(page), true, 'das Feld wurde geschlossen');
    await page.close();
  });

  test('Escape im Beschreibungsfeld bricht nicht ab', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.press('#description', 'Escape');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), []);
    await page.close();
  });

  test('der schwebende Editor schliesst das eingefrorene Feld nicht', async function () {
    // Das Panel liegt ausserhalb des Feldblocks - fuer Jira also "daneben".
    // Bedienbar bleibt es trotzdem: der Klick geht durch, alles andere nicht.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.locator('.jmd-fieldbar').first().getByText('Editor').click();
    await page.click('.jmd-panel textarea');
    await page.fill('#jmd-input', '# Titel');
    await page.click('.jmd-panel [data-action="insert"]');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), [], 'Jira hat das Feld geschlossen');
    assert.ok(/h1\. Titel/.test(await page.inputValue('#description')),
      'das Panel hat nichts eingefuegt: ' + await page.inputValue('#description'));
    await page.close();
  });

  test('vor der Seite geladen greift das Einfrieren ebenfalls', async function () {
    // Wie im Manifest: run_at document_start. Die Erweiterung laeuft dann vor
    // allen Skripten der Seite - und muss ihre Oberflaeche trotzdem erst
    // aufbauen, wenn das Dokument steht.
    var browser = await browserPromise;
    var context = await browser.newContext();
    var page = await context.newPage();
    await page.addInitScript({ content: browserLib.CHROME_STUB });
    for (var i = 0; i < browserLib.SOURCES.length; i++) {
      await page.addInitScript({ content: browserLib.readSource(browserLib.SOURCES[i]) });
    }
    await page.goto('file://' + path.join(root, 'test', 'fixtures', ISSUE));
    await page.waitForFunction(function () {
      return !!document.querySelector('.jmd-fab');
    }, null, { timeout: 5000 });
    await openDescription(page);
    await page.click('#daneben');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), [], 'Jira hat das Feld geschlossen');
    await page.close();
  });

  test('ohne Einfrieren schliesst Jira das Beschreibungsfeld weiterhin', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { freezeEditMode: false }, ISSUE);
    await openDescription(page);
    await page.click('#daneben');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), ['klick-daneben']);
    await page.close();
  });
});
