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

var SOURCES = ['src/settings.js', 'src/converter.js', 'src/editors.js', 'src/content.js'];

function readSource(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

async function newPage(browser, settings, fixture) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.goto('file://' + path.join(root, 'test', 'fixtures', fixture || 'mock-jira.html'));
  await page.addStyleTag({ content: readSource('src/content.css') });
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
