/**
 * Tests fuer den Markdown -> Jira-Konverter.
 * Aufruf: node test/converter.test.js
 */
'use strict';

var assert = require('assert');
var path = require('path');
var jira = require(path.join(__dirname, '..', 'src', 'converter.js'));

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
    console.log('       ' + (error && error.message ? error.message.split('\n').join('\n       ') : error));
  }
}

function eq(markdown, expected, message) {
  var actual = jira.convert(markdown);
  assert.strictEqual(actual, expected, (message || '') +
    '\n  Eingabe:   ' + JSON.stringify(markdown) +
    '\n  Erwartet:  ' + JSON.stringify(expected) +
    '\n  Erhalten:  ' + JSON.stringify(actual));
}

console.log('\nUeberschriften');
test('H1 bis H6', function () {
  eq('# Eins', 'h1. Eins');
  eq('## Zwei', 'h2. Zwei');
  eq('### Drei', 'h3. Drei');
  eq('#### Vier', 'h4. Vier');
  eq('##### Fuenf', 'h5. Fuenf');
  eq('###### Sechs', 'h6. Sechs');
});
test('geschlossene ATX-Ueberschrift', function () {
  eq('## Titel ##', 'h2. Titel');
});
test('mehr als sechs Rauten sind keine Ueberschrift', function () {
  eq('####### Sieben', '####### Sieben');
});
test('Raute ohne Leerzeichen bleibt Text', function () {
  eq('#kein-heading', '#kein-heading');
});
test('Setext-Ueberschriften', function () {
  eq('Titel\n=====', 'h1. Titel');
  eq('Untertitel\n----------', 'h2. Untertitel');
});
test('Ueberschrift mit Inline-Markup', function () {
  eq('# Ein **fetter** Titel', 'h1. Ein *fetter* Titel');
});

console.log('\nTextauszeichnungen');
test('fett', function () {
  eq('**fett**', '*fett*');
  eq('__fett__', '*fett*');
});
test('kursiv', function () {
  eq('*kursiv*', '_kursiv_');
  eq('_kursiv_', '_kursiv_');
});
test('fett und kursiv', function () {
  eq('***beides***', '*_beides_*');
});
test('durchgestrichen', function () {
  eq('~~weg~~', '-weg-');
});
test('snake_case bleibt unveraendert', function () {
  eq('ein snake_case_name hier', 'ein snake_case_name hier');
});
test('Sternchen mitten im Wort wird nicht kursiv', function () {
  eq('2 * 3 * 4', '2 * 3 * 4');
});
test('maskierte Sonderzeichen', function () {
  eq('\\*kein Markup\\*', '*kein Markup*');
});
test('mehrere Auszeichnungen in einer Zeile', function () {
  eq('**A** und *B* und ~~C~~', '*A* und _B_ und -C-');
});

console.log('\nCode');
test('Inline-Code', function () {
  eq('Nutze `npm install` dafuer.', 'Nutze {{npm install}} dafuer.');
});
test('Inline-Code schuetzt Markdown-Zeichen', function () {
  eq('`**nicht fett**`', '{{**nicht fett**}}');
});
test('Fenced-Code mit Sprache', function () {
  eq('```java\nint a = 1;\n```', '{code:java}\nint a = 1;\n{code}');
});
test('Fenced-Code ohne Sprache', function () {
  eq('```\nirgendwas\n```', '{code}\nirgendwas\n{code}');
});
test('Sprach-Alias wird gemappt', function () {
  eq('```js\nvar a;\n```', '{code:javascript}\nvar a;\n{code}');
  eq('```yml\na: 1\n```', '{code:yaml}\na: 1\n{code}');
});
test('unbekannte Sprache faellt auf {code} zurueck', function () {
  eq('```brainfuck\n+++\n```', '{code}\n+++\n{code}');
});
test('Tilde-Fence', function () {
  eq('~~~python\nprint(1)\n~~~', '{code:python}\nprint(1)\n{code}');
});
test('Code-Inhalt wird nicht konvertiert', function () {
  eq('```\n# kein Heading\n- keine Liste\n**kein fett**\n```',
     '{code}\n# kein Heading\n- keine Liste\n**kein fett**\n{code}');
});
test('eingerueckter Codeblock', function () {
  eq('Text:\n\n    zeile eins\n    zeile zwei',
     'Text:\n\n{noformat}\nzeile eins\nzeile zwei\n{noformat}');
});

console.log('\nLinks und Bilder');
test('Inline-Link', function () {
  eq('[Doku](https://example.com)', '[Doku|https://example.com]');
});
test('Link ohne Label', function () {
  eq('[](https://example.com)', '[https://example.com]');
});
test('Link mit Titel-Attribut', function () {
  eq('[Doku](https://example.com "Titel")', '[Doku|https://example.com]');
});
test('Label gleich URL', function () {
  eq('[https://example.com](https://example.com)', '[https://example.com]');
});
test('Bild', function () {
  eq('![Screenshot](https://example.com/a.png)', '!https://example.com/a.png!');
});
test('Autolink', function () {
  eq('<https://example.com>', '[https://example.com]');
});
test('E-Mail-Link', function () {
  eq('[Mail](mailto:a@b.de)', '[Mail|mailto:a@b.de]');
  eq('[Mail](a@b.de)', '[Mail|mailto:a@b.de]');
});
test('Referenz-Link', function () {
  eq('Siehe [die Doku][doku].\n\n[doku]: https://example.com',
     'Siehe [die Doku|https://example.com].');
});
test('Link mit Markup im Label', function () {
  eq('[**fett**](https://example.com)', '[*fett*|https://example.com]');
});
test('Link in Ueberschrift', function () {
  eq('## Siehe [PR 42](https://dev.azure.com/pr/42)',
     'h2. Siehe [PR 42|https://dev.azure.com/pr/42]');
});

console.log('\nListen');
test('einfache Bulletliste', function () {
  eq('- a\n- b', '* a\n* b');
});
test('Bulletliste mit Stern', function () {
  eq('* a\n* b', '* a\n* b');
});
test('verschachtelte Bulletliste', function () {
  eq('- a\n  - b\n    - c\n- d', '* a\n** b\n*** c\n* d');
});
test('numerierte Liste', function () {
  eq('1. eins\n2. zwei', '# eins\n# zwei');
});
test('verschachtelte numerierte Liste', function () {
  eq('1. eins\n   1. eins-eins\n2. zwei', '# eins\n## eins-eins\n# zwei');
});
test('gemischte Verschachtelung', function () {
  eq('- a\n  1. b\n  2. c\n- d', '* a\n*# b\n*# c\n* d');
});
test('Aufgabenliste', function () {
  eq('- [x] fertig\n- [ ] offen', '* (/) fertig\n* (x) offen');
});
test('Listeneintrag mit Inline-Markup', function () {
  eq('- **wichtig**: siehe `hier`', '* *wichtig*: siehe {{hier}}');
});
test('Fortsetzungszeile wird angehaengt', function () {
  eq('- erste Zeile\n  zweite Zeile', '* erste Zeile zweite Zeile');
});
test('Liste mit Leerzeilen zwischen Eintraegen', function () {
  eq('- a\n\n- b', '* a\n* b');
});
test('Liste endet vor Absatz', function () {
  eq('- a\n- b\n\nEin Absatz.', '* a\n* b\n\nEin Absatz.');
});
test('vierstellig eingerueckte Unterliste', function () {
  eq('- a\n    - b', '* a\n** b');
});

console.log('\nTabellen');
test('einfache Tabelle', function () {
  eq('| A | B |\n| --- | --- |\n| 1 | 2 |', '||A||B||\n|1|2|');
});
test('Tabelle mit Ausrichtung', function () {
  eq('| A | B |\n|:---|---:|\n| 1 | 2 |', '||A||B||\n|1|2|');
});
test('Tabelle ohne aeussere Pipes', function () {
  eq('A | B\n--- | ---\n1 | 2', '||A||B||\n|1|2|');
});
test('leere Zelle wird zu Leerzeichen', function () {
  eq('| A | B |\n| --- | --- |\n| 1 |  |', '||A||B||\n|1| |');
});
test('Tabellenzelle mit Markup', function () {
  eq('| A | B |\n| --- | --- |\n| **x** | `y` |', '||A||B||\n|*x*|{{y}}|');
});
test('mehrere Datenzeilen', function () {
  eq('| A |\n| --- |\n| 1 |\n| 2 |\n| 3 |', '||A||\n|1|\n|2|\n|3|');
});

console.log('\nZitate, Trenner, Panels');
test('einzeiliges Zitat', function () {
  eq('> Zitat', 'bq. Zitat');
});
test('mehrzeiliges Zitat', function () {
  eq('> Zeile eins\n> Zeile zwei', '{quote}\nZeile eins\nZeile zwei\n{quote}');
});
test('horizontale Linie', function () {
  eq('---', '----');
  eq('***', '----');
  eq('___', '----');
});
test('Azure-DevOps-Alert wird Panel', function () {
  eq('> [!NOTE]\n> Wichtiger Hinweis', '{panel:title=Hinweis}\nWichtiger Hinweis\n{panel}');
  eq('> [!WARNING]\n> Vorsicht', '{panel:title=Warnung}\nVorsicht\n{panel}');
});

console.log('\nSonderfaelle');
test('leere Eingabe', function () {
  eq('', '');
  eq('   \n  \n', '');
});
test('CRLF-Zeilenenden', function () {
  eq('# Titel\r\n\r\nText', 'h1. Titel\n\nText');
});
test('geschweifte Klammern werden maskiert', function () {
  eq('Platzhalter {name} einsetzen', 'Platzhalter \\{name\\} einsetzen');
});
test('geschweifte Klammern in Code bleiben unveraendert', function () {
  eq('`{ "a": 1 }`', '{{{ "a": 1 }}}');
  eq('```json\n{ "a": 1 }\n```', '{code:json}\n{ "a": 1 }\n{code}');
});
test('harter Zeilenumbruch', function () {
  eq('Zeile eins  \nZeile zwei', 'Zeile eins\\\\\nZeile zwei');
});
test('HTML-Zeilenumbruch', function () {
  eq('Zeile eins<br>Zeile zwei', 'Zeile eins\\\\Zeile zwei');
});
test('mehrfache Leerzeilen werden reduziert', function () {
  eq('A\n\n\n\nB', 'A\n\nB');
});
test('unmaskierter Text ohne Markdown bleibt gleich', function () {
  eq('Ein ganz normaler Satz.', 'Ein ganz normaler Satz.');
});
test('Absatz mit Umlauten und Sonderzeichen', function () {
  eq('Groesse: 5 m³, Preis 10 €', 'Groesse: 5 m³, Preis 10 €');
});
test('Konvertierung ist idempotent bei reinem Text', function () {
  var once = jira.convert('Nur Text.');
  assert.strictEqual(jira.convert(once), once);
});

console.log('\nOptionen');
test('escapeBraces abschaltbar', function () {
  assert.strictEqual(jira.convert('{x}', { escapeBraces: false }), '{x}');
});
test('keepCodeLanguage abschaltbar', function () {
  assert.strictEqual(jira.convert('```js\na\n```', { keepCodeLanguage: false }), '{code}\na\n{code}');
});
test('convertAlerts abschaltbar', function () {
  assert.strictEqual(jira.convert('> [!NOTE]\n> Text', { convertAlerts: false }),
    '{quote}\n[!NOTE]\nText\n{quote}');
});

console.log('\nMarkdown-Erkennung');
test('looksLikeMarkdown erkennt Markdown', function () {
  assert.ok(jira.looksLikeMarkdown('# Titel'));
  assert.ok(jira.looksLikeMarkdown('- Punkt'));
  assert.ok(jira.looksLikeMarkdown('**fett**'));
  assert.ok(jira.looksLikeMarkdown('[a](b)'));
  assert.ok(jira.looksLikeMarkdown('```\ncode\n```'));
});
test('looksLikeMarkdown ignoriert Klartext', function () {
  assert.ok(!jira.looksLikeMarkdown('Ein normaler Satz ohne Markup.'));
  assert.ok(!jira.looksLikeMarkdown(''));
  assert.ok(!jira.looksLikeMarkdown(null));
});

console.log('\nHTML fuer den Rich-Text-Editor');

function html(markdown, expected, message) {
  var actual = jira.convertToHtml(markdown);
  assert.strictEqual(actual, expected, (message || '') +
    '\n  Eingabe:   ' + JSON.stringify(markdown) +
    '\n  Erwartet:  ' + JSON.stringify(expected) +
    '\n  Erhalten:  ' + JSON.stringify(actual));
}

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

console.log('\nBeide Formate auf einmal');
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

console.log('\nSprachliste fuer die Auswahl');
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

console.log('\nCodeblock aus dem Dialog');
test('Dialekte bauen den Codeblock ohne Markdown-Deutung', function () {
  // Der Code-Dialog nimmt genau diesen Weg: Text direkt in den Dialekt,
  // ohne den Parser.
  var body = '# kein Titel\n**kein Fettdruck**\n  eingerueckt';
  assert.strictEqual(jira.dialects.jira.codeBlock('java', body),
    '{code:java}\n' + body + '\n{code}');
  assert.strictEqual(jira.dialects.jira.codeBlock('', body),
    '{code}\n' + body + '\n{code}');
});
test('HTML-Codeblock maskiert den Inhalt', function () {
  var html = jira.dialects.html.codeBlock('html', '<b>&</b>');
  assert.strictEqual(html, '<pre><code class="language-html">&lt;b&gt;&amp;&lt;/b&gt;</code></pre>');
});

console.log('\nGesamtdokument (Azure DevOps Work Item)');
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

console.log('\nPanel aus einer Vorlage');
var Settings = require(path.join(__dirname, '..', 'src', 'settings.js'));

function template(id) {
  var found = Settings.panelTemplate(id);
  assert.ok(found, 'Vorlage fehlt: ' + id);
  return found;
}

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
    var html = jira.panelHtml(entry);
    assert.ok(html.indexOf('border-left: 4px solid ' + entry.borderColor) !== -1, entry.id + ': ' + html);
    assert.ok(html.indexOf('background-color: ' + entry.bgColor) !== -1, entry.id + ': ' + html);
    assert.ok(html.indexOf('<strong>' + entry.title + '</strong>') !== -1, entry.id + ': ' + html);
    assert.ok(html.indexOf('<p>' + entry.body + '</p>') !== -1, entry.id + ': ' + html);
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
  var html = jira.panelHtml({ title: '<b>T</b>', body: '<script>x</script>', borderColor: '#000000', bgColor: '#ffffff' });
  assert.ok(html.indexOf('<script>') === -1, html);
  assert.ok(html.indexOf('&lt;b&gt;T&lt;/b&gt;') !== -1, html);
});

console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
process.exit(failed === 0 ? 0 : 1);
