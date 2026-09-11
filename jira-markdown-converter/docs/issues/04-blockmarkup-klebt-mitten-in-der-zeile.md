# Einfuegen mitten in einer Zeile klebt Ueberschriften, Listen und Tabellen an den Text

**Labels:** bug, content, high
**Schwere:** hoch - Jira rendert `h2.`, `*`, `||` nur am Zeilenanfang, das Ergebnis ist Rohtext im Ticket
**Nachgewiesen:** Edge 152 mit geladener Erweiterung, `mock-jira-server.html` - Einfuegen-Button, Strg+V und Panel "Ins Ticket einfuegen"

## Beschreibung

Steht der Cursor mitten in einer Zeile (`Satz eins. |Satz zwei.`) und wird
Markdown eingefuegt, das mit einem Blockkonstrukt beginnt oder endet, kommt an:

```
Satz eins. h2. Neu

* a
* bSatz zwei.
```

Jira zeigt `h2. Neu` woertlich, und aus `* bSatz zwei.` wird ein
Listenpunkt mit falschem Text. Fuer `{code}` und `{panel}` gibt es den Modus
`'block'` (eigene Zeilen), fuer das Ergebnis der Markdown-Konvertierung nicht -
`deliver()` und `onPaste()` uebergeben immer `'insert'`.

Fuer eigene Vorlagen existiert bereits die passende Heuristik
`insertModeFor()` in `src/content.js` (Zeilenumbruch oder Blockanfang ->
`'block'`); sie wird fuer konvertiertes Markdown nicht benutzt.

## Reproduktion

1. Beschreibung: `Satz eins. Satz zwei.` eintippen, Cursor hinter `eins. `
   setzen.
2. `## Neu\n\n- a\n- b` in die Zwischenablage legen, *Einfuegen* klicken
   (oder Strg+V).
3. Ergebnis wie oben.

## Vorschlag

- In `deliver()` (und damit fuer Einfuegen-Button, Strg+V, Panel) den Modus
  aus dem konvertierten Markup ableiten: `insertModeFor(markup)` statt fest
  `'insert'`. Fliesstext ohne Blockkonstrukt bleibt bei `'insert'`.
- `asOwnLines()` in `src/editors.js` deckt dann Anfang und Ende ab.
- Fuer den Rich-Text-Editor gilt dasselbe ueber `asOwnBlocks()`.
- Test im Modul `content`: Cursor mitten in der Zeile, Einfuegen von
  Ueberschrift, Liste und Tabelle - Markup steht auf eigenen Zeilen, der
  Rest der Zeile beginnt neu.
