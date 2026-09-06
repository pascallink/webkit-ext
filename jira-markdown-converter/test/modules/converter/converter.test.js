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
  test('mehrere Datenzeilen', function () {
    eq('| A |\n| --- |\n| 1 |\n| 2 |\n| 3 |', '||A||\n|1|\n|2|\n|3|');
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
      '{quote}\n[!NOTE]\nText\n{quote}');
  });
});

describe('Markdown-Erkennung', function () {
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
});
