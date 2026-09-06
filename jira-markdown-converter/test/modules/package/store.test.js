/**
 * Prueft die Artefakte fuer die Store-Einreichung (docs/store): Groessen der
 * Bilder, Laenge der Beschreibungstexte, Vollstaendigkeit der Unterlagen.
 * Manifest steht in manifest.test.js, Quellcode-Regeln in sources.test.js.
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

describe('Store-Artefakte', function () {
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
});
