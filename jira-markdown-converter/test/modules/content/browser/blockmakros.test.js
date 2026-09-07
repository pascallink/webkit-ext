/**
 * Blockmakros (Code, Panel) am Zeilenanfang: eigene Zeilen in der Textarea,
 * eigene Absaetze im Rich-Text-Editor - unabhaengig davon, welcher Dialog
 * das Markup liefert.
 * Aufruf: npm run test:content --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var browserLib = require('../../../lib/browser');
var dom = require('../../../lib/dom');
var fixtures = require('../../../lib/fixtures');

var setCaret = dom.setCaret;
var setRichCaret = dom.setRichCaret;
var pasteInto = dom.pasteInto;
var SERVER = fixtures.SERVER;
var RTE = fixtures.RTE;
var CODE_BUTTON = '.jmd-fieldbar__btn:text-is("Code")';

var hasPlaywright = browserLib.hasPlaywright();
var browserPromise = hasPlaywright ? browserLib.withBrowser() : null;

describe('Blockmakros am Zeilenanfang', { skip: !hasPlaywright }, function () {
  test('Codeblock hinter Text beginnt auf einer neuen Zeile', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Fehlerbild:');
    await setCaret(page, 11);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int a = 1;');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'),
      'Fehlerbild:\n{code:java}\nint a = 1;\n{code}');
    await page.close();
  });

  test('folgt Text, endet der Codeblock mit einem Zeilenumbruch', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'davor danach');
    await setCaret(page, 6);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'),
      'davor \n{code}\nx\n{code}\ndanach');
    await page.close();
  });

  test('am Zeilenanfang kommt kein zusaetzlicher Umbruch dazu', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    await setCaret(page, 5);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben\n{code}\nx\n{code}\nunten');
    await page.close();
  });

  test('Panel-Vorlage hinter Text beginnt auf einer neuen Zeile', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Achtung:');
    await setCaret(page, 8);
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    assert.strictEqual(await page.inputValue('#description'),
      'Achtung:\n{panel:title=Warnung|borderColor=#de350b|bgColor=#ffebe6}\n' +
      'Hier die Warnung eintragen.\n{panel}');
    await page.close();
  });

  test('der Platzhalter bleibt trotz Umbruch markiert', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Achtung:');
    await setCaret(page, 8);
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var selected = await page.evaluate(function () {
      var element = document.querySelector('#description');
      return element.value.slice(element.selectionStart, element.selectionEnd);
    });
    assert.strictEqual(selected, 'Hier die Information eintragen.');
    await page.close();
  });

  test('im Rich-Text-Editor bekommt der Codeblock einen eigenen Block', async function () {
    // Ohne Trenner zieht ein ProseMirror-Editor den Codeblock in den Absatz,
    // in dem die Marke steht - heraus kaeme Text mit Code-Auszeichnung statt
    // eines Codeblocks.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<p id="a">davor danach</p>', 'a', 6);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'java');
    await page.fill('#jmd-code-input', 'int a = 1;');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.strictEqual(paste.html,
      '<p></p><pre><code class="language-java">int a = 1;</code></pre><p></p>');
    assert.strictEqual(paste.text, '\n{code:java}\nint a = 1;\n{code}\n');
    await page.close();
  });

  test('am Ende des Absatzes reicht ein Trenner davor', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<p id="a">Fehlerbild:</p>', 'a', 11);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.strictEqual(paste.html, '<p></p><pre><code>x</code></pre>');
    assert.strictEqual(paste.text, '\n{code}\nx\n{code}');
    await page.close();
  });

  test('im leeren Absatz kommt kein Trenner dazu', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<p id="a">&nbsp;</p>', 'a', 0);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.strictEqual(paste.html, '<pre><code>x</code></pre>');
    assert.strictEqual(paste.text, '{code}\nx\n{code}');
    await page.close();
  });

  test('auch die Panel-Vorlage bekommt im Editor einen eigenen Block', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<p id="a">davor danach</p>', 'a', 6);
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.ok(/^<p><\/p><table/.test(paste.html) || /^<p><\/p></.test(paste.html),
      'kein Trenner vor dem Panel: ' + paste.html);
    assert.ok(/<p><\/p>$/.test(paste.html), 'kein Trenner hinter dem Panel: ' + paste.html);
    await page.close();
  });

  test('umgewandeltes Markdown wird weiterhin an Ort und Stelle eingesetzt', async function () {
    // Gegenprobe: nur Blockmakros bekommen eigene Zeilen, das Einfuegen von
    // Fliesstext bleibt unveraendert.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'AB');
    await setCaret(page, 1);
    await pasteInto(page, '#description', '**x**');
    assert.strictEqual(await page.inputValue('#description'), 'A*x*B');
    await page.close();
  });
});
