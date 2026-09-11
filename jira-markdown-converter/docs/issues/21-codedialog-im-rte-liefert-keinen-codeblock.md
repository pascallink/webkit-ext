# Code-Dialog im visuellen Modus liefert Monospace-Text statt eines Codeblocks

**Labels:** bug, dialogs, converter, high
**Schwere:** hoch - das Kernversprechen "Codeblock an der Cursorposition" gilt im Standardmodus der Instanz nicht
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Kommentar im visuellen Modus, danach auf *Text* umgeschaltet

## Beschreibung

Der Dialog fuegt `<pre><code class="language-java">...</code></pre>` als
`text/html` ein. Jiras TinyMCE-Konfiguration kennt dieses `<pre>` nicht
und packt es aus:

```
im Editor:   <p><code class="language-java">int x = 1;\nreturn x;</code></p>
als Wiki:    {{int x = 1;
             return x;}}
```

Also Inline-Monospace ueber zwei Zeilen, kein `{code}`. Die Form, die Jira
selbst fuer ein `{code}`-Makro im Editor benutzt (aus dem Editor gelesen):

```html
<pre class="code panel" style="border-width: 1px;" data-language="code-java">int x = 1;
return x;
</pre>
```

Weitere Makro-Formen des Editors, fuer den HTML-Dialekt insgesamt:

| Wiki | HTML im Editor |
| --- | --- |
| `{noformat}` | `<pre class="noformat panel" style="border-width: 1px;">...</pre>` |
| `{panel:title=T\|borderColor=#x\|bgColor=#y}` | `<div class="plain panel" style="background-color: #y; border-color: #x; border-width: 1px;"><panel-title style="...">T</panel-title><p>...</p></div>` |
| `{quote}` / `bq.` | `<blockquote><p>...</p></blockquote>` |
| `{{mono}}` | `<tt>mono</tt>` |
| `-x-` / `+x+` | `<del>` / `<ins>` |
| Tabelle | `<div class="table-wrap"><table class="confluenceTable"><tr><th class="confluenceTh">` |

Nebenbefund: die Trenner `<p></p>` aus `asOwnBlocks()` werden im Editor zu
`<p><br></p>` und im Wiki zu Zeilen mit einem geschuetzten Leerzeichen
(` `), die Jira als Leerzeilen mit Inhalt speichert.

## Reproduktion

1. Kommentar, Modus *Visuell*, *Code* -> Java -> zwei Zeilen -> *Einfuegen*.
2. Auf *Text* umschalten: `{{...}}` statt `{code:java}`.

## Vorschlag

- `HTML_DIALECT.codeBlock()` liefert `<pre class="code panel"
  data-language="code-<lang>">` (ohne Sprache: `class="code panel"` ohne
  `data-language`), `preBlock()` liefert `<pre class="noformat panel">`.
  Der Code-Dialog nutzt dieselben Dialekte, ist damit automatisch richtig.
- Statt leerer `<p></p>` als Trenner den Block direkt zwischen zwei Absaetze
  setzen (Range auf Blockgrenze) oder die Trenner nach dem Einfuegen wieder
  entfernen.
- Test: Roundtrip-Fall im Nachbau (`docs/mockup`, dessen Umschalter
  `pre.code.panel` nach `{code}` zurueckwandelt) und einmalig in der Instanz.
