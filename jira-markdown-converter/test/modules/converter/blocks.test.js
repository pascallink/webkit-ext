/**
 * Tests fuer blockartige Elemente: Inline- und Fenced-Code, Zitate, Trenner,
 * Panels aus Azure-DevOps-Alerts sowie den direkten Codeblock-Weg der
 * Dialekte (umgeht den Markdown-Parser, wie es der Code-Dialog tut).
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

describe('Code', function () {
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
});

describe('Zitate, Trenner, Panels', function () {
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
});

describe('Codeblock aus dem Dialog', function () {
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
});
