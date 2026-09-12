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
  test('Inline-Code mit geschweiften Klammern als noformat', function () {
    eq('Nutze `{{key}}` hier', 'Nutze {noformat}{{key}}{noformat} hier');
    eq('`a}`', '{noformat}a}{noformat}');
    eq('`{`', '{noformat}{{noformat}');
    eq('`${var}`', '{noformat}${var}{noformat}');
    // Regression: Inline-Code ohne Klammern bleibt bei {{ }}.
    eq('`npm install`', '{{npm install}}');
    eq('`**nicht fett**`', '{{**nicht fett**}}');
  });
  test('Inline-Code, der selbst {noformat} enthaelt, bleibt bei {{ }}', function () {
    // Bewusste Grenze: {noformat} laesst sich nicht in sich selbst
    // schachteln, darum bleibt dieser Sonderfall bei der alten Form -
    // besser eine bekannt kaputte Ausgabe als ein zweites kaputtes Muster.
    eq('`{noformat}`', '{{{noformat}}}');
  });
  test('noformat-Ausgabe bleibt als Jira-Markup erkennbar (Issue #92)', function () {
    // convert() selbst ist nicht idempotent - reiner Text mit rohen {}
    // wuerde beim zweiten Durchlauf maskiert. Die eigentliche Absicherung
    // gegen erneutes Konvertieren sitzt in content.js: looksLikeJiraMarkup()
    // erkennt {noformat} bereits, die Automatik laesst die Ausgabe darum
    // beim erneuten Einfuegen stehen, statt sie ein zweites Mal durch
    // convert() zu schicken.
    var once = jira.convert('Nutze `{{key}}` hier');
    assert.ok(jira.looksLikeJiraMarkup(once));
  });
});

describe('Zitate, Trenner, Panels', function () {
  test('einzeiliges Zitat', function () {
    eq('> Zitat', 'bq. Zitat');
  });
  test('mehrzeiliges Zitat', function () {
    eq('> Zeile eins\n> Zeile zwei', '{quote}\nZeile eins\nZeile zwei\n{quote}');
  });
  test('verschachteltes Zitat bleibt eine Huelle', function () {
    eq('> a\n>> b\n>>> c', '{quote}\na\nb\nc\n{quote}');
    eq('> a\n>\n>> b', '{quote}\na\n\nb\n{quote}');
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
    assert.strictEqual(html,
      '<pre class="code panel" style="border-width: 1px;" data-language="code-html">' +
      '&lt;b&gt;&amp;&lt;/b&gt;\n</pre>');
  });
  test('HTML-Codeblock kommt in Jiras Editor-Form', function () {
    // TinyMCE in 9.12 packt fremdes <pre> aus (siehe JIRA912-Fixture) - der
    // Codeblock muss darum schon in Jiras panel-Form vorliegen.
    var withLang = jira.dialects.html.codeBlock('java', 'int a = 1;');
    assert.strictEqual(withLang,
      '<pre class="code panel" style="border-width: 1px;" data-language="code-java">int a = 1;\n</pre>');
    var withoutLang = jira.dialects.html.codeBlock('', 'int a = 1;');
    assert.strictEqual(withoutLang,
      '<pre class="code panel" style="border-width: 1px;">int a = 1;\n</pre>');
    var pre = jira.dialects.html.preBlock('irgendwas');
    assert.strictEqual(pre,
      '<pre class="noformat panel" style="border-width: 1px;">irgendwas\n</pre>');
  });
});
