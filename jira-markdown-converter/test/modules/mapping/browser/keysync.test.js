/**
 * Tests fuer JiraKeySync (src/keysync.js, Issue #32 Sub-Task 4): Suche im
 * Beschreibungstext ueber JiraMapping.findKeys, Lesen der Leseansicht und der
 * Ablauf gegen den Nachbau von 9.12 (JIRA912) - Label, dann Custom Field.
 *
 * Fuer run() zaehlt fixtures.JIRA912 (mock-jira-912-issue-view.html), nicht
 * fixtures.OTRS (mock-jira-otrs.html): otrsflow.js/jiraui.js wurden fuer
 * Issue #26 auf die echten 9.12.2-Selektoren umgestellt (#shifter-dialog,
 * #modal-field-view, ui.submitForm() statt Button-Klick, siehe
 * test/modules/otrs/browser/verdrahtung.test.js) - die aeltere OTRS-Fixture
 * kennt weder #shifter-dialog noch ein <form> im Labels-Dialog und laesst
 * ui.submitForm() dort immer leerlaufen. keysync.js nutzt denselben Weg wie
 * otrsflow.js (addLabel/runShifterAction/ui.submitForm), darum laeuft dieser
 * Test gegen dieselbe DOM-verifizierte Fixture wie otrsflow.test.js. Das
 * einzige dort bekannte Custom Field heisst "Kunden Referenz" (siehe
 * #shifter-dialog-suggestions) - der Feldname im Test uebernimmt ihn 1:1.
 * Aufruf: npm run test:mapping --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

var JIRA912_FIXTURE = 'file://' + path.join(__dirname, '..', '..', '..', 'fixtures', fixtures.JIRA912);
var FIELD_NAME = 'Kunden Referenz';

/**
 * Laedt den Nachbau von 9.12 (JIRA912) mit nur jiraui.js und keysync.js -
 * nicht newPage() aus lib/browser: das laedt den vollen Content-Script-Stack
 * aus content_scripts[0], den dieser reine Ablauf-Test nicht braucht (wie
 * schon in otrsflow.test.js).
 */
async function loadFlowPage(browser) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto(JIRA912_FIXTURE);
  await page.addScriptTag({ content: browserLib.readSource('src/jiraui.js') });
  await page.addScriptTag({ content: browserLib.readSource('src/keysync.js') });
  return page;
}

describe('JiraKeySync - Suche und Textlesen', { skip: !hasPlaywright }, function () {
  test('keysInDescription liefert eindeutige Treffer und respektiert das Muster', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.SERVER);
    var result = await page.evaluate(function () {
      return window.JiraKeySync.keysInDescription('ROV-1 und ROV-1 und ROV-2, dazu XYZ-9', '(ROV)-\\d+');
    });
    assert.deepStrictEqual(result, ['ROV-1', 'ROV-2']);
    await page.close();
  });

  test('keysInDescription findet nichts ohne Treffer im Muster', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.SERVER);
    var result = await page.evaluate(function () {
      return window.JiraKeySync.keysInDescription('nur Fliesstext, kein Schluessel', '(ROV|REFI)-\\d+');
    });
    assert.deepStrictEqual(result, []);
    await page.close();
  });

  test('descriptionText liest die Leseansicht (#description-val)', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.SERVER);
    await page.evaluate(function () {
      var container = document.createElement('div');
      container.id = 'description-val';
      container.innerHTML = '<div class="user-content-block">Ticket ROV-9 offen</div>';
      document.body.appendChild(container);
    });
    var text = await page.evaluate(function () {
      return window.JiraKeySync.descriptionText(document);
    });
    assert.strictEqual(text, 'Ticket ROV-9 offen');
    await page.close();
  });

  /**
   * Das SERVER-Fixture hat weder #description-val, .user-content-block noch
   * #descriptionmodule - nur eine Textarea #description. Zusaetzlich zur
   * leeren Rueckgabe prueft dieser Fall, dass die Textarea selbst nie
   * gelesen wird, obwohl sie befuellt ist (DoD: nie aus Editor/Textarea).
   */
  test('descriptionText liefert "" ohne Beschreibungscontainer und liest nie die Textarea', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, fixtures.SERVER);
    await page.fill('#description', 'Ticket ROV-9 offen');
    var text = await page.evaluate(function () {
      return window.JiraKeySync.descriptionText(document);
    });
    assert.strictEqual(text, '');
    await page.close();
  });
});

describe('JiraKeySync.run - Ablauf gegen den Nachbau von 9.12', { skip: !hasPlaywright }, function () {
  test('setzt Label und Custom Field und loest mit label/field: true auf', async function () {
    var browser = await browserPromise;
    var page = await loadFlowPage(browser);
    var result = await page.evaluate(function (fieldName) {
      return window.JiraKeySync.run({ key: 'ROV-4711', fieldName: fieldName });
    }, FIELD_NAME);
    assert.deepStrictEqual(result, { key: 'ROV-4711', label: true, field: true });
    var saved = await page.evaluate(function () { return window.__mock.saved; });
    assert.strictEqual(saved.labels, 'ROV-4711');
    assert.strictEqual(saved.kundenReferenz, 'ROV-4711');
    await page.close();
  });

  /**
   * Der Feldname passt zu keinem Eintrag im Shifter und steht auch nicht
   * inline in der Ansicht - das Custom Field kann so nicht gesetzt werden,
   * das Label davor aber schon. Die Fehlermeldung muss den Nutzer darauf
   * hinweisen, dass das Kennzeichen trotzdem gesetzt wurde.
   */
  test('Custom Field faellt aus - Label bleibt gesetzt, Meldung nennt das', async function () {
    var browser = await browserPromise;
    var page = await loadFlowPage(browser);
    var result = await page.evaluate(function () {
      return window.JiraKeySync.run({ key: 'ROV-4711', fieldName: 'Unbekanntes Feld', timeout: 300 }).then(function () {
        return { rejected: false };
      }, function (error) {
        return { rejected: true, step: error.step, label: error.label, field: error.field, message: error.message };
      });
    });
    assert.strictEqual(result.rejected, true);
    assert.strictEqual(result.step, 'field');
    assert.strictEqual(result.label, true);
    assert.strictEqual(result.field, false);
    assert.ok(result.message.indexOf('Kennzeichen wurde bereits gesetzt') !== -1, result.message);
    var savedLabel = await page.evaluate(function () { return window.__mock.saved.labels; });
    assert.strictEqual(savedLabel, 'ROV-4711');
    await page.close();
  });
});
