/**
 * Code-Dialog: Oeffnen aus Feldleiste und Panel, Sprachauswahl, Tab-Einrueckung,
 * Einfuegen als {code:sprache}, sowie Kopieren als Markup bzw. formatiert.
 * Aufruf: npm run test:dialogs --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var fixtures = require('../../../lib/fixtures');
var stubClipboard = require('../../../lib/dom').stubClipboard;

var SERVER = fixtures.SERVER;
var RTE = fixtures.RTE;
var JIRA912 = fixtures.JIRA912;
var CODE_BUTTON = '.jmd-fieldbar__btn:text-is("Code")';

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

/**
 * Beschreibungsfeld im JIRA912-Nachbau oeffnen, Jira wechselt sofort in den
 * visuellen Modus. Nach dem Muster von openDescriptionVisual in
 * test/modules/editlock/browser/visual.test.js - nur bis der Rahmen
 * angehaengt ist warten, nicht auf die Feldleiste (die kommt separat aus dem
 * 400-ms-Scan in content.js).
 */
async function openDescriptionVisual(page) {
  await page.click('#description-val');
  await page.waitForSelector('#description-val.active iframe.tox-edit-area__iframe',
    { state: 'attached', timeout: 4000 });
}

describe('Code einfuegen', { skip: !hasPlaywright }, function () {
  test('Knopf an der Feldleiste oeffnet den Dialog', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog nicht offen');
    await page.close();
  });

  test('Knopf im Panel oeffnet denselben Dialog', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="code"]');
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog nicht offen');
    await page.close();
  });

  test('Auswahlliste bietet die Jira-Sprachen an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    var values = await page.evaluate(function () {
      return Array.prototype.map.call(
        document.querySelectorAll('#jmd-code-language option'),
        function (option) { return option.value; }
      );
    });
    assert.strictEqual(values[0], '', 'erster Eintrag muss "ohne Sprache" sein');
    ['java', 'javascript', 'sql', 'yaml'].forEach(function (name) {
      assert.ok(values.indexOf(name) !== -1, name + ' fehlt in der Auswahl');
    });
    assert.deepStrictEqual(values.slice(1), await page.evaluate(function () {
      return window.JiraMarkdown.codeLanguages;
    }), 'Auswahl weicht von der Konverter-Liste ab');
    await page.close();
  });

  test('Tabulator rueckt ein statt den Fokus zu wechseln', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'eins');
    await page.press('#jmd-code-input', 'Tab');
    await page.type('#jmd-code-input', 'zwei');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins    zwei');
    var focused = await page.evaluate(function () { return document.activeElement.id; });
    assert.strictEqual(focused, 'jmd-code-input', 'der Fokus hat das Feld verlassen');
    await page.close();
  });

  test('Umschalt+Tab nimmt die Einrueckung zurueck', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', '    eins');
    await page.press('#jmd-code-input', 'Shift+Tab');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins');
    await page.close();
  });

  test('Umschalt+Tab ohne Einrueckung fuehrt aus dem Feld heraus', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'eins');
    await page.press('#jmd-code-input', 'Shift+Tab');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins', 'Text wurde veraendert');
    var focused = await page.evaluate(function () { return document.activeElement.id; });
    assert.strictEqual(focused, 'jmd-code-language', 'Fokus blieb im Feld haengen');
    await page.close();
  });

  test('mehrere Zeilen werden gemeinsam ein- und ausgerueckt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'eins\nzwei');
    await page.evaluate(function () {
      var area = document.querySelector('#jmd-code-input');
      area.focus();
      area.setSelectionRange(0, area.value.length);
    });
    await page.press('#jmd-code-input', 'Tab');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), '    eins\n    zwei');
    await page.press('#jmd-code-input', 'Shift+Tab');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins\nzwei');
    await page.close();
  });

  test('Escape schliesst den Dialog', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.press('#jmd-code-input', 'Escape');
    assert.strictEqual(await page.locator('.jmd-dialog--open').count(), 0);
    await page.close();
  });

  test('Hinweis zum Verlassen des Feldes ist vorhanden', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    var described = await page.evaluate(function () {
      var area = document.querySelector('#jmd-code-input');
      var hint = document.getElementById(area.getAttribute('aria-describedby'));
      return hint ? hint.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    assert.ok(/Umschalt\+Tab/.test(described), 'Hinweis nennt Umschalt+Tab nicht: ' + described);
    assert.ok(/Escape/.test(described), 'Hinweis nennt Escape nicht: ' + described);
    await page.close();
  });

  test('Textfeld bekommt {code:sprache}', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int a = 1;');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'),
      'oben\n{code:java}\nint a = 1;\n{code}\nunten');
    assert.strictEqual(await page.locator('.jmd-dialog--open').count(), 0, 'Dialog blieb offen');
    await page.close();
  });

  test('ohne Sprache wird {code} eingefuegt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'nur Text');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), '{code}\nnur Text\n{code}');
    await page.close();
  });

  test('Code laeuft nicht durch den Markdown-Parser', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'python');
    await page.fill('#jmd-code-input', '# kein Titel\n**kein Fettdruck**\n- keine Liste');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'),
      '{code:python}\n# kein Titel\n**kein Fettdruck**\n- keine Liste\n{code}');
    await page.close();
  });

  test('Rich-Text-Editor bekommt pre.code.panel mit maskiertem Inhalt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'html');
    await page.fill('#jmd-code-input', '<b>&</b>');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes[0].html,
      '<pre class="code panel" style="border-width: 1px;" data-language="code-html">' +
      '&lt;b&gt;&amp;&lt;/b&gt;\n</pre>');
    assert.strictEqual(pastes[0].text, '{code:html}\n<b>&</b>\n{code}');
    var rendered = await page.frameLocator('#description_ifr').locator('pre').textContent();
    assert.strictEqual(rendered, '<b>&</b>\n');
    await page.close();
  });

  test('Einfuegen an der gemerkten Position im Rich-Text-Editor', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      doc.body.innerHTML = '<p id="a">AAA</p><p id="b">BBB</p>';
      var range = doc.createRange();
      range.setStart(doc.getElementById('a').firstChild, 3);
      range.collapse(true);
      var selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new Event('selectionchange'));
    });
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x = 1');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    assert.strictEqual(await page.evaluate(function () { return window.__caretParagraph; }), 'a');
    await page.close();
  });

  test('mit "Markup-Modus" landet der Codeblock in der Textarea', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, { switchToMarkup: true }, RTE);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int a = 1;');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__mode === 'markup';
    }, null, { timeout: 4000 });
    await page.waitForFunction(function () {
      return document.querySelector('#description').value.indexOf('{code:java}') !== -1;
    }, null, { timeout: 4000 });
    assert.strictEqual(await page.inputValue('#description'), '{code:java}\nint a = 1;\n{code}');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__pastes; }), []);
    await page.close();
  });

  test('Markup kopieren legt den Codeblock in die Zwischenablage', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await stubClipboard(page);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'sql');
    await page.fill('#jmd-code-input', 'select 1;');
    await page.click('.jmd-dialog [data-code-action="copy-jira"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied[0]; }),
      { kind: 'text', text: '{code:sql}\nselect 1;\n{code}' });
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog haette offen bleiben muessen');
    assert.strictEqual(await page.inputValue('#description'), '', 'es wurde zusaetzlich eingefuegt');
    await page.close();
  });

  test('Formatiert kopieren legt HTML und Markup nebeneinander ab', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await stubClipboard(page);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'html');
    await page.fill('#jmd-code-input', '<b>&</b>');
    await page.click('.jmd-dialog [data-code-action="copy-html"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    var copied = await page.evaluate(function () { return window.__copied[0]; });
    assert.strictEqual(copied.kind, 'html', 'nicht als text/html kopiert');
    assert.strictEqual(copied.html,
      '<pre class="code panel" style="border-width: 1px;" data-language="code-html">' +
      '&lt;b&gt;&amp;&lt;/b&gt;\n</pre>');
    assert.strictEqual(copied.text, '{code:html}\n<b>&</b>\n{code}');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__pastes; }), [],
      'Kopieren darf nichts einfuegen');
    await page.close();
  });

  test('ohne text/html-Zwischenablage wird der HTML-Text kopiert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await page.evaluate(function () {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: function (text) {
            window.__copied.push({ kind: 'text', text: text });
            return Promise.resolve();
          }
        }
      });
    });
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'a < b');
    await page.click('.jmd-dialog [data-code-action="copy-html"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied[0]; }),
      { kind: 'text', text: '<pre class="code panel" style="border-width: 1px;">a &lt; b\n</pre>' });
    await page.close();
  });

  test('leerer Code wird auch nicht kopiert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await stubClipboard(page);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.click('.jmd-dialog [data-code-action="copy-jira"]');
    await page.waitForTimeout(200);
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied; }), []);
    await page.close();
  });

  test('leerer Code wird nicht eingefuegt', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog haette offen bleiben muessen');
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });
});

describe('Code im visuellen Modus (JIRA912)', { skip: !hasPlaywright }, function () {
  test('Codeblock kommt als {code:java} im Wiki an', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, JIRA912);
    await openDescriptionVisual(page);
    // Feldleiste kommt erst mit dem 400-ms-Scan aus content.js.
    await page.waitForSelector('.jmd-fieldbar', { timeout: 4000 });
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int x = 1;\nreturn x;');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    // Umschalter auf Text, der Nachbau synct dabei aus dem Rahmen zurueck.
    await page.click('.editor-toggle-tabs li[data-mode="source"] button');
    var value = await page.inputValue('#description');
    assert.ok(value.indexOf('{code:java}\nint x = 1;\nreturn x;\n{code}') !== -1,
      'kein Codeblock im Wiki-Text angekommen: ' + value);
    assert.ok(value.indexOf('{{') === -1,
      'Codeblock kam als Inline-Monospace statt als Codeblock an: ' + value);
    // Nebenbefund: keine Zeile darf nur aus einem geschuetzten Leerzeichen
    // bestehen (Ueberbleibsel eines ausgepackten Blocks). Ohne rohe
    // Anfuehrungszeichen im Regex-Literal, sonst desynct der Quote-Scanner
    // aus package/isolation.test.js.
    var strayProtectedSpace = value.split('\n').some(function (line) {
      return /^ $/.test(line);
    });
    assert.strictEqual(strayProtectedSpace, false,
      'eine Zeile besteht nur aus einem geschuetzten Leerzeichen: ' + value);
    await page.close();
  });
});
