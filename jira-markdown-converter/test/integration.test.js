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
  'window.__local = {};',
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
  '    local: {',
  '      get: function (defaults, cb) {',
  '        var out = Object.assign({}, defaults, window.__local);',
  '        setTimeout(function () { cb(out); }, 0);',
  '      },',
  '      set: function (values, cb) {',
  '        Object.assign(window.__local, values);',
  '        if (cb) setTimeout(cb, 0);',
  '      }',
  '    },',
  '    onChanged: { addListener: function () {} }',
  '  }',
  '};'
].join('\n');

var SOURCES = ['src/settings.js', 'src/converter.js', 'src/editors.js', 'src/codedialog.js',
  'src/templatedialog.js', 'src/editlock.js', 'src/content.js'];
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
    // customTemplates gehoert in den local-Bereich - sonst ueberschreibt der
    // leere local-Standardwert die hier uebergebenen Vorlagen beim Laden.
    var sync = Object.assign({}, settings);
    var local = { customTemplates: sync.customTemplates || [] };
    delete sync.customTemplates;
    await page.evaluate(function (values) {
      window.__settings = values.sync;
      window.__local = values.local;
    }, { sync: sync, local: local });
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

/**
 * Laedt die Optionsseite. settings.customTemplates (falls gesetzt) landet im
 * local-Bereich des Stubs, alles andere im sync-Bereich - wie in der echten
 * Aufteilung. Der Stub muss per addInitScript vor page.goto stehen, weil die
 * Seite settings.js selbst per <script> laedt.
 */
async function optionsPage(browser, settings) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.addInitScript({ content: CHROME_STUB });
  if (settings) {
    var local = { customTemplates: settings.customTemplates || [] };
    var sync = Object.assign({}, settings);
    delete sync.customTemplates;
    await page.addInitScript({
      content: 'window.__settings = ' + JSON.stringify(sync) + ';' +
        'window.__local = ' + JSON.stringify(local) + ';'
    });
  }
  await page.goto('file://' + path.join(root, 'options', 'options.html'));
  // #templateList steht statisch im HTML - erst ein Kind zeigt, dass
  // renderTemplates() (nach Settings.load()) tatsaechlich gelaufen ist.
  await page.waitForSelector('#templateList > *');
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
  var browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  var SERVER = 'mock-jira-server.html';
  var RTE = 'mock-jira-rte.html';

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

  /** Zustand aller Schalter, die in Leisten am Feld haengen. */
  function barToggles(page) {
    return page.evaluate(function () {
      var buttons = document.querySelectorAll('.jmd-fieldbar__btn--auto');
      return Array.prototype.map.call(buttons, function (button) {
        return {
          label: button.querySelector('.jmd-fieldbar__caption').textContent,
          color: button.querySelector('.jmd-fieldbar__dot').style.background,
          pressed: button.getAttribute('aria-pressed')
        };
      });
    });
  }

  await test('Schalter sitzt auch in der Leiste am Feld', async function () {
    var page = await newPage(browser, null, SERVER);
    var view = await barToggles(page);
    assert.ok(view.length >= 2, 'nicht an jeder Leiste ein Schalter: ' + view.length);
    view.forEach(function (button) {
      assert.ok(/an$/.test(button.label), 'Beschriftung: ' + button.label);
      assert.ok(/54, 179, 126/.test(button.color), 'aktiv nicht gruen: ' + button.color);
      assert.strictEqual(button.pressed, 'true');
    });
    await page.close();
  });

  await test('Umschalten in der Leiste zieht alle Leisten nach', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    var view = await barToggles(page);
    view.forEach(function (button) {
      assert.ok(/aus$/.test(button.label), 'Beschriftung: ' + button.label);
      assert.ok(/137, 147, 164/.test(button.color), 'inaktiv nicht grau: ' + button.color);
      assert.strictEqual(button.pressed, 'false');
    });
    assert.strictEqual(await page.evaluate(function () { return window.__settings.convertOnPaste; }),
      false, 'Einstellung wurde nicht gespeichert');
    await page.close();
  });

  await test('in der Leiste ausgeschaltet wird beim Einfuegen nichts umgewandelt', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    await pasteInto(page, '#description', '# Titel');
    assert.strictEqual(await page.inputValue('#description'), '',
      'das Einfuegen wurde weiterhin abgefangen');

    // Gegenprobe: wieder an, und die Automatik greift erneut.
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    await pasteInto(page, '#description', '# Titel');
    assert.strictEqual(await page.inputValue('#description'), 'h1. Titel');
    await page.close();
  });

  await test('Umschalten im Panel zieht in der Leiste nach', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.click('.jmd-fab');
    await page.click('.jmd-panel .jmd-switch__track');
    var view = await barToggles(page);
    view.forEach(function (button) {
      assert.ok(/aus$/.test(button.label), 'Beschriftung: ' + button.label);
      assert.strictEqual(button.pressed, 'false');
    });
    await page.close();
  });

  await test('auch im Rich-Text-Editor hat die Leiste den Schalter', async function () {
    var page = await newPage(browser, null, RTE);
    var before = await barToggles(page);
    assert.ok(before.length >= 1, 'kein Schalter an der Leiste');
    assert.ok(/an$/.test(before[0].label), 'Beschriftung: ' + before[0].label);
    await page.locator('.jmd-fieldbar__btn--auto').first().click();
    var after = await barToggles(page);
    assert.ok(/aus$/.test(after[0].label), 'Beschriftung: ' + after[0].label);
    assert.notStrictEqual(before[0].color, after[0].color, 'der Punkt aendert seine Farbe nicht');
    await page.close();
  });

  console.log('\nCode einfuegen');
  var CODE_BUTTON = '.jmd-fieldbar__btn:text-is("Code")';

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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.waitForSelector('.jmd-panelmenu');
    var colors = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.jmd-panelmenu__item'), function (item) {
        var swatch = item.querySelector('.jmd-panelmenu__swatch');
        var style = window.getComputedStyle(swatch);
        return { bg: style.backgroundColor, border: style.borderLeftColor };
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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="warning"]');
    assert.strictEqual(await page.inputValue('#description'),
      '{panel:title=Warnung|borderColor=#de350b|bgColor=#ffebe6}\n' +
      'Hier die Warnung eintragen.\n{panel}');
    await page.close();
  });

  await test('Cursor steht anschliessend im Textbereich des Panels', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="plain"]');
    assert.strictEqual(await page.inputValue('#description'),
      'oben\n{panel:title=Titel|borderColor=#dfe1e6|bgColor=#f4f5f7}\n' +
      'Hier den Text eintragen.\n{panel}\nunten');
    await page.close();
  });

  await test('Menue schliesst mit Escape und beim Klick daneben', async function () {
    var page = await newPage(browser, null, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    var button = page.locator('.jmd-fieldbar').first().getByText('Panel');
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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes.length, 1, 'kein Einfuegen im Editor angekommen');
    assert.ok(/border-left: 4px solid #0052cc/.test(pastes[0].html), 'Rahmenfarbe fehlt: ' + pastes[0].html);
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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
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
    await page.locator('.jmd-fieldbar').first().getByText('Panel').click();
    await page.click('.jmd-panelmenu__item[data-template="info"]');
    await page.waitForFunction(function () {
      return document.querySelector('#description').value.indexOf('{panel:title=Info') !== -1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  console.log('\nBearbeitungsmodus einfrieren');
  var INLINE = 'mock-jira-inline-edit.html';

  /** Inline-Bearbeitung oeffnen und warten, bis unsere Leiste dranhaengt. */
  async function startEditing(page) {
    await page.click('#description-val');
    await page.waitForSelector('.jmd-fieldbar', { timeout: 4000 });
  }

  async function clickBeside(page) {
    await page.click('#daneben');
    await page.waitForTimeout(150);
  }

  function editing(page) {
    return page.evaluate(function () {
      return !!document.getElementById('description-wiki-edit');
    });
  }

  await test('ohne Einfrieren schliesst Jira das Feld beim Klick daneben', async function () {
    var page = await newPage(browser, { freezeEditMode: false }, INLINE);
    await startEditing(page);
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'das Feld haette schliessen muessen');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__closed; }),
      ['klick-daneben']);
    await page.close();
  });

  await test('eingefroren bleibt das Feld beim Klick daneben offen', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.waitForFunction(function () {
      return window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.fill('#description', 'Wichtige Aenderung');
    await clickBeside(page);
    assert.strictEqual(await editing(page), true, 'das Feld wurde geschlossen');
    assert.deepStrictEqual(await page.evaluate(function () { return window.__closed; }), []);
    assert.strictEqual(await page.inputValue('#description'), 'Wichtige Aenderung',
      'der Text ist verloren gegangen');
    await page.close();
  });

  await test('das Schloss zeigt den Zustand an', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    var view = await page.evaluate(function () {
      var button = document.querySelector('.jmd-fieldbar__btn--lock');
      return {
        pressed: button.getAttribute('aria-pressed'),
        text: button.textContent,
        hidden: button.hidden
      };
    });
    assert.strictEqual(view.hidden, false);
    assert.strictEqual(view.pressed, 'true');
    assert.ok(/Eingefroren/.test(view.text), 'Beschriftung: ' + view.text);
    await page.close();
  });

  await test('geoeffnetes Schloss stellt Jiras Verhalten wieder her', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('.jmd-fieldbar__btn--lock');
    var view = await page.evaluate(function () {
      var button = document.querySelector('.jmd-fieldbar__btn--lock');
      return { pressed: button.getAttribute('aria-pressed'), text: button.textContent };
    });
    assert.strictEqual(view.pressed, 'false');
    assert.ok(/Einfrieren/.test(view.text), 'Beschriftung: ' + view.text);
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'Jira haette schliessen duerfen');
    await page.close();
  });

  await test('Escape bricht das eingefrorene Feld nicht ab', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.press('#description', 'Escape');
    await page.waitForTimeout(150);
    assert.strictEqual(await editing(page), true, 'Escape hat das Feld geschlossen');
    await page.click('.jmd-fieldbar__btn--lock');
    await page.press('#description', 'Escape');
    await page.waitForTimeout(150);
    assert.strictEqual(await editing(page), false, 'nach dem Oeffnen muss Escape wieder greifen');
    await page.close();
  });

  await test('ein geoeffnetes Schloss friert nicht von selbst wieder ein', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('.jmd-fieldbar__btn--lock');
    // Zurueck ins Feld: der Fokus darf die Sperre nicht wieder setzen.
    await page.click('#description');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.JiraEditLock.isActive(); }), false);
    await clickBeside(page);
    assert.strictEqual(await editing(page), false, 'Jira haette schliessen duerfen');
    await page.close();
  });

  await test('Speichern im Feld funktioniert weiter', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.fill('#description', 'Neuer Stand');
    await page.click('#speichern');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(function () { return window.__saved; }), 'Neuer Stand');
    await page.close();
  });

  await test('vor dem Verlassen der Seite wird gefragt, solange eingefroren ist', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    var asks = function () {
      return page.evaluate(function () {
        var event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    };
    assert.strictEqual(await asks(), true, 'es wurde nicht nachgefragt');
    await page.click('.jmd-fieldbar__btn--lock');
    assert.strictEqual(await asks(), false, 'nach dem Oeffnen darf nichts mehr fragen');
    await page.close();
  });

  await test('geschlossenes Feld gibt seine Sperre wieder ab', async function () {
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('.jmd-fieldbar__btn--lock');
    await clickBeside(page);
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    var asked = await page.evaluate(function () {
      var event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.strictEqual(asked, false);
    await page.close();
  });

  await test('abgeschaltet gibt es weder Schloss noch Einfrieren', async function () {
    var page = await newPage(browser, { freezeEditMode: false }, INLINE);
    await startEditing(page);
    var hidden = await page.evaluate(function () {
      return document.querySelector('.jmd-fieldbar__btn--lock').hidden;
    });
    assert.strictEqual(hidden, true, 'das Schloss haette versteckt sein muessen');
    assert.strictEqual(await page.evaluate(function () { return window.JiraEditLock.isActive(); }), false);
    await page.close();
  });

  await test('eingefroren bleiben Klicks daneben ohne Wirkung', async function () {
    // Bewusst so: das Feld ist eingefroren, die Seite reagiert daneben nicht
    // mehr auf Klicks. Das Schloss oeffnen gibt sie wieder frei.
    var page = await newPage(browser, null, INLINE);
    await startEditing(page);
    await page.click('#fremder-knopf');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(function () { return window.__fremdeKlicks; }), 0);
    await page.click('.jmd-fieldbar__btn--lock');
    await page.click('#fremder-knopf');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(function () { return window.__fremdeKlicks; }), 1);
    await page.close();
  });

  console.log('\nEinfrieren im Beschreibungsfeld des Vorgangs');
  var ISSUE = 'mock-jira-issue-description.html';

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

  await test('Textmodus: das Feld bleibt beim Klick daneben offen', async function () {
    // Jira schliesst hier in der Erfassungsphase am Dokument - vor unserem
    // eigenen Wachposten, wenn der nur am Dokument haengt.
    var page = await newPage(browser, null, ISSUE);
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

  await test('Speichern neben dem Wiki-Feld funktioniert weiter', async function () {
    // Die Knoepfe liegen im Feldblock, aber ausserhalb des Wiki-Felds.
    var page = await newPage(browser, null, ISSUE);
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

  await test('Abbrechen funktioniert weiter', async function () {
    var page = await newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.click('#abbrechen');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), ['abbrechen']);
    await page.waitForFunction(function () {
      return !window.JiraEditLock.isActive();
    }, null, { timeout: 4000 });
    await page.close();
  });

  await test('nach dem Moduswechsel bleibt das Feld eingefroren', async function () {
    // Jira baut den Feldblock beim Wechsel neu auf - die Sperre muss auf die
    // neue Textarea uebergehen.
    var page = await newPage(browser, null, ISSUE);
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

  await test('visueller Modus: auch der Editorrahmen friert das Feld ein', async function () {
    var page = await newPage(browser, null, ISSUE);
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

  await test('Escape im Beschreibungsfeld bricht nicht ab', async function () {
    var page = await newPage(browser, null, ISSUE);
    await openDescription(page);
    await page.press('#description', 'Escape');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), []);
    await page.close();
  });

  await test('der schwebende Editor schliesst das eingefrorene Feld nicht', async function () {
    // Das Panel liegt ausserhalb des Feldblocks - fuer Jira also "daneben".
    // Bedienbar bleibt es trotzdem: der Klick geht durch, alles andere nicht.
    var page = await newPage(browser, null, ISSUE);
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

  await test('vor der Seite geladen greift das Einfrieren ebenfalls', async function () {
    // Wie im Manifest: run_at document_start. Die Erweiterung laeuft dann vor
    // allen Skripten der Seite - und muss ihre Oberflaeche trotzdem erst
    // aufbauen, wenn das Dokument steht.
    var context = await browser.newContext();
    var page = await context.newPage();
    await page.addInitScript({ content: CHROME_STUB });
    for (var i = 0; i < SOURCES.length; i++) {
      await page.addInitScript({ content: readSource(SOURCES[i]) });
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

  await test('ohne Einfrieren schliesst Jira das Beschreibungsfeld weiterhin', async function () {
    var page = await newPage(browser, { freezeEditMode: false }, ISSUE);
    await openDescription(page);
    await page.click('#daneben');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await closedBy(page), ['klick-daneben']);
    await page.close();
  });

  console.log('\nOptionsseite: Eigene Vorlagen');
  await test('Anlegen einer Vorlage erzeugt eine Zeile in der Liste', async function () {
    var page = await optionsPage(browser);
    await page.fill('#tplTitle', 'Bug-Report');
    await page.fill('#tplMarkup', 'h3. ${Titel}');
    await page.click('#tplSave');
    await page.waitForSelector('.tpl-item');
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    var title = await page.locator('.tpl-item__title').innerText();
    assert.strictEqual(title, 'Bug-Report');
    // Leer gelassene Platzhalterliste ist "keine Reihenfolge vorgegeben",
    // nicht "unvollstaendig" - darf keinen Hinweis ausloesen.
    assert.strictEqual(await page.locator('#tplError').innerText(), '');
    await page.close();
  });

  await test('sechs Platzhalter erzeugen eine Fehlermeldung und legen nichts an', async function () {
    var page = await optionsPage(browser);
    await page.fill('#tplTitle', 'Zu viele Platzhalter');
    await page.fill('#tplMarkup', '${A} ${B} ${C} ${D} ${E} ${F}');
    await page.click('#tplSave');
    var error = await page.locator('#tplError').innerText();
    assert.ok(/hoechstens 5/i.test(error), 'Fehlermeldung: ' + error);
    assert.strictEqual(await page.locator('.tpl-item').count(), 0);
    await page.close();
  });

  await test('Bearbeiten aendert den Titel, ohne die id zu wechseln', async function () {
    var page = await optionsPage(browser, {
      customTemplates: [{ id: 'tpl-fix', title: 'Alt', templateMarkup: 'Text', placeholders: [] }]
    });
    await page.waitForSelector('.tpl-item');
    await page.click('[data-tpl-action="edit"]');
    await page.fill('#tplTitle', 'Neu');
    await page.click('#tplSave');
    await page.waitForTimeout(150);
    var local = await page.evaluate(function () { return window.__local.customTemplates; });
    assert.strictEqual(local.length, 1);
    assert.strictEqual(local[0].id, 'tpl-fix');
    assert.strictEqual(local[0].title, 'Neu');
    await page.close();
  });

  await test('Loeschen entfernt die Zeile', async function () {
    var page = await optionsPage(browser, {
      customTemplates: [{ id: 'tpl-del', title: 'Weg damit', templateMarkup: 'Text', placeholders: [] }]
    });
    await page.waitForSelector('.tpl-item');
    await page.evaluate(function () { window.confirm = function () { return true; }; });
    await page.click('[data-tpl-action="delete"]');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('.tpl-item').count(), 0);
    var local = await page.evaluate(function () { return window.__local.customTemplates; });
    assert.deepStrictEqual(local, []);
    await page.close();
  });

  await test('eine angelegte Vorlage landet in local, nicht in sync', async function () {
    var page = await optionsPage(browser);
    await page.fill('#tplTitle', 'Nur lokal');
    await page.fill('#tplMarkup', 'Text ohne Platzhalter');
    await page.click('#tplSave');
    await page.waitForTimeout(150);
    var local = await page.evaluate(function () { return window.__local.customTemplates; });
    var sync = await page.evaluate(function () { return window.__settings.customTemplates; });
    assert.strictEqual(local.length, 1);
    assert.strictEqual(sync, undefined);
    await page.close();
  });

  await test('Platzhaltername "constructor" laesst sich speichern', async function () {
    var page = await optionsPage(browser);
    await page.fill('#tplTitle', 'Proto');
    await page.fill('#tplMarkup', 'h3. ${constructor} und ${Datum}');
    await page.fill('#tplPlaceholders', 'constructor, Datum');
    await page.click('#tplSave');
    var error = await page.locator('#tplError').innerText();
    assert.strictEqual(error, '');
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    await page.close();
  });

  await test('fehlender Platzhalter in der Liste ist nur eine Warnung', async function () {
    var page = await optionsPage(browser);
    await page.fill('#tplTitle', 'Unvollstaendige Liste');
    await page.fill('#tplMarkup', 'h3. ${Titel} ${Datum}');
    await page.fill('#tplPlaceholders', 'Titel');
    await page.click('#tplSave');
    var hint = await page.locator('#tplError').innerText();
    assert.ok(/Datum/.test(hint), 'Hinweis: ' + hint);
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    await page.close();
  });

  await test('Tippfehler in der Platzhalterliste ist nur eine Warnung', async function () {
    var page = await optionsPage(browser);
    await page.fill('#tplTitle', 'Tippfehler');
    await page.fill('#tplMarkup', 'h3. ${Titel}');
    await page.fill('#tplPlaceholders', 'Titel, Tippfehler');
    await page.click('#tplSave');
    var hint = await page.locator('#tplError').innerText();
    assert.ok(/Tippfehler/.test(hint), 'Hinweis: ' + hint);
    assert.strictEqual(await page.locator('.tpl-item').count(), 1);
    await page.close();
  });

  var TEMPLATES_BUTTON = '.jmd-fieldbar__btn--templates';
  var TEMPLATE_DIALOG = '.jmd-dialog[data-jmd-ui="template-dialog"]';

  console.log('\nPlatzhalter-Dialog');

  await test('Vorlage mit zwei Platzhaltern oeffnet den Dialog mit zwei Feldern', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-two',
          title: 'Bug-Report',
          templateMarkup: 'h3. ${Titel}\n${Beschreibung}',
          placeholders: ['Titel', 'Beschreibung']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-two"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    var labels = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('[data-role="tpl-fields"] label'), function (label) {
        return label.textContent;
      });
    });
    assert.deepStrictEqual(labels, ['Titel', 'Beschreibung']);
    assert.strictEqual(await page.locator('[data-role="tpl-fields"] input').count(), 2);
    await page.close();
  });

  await test('Vorlage mit fuenf Platzhaltern zeigt fuenf Felder', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-five',
          title: 'Viele Platzhalter',
          templateMarkup: '${A} ${B} ${C} ${D} ${E}',
          placeholders: ['A', 'B', 'C', 'D', 'E']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-five"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    assert.strictEqual(await page.locator('[data-role="tpl-fields"] input').count(), 5);
    await page.close();
  });

  await test('Eingabe und "Einfuegen" schreibt die Werte ins Feld', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-insert',
          title: 'Bug-Report',
          templateMarkup: 'h3. ${Titel}\n${Beschreibung}',
          placeholders: ['Titel', 'Beschreibung']
        }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-insert"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Titel"]', 'Login schlaegt fehl');
    await page.fill('[data-role="tpl-fields"] input[data-name="Beschreibung"]', 'Fehler nach dem Absenden');
    await page.click('[data-tpl-action="insert"]');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0);
    var value = await page.inputValue('#description');
    assert.strictEqual(value, 'h3. Login schlaegt fehl\nFehler nach dem Absenden');
    var focusedId = await page.evaluate(function () {
      return document.activeElement && document.activeElement.id;
    });
    assert.strictEqual(focusedId, 'description', 'Fokus liegt nach dem Einfuegen nicht mehr im Zielfeld');
    await page.close();
  });

  await test('Escape schliesst den Dialog ohne einzufuegen', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-escape', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-escape"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0);
    assert.strictEqual(await page.inputValue('#description'), '');
    await page.close();
  });

  await test('Escape gibt den Fokus an den Vorlagen-Button zurueck', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-escape-focus', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-escape-focus"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.keyboard.press('Escape');
    var focusReturned = await page.evaluate(function () {
      var bar = document.querySelectorAll('.jmd-fieldbar')[0];
      var button = bar.querySelector('.jmd-fieldbar__btn--templates');
      return document.activeElement === button;
    });
    assert.strictEqual(focusReturned, true, 'Fokus ist nach Escape nicht auf den Vorlagen-Button zurueckgekehrt');
    await page.close();
  });

  await test('Strg+Enter fuegt die Vorlage ein', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-ctrl-enter', title: 'Bug-Report', templateMarkup: 'h3. ${Titel}', placeholders: ['Titel'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-ctrl-enter"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Titel"]', 'Schnelltest');
    await page.keyboard.press('Control+Enter');
    assert.strictEqual(await page.locator(TEMPLATE_DIALOG + '.jmd-dialog--open').count(), 0);
    assert.strictEqual(await page.inputValue('#description'), 'h3. Schnelltest');
    await page.close();
  });

  console.log('\nEigene Vorlagen haerten');

  await test('Vorlage fuegt an der zuletzt gesetzten Cursorposition ein', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-caret', title: 'Status', templateMarkup: 'Status: Erledigt', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'oben\n\nunten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-caret"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben\nStatus: Erledigt\nunten');
    await page.close();
  });

  await test('Vorlage ersetzt eine bestehende Auswahl', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-replace', title: 'Ersatz', templateMarkup: 'ERSATZ', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'oben ALT unten');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(5, 8);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-replace"]');
    assert.strictEqual(await page.inputValue('#description'), 'oben ERSATZ unten');
    await page.close();
  });

  await test('Einzeilige Vorlage erzeugt keine zusaetzliche Leerzeile', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-oneline', title: 'Einzeiler', templateMarkup: 'MITTE', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-oneline"]');
    assert.strictEqual(await page.inputValue('#description'), 'AMITTEB');
    await page.close();
  });

  await test('Listen-Vorlage bekommt trotz Cursor mitten in der Zeile eigene Zeilen', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-list', title: 'Liste', templateMarkup: '* Punkt eins', placeholders: [] }
      ]
    }, SERVER);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-list"]');
    assert.strictEqual(await page.inputValue('#description'), 'A\n* Punkt eins\nB');
    await page.close();
  });

  await test('Mehrzeilige Vorlage ohne Blockzeichen behaelt ihre Randumbrueche', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        {
          id: 'tpl-multiline',
          title: 'Mehrzeilig',
          templateMarkup: 'Zeile eins\n{code}\nx\n{code}',
          placeholders: []
        }
      ]
    }, SERVER);
    await page.fill('#description', 'AB');
    await page.evaluate(function () {
      var element = document.querySelector('#description');
      element.focus();
      element.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-multiline"]');
    assert.strictEqual(await page.inputValue('#description'), 'A\nZeile eins\n{code}\nx\n{code}\nB');
    await page.close();
  });

  await test('Rich-Text mit switchToMarkup schaltet um und fuegt Markup ein', async function () {
    var page = await newPage(browser, {
      switchToMarkup: true,
      customTemplates: [
        { id: 'tpl-rte-switch', title: 'Status', templateMarkup: 'Status: Erledigt', placeholders: [] }
      ]
    }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-rte-switch"]');
    await page.waitForFunction(function () {
      return window.__mode === 'markup';
    }, null, { timeout: 4000 });
    assert.strictEqual(await page.inputValue('#description'), 'Status: Erledigt');
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.deepStrictEqual(pastes, [], 'es haette nichts im Rich-Text-Editor landen duerfen');
    await page.close();
  });

  await test('Rich-Text ohne switchToMarkup fuegt Markup als Text ein', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-rte-plain', title: 'Status', templateMarkup: 'h3. Status: Erledigt', placeholders: [] }
      ]
    }, RTE);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-rte-plain"]');
    await page.waitForFunction(function () {
      return window.__pastes.length === 1;
    }, null, { timeout: 4000 });
    var pastes = await page.evaluate(function () { return window.__pastes; });
    assert.strictEqual(pastes[0].text.indexOf('Status: Erledigt') !== -1, true, 'Markup fehlt: ' + pastes[0].text);
    assert.ok(!pastes[0].html, 'Rich-Text haette kein HTML bekommen duerfen');
    assert.strictEqual(await page.evaluate(function () { return window.__mode; }), 'rich');
    await page.close();
  });

  await test('Dialogwert mit Sonderzeichen landet maskiert im Feld', async function () {
    var page = await newPage(browser, {
      customTemplates: [
        { id: 'tpl-value-escape', title: 'Mit Wert', templateMarkup: 'h3. ${Wert}', placeholders: ['Wert'] }
      ]
    }, SERVER);
    await page.waitForSelector('.jmd-fieldbar');
    await page.locator('.jmd-fieldbar').first().locator(TEMPLATES_BUTTON).click();
    await page.click('.jmd-panelmenu__item[data-template="tpl-value-escape"]');
    await page.waitForSelector(TEMPLATE_DIALOG + '.jmd-dialog--open');
    await page.fill('[data-role="tpl-fields"] input[data-name="Wert"]', 'A{B}C|D[E]F');
    await page.click('[data-tpl-action="insert"]');
    assert.strictEqual(await page.inputValue('#description'), 'h3. A\\{B\\}C\\|D\\[E\\]F');
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
