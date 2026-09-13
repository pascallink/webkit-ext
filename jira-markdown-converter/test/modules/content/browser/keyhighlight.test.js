/**
 * Kunden-Schluessel in der Leseansicht hervorheben (Issue #32, Sub-Task 5):
 * highlightCustomerKeys() in src/content.js umschliesst Treffer in den
 * Lese-Containern (Beschreibung, Kommentare) mit einem
 * "span.jmd-customer-key" - rein visuell, nie in einem Editor oder einem
 * bearbeitbaren Feld. Faelle hier: einfacher Treffer, title mit/ohne
 * Mapping-Eintrag, harte Ausschlussliste (Textarea/contenteditable/code),
 * Schalter aus (Start und Laufzeit) sowie ein neu aufgebauter Lesebereich
 * gegen die Observer-Schleife. Dazu: die gerenderte Beschreibung (Link,
 * Liste, Codeblock) bleibt ueber Hervorhebung und Ruecknahme hinweg in
 * ihrer Struktur unveraendert.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');

var JIRA912 = fixtures.JIRA912;
var BADGE = '.jmd-customer-key';

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/** Setzt den Beschreibungscontainer (JIRA912-Fixture, 9.12-Theme) auf reinen Text. */
function setDescriptionText(page, text) {
  return page.evaluate(function (value) {
    var container = document.querySelector('#description-val .user-content-block');
    container.textContent = value;
  }, text);
}

/** Wartet, bis genau count Badges im Dokument stehen. */
function waitForBadgeCount(page, count) {
  return page.waitForFunction(function (expected) {
    return document.querySelectorAll('.jmd-customer-key').length === expected;
  }, count, { timeout: 3000 });
}

describe('Kunden-Schluessel in der Leseansicht hervorheben', { skip: !hasPlaywright }, function () {
  test('ein Kunden-Schluessel in der Beschreibung bekommt einen Badge', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await setDescriptionText(page, 'Vorlauf ROV-1234 Text danach.');
    await waitForBadgeCount(page, 1);
    var text = await page.textContent(BADGE);
    assert.strictEqual(text, 'ROV-1234');
    await page.close();
  });

  test('Mapping-Eintrag steht im title, ein Treffer ohne Eintrag bleibt ohne title', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyMap: { 'ROV-1234': ['JIRA-567'] } }, JIRA912);
    await setDescriptionText(page, 'ROV-1234 und REFI-9 offen.');
    await waitForBadgeCount(page, 2);
    var titles = await page.evaluate(function () {
      var spans = document.querySelectorAll('.jmd-customer-key');
      var result = {};
      Array.prototype.forEach.call(spans, function (span) {
        result[span.textContent] = span.title;
      });
      return result;
    });
    assert.strictEqual(titles['ROV-1234'], 'Jira: JIRA-567');
    assert.strictEqual(titles['REFI-9'], '');
    await page.close();
  });

  /**
   * Kern der Vorgabe aus Issue #32: ein Treffer in einer Textarea, einem
   * [contenteditable]-Feld oder einem code-Element wird nie umschlossen -
   * nur der Treffer in reinem Lesetext (hier im <p>) bekommt einen Badge.
   */
  test('Textarea, contenteditable und code bleiben unberuehrt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await page.evaluate(function () {
      var container = document.querySelector('#description-val .user-content-block');
      container.innerHTML = '<p>Vorlauf ROV-1234 danach.</p>'
        + '<textarea>ROV-1234</textarea>'
        + '<div contenteditable="true">ROV-1234</div>'
        + '<code>ROV-1234</code>';
    });
    await waitForBadgeCount(page, 1);
    var state = await page.evaluate(function () {
      var container = document.querySelector('#description-val .user-content-block');
      return {
        badgeInParagraph: !!container.querySelector('p .jmd-customer-key'),
        textareaValue: container.querySelector('textarea').value,
        textareaHasBadge: !!container.querySelector('textarea .jmd-customer-key'),
        editableText: container.querySelector('[contenteditable]').textContent,
        editableHasBadge: !!container.querySelector('[contenteditable] .jmd-customer-key'),
        codeText: container.querySelector('code').textContent,
        codeHasBadge: !!container.querySelector('code .jmd-customer-key')
      };
    });
    assert.strictEqual(state.badgeInParagraph, true);
    assert.strictEqual(state.textareaValue, 'ROV-1234');
    assert.strictEqual(state.textareaHasBadge, false);
    assert.strictEqual(state.editableText, 'ROV-1234');
    assert.strictEqual(state.editableHasBadge, false);
    assert.strictEqual(state.codeText, 'ROV-1234');
    assert.strictEqual(state.codeHasBadge, false);
    await page.close();
  });

  test('customerKeyHighlight: false erzeugt keine Badges', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { customerKeyHighlight: false }, JIRA912);
    await setDescriptionText(page, 'Ticket ROV-1234 offen.');
    // Kein positives Ereignis zum Abwarten (es soll ja nichts entstehen) -
    // derselbe Abstand wie in robustheit.test.js/fabgate.test.js (600 ms,
    // deutlich ueber dem 400-ms-Scan-Debounce).
    await page.waitForTimeout(600);
    var count = await page.evaluate(function () {
      return document.querySelectorAll('.jmd-customer-key').length;
    });
    assert.strictEqual(count, 0);
    await page.close();
  });

  /**
   * Umschalten zur Laufzeit ueber den bestehenden Settings.onChange-Block:
   * chrome.storage.onChanged.trigger() (test/lib/page-stub.js) simuliert den
   * Wechsel, denselben Vertrag wie der Node-seitige Stub.
   */
  test('Umschalten zur Laufzeit entfernt vorhandene Badges wieder', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await setDescriptionText(page, 'Ticket ROV-1234 offen.');
    await waitForBadgeCount(page, 1);

    await page.evaluate(function () {
      window.__settings.customerKeyHighlight = false;
      chrome.storage.onChanged.trigger({ customerKeyHighlight: { newValue: false } }, 'sync');
    });
    await waitForBadgeCount(page, 0);

    var text = await page.evaluate(function () {
      return document.querySelector('#description-val .user-content-block').textContent;
    });
    assert.strictEqual(text, 'Ticket ROV-1234 offen.');
    await page.close();
  });

  /**
   * Baut Jira den Lesebereich neu auf (neuer Knoten statt derselbe
   * .user-content-block), zieht die Hervorhebung ueber den bestehenden
   * Scan (scheduleScan()/onMutations()) nach - ohne dass sich die Zahl der
   * Badges vervielfacht. Belegt withObserverPaused(): die eigenen
   * Einfuegungen loesen keinen Dauerscan aus.
   */
  test('ein neu aufgebauter Lesebereich zieht nach, ohne dass Badges sich vervielfachen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await setDescriptionText(page, 'Ticket ROV-1234 offen.');
    await waitForBadgeCount(page, 1);

    await page.evaluate(function () {
      var previous = document.querySelector('#description-val .user-content-block');
      var next = document.createElement('div');
      next.className = 'user-content-block';
      next.textContent = 'Neuer Text mit ROV-1234 wieder.';
      previous.parentNode.replaceChild(next, previous);
    });
    await waitForBadgeCount(page, 1);

    // Deutlich laenger als der 400-ms-Scan-Debounce warten: bleibt die Zahl
    // bei 1, laeuft der Observer nicht in eine Schleife.
    await page.waitForTimeout(1200);
    var count = await page.evaluate(function () {
      return document.querySelectorAll('.jmd-customer-key').length;
    });
    assert.strictEqual(count, 1);
    await page.close();
  });

  /**
   * Dritter Lese-Container aus Issue #32: ".user-content-block" innerhalb
   * von "#issue_actions_container" (Kommentare) - unabhaengig von der
   * Beschreibung.
   */
  test('ein Kommentar unter issue_actions_container bekommt ebenfalls einen Badge', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await page.evaluate(function () {
      var block = document.createElement('div');
      block.className = 'issue-data-block activity-comment';
      var body = document.createElement('div');
      body.className = 'action-body flooded user-content-block';
      body.textContent = 'Kommentar zu ROV-4711.';
      block.appendChild(body);
      document.getElementById('issue_actions_container').appendChild(block);
    });
    await waitForBadgeCount(page, 1);
    var text = await page.textContent(BADGE);
    assert.strictEqual(text, 'ROV-4711');
    await page.close();
  });

  /**
   * Regression gegen den zurueckgenommenen Entwurf aus 242f3fa (per fbe97d6
   * entfernt): highlightCustomerKeys() darf die gerenderte Beschreibung nie
   * zu reinem Text einebnen - Link, Liste und Codeblock bleiben ueber
   * Hervorhebung und Ruecknahme hinweg als Struktur erhalten.
   */
  test('die gerenderte Beschreibung ueberlebt Hervorhebung und Ruecknahme unveraendert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    var before = await page.evaluate(function () {
      var container = document.querySelector('#description-val .user-content-block');
      container.innerHTML = '<p>Vorgang ROV-1234 offen.</p>'
        + '<ul><li>Punkt eins</li><li>Punkt zwei</li></ul>'
        + '<p><a href="https://example.invalid/">Link</a></p>'
        + '<pre><code>ROV-1234</code></pre>';
      return container.innerHTML;
    });
    await waitForBadgeCount(page, 1);
    var state = await page.evaluate(function () {
      var container = document.querySelector('#description-val .user-content-block');
      return {
        badgeInParagraph: !!container.querySelector('p .jmd-customer-key'),
        hasList: !!container.querySelector('ul li'),
        hasLink: !!container.querySelector('a[href]'),
        hasCode: !!container.querySelector('pre code')
      };
    });
    assert.strictEqual(state.badgeInParagraph, true);
    assert.strictEqual(state.hasList, true);
    assert.strictEqual(state.hasLink, true);
    assert.strictEqual(state.hasCode, true);

    await page.evaluate(function () {
      window.__settings.customerKeyHighlight = false;
      chrome.storage.onChanged.trigger({ customerKeyHighlight: { newValue: false } }, 'sync');
    });
    await waitForBadgeCount(page, 0);

    var after = await page.evaluate(function () {
      return document.querySelector('#description-val .user-content-block').innerHTML;
    });
    assert.strictEqual(after, before);
    await page.close();
  });
});
