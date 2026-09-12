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
    // Die Marke steht mitten im Absatz - der Absatz wird darum an dieser
    // Stelle echt geteilt, statt ihn mit leeren Trenner-Absaetzen einzurahmen.
    // So kommt der Codeblock als eigenstaendiges Element an, ohne dass ein
    // leerer Absatz im Editor zurueckbleibt.
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
      '<pre class="code panel" style="border-width: 1px;" data-language="code-java">int a = 1;\n</pre>');
    assert.strictEqual(paste.text, '{code:java}\nint a = 1;\n{code}');
    var hasEmptyParagraph = await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      var paragraphs = doc.body.querySelectorAll('p');
      for (var i = 0; i < paragraphs.length; i++) {
        if (!paragraphs[i].textContent.trim()) return true;
      }
      return false;
    });
    assert.strictEqual(hasEmptyParagraph, false, 'kein Absatz ohne Inhalt nach dem Einfuegen');
    await page.close();
  });

  test('am Ende des Absatzes braucht es keinen Trenner mehr', async function () {
    // Die Marke steht schon am Blockende - die Selektion rueckt darum ohne
    // Teilung hinter den Absatz, ein Trenner ist nicht mehr noetig.
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
    assert.strictEqual(paste.html, '<pre class="code panel" style="border-width: 1px;">x\n</pre>');
    assert.strictEqual(paste.text, '{code}\nx\n{code}');
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
    assert.strictEqual(paste.html, '<pre class="code panel" style="border-width: 1px;">x\n</pre>');
    assert.strictEqual(paste.text, '{code}\nx\n{code}');
    await page.close();
  });

  test('auch die Panel-Vorlage bekommt im Editor einen eigenen Block', async function () {
    // Dieselbe Teilung wie beim Codeblock: die Marke steht mitten im Absatz,
    // der darum echt geteilt wird - auch die Panel-Vorlage kommt so ohne
    // Trenner-Absaetze an.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<p id="a">davor danach</p>', 'a', 6);
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.ok(!/<p><\/p>/.test(paste.html), 'kein Trenner-Absatz im Panel-HTML: ' + paste.html);
    assert.ok(/^<div /.test(paste.html), 'Panel beginnt direkt mit dem Rahmen: ' + paste.html);
    await page.close();
  });

  test('mitten im Listenpunkt bleibt die Liste unveraendert lang', async function () {
    // Listenpunkt ist kein sicher teilbarer Block - splitBlockAtCaret() muss
    // hier auf die Rueckfallebene mit BLOCK_SEPARATOR ausweichen, sonst
    // haengt der Klon einen zusaetzlichen Listenpunkt an.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<ul><li id="a">davor danach</li><li>zweiter Punkt</li></ul>', 'a', 6);
    var itemsBefore = await page.evaluate(function () {
      return document.querySelector('#description_ifr').contentDocument.querySelectorAll('li').length;
    });
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.strictEqual(paste.html,
      '<p></p><pre class="code panel" style="border-width: 1px;">x\n</pre><p></p>');
    var itemsAfter = await page.evaluate(function () {
      return document.querySelector('#description_ifr').contentDocument.querySelectorAll('li').length;
    });
    assert.strictEqual(itemsAfter, itemsBefore, 'kein zusaetzlicher Listenpunkt durch die Teilung');
    await page.close();
  });

  test('mitten in einer Tabellenzelle bleibt die Zeile unveraendert lang', async function () {
    // Tabellenzelle ist ebenfalls kein sicher teilbarer Block - sonst haengt
    // der Klon eine zusaetzliche Zelle an die Tabellenzeile.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page,
      '<table><tr><td id="a">davor danach</td><td>zweite Zelle</td></tr></table>', 'a', 6);
    var cellsBefore = await page.evaluate(function () {
      return document.querySelector('#description_ifr').contentDocument.querySelectorAll('td').length;
    });
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'x');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.strictEqual(paste.html,
      '<p></p><pre class="code panel" style="border-width: 1px;">x\n</pre><p></p>');
    var cellsAfter = await page.evaluate(function () {
      return document.querySelector('#description_ifr').contentDocument.querySelectorAll('td').length;
    });
    assert.strictEqual(cellsAfter, cellsBefore, 'keine zusaetzliche Zelle durch die Teilung');
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

/**
 * Loest ein paste-Ereignis im Dokument des Rich-Text-Rahmens aus - anders
 * als pasteInto() (Ziel im Hauptdokument), reicht ein Selektor im
 * Hauptdokument hier nicht: die Marke aus setRichCaret() steckt im Rahmen.
 */
async function pasteIntoFrame(page, markdown) {
  await page.evaluate(function (text) {
    var doc = document.querySelector('#description_ifr').contentDocument;
    var data = new DataTransfer();
    data.setData('text/plain', text);
    doc.body.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));
  }, markdown);
}

describe('Konvertiertes Markdown mitten in der Zeile', { skip: !hasPlaywright }, function () {
  // Bisher bekommt jedes eingefuegte bzw. eingefuegt-konvertierte Markdown
  // fest den Modus 'insert' - Blockmakros wie Ueberschrift, Liste oder
  // Tabelle deutet Jira aber nur am Zeilenanfang. Steht die Marke mitten in
  // einer Zeile, klebt das Markup bislang am umgebenden Text, statt auf
  // eigene Zeilen zu ruecken (Issue #91).

  test('Ueberschrift rueckt auf eine eigene Zeile', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Satz eins. Satz zwei.');
    await setCaret(page, 11);
    await pasteInto(page, '#description', '## Neu');
    assert.strictEqual(await page.inputValue('#description'),
      'Satz eins. \nh2. Neu\nSatz zwei.');
    await page.close();
  });

  test('Liste beginnt und endet auf eigenen Zeilen', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Satz eins. Satz zwei.');
    await setCaret(page, 11);
    await pasteInto(page, '#description', '- a\n- b');
    assert.strictEqual(await page.inputValue('#description'),
      'Satz eins. \n* a\n* b\nSatz zwei.');
    await page.close();
  });

  test('Tabelle rueckt auf eine eigene Zeile', async function () {
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Satz eins. Satz zwei.');
    await setCaret(page, 11);
    await pasteInto(page, '#description', '| a | b |\n| - | - |');
    assert.strictEqual(await page.inputValue('#description'),
      'Satz eins. \n||a||b||\nSatz zwei.');
    await page.close();
  });

  test('Inline-Code bleibt an der Cursorposition', async function () {
    // Inline-Code ist Fliesstext, kein Blockmakro - Issue #91 verlangt
    // ausdruecklich, dass solcher Text an der Cursorposition bleibt.
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, SERVER);
    await page.fill('#description', 'Satz eins. Satz zwei.');
    await setCaret(page, 11);
    await pasteInto(page, '#description', '`npm test` ausfuehren');
    assert.strictEqual(await page.inputValue('#description'),
      'Satz eins. {{npm test}} ausfuehrenSatz zwei.');
    await page.close();
  });

  test('im Rich-Text-Editor bekommt die Ueberschrift einen eigenen Block', async function () {
    // Die Marke steht mitten im Absatz - eine Ueberschrift darf dort nicht
    // an Ort und Stelle landen, sondern muss den Absatz wie ein Blockmakro
    // aufteilen (siehe 'im Rich-Text-Editor bekommt der Codeblock einen
    // eigenen Block' oben).
    var browser = await browserPromise;
    var page = await browserLib.newPage(browser, null, RTE);
    await setRichCaret(page, '<p id="a">davor danach</p>', 'a', 6);
    await pasteIntoFrame(page, '## Neu');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var paste = await page.evaluate(function () { return window.__pastes[0]; });
    assert.strictEqual(paste.text, 'h2. Neu', 'keine angeklebten Reste im Markup');
    var remainderOfA = await page.evaluate(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      return doc.getElementById('a').textContent;
    });
    assert.strictEqual(remainderOfA, 'davor ',
      'die Ueberschrift haengt noch im Absatz #a statt ihn zu teilen');
    await page.close();
  });
});
