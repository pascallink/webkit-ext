/**
 * Prueft Dateiverweise ausserhalb des Manifests: HTML-Seiten, README,
 * Service-Worker-Paritaet mit dem Manifest, sowie Quellcode-Regeln
 * (keine console-Ausgaben, kein rohes innerHTML, Store-kritische Merkmale
 * an allen Oberflaechen). Manifest selbst steht in manifest.test.js,
 * Store-Artefakte in store.test.js.
 * Aufruf: npm run test:package --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;

var root = path.join(__dirname, '..', '..', '..');

function abs(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(abs(relative));
}

var manifest = JSON.parse(fs.readFileSync(abs('manifest.json'), 'utf8'));

describe('Dateiverweise in HTML', function () {
  ['popup/popup.html', 'options/options.html'].forEach(function (page) {
    test(page + ' verweist nur auf vorhandene Dateien', function () {
      var html = fs.readFileSync(abs(page), 'utf8');
      var dir = path.dirname(page);
      var references = [];
      var pattern = /(?:src|href)="([^"#][^"]*)"/g;
      var match;
      while ((match = pattern.exec(html)) !== null) {
        references.push(match[1]);
      }
      assert.ok(references.length, 'keine Verweise gefunden');
      references.forEach(function (reference) {
        var resolved = path.normalize(path.join(dir, reference));
        assert.ok(exists(resolved), reference + ' -> ' + resolved + ' fehlt');
      });
    });
  });

  test('README verweist nur auf vorhandene Bilder', function () {
    var readme = fs.readFileSync(abs('README.md'), 'utf8');
    // Nur echte Verweise, nicht die Beispielzeile in der Umwandlungstabelle.
    var pattern = /!\[[^\]]*\]\((docs\/[^)]+)\)/g;
    var match;
    var count = 0;
    while ((match = pattern.exec(readme)) !== null) {
      count++;
      assert.ok(exists(match[1]), match[1] + ' fehlt');
    }
    assert.ok(count >= 4, 'zu wenige Bilder in der Dokumentation: ' + count);
  });
});

describe('Service-Worker', function () {
  test('importScripts verweist auf vorhandene Dateien', function () {
    var source = fs.readFileSync(abs('src/background.js'), 'utf8');
    var match = /importScripts\(([^)]*)\)/.exec(source);
    assert.ok(match, 'kein importScripts gefunden');
    var files = match[1].split(',').map(function (part) {
      return part.trim().replace(/^['"]|['"]$/g, '');
    });
    files.forEach(function (file) {
      assert.ok(exists(path.join('src', file)), 'src/' + file + ' fehlt');
    });
  });

  test('Content-Dateien im Service-Worker stimmen mit dem Manifest ueberein', function () {
    var source = fs.readFileSync(abs('src/background.js'), 'utf8');
    var match = /var CONTENT_FILES = \[([^\]]*)\]/.exec(source);
    assert.ok(match, 'CONTENT_FILES nicht gefunden');
    var files = match[1].split(',').map(function (part) {
      return part.trim().replace(/^['"]|['"]$/g, '');
    }).filter(Boolean);
    assert.deepStrictEqual(files, manifest.content_scripts[0].js);
  });
});

describe('Quellcode', function () {
  test('keine console-Ausgaben im Auslieferungscode', function () {
    ['src/content.js', 'src/editors.js', 'src/converter.js', 'src/codedialog.js', 'src/templatedialog.js', 'src/editlock.js', 'src/settings.js', 'src/background.js'].forEach(function (file) {
      var source = fs.readFileSync(abs(file), 'utf8');
      assert.ok(!/console\.(log|debug|info)\(/.test(source), file + ' enthaelt console-Ausgaben');
    });
  });

  test('kein innerHTML mit Fremddaten', function () {
    var templates = {
      'src/content.js': /PANEL_HTML/,
      'src/codedialog.js': /DIALOG_HTML/,
      'src/templatedialog.js': /DIALOG_HTML/
    };
    Object.keys(templates).forEach(function (file) {
      var source = fs.readFileSync(abs(file), 'utf8');
      var matches = source.match(/\.innerHTML\s*=\s*([^;]+);/g) || [];
      matches.forEach(function (line) {
        assert.ok(templates[file].test(line), file + ': innerHTML nur mit fester Vorlage erlaubt: ' + line);
      });
    });
  });

  test('Schalter ist an allen Oberflaechen vorhanden', function () {
    // Popup, Optionsseite und Panel muessen dieselbe Einstellung anbieten.
    ['popup/popup.html', 'options/options.html'].forEach(function (page) {
      var html = fs.readFileSync(abs(page), 'utf8');
      assert.ok(/id="convertOnPaste"/.test(html), page + ' hat keinen Schalter');
      assert.ok(/switch__track/.test(html), page + ' nutzt nicht die Schalter-Optik');
    });
    var content = fs.readFileSync(abs('src/content.js'), 'utf8');
    assert.ok(/data-option="convertOnPaste"/.test(content), 'Panel hat keinen Schalter');
    assert.ok(/jmd-switch__track/.test(content), 'Panel nutzt nicht die Schalter-Optik');

    // Die Leiste direkt am Feld gehoert dazu - mit Punkt und Beschriftung, und
    // beides aus derselben Quelle wie ueberall sonst.
    assert.ok(/jmd-fieldbar__btn--auto/.test(content), 'Feldleiste hat keinen Schalter');
    assert.ok(/createAutoToggle\(\)/.test(content), 'Schalter wird nicht in die Leiste gebaut');
    assert.ok(/Settings\.toggleState\(settings\)/.test(content),
      'Feldleiste holt den Zustand nicht aus Settings.TOGGLE');
    var css = fs.readFileSync(abs('src/content.css'), 'utf8');
    assert.ok(/\.jmd-fieldbar__dot/.test(css), 'Schalter in der Leiste ohne Zustandspunkt');
  });

  test('Schalter sitzt auch am Erweiterungssymbol', function () {
    var source = fs.readFileSync(abs('src/background.js'), 'utf8');
    assert.ok(/contexts:\s*\[[^\]]*'action'/.test(source),
      'kein Kontextmenue-Eintrag am Symbol');
    assert.ok(/type:\s*'checkbox'/.test(source), 'Eintrag ist kein Haken-Eintrag');
    assert.ok(/setBadgeText/.test(source), 'kein Badge am Symbol');
    assert.ok(/setBadgeBackgroundColor/.test(source), 'Badge ohne Farbe');
  });

  test('Code einfuegen ist an Feldleiste und Panel vorhanden', function () {
    var content = fs.readFileSync(abs('src/content.js'), 'utf8');
    assert.ok(/data-action="code"/.test(content), 'Panel hat keinen Knopf fuer Code');
    assert.ok(/openCodeDialog\(field\)/.test(content), 'Feldleiste hat keinen Knopf fuer Code');
    var dialog = fs.readFileSync(abs('src/codedialog.js'), 'utf8');
    assert.ok(/codeLanguages/.test(dialog), 'Sprachliste wird nicht aus dem Konverter geholt');
    assert.ok(/data-code-action="copy-jira"/.test(dialog), 'kein Knopf zum Kopieren des Markups');
    assert.ok(/data-code-action="copy-html"/.test(dialog), 'kein Knopf zum formatierten Kopieren');
    assert.ok(!/actionscript/.test(dialog), 'Sprachliste ist im Dialog dupliziert');
  });

  test('Kopieren gibt es als Markup und formatiert', function () {
    var content = fs.readFileSync(abs('src/content.js'), 'utf8');
    assert.ok(/data-action="copy"/.test(content), 'Panel kopiert kein Markup');
    assert.ok(/data-action="copy-html"/.test(content), 'Panel kopiert nicht formatiert');
    var dialog = fs.readFileSync(abs('src/codedialog.js'), 'utf8');
    assert.ok(/data-code-action="copy-jira"/.test(dialog), 'Dialog kopiert kein Markup');
    assert.ok(/data-code-action="copy-html"/.test(dialog), 'Dialog kopiert nicht formatiert');
  });

  test('Einfrieren ist Einstellung und Schloss', function () {
    var page = fs.readFileSync(abs('options/options.html'), 'utf8');
    assert.ok(/id="freezeEditMode"/.test(page), 'Einstellungsseite hat keinen Schalter');
    var options = fs.readFileSync(abs('options/options.js'), 'utf8');
    assert.ok(/'freezeEditMode'/.test(options), 'Schalter wird nicht gespeichert');
    var lock = fs.readFileSync(abs('src/editlock.js'), 'utf8');
    assert.ok(/beforeunload/.test(lock), 'kein Schutz vor dem Verlassen der Seite');
    assert.ok(/aria-pressed/.test(lock), 'Schloss meldet seinen Zustand nicht');
  });

  test('Optionsseite bietet eigene Vorlagen an', function () {
    var html = fs.readFileSync(abs('options/options.html'), 'utf8');
    assert.ok(/id="templateList"/.test(html), 'keine Liste fuer eigene Vorlagen');
    assert.ok(/id="tplMarkup"/.test(html), 'kein Eingabefeld fuer das Vorlagen-Markup');
    assert.ok(/id="tplSave"/.test(html), 'kein Knopf zum Speichern einer Vorlage');
  });

  test('options.js baut das DOM ohne innerHTML', function () {
    var options = fs.readFileSync(abs('options/options.js'), 'utf8');
    assert.ok(!/\.innerHTML\s*=/.test(options), 'options.js setzt innerHTML');
  });

  test('Vorlagenmenue in der Feldleiste nutzt eigene Vorlagen', function () {
    var content = fs.readFileSync(abs('src/content.js'), 'utf8');
    assert.ok(/function customTemplateItems\(/.test(content), 'customTemplateItems fehlt');
    assert.ok(/function insertCustomTemplate\(/.test(content), 'insertCustomTemplate fehlt');
    var matches = content.match(/\.innerHTML\s*=\s*([^;]+);/g) || [];
    matches.forEach(function (line) {
      assert.ok(/PANEL_HTML/.test(line), 'innerHTML nur mit fester Vorlage erlaubt: ' + line);
    });
  });

  test('customTemplates liegt in LOCAL_KEYS', function () {
    var settings = fs.readFileSync(abs('src/settings.js'), 'utf8');
    var match = settings.match(/LOCAL_KEYS\s*=\s*\[([^\]]*)\]/);
    assert.ok(match, 'LOCAL_KEYS nicht gefunden');
    assert.ok(/customTemplates/.test(match[1]), 'customTemplates fehlt in LOCAL_KEYS: ' + match[1]);
  });

  test('kein nachgeladener Code im Paket', function () {
    // Harter Ablehnungsgrund im Store: Code, der nicht im Paket liegt.
    ['src/content.js', 'src/editors.js', 'src/converter.js', 'src/codedialog.js',
      'src/templatedialog.js', 'src/editlock.js', 'src/settings.js', 'src/background.js',
      'popup/popup.js', 'options/options.js'].forEach(function (file) {
      var source = fs.readFileSync(abs(file), 'utf8');
      assert.ok(!/(^|[^.\w])eval\s*\(/.test(source), file + ' benutzt eval()');
      assert.ok(!/new\s+Function\s*\(/.test(source), file + ' benutzt new Function()');
    });
    ['popup/popup.html', 'options/options.html'].forEach(function (page) {
      var html = fs.readFileSync(abs(page), 'utf8');
      var pattern = /(?:src|href)="(https?:)?\/\//g;
      assert.ok(!pattern.test(html), page + ' laedt eine externe Datei');
    });
  });
});
