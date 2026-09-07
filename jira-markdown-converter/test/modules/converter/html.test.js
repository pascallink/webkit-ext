/**
 * Tests fuer die HTML-Ausgabe des Konverters (Rich-Text-Editor), die
 * Sprachliste, das vollstaendige Beispieldokument und die Panel-Vorlagen aus
 * den Einstellungen.
 * Aufruf: npm run test:converter --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var jira = require(path.join(__dirname, '..', '..', '..', 'src', 'converter.js'));
var Settings = require(path.join(__dirname, '..', '..', '..', 'src', 'settings.js'));

function eq(markdown, expected, message) {
  var actual = jira.convert(markdown);
  assert.strictEqual(actual, expected, (message || '') +
    '\n  Eingabe:   ' + JSON.stringify(markdown) +
    '\n  Erwartet:  ' + JSON.stringify(expected) +
    '\n  Erhalten:  ' + JSON.stringify(actual));
}

function html(markdown, expected, message) {
  var actual = jira.convertToHtml(markdown);
  assert.strictEqual(actual, expected, (message || '') +
    '\n  Eingabe:   ' + JSON.stringify(markdown) +
    '\n  Erwartet:  ' + JSON.stringify(expected) +
    '\n  Erhalten:  ' + JSON.stringify(actual));
}

function template(id) {
  var found = Settings.panelTemplate(id);
  assert.ok(found, 'Vorlage fehlt: ' + id);
  return found;
}

describe('HTML fuer den Rich-Text-Editor', function () {
  test('Ueberschriften', function () {
    html('# Eins', '<h1>Eins</h1>');
    html('###### Sechs', '<h6>Sechs</h6>');
  });
  test('Absatz mit Auszeichnungen', function () {
    html('Ein **fetter** und *kursiver* Text.',
      '<p>Ein <strong>fetter</strong> und <em>kursiver</em> Text.</p>');
    html('~~weg~~', '<p><del>weg</del></p>');
    html('***beides***', '<p><strong><em>beides</em></strong></p>');
  });
  test('Inline-Code wird escaped', function () {
    html('`a < b && c`', '<p><code>a &lt; b &amp;&amp; c</code></p>');
  });
  test('Klartext wird escaped', function () {
    html('5 < 6 & 7 > 2', '<p>5 &lt; 6 &amp; 7 &gt; 2</p>');
  });
  test('Codeblock mit Sprache', function () {
    html('```java\nif (a < b) {}\n```',
      '<pre><code class="language-java">if (a &lt; b) {}</code></pre>');
  });
  test('Liste', function () {
    html('- a\n- b', '<ul><li>a</li><li>b</li></ul>');
  });
  test('verschachtelte Liste', function () {
    html('- a\n  - b\n- c', '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  });
  test('numerierte Liste', function () {
    html('1. eins\n2. zwei', '<ol><li>eins</li><li>zwei</li></ol>');
  });
  test('gemischte Verschachtelung', function () {
    html('- a\n  1. b\n- c', '<ul><li>a<ol><li>b</li></ol></li><li>c</li></ul>');
  });
  test('Aufgabenliste', function () {
    html('- [x] fertig\n- [ ] offen',
      '<ul><li>&#9745; fertig</li><li>&#9744; offen</li></ul>');
  });
  test('Tabelle', function () {
    html('| A | B |\n| --- | --- |\n| 1 | 2 |',
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
  });
  test('Zitat', function () {
    html('> Zitat', '<blockquote>\n<p>Zitat</p>\n</blockquote>');
  });
  test('Hinweisblock wird Zitat mit Ueberschrift', function () {
    html('> [!WARNING]\n> Vorsicht',
      '<blockquote>\n<p><strong>Warnung</strong></p>\n<p>Vorsicht</p>\n</blockquote>');
  });
  test('Trennlinie', function () {
    html('---', '<hr>');
  });
  test('Link', function () {
    html('[Doku](https://example.com)', '<p><a href="https://example.com">Doku</a></p>');
  });
  test('Bild', function () {
    html('![Screen](https://example.com/a.png)',
      '<p><img src="https://example.com/a.png" alt="Screen"></p>');
  });
  test('javascript-Links werden verworfen', function () {
    // Das HTML wandert in einen laufenden Editor - dort darf kein Skript-Ziel
    // ankommen, auch nicht aus einem kopierten Work Item.
    html('[klick](javascript:alert(1))', '<p>klick</p>');
    html('![x](javascript:alert(1))', '<p>javascript:alert(1)</p>');
  });
  test('Anfuehrungszeichen in URLs brechen das Attribut nicht', function () {
    html('[x](https://example.com/"onx)', '<p><a href="https://example.com/&quot;onx">x</a></p>');
  });
  test('roher HTML-Text wird nicht durchgereicht', function () {
    html('<div onclick="boese()">Text</div>',
      '<p>&lt;div onclick="boese()"&gt;Text&lt;/div&gt;</p>');
  });
  test('erlaubte Inline-Tags werden uebersetzt', function () {
    html('Ein <b>fett</b> und <br> Umbruch',
      '<p>Ein <strong>fett</strong> und <br> Umbruch</p>');
  });
  test('weiche Zeilenumbrueche werden zu <br>', function () {
    html('Zeile eins\nZeile zwei', '<p>Zeile eins<br>\nZeile zwei</p>');
  });
  test('leere Eingabe', function () {
    html('', '');
  });
});

describe('Beide Formate auf einmal', function () {
  test('convertBoth liefert Markup und HTML', function () {
    var both = jira.convertBoth('# Titel\n\n- **a**');
    assert.strictEqual(both.jira, 'h1. Titel\n\n* *a*');
    assert.strictEqual(both.html, '<h1>Titel</h1>\n\n<ul><li><strong>a</strong></li></ul>');
  });
  test('Optionen wirken auf beide Formate', function () {
    var both = jira.convertBoth('```js\na\n```', { keepCodeLanguage: false });
    assert.strictEqual(both.jira, '{code}\na\n{code}');
    assert.strictEqual(both.html, '<pre><code>a</code></pre>');
  });
});

describe('Sprachliste fuer die Auswahl', function () {
  test('Sprachliste wird exportiert und ist alphabetisch', function () {
    var names = jira.codeLanguages;
    assert.ok(Array.isArray(names), 'kein Array');
    assert.ok(names.length > 40, 'zu wenige Sprachen: ' + names.length);
    ['java', 'javascript', 'json', 'python', 'sql', 'yaml'].forEach(function (name) {
      assert.ok(names.indexOf(name) !== -1, name + ' fehlt in der Liste');
    });
    assert.deepStrictEqual(names, names.slice().sort(), 'Liste ist nicht sortiert');
  });
  test('jede angebotene Sprache ueberlebt die Zuordnung', function () {
    jira.codeLanguages.forEach(function (name) {
      assert.strictEqual(jira.mapLanguage(name), name, name + ' wird nicht erkannt');
    });
    assert.strictEqual(jira.mapLanguage('js'), 'javascript');
    assert.strictEqual(jira.mapLanguage('erfunden'), '');
  });
});

describe('Gesamtdokument (Azure DevOps Work Item)', function () {
  test('vollstaendiges Dokument', function () {
    var markdown = [
      '# Bug: Login schlaegt fehl',
      '',
      '## Beschreibung',
      '',
      'Beim Login mit **SSO** erscheint ein Fehler. Siehe [AB#1234](https://dev.azure.com/org/_workitems/edit/1234).',
      '',
      '## Schritte',
      '',
      '1. Seite `/login` oeffnen',
      '2. SSO waehlen',
      '   - Microsoft-Konto nutzen',
      '3. Fehler erscheint',
      '',
      '## Log',
      '',
      '```json',
      '{ "error": "invalid_grant" }',
      '```',
      '',
      '## Umgebung',
      '',
      '| Feld | Wert |',
      '| --- | --- |',
      '| Browser | Edge 120 |',
      '| OS | Windows 11 |',
      '',
      '> [!IMPORTANT]',
      '> Betrifft alle Mandanten.',
      '',
      '---',
      '',
      '- [x] reproduziert',
      '- [ ] behoben'
    ].join('\n');

    var expected = [
      'h1. Bug: Login schlaegt fehl',
      '',
      'h2. Beschreibung',
      '',
      'Beim Login mit *SSO* erscheint ein Fehler. Siehe [AB#1234|https://dev.azure.com/org/_workitems/edit/1234].',
      '',
      'h2. Schritte',
      '',
      '# Seite {{/login}} oeffnen',
      '# SSO waehlen',
      '#* Microsoft-Konto nutzen',
      '# Fehler erscheint',
      '',
      'h2. Log',
      '',
      '{code:json}',
      '{ "error": "invalid_grant" }',
      '{code}',
      '',
      'h2. Umgebung',
      '',
      '||Feld||Wert||',
      '|Browser|Edge 120|',
      '|OS|Windows 11|',
      '',
      '{panel:title=Wichtig}',
      'Betrifft alle Mandanten.',
      '{panel}',
      '',
      '----',
      '',
      '* (/) reproduziert',
      '* (x) behoben'
    ].join('\n');

    eq(markdown, expected);
  });
});

describe('Panel aus einer Vorlage', function () {
  test('Markup nutzt {panel} mit Rahmen- und Hintergrundfarbe', function () {
    // {info}/{note}/{warning} sind Confluence-Makros und stehen im Wiki Style
    // Renderer von Jira Server nicht bereit - die Farbe kommt ueber Attribute.
    assert.strictEqual(jira.panelMarkup(template('info')),
      '{panel:title=Info|borderColor=#0052cc|bgColor=#deebff}\n' +
      'Hier die Information eintragen.\n{panel}');
  });

  test('jede Vorlage liefert Titel, Platzhalter und beide Farben', function () {
    Settings.PANEL_TEMPLATES.forEach(function (entry) {
      var markup = jira.panelMarkup(entry);
      assert.ok(markup.indexOf('{panel:title=' + entry.title) === 0, entry.id + ': ' + markup);
      assert.ok(markup.indexOf('|borderColor=' + entry.borderColor) !== -1, entry.id + ': ' + markup);
      assert.ok(markup.indexOf('|bgColor=' + entry.bgColor) !== -1, entry.id + ': ' + markup);
      assert.ok(markup.indexOf('\n' + entry.body + '\n') !== -1, entry.id + ': ' + markup);
      assert.ok(/\{panel\}$/.test(markup), entry.id + ': ' + markup);
    });
  });

  test('kein Confluence-Makro im Markup', function () {
    Settings.PANEL_TEMPLATES.forEach(function (entry) {
      assert.ok(!/\{(?:info|note|warning|tip)[:}]/.test(jira.panelMarkup(entry)), entry.id);
    });
  });

  test('HTML-Zweig faerbt Akzentleiste und Fuellung nach Vorlage', function () {
    Settings.PANEL_TEMPLATES.forEach(function (entry) {
      var panelHtml = jira.panelHtml(entry);
      assert.ok(panelHtml.indexOf('border-left: 4px solid ' + entry.borderColor) !== -1, entry.id + ': ' + panelHtml);
      assert.ok(panelHtml.indexOf('background-color: ' + entry.bgColor) !== -1, entry.id + ': ' + panelHtml);
      assert.ok(panelHtml.indexOf('<strong>' + entry.title + '</strong>') !== -1, entry.id + ': ' + panelHtml);
      assert.ok(panelHtml.indexOf('<p>' + entry.body + '</p>') !== -1, entry.id + ': ' + panelHtml);
    });
  });

  test('beide Zweige lesen dieselbe Vorlage', function () {
    var eigene = {
      id: 'test', label: 'Test', title: 'Titel', body: 'Text',
      borderColor: '#123456', bgColor: '#abcdef'
    };
    assert.ok(jira.panelMarkup(eigene).indexOf('#123456') !== -1);
    assert.ok(jira.panelHtml(eigene).indexOf('#123456') !== -1);
    assert.ok(jira.panelMarkup(eigene).indexOf('#abcdef') !== -1);
    assert.ok(jira.panelHtml(eigene).indexOf('#abcdef') !== -1);
  });

  test('eigener Text ersetzt den Platzhalter', function () {
    var markup = jira.panelMarkup(template('note'), 'Eigener Text');
    assert.ok(markup.indexOf('\nEigener Text\n') !== -1, markup);
    assert.ok(jira.panelHtml(template('note'), 'Eigener Text').indexOf('<p>Eigener Text</p>') !== -1);
  });

  test('Titel kann das Makro nicht sprengen', function () {
    var boese = { title: 'a|b}c', body: 'x', borderColor: '#000000', bgColor: '#ffffff' };
    var markup = jira.panelMarkup(boese);
    assert.strictEqual(markup.split('\n')[0],
      '{panel:title=a b c|borderColor=#000000|bgColor=#ffffff}', markup);
  });

  test('unbrauchbare Farben fallen weg', function () {
    var markup = jira.panelMarkup({ title: 'T', body: 'x', borderColor: 'rot; content: bad', bgColor: '' });
    assert.strictEqual(markup.split('\n')[0], '{panel:title=T}', markup);
  });

  test('HTML im Panel wird maskiert', function () {
    var panelHtml = jira.panelHtml({ title: '<b>T</b>', body: '<script>x</script>', borderColor: '#000000', bgColor: '#ffffff' });
    assert.ok(panelHtml.indexOf('<script>') === -1, panelHtml);
    assert.ok(panelHtml.indexOf('&lt;b&gt;T&lt;/b&gt;') !== -1, panelHtml);
  });
});
