/**
 * Integrationstest: laedt das Content-Script in einer echten Chromium-Instanz
 * auf einer nachgebauten Jira-Seite und prueft Erkennung, Einfuegen und die
 * automatische Umwandlung beim Einfuegen.
 *
 * Aufruf: node test/integration.test.js
 * Benoetigt Playwright (global installiert; NODE_PATH ggf. setzen).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

var chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  console.log('\nPlaywright nicht gefunden - Integrationstest wird uebersprungen.');
  console.log('Installation: npm i -D playwright  (oder NODE_PATH auf die globale Installation setzen)\n');
  process.exit(0);
}

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      passed++;
      console.log('  ok   ' + name);
    }, function (error) {
      failed++;
      console.log('  FAIL ' + name);
      console.log('       ' + (error && error.message ? error.message.split('\n').join('\n       ') : error));
    });
}

/** Stellt chrome.* so weit nach, wie das Content-Script es braucht. */
var CHROME_STUB = [
  'window.__settings = {};',
  'window.chrome = {',
  '  runtime: {',
  '    lastError: null,',
  '    onMessage: { addListener: function (fn) { window.__onMessage = fn; } },',
  '    sendMessage: function () {}',
  '  },',
  '  storage: {',
  '    sync: {',
  '      get: function (defaults, cb) {',
  '        var out = Object.assign({}, defaults, window.__settings);',
  '        setTimeout(function () { cb(out); }, 0);',
  '      },',
  '      set: function (values, cb) {',
  '        Object.assign(window.__settings, values);',
  '        if (cb) setTimeout(cb, 0);',
  '      }',
  '    },',
  '    onChanged: { addListener: function () {} }',
  '  }',
  '};'
].join('\n');

var SOURCES = ['src/settings.js', 'src/converter.js', 'src/editors.js', 'src/codedialog.js', 'src/content.js'];
var STYLES = ['src/content.css', 'src/codedialog.css'];

function readSource(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

async function newPage(browser, settings, fixture) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto('file://' + path.join(root, 'test', 'fixtures', fixture || 'mock-jira.html'));
  for (var s = 0; s < STYLES.length; s++) {
    await page.addStyleTag({ content: readSource(STYLES[s]) });
  }
  await page.addScriptTag({ content: CHROME_STUB });
  if (settings) {
    await page.evaluate(function (values) {
      window.__settings = values;
    }, settings);
  }
  for (var i = 0; i < SOURCES.length; i++) {
    await page.addScriptTag({ content: readSource(SOURCES[i]) });
  }
  // Das Content-Script startet asynchron (Settings werden geladen).
  await page.waitForFunction(function () {
    return !!document.querySelector('.jmd-fab');
  }, null, { timeout: 5000 });
  return page;
}

/** Simuliert Strg+V mit vorgegebenem Text. */
async function pasteInto(page, selector, text) {
  await page.focus(selector);
  await page.evaluate(function (args) {
    var element = document.querySelector(args.selector);
    var data = new DataTransfer();
    data.setData('text/plain', args.text);
    element.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));
  }, { selector: selector, text: text });
}

/** Legt eine Zwischenablage unter, die nur mitschreibt. */
async function stubClipboard(page) {
  await page.evaluate(function () {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: function (text) {
          window.__copied.push({ kind: 'text', text: text });
          return Promise.resolve();
        },
        write: function (items) {
          return items[0].getType('text/html').then(function (blob) {
            return blob.text();
          }).then(function (html) {
            return items[0].getType('text/plain').then(function (blob) {
              return blob.text();
            }).then(function (text) {
              window.__copied.push({ kind: 'html', html: html, text: text });
            });
          });
        }
      }
    });
  });
}

async function run() {
  var browser = await chromium.launch();

  console.log('\nOberflaeche');
  await test('schwebender Button wird eingebaut', async function () {
    var page = await newPage(browser);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 1);
    await page.close();
  });

  await test('Buttonleiste erscheint an beiden Editoren', async function () {
    var page = await newPage(browser);
    await page.waitForSelector('.jmd-fieldbar');
    var count = await page.locator('.jmd-fieldbar').count();
    assert.strictEqual(count, 2, 'erwartet: Leiste an Textarea und Rich-Text-Editor, gefunden: ' + count);
    await page.close();
  });

  await test('Suchfeld wird nicht als Ziel angeboten', async function () {
    var page = await newPage(browser);
    var isTarget = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().some(function (element) {
        return element.id === 'quickSearchInput';
      });
    });
    assert.strictEqual(isTarget, false);
    await page.close();
  });

  await test('Panel oeffnet und schliesst', async function () {
    var page = await newPage(browser);
    await page.click('.jmd-fab');
    assert.ok(await page.locator('.jmd-panel--open').count());
    await page.click('.jmd-panel [data-action="close"]');
    assert.strictEqual(await page.locator('.jmd-panel--open').count(), 0);
    await page.close();
  });

  console.log('\nVorschau und Einfuegen ueber das Panel');
  await test('Vorschau zeigt Jira-Markup', async function () {
    var page = await newPage(browser);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel\n\n- **fett**');
    assert.strictEqual(await page.inputValue('#jmd-output'), 'h1. Titel\n\n* *fett*');
    await page.close();
  });

  await test('Einfuegen schreibt in die Textarea', async function () {
    var page = await newPage(browser);
    await page.focus('#description');
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '## Schritte\n\n1. eins\n2. zwei');
    await page.click('.jmd-panel [data-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'h2. Schritte\n\n# eins\n# zwei');
    await page.close();
  });

  await test('Feld ersetzen ueberschreibt vorhandenen Inhalt', async function () {
    var page = await newPage(browser);
    await page.fill('#description', 'alter Inhalt');
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Neu');
    await page.click('.jmd-panel [data-action="pick"]');
    await page.click('#description');
    await page.click('.jmd-panel [data-action="replace"]');
    assert.strictEqual(await page.inputValue('#description'), 'h1. Neu');
    await page.close();
  });

  await test('Aus Zielfeld uebernimmt den Feldinhalt', async function () {
    var page = await newPage(browser);
    await page.fill('#description', '# Aus dem Feld');
    await page.focus('#description');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="from-field"]');
    assert.strictEqual(await page.inputValue('#jmd-input'), '# Aus dem Feld');
    assert.strictEqual(await page.inputValue('#jmd-output'), 'h1. Aus dem Feld');
    await page.close();
  });

  await test('Panel kopiert das Jira-Markup', async function () {
    var page = await newPage(browser);
    await stubClipboard(page);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel');
    await page.click('.jmd-panel [data-action="copy"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied[0]; }),
      { kind: 'text', text: 'h1. Titel' });
    await page.close();
  });

  await test('Panel kopiert formatiert mit Markup als Rueckfalltext', async function () {
    var page = await newPage(browser);
    await stubClipboard(page);
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel\n\n- **fett**');
    await page.click('.jmd-panel [data-action="copy-html"]');
    await page.waitForFunction(function () {
      return window.__copied.length === 1;
    }, null, { timeout: 4000 });
    var copied = await page.evaluate(function () { return window.__copied[0]; });
    assert.strictEqual(copied.kind, 'html', 'nicht als text/html kopiert');
    assert.strictEqual(copied.html, '<h1>Titel</h1>\n\n<ul><li><strong>fett</strong></li></ul>');
    assert.strictEqual(copied.text, 'h1. Titel\n\n* *fett*');
    await page.close();
  });

  await test('leeres Panel kopiert nichts', async function () {
    var page = await newPage(browser);
    await stubClipboard(page);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="copy-html"]');
    await page.click('.jmd-panel [data-action="copy"]');
    await page.waitForTimeout(200);
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied; }), []);
    await page.close();
  });

  console.log('\nAutomatik beim Einfuegen');
  await test('Markdown wird beim Einfuegen in die Textarea umgewandelt', async function () {
    var page = await newPage(browser);
    await pasteInto(page, '#description', '# Titel\n\n- eins\n- zwei');
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel\n\n* eins\n* zwei');
    await page.close();
  });

  await test('Klartext ohne Markdown wird nicht angefasst', async function () {
    var page = await newPage(browser);
    var handled = await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', 'Ein ganz normaler Satz.');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(handled, false, 'das Einfuegen haette nicht abgefangen werden duerfen');
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  await test('Einfuegen an der Cursorposition erhaelt den Rest', async function () {
    var page = await newPage(browser);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
    });
    await pasteInto(page, '#description', '**x**');
    assert.strictEqual(await page.inputValue('#description'), 'A*x*B');
    await page.close();
  });

  await test('Rich-Text-Editor bekommt konvertiertes Markup als Paste', async function () {
    var page = await newPage(browser);
    await pasteInto(page, '.ProseMirror', '# Titel\n\n- eins');
    var pastes = await page.evaluate(function () {
      return window.__pastes;
    });
    assert.deepStrictEqual(pastes, ['h1. Titel\n\n* eins'], 'erhalten: ' + JSON.stringify(pastes));
    var text = await page.textContent('.ProseMirror');
    assert.ok(text.indexOf('h1. Titel') !== -1, 'Editor-Inhalt: ' + text);
    await page.close();
  });

  await test('Einstellung "Markdown durchreichen" laesst den Rich-Text-Editor in Ruhe', async function () {
    var page = await newPage(browser, { richEditorFormat: 'markdown' });
    var handled = await page.evaluate(function () {
      var element = document.querySelector('.ProseMirror');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return window.__pastes;
    });
    assert.deepStrictEqual(handled, ['# Titel'], 'das Markdown haette unveraendert ankommen muessen');
    await page.close();
  });

  await test('Automatik laesst sich abschalten', async function () {
    var page = await newPage(browser, { convertOnPaste: false });
    var prevented = await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(prevented, false);
    await page.close();
  });

  console.log('\nUmwandeln an Ort und Stelle');
  await test('Buttonleiste wandelt den Feldinhalt um', async function () {
    var page = await newPage(browser);
    await page.fill('#description', '# Titel\n\n**fett**');
    await page.locator('.jmd-fieldbar').first().getByText('Markdown in Jira-Markup umwandeln').click();
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel\n\n*fett*');
    await page.close();
  });

  await test('Tastenkuerzel wandelt nur die Auswahl um', async function () {
    var page = await newPage(browser);
    await page.fill('#description', 'oben\n# Titel\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 13);
      window.__onMessage({ type: 'convert-selection' }, {}, function () {});
    });
    assert.strictEqual(await page.inputValue('#description'), 'oben\nh1. Titel\nunten');
    await page.close();
  });

  await test('Nachricht insert-text fuegt Text ein', async function () {
    var page = await newPage(browser);
    await page.focus('#description');
    var response = await page.evaluate(function () {
      var result = null;
      window.__onMessage({ type: 'insert-text', text: 'h1. Von aussen', mode: 'replace' }, {}, function (value) {
        result = value;
      });
      return result;
    });
    assert.deepStrictEqual(response, { ok: true });
    assert.strictEqual(await page.inputValue('#description'), 'h1. Von aussen');
    await page.close();
  });

  console.log('\nJira Server / Data Center 9.x');
  var SERVER = 'mock-jira-server.html';

  await test('Wiki-Felder (Beschreibung und Kommentar) werden erkannt', async function () {
    var page = await newPage(browser, null, SERVER);
    var ids = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().map(function (element) {
        return element.id;
      });
    });
    assert.deepStrictEqual(ids.sort(), ['comment', 'description']);
    await page.close();
  });

  await test('Schnellsuche wird nicht angefasst', async function () {
    var page = await newPage(browser, null, SERVER);
    var ids = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().map(function (element) {
        return element.id;
      });
    });
    assert.ok(ids.indexOf('searcher-query') === -1, 'Suchfeld wurde als Ziel angeboten');
    await page.close();
  });

  await test('Buttonleiste sitzt direkt ueber dem Textfeld', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var ok = await page.evaluate(function () {
      var textarea = document.querySelector('#description');
      var previous = textarea.previousElementSibling;
      return previous && previous.classList.contains('jmd-fieldbar');
    });
    assert.strictEqual(ok, true, 'Leiste steht nicht unmittelbar vor der Textarea');
    await page.close();
  });

  await test('Umwandeln im Kommentarfeld', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.fill('#comment', '## Analyse\n\n- **Ursache**: Timeout\n- Fix folgt');
    await page.focus('#comment');
    await page.evaluate(function () {
      window.__onMessage({ type: 'convert-selection' }, {}, function () {});
    });
    assert.strictEqual(await page.inputValue('#comment'), 'h2. Analyse\n\n* *Ursache*: Timeout\n* Fix folgt');
    await page.close();
  });

  await test('Einfuegen mit Strg+V in die Beschreibung', async function () {
    var page = await newPage(browser, null, SERVER);
    await pasteInto(page, '#description', '# Fehler\n\n| Feld | Wert |\n| --- | --- |\n| OS | Windows |');
    assert.strictEqual(await page.inputValue('#description'),
      'h1. Fehler\n\n||Feld||Wert||\n|OS|Windows|');
    await page.close();
  });

  await test('input- und change-Event feuern (Jira merkt die Aenderung)', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.evaluate(function () {
      window.__events = [];
      var textarea = document.querySelector('#description');
      ['input', 'change'].forEach(function (name) {
        textarea.addEventListener(name, function () { window.__events.push(name); });
      });
    });
    await pasteInto(page, '#description', '# Titel');
    var events = await page.evaluate(function () { return window.__events; });
    assert.ok(events.indexOf('input') !== -1, 'kein input-Event');
    assert.ok(events.indexOf('change') !== -1, 'kein change-Event');
    await page.close();
  });

  await test('nachtraeglich eingeblendetes Feld bekommt eine Leiste', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.evaluate(function () { window.__addInlineField(); });
    await page.waitForFunction(function () {
      var textarea = document.querySelector('#environment');
      return textarea && textarea.previousElementSibling &&
        textarea.previousElementSibling.classList.contains('jmd-fieldbar');
    }, null, { timeout: 4000 });
    await page.close();
  });

  await test('Leiste verschwindet mit dem Feld', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.evaluate(function () { window.__addInlineField(); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('.jmd-fieldbar').length === 3;
    }, null, { timeout: 4000 });
    await page.evaluate(function () { window.__removeInlineField(); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('.jmd-fieldbar').length === 2;
    }, null, { timeout: 4000 });
    await page.close();
  });

  console.log('\nRich-Text-Editor (jira.rte.enabled)');
  var RTE = 'mock-jira-rte.html';

  await test('Feld wird trotz versteckter Textarea erkannt', async function () {
    var page = await newPage(browser, null, RTE);
    var found = await page.evaluate(function () {
      return window.JiraEditors.findAllTargets().map(function (element) {
        return element.id;
      });
    });
    assert.deepStrictEqual(found, ['description']);
    var active = await page.evaluate(function () {
      return window.JiraEditors.isRichTextActive(document.querySelector('#description'));
    });
    assert.strictEqual(active, true, 'Rich-Text-Modus nicht erkannt');
    await page.close();
  });

  await test('Buttonleiste sitzt ueber dem Editor, nicht an der versteckten Textarea', async function () {
    var page = await newPage(browser, null, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    var ok = await page.evaluate(function () {
      var bar = document.querySelector('.jmd-fieldbar');
      return bar.nextElementSibling && bar.nextElementSibling.id === 'mce-container';
    });
    assert.strictEqual(ok, true);
    await page.close();
  });

  await test('formatiert einfuegen: HTML statt Markup', async function () {
    var page = await newPage(browser, null, RTE);
    await pasteInto(page, '#description', '# Titel\n\nMit **fett** und `code`.');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Einfuegen im Editor angekommen');
    assert.ok(/<h1>Titel<\/h1>/.test(pastes[0].html), 'HTML fehlt: ' + pastes[0].html);
    assert.ok(/<strong>fett<\/strong>/.test(pastes[0].html), 'Fettdruck fehlt: ' + pastes[0].html);
    // Als Rueckfalltext liegt weiterhin Jira-Markup bereit.
    assert.ok(/^h1\. Titel/.test(pastes[0].text), 'Klartext fehlt: ' + pastes[0].text);
    var rendered = await page.frameLocator('#description_ifr').locator('h1').textContent();
    assert.strictEqual(rendered, 'Titel');
    await page.close();
  });

  await test('Einstellung "Jira-Markup einfuegen" schickt kein HTML', async function () {
    var page = await newPage(browser, { richEditorFormat: 'jira' }, RTE);
    await pasteInto(page, '#description', '# Titel');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes[0].html, '');
    assert.strictEqual(pastes[0].text, 'h1. Titel');
    await page.close();
  });

  await test('Umschalten auf Markup-Modus vor dem Einfuegen', async function () {
    var page = await newPage(browser, { switchToMarkup: true }, RTE);
    await pasteInto(page, '#description', '# Titel\n\n- eins');
    await page.waitForFunction(function () {
      return window.__mode === 'markup';
    }, null, { timeout: 4000 });
    await page.waitForFunction(function () {
      return document.querySelector('#description').value.indexOf('h1. Titel') !== -1;
    }, null, { timeout: 4000 });
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel\n\n* eins');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  await test('Umschalter wird ueber die Beschriftung gefunden', async function () {
    var page = await newPage(browser, null, RTE);
    var label = await page.evaluate(function () {
      var toggle = window.JiraEditors.findModeToggle(document.querySelector('#description'));
      return toggle ? toggle.id : null;
    });
    assert.strictEqual(label, 'toggle');
    await page.close();
  });

  await test('ohne Umschalter wird formatiert eingefuegt', async function () {
    var page = await newPage(browser, { switchToMarkup: true }, RTE);
    await page.evaluate(function () {
      // Umschalter entfernen: Jira benennt ihn je nach Version anders.
      document.getElementById('toggle').remove();
    });
    await pasteInto(page, '#description', '# Titel');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Rueckfall auf formatiertes Einfuegen');
    assert.ok(/<h1>Titel<\/h1>/.test(pastes[0].html));
    assert.strictEqual(await page.evaluate(function () { return window.__mode; }), 'rich');
    await page.close();
  });

  console.log('\nGemerkte Cursorposition');
  await test('Panel fuegt an der zuletzt gesetzten Cursorposition ein', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    // Cursor in die Leerzeile setzen, dann ins Panel wechseln.
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Titel');
    await page.click('.jmd-panel [data-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben\nh1. Titel\nunten');
    await page.close();
  });

  await test('Auswahl wird durch das Einfuegen ersetzt', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.fill('#description', 'oben ERSETZEN unten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 13);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '**neu**');
    await page.click('.jmd-panel [data-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben *neu* unten');
    await page.close();
  });

  await test('Position im Rich-Text-Editor ueberlebt den Wechsel ins Panel', async function () {
    var page = await newPage(browser, null, RTE);
    // Zwei Absaetze anlegen und den Cursor in den ersten setzen.
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
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '**hier**');
    await page.click('.jmd-panel [data-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var wasCollapsedInA = await page.evaluate(function () {
      return window.__caretParagraph;
    });
    assert.strictEqual(wasCollapsedInA, 'a', 'Einfuegemarke lag nicht mehr im ersten Absatz');
    await page.close();
  });

  console.log('\nSchalter fuer die Einfuege-Automatik');
  await test('Schalter im Panel zeigt den Zustand an', async function () {
    var page = await newPage(browser);
    await page.click('.jmd-fab');
    var view = await page.evaluate(function () {
      var card = document.querySelector('[data-role="toggle-card"]');
      return {
        checked: document.querySelector('.jmd-panel [data-option="convertOnPaste"]').checked,
        label: document.querySelector('[data-role="toggle-label"]').textContent,
        color: card.style.getPropertyValue('--jmd-switch-color')
      };
    });
    assert.strictEqual(view.checked, true);
    assert.ok(/an$/.test(view.label), 'Beschriftung: ' + view.label);
    assert.strictEqual(view.color, '#36b37e', 'aktiv muss gruen sein');
    await page.close();
  });

  await test('Ausschalten faerbt grau und stoppt die Automatik', async function () {
    var page = await newPage(browser);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');

    var view = await page.evaluate(function () {
      return {
        checked: document.querySelector('.jmd-panel [data-option="convertOnPaste"]').checked,
        label: document.querySelector('[data-role="toggle-label"]').textContent,
        color: document.querySelector('[data-role="toggle-card"]').style.getPropertyValue('--jmd-switch-color'),
        stored: window.__settings.convertOnPaste
      };
    });
    assert.strictEqual(view.checked, false);
    assert.ok(/aus$/.test(view.label), 'Beschriftung: ' + view.label);
    assert.strictEqual(view.color, '#8993a4', 'inaktiv muss grau sein');
    assert.strictEqual(view.stored, false, 'Einstellung wurde nicht gespeichert');

    // Und der eigentliche Zweck: Einfuegen bleibt jetzt unveraendert.
    await page.close();
  });

  await test('nach dem Ausschalten wird nichts mehr umgewandelt', async function () {
    var page = await newPage(browser);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');
    await page.click('.jmd-panel [data-action="close"]');

    var prevented = await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      var data = new DataTransfer();
      data.setData('text/plain', '# Titel');
      var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(prevented, false, 'das Einfuegen wurde weiterhin abgefangen');
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  await test('Zustandspunkt am schwebenden Button folgt dem Schalter', async function () {
    var page = await newPage(browser);
    var on = await page.evaluate(function () {
      return document.querySelector('.jmd-fab__dot').style.background;
    });
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');
    var off = await page.evaluate(function () {
      return document.querySelector('.jmd-fab__dot').style.background;
    });
    assert.notStrictEqual(on, off, 'der Punkt aendert seine Farbe nicht');
    assert.ok(/54, 179, 126/.test(on), 'aktiv nicht gruen: ' + on);
    await page.close();
  });

  await test('ausgeschalteter Zustand wird beim Laden uebernommen', async function () {
    var page = await newPage(browser, { convertOnPaste: false });
    await page.click('.jmd-fab');
    var view = await page.evaluate(function () {
      return {
        checked: document.querySelector('.jmd-panel [data-option="convertOnPaste"]').checked,
        color: document.querySelector('[data-role="toggle-card"]').style.getPropertyValue('--jmd-switch-color')
      };
    });
    assert.strictEqual(view.checked, false);
    assert.strictEqual(view.color, '#8993a4');
    await page.close();
  });

  console.log('\nCode einfuegen');
  var CODE_BUTTON = '.jmd-fieldbar__btn:has-text("Code einfuegen")';

  await test('Knopf an der Feldleiste oeffnet den Dialog', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog nicht offen');
    await page.close();
  });

  await test('Knopf im Panel oeffnet denselben Dialog', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="code"]');
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog nicht offen');
    await page.close();
  });

  await test('Auswahlliste bietet die Jira-Sprachen an', async function () {
    var page = await newPage(browser, null, SERVER);
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

  await test('Tabulator rueckt ein statt den Fokus zu wechseln', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'eins');
    await page.press('#jmd-code-input', 'Tab');
    await page.type('#jmd-code-input', 'zwei');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins    zwei');
    var focused = await page.evaluate(function () { return document.activeElement.id; });
    assert.strictEqual(focused, 'jmd-code-input', 'der Fokus hat das Feld verlassen');
    await page.close();
  });

  await test('Umschalt+Tab nimmt die Einrueckung zurueck', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', '    eins');
    await page.press('#jmd-code-input', 'Shift+Tab');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins');
    await page.close();
  });

  await test('Umschalt+Tab ohne Einrueckung fuehrt aus dem Feld heraus', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'eins');
    await page.press('#jmd-code-input', 'Shift+Tab');
    assert.strictEqual(await page.inputValue('#jmd-code-input'), 'eins', 'Text wurde veraendert');
    var focused = await page.evaluate(function () { return document.activeElement.id; });
    assert.strictEqual(focused, 'jmd-code-language', 'Fokus blieb im Feld haengen');
    await page.close();
  });

  await test('mehrere Zeilen werden gemeinsam ein- und ausgerueckt', async function () {
    var page = await newPage(browser, null, SERVER);
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

  await test('Escape schliesst den Dialog', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.press('#jmd-code-input', 'Escape');
    assert.strictEqual(await page.locator('.jmd-dialog--open').count(), 0);
    await page.close();
  });

  await test('Hinweis zum Verlassen des Feldes ist vorhanden', async function () {
    var page = await newPage(browser, null, SERVER);
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

  await test('Textfeld bekommt {code:sprache}', async function () {
    var page = await newPage(browser, null, SERVER);
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

  await test('ohne Sprache wird {code} eingefuegt', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.fill('#jmd-code-input', 'nur Text');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), '{code}\nnur Text\n{code}');
    await page.close();
  });

  await test('Code laeuft nicht durch den Markdown-Parser', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'python');
    await page.fill('#jmd-code-input', '# kein Titel\n**kein Fettdruck**\n- keine Liste');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'),
      '{code:python}\n# kein Titel\n**kein Fettdruck**\n- keine Liste\n{code}');
    await page.close();
  });

  await test('Rich-Text-Editor bekommt <pre><code> mit maskiertem Inhalt', async function () {
    var page = await newPage(browser, null, RTE);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.selectOption('#jmd-code-language', 'html');
    await page.fill('#jmd-code-input', '<b>&</b>');
    await page.click('.jmd-dialog [data-code-action="insert"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes[0].html,
      '<pre><code class="language-html">&lt;b&gt;&amp;&lt;/b&gt;</code></pre>');
    assert.strictEqual(pastes[0].text, '{code:html}\n<b>&</b>\n{code}');
    var rendered = await page.frameLocator('#description_ifr').locator('pre code').textContent();
    assert.strictEqual(rendered, '<b>&</b>');
    await page.close();
  });

  await test('Einfuegen an der gemerkten Position im Rich-Text-Editor', async function () {
    var page = await newPage(browser, null, RTE);
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

  await test('mit "Markup-Modus" landet der Codeblock in der Textarea', async function () {
    var page = await newPage(browser, { switchToMarkup: true }, RTE);
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

  await test('Markup kopieren legt den Codeblock in die Zwischenablage', async function () {
    var page = await newPage(browser, null, SERVER);
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

  await test('Formatiert kopieren legt HTML und Markup nebeneinander ab', async function () {
    var page = await newPage(browser, null, RTE);
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
      '<pre><code class="language-html">&lt;b&gt;&amp;&lt;/b&gt;</code></pre>');
    assert.strictEqual(copied.text, '{code:html}\n<b>&</b>\n{code}');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__pastes; }), [],
      'Kopieren darf nichts einfuegen');
    await page.close();
  });

  await test('ohne text/html-Zwischenablage wird der HTML-Text kopiert', async function () {
    var page = await newPage(browser, null, RTE);
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
      { kind: 'text', text: '<pre><code>a &lt; b</code></pre>' });
    await page.close();
  });

  await test('leerer Code wird auch nicht kopiert', async function () {
    var page = await newPage(browser, null, SERVER);
    await stubClipboard(page);
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.click('.jmd-dialog [data-code-action="copy-jira"]');
    await page.waitForTimeout(200);
    assert.deepStrictEqual(await page.evaluate(function () { return window.__copied; }), []);
    await page.close();
  });

  await test('leerer Code wird nicht eingefuegt', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.focus('#description');
    await page.locator('.jmd-fieldbar').first().locator(CODE_BUTTON).click();
    await page.click('.jmd-dialog [data-code-action="insert"]');
    assert.ok(await page.locator('.jmd-dialog--open').count(), 'Dialog haette offen bleiben muessen');
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  console.log('\nPanel aus einer Vorlage');
  await test('Buttonleiste bietet vier Vorlagen an', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.waitForSelector('.jmd-panelmenu');
    var labels = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.jmd-panelmenu__item'), function (item) {
        return item.dataset.template + ':' + item.textContent;
      });
    });
    assert.deepStrictEqual(labels, ['info:Info', 'note:Hinweis', 'warning:Warnung', 'plain:Standard']);
    await page.close();
  });

  await test('jede Vorlage zeigt ihre Farbe', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.waitForSelector('.jmd-panelmenu');
    var colors = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.jmd-panelmenu__item'), function (item) {
        var swatch = item.querySelector('.jmd-panelmenu__swatch');
        var style = window.getComputedStyle(swatch);
        return { bg: style.backgroundColor, border: style.borderTopColor };
      });
    });
    // Info blau, Hinweis gelb, Warnung rot, Standard grau.
    assert.strictEqual(colors[0].border, 'rgb(0, 82, 204)', JSON.stringify(colors[0]));
    assert.strictEqual(colors[0].bg, 'rgb(222, 235, 255)', JSON.stringify(colors[0]));
    assert.strictEqual(colors[1].border, 'rgb(255, 139, 0)', JSON.stringify(colors[1]));
    assert.strictEqual(colors[2].border, 'rgb(222, 53, 11)', JSON.stringify(colors[2]));
    assert.strictEqual(colors[3].border, 'rgb(223, 225, 230)', JSON.stringify(colors[3]));
    await page.close();
  });

  await test('Textfeld bekommt {panel} mit Farben', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    assert.strictEqual(await page.inputValue('#description'),
      '{panel:title=Warnung|borderColor=#de350b|bgColor=#ffebe6}\n' +
      'Hier die Warnung eintragen.\n{panel}');
    await page.close();
  });

  await test('Cursor steht anschliessend im Textbereich des Panels', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var selected = await page.evaluate(function () {
      var element = document.querySelector('#description');
      return {
        text: element.value.slice(element.selectionStart, element.selectionEnd),
        focused: document.activeElement === element
      };
    });
    assert.strictEqual(selected.text, 'Hier die Information eintragen.');
    assert.strictEqual(selected.focused, true, 'das Feld hat den Fokus nicht');
    await page.close();
  });

  await test('Panel landet an der gemerkten Cursorposition', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.click('.jmd-panelmenu__item[data-template="plain"]');
    assert.strictEqual(await page.inputValue('#description'),
      'oben\n{panel:title=Titel|borderColor=#dfe1e6|bgColor=#f4f5f7}\n' +
      'Hier den Text eintragen.\n{panel}\nunten');
    await page.close();
  });

  await test('Menue schliesst mit Escape und beim Klick daneben', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage');
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.jmd-panelmenu').count(), 0, 'Escape hat nicht geschlossen');
    await button.click();
    await page.waitForSelector('.jmd-panelmenu');
    await page.mouse.click(5, 5);
    assert.strictEqual(await page.locator('.jmd-panelmenu').count(), 0, 'Klick daneben hat nicht geschlossen');
    // Und nichts wurde eingefuegt.
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  await test('Panel der Erweiterung bietet dieselben Vorlagen', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.focus('#comment');
    await page.click('.jmd-fab');
    await page.click('.jmd-panel [data-action="panel-template"]');
    await page.waitForSelector('.jmd-panelmenu');
    assert.strictEqual(await page.locator('.jmd-panelmenu__item').count(), 4);
    await page.click('.jmd-panelmenu__item[data-template="note"]');
    assert.strictEqual(await page.inputValue('#comment'),
      '{panel:title=Hinweis|borderColor=#ff8b00|bgColor=#fffae6}\n' +
      'Hier den Hinweis eintragen.\n{panel}');
    await page.close();
  });

  await test('Rich-Text-Editor bekommt HTML mit denselben Farben', async function () {
    var page = await newPage(browser, null, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Einfuegen im Editor angekommen');
    assert.ok(/border: 1px solid #0052cc/.test(pastes[0].html), 'Rahmenfarbe fehlt: ' + pastes[0].html);
    assert.ok(/background-color: #deebff/.test(pastes[0].html), 'Fuellfarbe fehlt: ' + pastes[0].html);
    assert.ok(/<strong>Info<\/strong>/.test(pastes[0].html), 'Titel fehlt: ' + pastes[0].html);
    // Als Rueckfalltext liegt weiterhin das Wiki-Markup bereit.
    assert.ok(/^\{panel:title=Info\|borderColor=#0052cc\|bgColor=#deebff\}/.test(pastes[0].text),
      'Markup fehlt: ' + pastes[0].text);
    // Die Textarea bleibt unangetastet - geschrieben wird in den Editor.
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  await test('im Rich-Text-Editor steht der Cursor im Panel-Text', async function () {
    var page = await newPage(browser, null, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    await page.waitForFunction(function () {
      var doc = document.querySelector('#description_ifr').contentDocument;
      var selection = doc.defaultView.getSelection();
      return selection && selection.toString() === 'Hier die Warnung eintragen.';
    }, null, { timeout: 4000 });
    await page.close();
  });

  await test('mit "vorher umschalten" kommt Markup statt HTML', async function () {
    var page = await newPage(browser, { switchToMarkup: true }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel aus Vorlage').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    await page.waitForFunction(function () {
      return document.querySelector('#description').value.indexOf('{panel:title=Info') !== -1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  console.log('\nRobustheit');
  await test('kein Fehler in der Konsole beim Laden', async function () {
    var context = await browser.newContext();
    var page = await context.newPage();
    var errors = [];
    page.on('pageerror', function (error) {
      errors.push(String(error));
    });
    page.on('console', function (message) {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('file://' + path.join(root, 'test', 'fixtures', 'mock-jira.html'));
    await page.addScriptTag({ content: CHROME_STUB });
    for (var i = 0; i < SOURCES.length; i++) {
      await page.addScriptTag({ content: readSource(SOURCES[i]) });
    }
    await page.waitForSelector('.jmd-fab');
    await page.click('.jmd-fab');
    await page.fill('#jmd-input', '# Test');
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await test('doppeltes Laden baut nichts doppelt ein', async function () {
    var page = await newPage(browser);
    for (var i = 0; i < SOURCES.length; i++) {
      await page.addScriptTag({ content: readSource(SOURCES[i]) });
    }
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.jmd-fab').count(), 1);
    assert.strictEqual(await page.locator('.jmd-fieldbar').count(), 2);
    await page.close();
  });

  await browser.close();

  console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
