# Automatik beim Einfuegen zerstoert Text, der bereits Jira-Markup ist

**Labels:** bug, converter, content, high
**Schwere:** hoch - Kopieren aus einem anderen Jira-Ticket (Textmodus) macht `{code}`- und `{panel}`-Makros kaputt
**Nachgewiesen:** Node (`convert()`), Verhalten der Automatik folgt aus `looksLikeMarkdown()`

## Beschreibung

Wer Text aus dem Textmodus eines anderen Jira-Vorgangs kopiert (typisch:
Beschreibung uebernehmen, Kommentar zitieren), hat Jira-Markup in der
Zwischenablage. Enthaelt es eine Zeile `* punkt` oder `# schritt`, meldet
`looksLikeMarkdown()` "Markdown", und die Automatik konvertiert:

```
h1. Schon Jira            ->  h1. Schon Jira
* punkt                   ->  * punkt
{code:java}               ->  \{code:java\}
x                         ->  x
{code}                    ->  \{code\}
```

Ueberschriften bleiben zufaellig heil, aber jedes Makro (`{code}`,
`{noformat}`, `{panel}`, `{color}`, `{quote}`) wird maskiert und steht danach
woertlich im Ticket. Tabellen (`||a||`) ueberleben nur, weil `|` nicht
angefasst wird.

## Reproduktion

1. In DBREFI-10549 die Beschreibung im Textmodus mit folgendem Inhalt
   speichern:
   ```
   h2. Titel
   * punkt
   {code:java}
   int x = 1;
   {code}
   ```
2. Beschreibung erneut oeffnen, alles kopieren, Kommentarfeld oeffnen,
   Strg+V.
3. Toast "In Jira-Markup umgewandelt.", im Kommentar steht `\{code:java\}`.

## Vorschlag

- `looksLikeJiraMarkup(text)` in `src/converter.js`: greift bei
  `^h[1-6]\. `, `\{(code|noformat|panel|quote|color)(:[^}]*)?\}`, `^\|\|`,
  `\[[^\]]+\|https?://`, `{{...}}`. Liefert es `true`, laesst `onPaste` den
  Text unangetastet (Toast: "Sieht schon nach Jira-Markup aus - nicht
  umgewandelt.").
- Alternativ oder zusaetzlich: `escapeBraces` maskiert keine bekannten
  Jira-Makros am Zeilenanfang.
- *Umwandeln* per Button darf weiterhin konvertieren (bewusste Aktion), soll
  aber denselben Hinweis zeigen.
- Tests: Node-Faelle fuer die Erkennung, Browser-Fall fuer die Automatik.
