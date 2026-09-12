/**
 * Tests fuer die allgemeine Markdown -> Jira-Umwandlung: Ueberschriften,
 * Auszeichnungen, Links, Listen, Tabellen, Sonderfaelle, Optionen und die
 * Markdown-Erkennung. Code, Zitate/Trenner/Panels stehen in blocks.test.js,
 * HTML-Ausgabe und Vorlagen in html.test.js.
 * Aufruf: npm run test:converter --prefix jira-markdown-converter
 */
'use strict';

var assert = require('assert');
var path = require('path');
var nodeTest = require('node:test');
var describe = nodeTest.describe;
var test = nodeTest.test;
var jira = require(path.join(__dirname, '..', '..', '..', 'src', 'converter.js'));

function eq(markdown, expected, message) {
  var actual = jira.convert(markdown);
  assert.strictEqual(actual, expected, (message || '') +
    '\n  Eingabe:   ' + JSON.stringify(markdown) +
    '\n  Erwartet:  ' + JSON.stringify(expected) +
    '\n  Erhalten:  ' + JSON.stringify(actual));
}

describe('Ueberschriften', function () {
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
});

describe('Textauszeichnungen', function () {
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
});

describe('Links und Bilder', function () {
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
  test('Bild aus Azure DevOps: Groessensuffix und Anhangspfad', function () {
    eq('![a](https://x/a.png =300x)', '!https://x/a.png!');
    eq('![a](https://x/a.png =300x200)', '!https://x/a.png!');
    eq('![shot.png](/.attachments/shot-1.png =300x)', '!shot-1.png!');
    eq('![shot.png](/.attachments/shot-1.png)', '!shot-1.png!');
  });
  test('Autolink', function () {
    eq('<https://example.com>', '[https://example.com]');
  });
  test('E-Mail-Link', function () {
    eq('[Mail](mailto:a@b.de)', '[Mail|mailto:a@b.de]');
    eq('[Mail](a@b.de)', '[Mail|mailto:a@b.de]');
  });
  test('Autolink auf E-Mail behaelt die Adresse als Text', function () {
    eq('<max@x.de>', '[max@x.de|mailto:max@x.de]');
    eq('[a@b.de](a@b.de)', '[a@b.de|mailto:a@b.de]');
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
});

describe('Azure-DevOps-Marker', function () {
  test('TOC-Marker und GUID-Erwaehnungen verschwinden', function () {
    eq('[[_TOC_]]', '');
    eq('# Titel\n\n[[_TOC_]]\n\nText', 'h1. Titel\n\nText');
    eq('Hallo @<9F4E1A2B-1111-2222-3333-444455556666> bitte', 'Hallo bitte');
    eq('Danke @<11111111-2222-3333-4444-555555555555> Anna Meier', 'Danke @Anna Meier');
    eq('Preis 3 @ 5 Euro', 'Preis 3 @ 5 Euro');
    eq('a@b.de', 'a@b.de');
  });
});

describe('Listen', function () {
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
  test('Fortsetzungsabsatz bricht die Liste nicht', function () {
    eq('- erster Punkt\n\n  Fortsetzung.\n\n- zweiter',
      '* erster Punkt\\\\Fortsetzung.\n* zweiter');
  });
  test('eingerueckte Tabelle nach Leerzeile bleibt eigener Block', function () {
    eq('- a\n\n  |X|Y|\n  |---|---|\n  |1|2|',
      '* a\n\n||X||Y||\n|1|2|');
  });
  test('eingerueckte Ueberschrift nach Leerzeile bleibt eigener Block', function () {
    eq('- a\n\n  ## Titel', '* a\n\nh2. Titel');
  });
  test('eingeruecktes Zitat nach Leerzeile bleibt eigener Block', function () {
    eq('- a\n\n  > zitat', '* a\n\nbq. zitat');
  });
});

describe('Tabellen', function () {
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
  test('Tabellenzelle mit Inline-Code und geschweiften Klammern', function () {
    eq('| A |\n| --- |\n| `{x}` |', '||A||\n|{noformat}{x}{noformat}|');
  });
  test('mehrere Datenzeilen', function () {
    eq('| A |\n| --- |\n| 1 |\n| 2 |\n| 3 |', '||A||\n|1|\n|2|\n|3|');
  });
  test('maskierter Strich bleibt in der Zelle', function () {
    eq('| A | B |\n| --- | --- |\n| Regex | a\\|b |', '||A||B||\n|Regex|a\\|b|');
  });
  test('maskierter Strich in der Kopfzeile', function () {
    eq('| a\\|b | B |\n| --- | --- |\n| 1 | 2 |', '||a\\|b||B||\n|1|2|');
  });
  test('Inline-Code mit maskiertem Strich', function () {
    eq('| A |\n| --- |\n| `a\\|b` |', '||A||\n|{{a\\|b}}|');
  });
  test('roher Strich in Inline-Code trennt wie in GFM', function () {
    // Dokumentiert bewusst uebernommenes GFM-Verhalten: ein nicht maskierter
    // Strich innerhalb von Inline-Code trennt trotzdem die Tabellenzelle.
    eq('| A | B |\n| --- | --- |\n| `y|z` |', '||A||B||\n|`y|z`|');
  });
  test('Link-Label mit maskiertem Strich', function () {
    eq('| A | B |\n| --- | --- |\n| x | [a\\|b](http://e.com) |',
      '||A||B||\n|x|[a\\|b|http://e.com]|');
  });
  test('Link in der Zelle bleibt unveraendert', function () {
    eq('| A | B |\n| --- | --- |\n| x | [Doku](http://e.com) |',
      '||A||B||\n|x|[Doku|http://e.com]|');
  });
});

describe('Sonderfaelle', function () {
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
    eq('`{ "a": 1 }`', '{noformat}{ "a": 1 }{noformat}');
    eq('```json\n{ "a": 1 }\n```', '{code:json}\n{ "a": 1 }\n{code}');
  });
  test('harter Zeilenumbruch', function () {
    eq('Zeile eins  \nZeile zwei', 'Zeile eins\\\\\nZeile zwei');
  });
  test('HTML-Zeilenumbruch', function () {
    eq('Zeile eins<br>Zeile zwei', 'Zeile eins\\\\Zeile zwei');
  });
  test('Backslash am Zeilenende ist ein harter Umbruch', function () {
    eq('Zeile eins\\\nZeile zwei', 'Zeile eins\\\\\nZeile zwei');
  });
  test('Strich in der URL wird kodiert', function () {
    eq('[a|b](https://x.de/?q=1|2)', '[a\\|b|https://x.de/?q=1%7C2]');
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
});

describe('Jira-Sonderzeichen maskieren', function () {
  test('eckige Klammern im Fliesstext', function () {
    eq('[INFO] gestartet', '\\[INFO\\] gestartet');
    eq('Liste [a] und [b]', 'Liste \\[a\\] und \\[b\\]');
  });
  test('Jira-eigene Klammerformen bleiben unveraendert', function () {
    eq('Hallo [~pascal], bitte pruefen', 'Hallo [~pascal], bitte pruefen');
    eq('Danke an [~jdoe] und [~asmith]!', 'Danke an [~jdoe] und [~asmith]!');
    eq('Anhang [^bericht.pdf] beachten', 'Anhang [^bericht.pdf] beachten');
    eq('Siehe [#anker] unten', 'Siehe [#anker] unten');
    eq('[INFO] fuer [~pascal]', '\\[INFO\\] fuer [~pascal]');
  });
  test('paarige Auszeichnungszeichen', function () {
    eq('Kosten -oder- mehr', 'Kosten \\-oder\\- mehr');
    eq('Dauer ~30 ms~', 'Dauer \\~30 ms\\~');
    eq('x^2^', 'x\\^2\\^');
    eq('Text +wichtig+ Ende', 'Text \\+wichtig\\+ Ende');
    eq('Status ??unklar?? offen', 'Status \\?\\?unklar\\?\\? offen');
  });
  test('Markdown-Escape bleibt maskiert', function () {
    eq('\\[INFO\\]', '\\[INFO\\]');
  });
  test('unpaarige oder eingebettete Zeichen bleiben unveraendert', function () {
    eq('-5 bis -1', '-5 bis -1');
    eq('2024-01-01', '2024-01-01');
    eq('Dauer ~30 ms bis ~50 ms', 'Dauer ~30 ms bis ~50 ms');
    eq('5 * 3 * 2', '5 * 3 * 2');
    eq('E-Mail-Adresse', 'E-Mail-Adresse');
    eq('a - b', 'a - b');
    eq('C++ und C++', 'C++ und C++');
  });
  test('bestehendes Markup bleibt unberuehrt', function () {
    eq('[Doku](https://example.com)', '[Doku|https://example.com]');
    eq('~~weg~~', '-weg-');
    eq('![alt](u.png)', '!u.png!');
    eq('```\n[a] -b- c^d^\n```', '{code}\n[a] -b- c^d^\n{code}');
  });
  test('escapeBraces schaltet auch die neuen Zeichen ab', function () {
    assert.strictEqual(jira.convert('{a} [b] -c-', { escapeBraces: false }), '{a} [b] -c-');
  });
  test('escapeJiraSyntax ist ein Alias fuer escapeBraces', function () {
    assert.strictEqual(jira.convert('{a} [b] -c-', { escapeJiraSyntax: false }), '{a} [b] -c-');
  });
  test('escapeJiraSyntax sticht escapeBraces', function () {
    assert.strictEqual(jira.convert('{a} [b] -c-', { escapeBraces: false, escapeJiraSyntax: true }),
      '\\{a\\} \\[b\\] \\-c\\-');
  });
});

describe('Optionen', function () {
  test('escapeBraces abschaltbar', function () {
    assert.strictEqual(jira.convert('{x}', { escapeBraces: false }), '{x}');
  });
  test('keepCodeLanguage abschaltbar', function () {
    assert.strictEqual(jira.convert('```js\na\n```', { keepCodeLanguage: false }), '{code}\na\n{code}');
  });
  test('convertAlerts abschaltbar', function () {
    assert.strictEqual(jira.convert('> [!NOTE]\n> Text', { convertAlerts: false }),
      '{quote}\n\\[!NOTE\\]\nText\n{quote}');
  });
});

describe('Markdown-Erkennung', function () {
  test('looksLikeMarkdown erkennt Markdown', function () {
    assert.ok(jira.looksLikeMarkdown('# Titel'));
    assert.ok(jira.looksLikeMarkdown('- Punkt'));
    assert.ok(jira.looksLikeMarkdown('**fett**'));
    assert.ok(jira.looksLikeMarkdown('[a](b)'));
    assert.ok(jira.looksLikeMarkdown('```\ncode\n```'));
    assert.ok(jira.looksLikeMarkdown('Titel\n====='));
    assert.ok(jira.looksLikeMarkdown('Titel\n-----'));
  });
  test('looksLikeMarkdown ignoriert Klartext', function () {
    assert.ok(!jira.looksLikeMarkdown('Ein normaler Satz ohne Markup.'));
    assert.ok(!jira.looksLikeMarkdown(''));
    assert.ok(!jira.looksLikeMarkdown(null));
  });
  test('looksLikeMarkdown erkennt keinen Trenner nach einer Leerzeile als Setext', function () {
    assert.ok(!jira.looksLikeMarkdown('Ein Absatz.\n\n----\n'));
  });
});

describe('Jira-Markup erkennen', function () {
  test('looksLikeJiraMarkup erkennt Makros und Ueberschriften', function () {
    assert.ok(jira.looksLikeJiraMarkup('h2. Titel'));
    assert.ok(jira.looksLikeJiraMarkup('{code:java}\nx\n{code}'));
    assert.ok(jira.looksLikeJiraMarkup('{noformat}'));
    assert.ok(jira.looksLikeJiraMarkup('{panel:title=x}'));
    assert.ok(jira.looksLikeJiraMarkup('{quote}'));
    assert.ok(jira.looksLikeJiraMarkup('{color:#de350b}'));
    assert.ok(jira.looksLikeJiraMarkup('||a||b||'));
    assert.ok(jira.looksLikeJiraMarkup('[Text|https://example.org]'));
    assert.ok(jira.looksLikeJiraMarkup('{{mono}}'));
    // Mischfall aus dem Issue-Repro: looksLikeMarkdown() liefert dafuer
    // ebenfalls true (wegen "* punkt"), looksLikeJiraMarkup() zusaetzlich.
    assert.ok(jira.looksLikeJiraMarkup('h2. Titel\n* punkt\n{code:java}\nint x = 1;\n{code}'));
    assert.ok(!jira.looksLikeJiraMarkup('# Titel'));
    assert.ok(!jira.looksLikeJiraMarkup('- Punkt'));
    assert.ok(!jira.looksLikeJiraMarkup('**fett**'));
    assert.ok(!jira.looksLikeJiraMarkup('[a](b)'));
    assert.ok(!jira.looksLikeJiraMarkup('Ein normaler Satz ohne Markup.'));
    assert.ok(!jira.looksLikeJiraMarkup('\x27\x27'));
    assert.ok(!jira.looksLikeJiraMarkup(null));
  });
});
