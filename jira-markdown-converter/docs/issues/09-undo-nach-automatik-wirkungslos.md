# Strg+Z nach der Einfuege-Automatik loescht das ganze Feld statt die Umwandlung zurueckzunehmen

**Labels:** bug, content, editors, docs, medium
**Schwere:** mittel - der einzige dokumentierte Weg, eine falsche Automatik-Umwandlung zurueckzunehmen, macht es schlimmer
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Kommentarfeld im Textmodus, echte Zwischenablage, Cmd+V und Cmd+Z in Edge 152

## Beschreibung

README, Abschnitt 5: "`Strg+Z` macht das rueckgaengig." Gemessen:

```
getippt:  "Vorher "             Zwischenablage: "# Titel\n\n- a"
Cmd+V:    "Vorher h1. Titel\n\n* a"
Cmd+Z:    ""                     <- Feld leer, auch das Getippte ist weg
```

`setTextareaValue()` schreibt ueber den nativen `value`-Setter; Chromium
verwirft damit den Undo-Verlauf der Textarea, und das naechste Undo springt
auf den Zustand vor dem ersten Tippen zurueck. (Im Fixture ohne echte
Tastatur bleibt der Wert einfach stehen - beides ist falsch.)

Gerade weil `looksLikeMarkdown()` auch bei normalem Text anspringt (ein
Spiegelstrich reicht), ist ein funktionierendes Undo die wichtigste
Absicherung.

## Vorschlag

- In `insertIntoTextarea()` zuerst `document.execCommand('insertText',
  false, payload)` versuchen, solange das Feld fokussiert ist - das laeuft
  durch den Undo-Stack des Browsers. Der native Setter bleibt Rueckfall.
- Alternativ den Satz aus der README streichen und einen Toast mit
  *Rueckgaengig*-Knopf anbieten, der den Originaltext einsetzt.
- Test in der Ebene `ext` (echte Erweiterung, echte Tastatur): Einfuegen per
  `Meta+V`/`Control+V`, danach Undo, Feld enthaelt wieder den Rohtext.
