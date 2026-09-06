/**
 * Prueft, dass das Erweiterungspaket in sich stimmig ist:
 * Manifest gueltig, alle referenzierten Dateien vorhanden, Icons echte PNGs.
 * Dazu die Artefakte fuer die Store-Einreichung (docs/store): Groessen der
 * Bilder, Laenge der Beschreibungstexte, kein nachgeladener Code.
 *
 * Aufruf: node test/package.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + (error && error.message ? error.message : error));
  }
}

function abs(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(abs(relative));
}

/** Breite und Hoehe aus dem IHDR-Kopf - ohne Abhaengigkeit, PNG genuegt. */
function pngSize(relative) {
  var buffer = fs.readFileSync(abs(relative));
  assert.strictEqual(buffer.subarray(0, 8).toString('binary'), '\x89PNG\r\n\x1a\n',
    relative + ' ist kein PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Der erste ```-Block eines Store-Dokuments - das ist der Text zum Uebernehmen. */
function firstBlock(relative) {
  var match = /```\n([\s\S]*?)\n```/.exec(fs.readFileSync(abs(relative), 'utf8'));
  assert.ok(match, relative + ' hat keinen Textblock');
  return match[1];
}

var manifest = JSON.parse(fs.readFileSync(abs('manifest.json'), 'utf8'));

console.log('\nManifest');
test('Manifest V3', function () {
  assert.strictEqual(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Version muss x.y.z sein');
});

test('Store-Vorgaben im Manifest', function () {
  // Der Store nimmt hoechstens 132 Zeichen und verlangt eine Support-Adresse.
  assert.ok(manifest.description.length <= 132,
    'description zu lang: ' + manifest.description.length + ' Zeichen');
  assert.ok(!/[\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]/.test(manifest.description),
    'description enthaelt Umlaute');
  assert.strictEqual(manifest.homepage_url, 'https://github.com/pascallink/webkit-ext');
});

test('Version steht in manifest.json und package.json gleich', function () {
  var pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8'));
  assert.strictEqual(manifest.version, pkg.version,
    'manifest.json ' + manifest.version + ' != package.json ' + pkg.version);
});

test('Service-Worker vorhanden', function () {
  assert.ok(exists(manifest.background.service_worker), manifest.background.service_worker + ' fehlt');
});

test('Content-Script-Dateien vorhanden', function () {
  manifest.content_scripts.forEach(function (entry) {
    entry.js.forEach(function (file) {
      assert.ok(exists(file), file + ' fehlt');
    });
    (entry.css || []).forEach(function (file) {
      assert.ok(exists(file), file + ' fehlt');
    });
  });
});

test('Content-Script laedt Abhaengigkeiten in richtiger Reihenfolge', function () {
  var js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf('src/settings.js') < js.indexOf('src/content.js'), 'settings vor content');
  assert.ok(js.indexOf('src/converter.js') < js.indexOf('src/content.js'), 'converter vor content');
  assert.ok(js.indexOf('src/editors.js') < js.indexOf('src/content.js'), 'editors vor content');
  assert.ok(js.indexOf('src/codedialog.js') < js.indexOf('src/content.js'), 'codedialog vor content');
  assert.ok(js.indexOf('src/converter.js') < js.indexOf('src/codedialog.js'), 'converter vor codedialog');
  assert.ok(js.indexOf('src/editlock.js') < js.indexOf('src/content.js'), 'editlock vor content');
  assert.ok(js.indexOf('src/editors.js') < js.indexOf('src/editlock.js'), 'editors vor editlock');
});

test('Popup und Optionsseite vorhanden', function () {
  assert.ok(exists(manifest.action.default_popup), 'Popup fehlt');
  assert.ok(exists(manifest.options_ui.page), 'Optionsseite fehlt');
});

test('Icons vorhanden und echte PNGs', function () {
  var sizes = Object.keys(manifest.icons);
  assert.ok(sizes.length >= 4, 'mindestens vier Groessen');
  sizes.forEach(function (size) {
    var file = manifest.icons[size];
    assert.ok(exists(file), file + ' fehlt');
    var head = fs.readFileSync(abs(file)).subarray(0, 8);
    assert.strictEqual(head.toString('binary'), '\x89PNG\r\n\x1a\n', file + ' ist kein PNG');
  });
});

test('Berechtigungen bleiben sparsam', function () {
  var allowed = ['activeTab', 'storage', 'contextMenus', 'scripting'];
  manifest.permissions.forEach(function (permission) {
    assert.ok(allowed.indexOf(permission) !== -1, 'unerwartete Berechtigung: ' + permission);
  });
  assert.deepStrictEqual(manifest.host_permissions, ['https://*.atlassian.net/*']);
  // Jede Berechtigung kostet im Store eine Begruendung - ungenutzte fliegen raus.
  assert.ok(!manifest.optional_permissions,
    'optional_permissions ohne Anforderung im Code: ' + JSON.stringify(manifest.optional_permissions));
  assert.deepStrictEqual(manifest.optional_host_permissions, ['*://*/*'],
    'das breite Muster gehoert nach optional_host_permissions, siehe docs/store/permissions.md');
});

test('Tastenkuerzel definiert', function () {
  assert.ok(manifest.commands['convert-selection'], 'Kommando fehlt');
});

console.log('\nDateiverweise in HTML');
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

console.log('\nService-Worker');
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

console.log('\nQuellcode');
test('keine console-Ausgaben im Auslieferungscode', function () {
  ['src/content.js', 'src/editors.js', 'src/converter.js', 'src/codedialog.js', 'src/editlock.js', 'src/settings.js', 'src/background.js'].forEach(function (file) {
    var source = fs.readFileSync(abs(file), 'utf8');
    assert.ok(!/console\.(log|debug|info)\(/.test(source), file + ' enthaelt console-Ausgaben');
  });
});

test('kein innerHTML mit Fremddaten', function () {
  var templates = { 'src/content.js': /PANEL_HTML/, 'src/codedialog.js': /DIALOG_HTML/ };
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
    'src/editlock.js', 'src/settings.js', 'src/background.js',
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

console.log('\nStore-Artefakte');
test('Bilder haben die vom Store verlangten Groessen', function () {
  var logo = pngSize('docs/store/assets/logo-300.png');
  assert.deepStrictEqual(logo, { width: 300, height: 300 }, 'Logo muss 300x300 sein');
  var promo = pngSize('docs/store/assets/promo-tile-1400x560.png');
  assert.deepStrictEqual(promo, { width: 1400, height: 560 }, 'Promo-Tile muss 1400x560 sein');

  var dir = 'docs/store/assets/screenshots';
  var shots = fs.readdirSync(abs(dir)).filter(function (name) {
    return /\.png$/.test(name);
  }).sort();
  assert.ok(shots.length >= 1 && shots.length <= 10,
    'der Store nimmt 1 bis 10 Screenshots, hier sind es ' + shots.length);
  shots.forEach(function (name) {
    var size = pngSize(path.join(dir, name));
    var ok = (size.width === 1280 && size.height === 800) ||
      (size.width === 640 && size.height === 480);
    assert.ok(ok, name + ' ist ' + size.width + 'x' + size.height + ', erlaubt sind 1280x800 oder 640x480');
  });
});

test('Beschreibungstexte bleiben in den Grenzen des Stores', function () {
  [['docs/store/listing-de.md', 'deutsch'], ['docs/store/listing-en.md', 'englisch']].forEach(function (entry) {
    var short = firstBlock(entry[0]);
    assert.ok(short.length <= 132,
      'Kurzbeschreibung ' + entry[1] + ' zu lang: ' + short.length + ' Zeichen');
    assert.ok(short.indexOf('\n') === -1, 'Kurzbeschreibung ' + entry[1] + ' ist mehrzeilig');
    var full = fs.readFileSync(abs(entry[0]), 'utf8');
    var blocks = full.match(/```\n[\s\S]*?\n```/g) || [];
    assert.ok(blocks.length >= 2, entry[0] + ' hat keine ausfuehrliche Beschreibung');
    assert.ok(blocks[1].length <= 10000,
      'Ausfuehrliche Beschreibung ' + entry[1] + ' zu lang: ' + blocks[1].length + ' Zeichen');
  });
});

test('Store-Unterlagen sind vollstaendig', function () {
  ['docs/store/README.md', 'docs/store/listing-de.md', 'docs/store/listing-en.md',
    'docs/store/permissions.md', 'docs/store/review-notes.md', 'docs/store/publishing.md',
    'docs/store/build-assets.js', 'docs/store/assets/logo.svg'].forEach(function (file) {
    assert.ok(exists(file), file + ' fehlt');
  });
  // Die Datenschutz-URL ist Pflichtfeld im Partner Center - die Datei muss es geben.
  assert.ok(fs.existsSync(path.join(root, '..', 'PRIVACY.md')), 'PRIVACY.md fehlt im Repo-Root');
  assert.ok(fs.existsSync(path.join(root, '..', 'LICENSE')), 'LICENSE fehlt im Repo-Root');
});

console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
process.exit(failed === 0 ? 0 : 1);
