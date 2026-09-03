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

console.log('\n' + passed + ' Tests ok, ' + failed + ' fehlgeschlagen.\n');
process.exit(failed === 0 ? 0 : 1);
