/**
 * Einfrieren gegen den Nachbau der Jira-9.12.2-Vorgangsansicht
 * (test/fixtures/mock-jira-912-issue-view.html, JIRA912): Toolbar-Link,
 * Bearbeiten-Dialog und Label-Dialog duerfen durch das Einfrieren nicht
 * unbedienbar werden (Issues #112, #90, #111).
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
 * Kommentarformular oeffnen und warten, bis unsere Leiste dranhaengt. Der
 * Nachbau haelt den TinyMCE-Rahmen bis zum ersten Aufbau auf
 * visibility:hidden (wie der echte Editor waehrend der Initialisierung) -
 * fuer den Test darum gleich auf den Textmodus umschalten, statt in den
 * (unklickbaren) Rahmen zu klicken.
 */
async function openComment(page) {
  await page.click('#footer-comment-button');
  await page.waitForSelector('#addcomment .jmd-fieldbar', { timeout: 4000 });
  await page.click('#addcomment li[data-mode="source"] button');
  await page.waitForTimeout(300);
}

/** Bearbeiten-Dialog oeffnen. */
async function openEditDialog(page) {
  await page.click('#edit-issue');
  await page.waitForSelector('#edit-issue-dialog[aria-hidden="false"]', { timeout: 4000 });
}

/** Selektor innerhalb des Beschreibungsfelds im Bearbeiten-Dialog (3. Feldgruppe). */
function inDialogDescription(selector) {
  return '#edit-issue-dialog .field-group:nth-of-type(3) ' + selector;
}

/**
 * Das Beschreibungsfeld im Dialog steht per Voreinstellung im visuellen
 * Modus (Rich-Text-Rahmen) - fuer die Textarea erst auf den Textmodus
 * umschalten, dann hineinklicken und auf die Sperre warten.
 */
async function focusDialogDescription(page) {
  await page.click(inDialogDescription('li[data-mode="source"] button'));
  await page.waitForTimeout(300);
  await page.click('#edit-issue-dialog textarea#description');
  await page.waitForFunction(function () {
    return window.JiraEditLock.isActive();
  }, null, { timeout: 4000 });
}

/** Label-Dialog per Tastenkuerzel oeffnen. */
async function openLabelsDialog(page) {
  await page.keyboard.press('l');
  await page.waitForSelector('#edit-labels-dialog.jira-dialog-open', { timeout: 4000 });
}

function mockLog(page) {
  return page.evaluate(function () { return window.__mock.log.slice(); });
}

function isActive(page) {
  return page.evaluate(function () { return window.JiraEditLock.isActive(); });
}

describe('Einfrieren gegen den Nachbau der Vorgangsansicht (JIRA912)', { skip: !hasPlaywright }, function () {
  test('Toolbar-Link navigiert nicht, solange eingefroren ist', async function () {
    // Issue #112: der Klick-Handler von Jira an #assign-issue oeffnet einen
    // Dialog und verhindert selbst die Navigation - kommt der Klick dort nie
    // an (weil unser Wachposten ihn vorher stoppt), folgt der Browser
    // stattdessen dem href und die Seite laedt neu.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openComment(page);
    await page.click('#comment');
    await page.keyboard.type('Wichtiger Kommentar');
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });

    var before = await page.evaluate(function () { return window.location.search; });
    await page.click('#assign-issue');
    await page.waitForTimeout(800);

    assert.strictEqual(await page.evaluate(function () { return window.location.search; }), before,
      'Toolbar-Link hat trotz Sperre navigiert');
    assert.strictEqual(await page.evaluate(function () {
      return document.getElementById('mock-navigated').hidden;
    }), true, 'Navigationshinweis ist sichtbar - Jira ist trotz Sperre navigiert');
    await page.close();
  });

  test('Escape und Abbrechen erreichen den Bearbeiten-Dialog', async function () {
    // Issue #90: Escape im gesperrten Feld selbst bleibt weiterhin gestoppt
    // (schuetzt den Entwurf) - der Dialog als Ganzes darf dadurch aber nicht
    // unbedienbar werden. Abbrechen liegt in .buttons-container.form-footer,
    // ausserhalb des Rahmens, den AREA_SELECTOR um das Feld findet.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openEditDialog(page);
    await focusDialogDescription(page);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(function () {
      return document.getElementById('edit-issue-dialog').getAttribute('aria-hidden');
    }), 'false', 'Escape hat den Dialog entgegen der Absicherung geschlossen');

    await page.click('#edit-issue-dialog button.cancel');
    await page.waitForTimeout(200);
    var log = await mockLog(page);
    assert.ok(log.indexOf('edit dialog CANCEL click') !== -1,
      'Abbrechen hat den Bearbeiten-Dialog nicht erreicht: ' + JSON.stringify(log));
    await page.close();
  });

  test('Label-Feld friert nicht ein', async function () {
    // Issue #111: #labels-textarea ist eine kleine Auswahl-Textarea
    // (role=combobox), keine Wiki-Bearbeitung - sie soll nie einfrieren,
    // damit Escape den Dialog wie gewohnt schliesst.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openLabelsDialog(page);
    await page.click('#labels-textarea');
    await page.keyboard.type('backend');
    await page.waitForTimeout(500);

    assert.strictEqual(await isActive(page), false, 'Labels-Feld haette nicht einfrieren duerfen');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(function () {
      return document.getElementById('edit-labels-dialog').classList.contains('jira-dialog-open');
    }), false, 'Escape hat den Label-Dialog nicht geschlossen');
    await page.close();
  });
});
