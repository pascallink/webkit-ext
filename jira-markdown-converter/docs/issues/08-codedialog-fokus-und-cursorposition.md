# Nach dem Code-Dialog liegt der Fokus auf dem Button, das naechste Einfuegen landet vor dem Codeblock

**Labels:** bug, content, dialogs, medium
**Schwere:** mittel - "Code, dann Panel" liefert das Panel oberhalb des Codes, obwohl der Cursor dahinter stand
**Nachgewiesen:** Edge 152 mit geladener Erweiterung, `mock-jira-server.html`

## Beschreibung

`CodeDialog.open()` merkt sich `document.activeElement` als `opener`. Beim
Klick auf den Leisten-Button *Code* ist das in Chromium/Edge der Button
selbst, nicht das Feld. `close()` gibt den Fokus darum an den Button zurueck
(`activeElement=BUTTON.jmd-fieldbar__btn`), obwohl der Kommentar im Code
"Fokus zurueck ins Jira-Feld" verspricht.

Folge: `selectionchange` nach `setSelectionRange()` kommt erst an, wenn der
Button schon fokussiert ist - `trackCaret()` sieht kein aktives Feld und
merkt sich die neue Position nicht. Die gemerkte Position ist die von vor dem
Codeblock. Der naechste Einsatz ueber *Panel*, *Vorlagen* oder *Einfuegen*
landet davor:

```
Zeile1
{panel:title=Info|...}          <- eingefuegt nach dem Code, steht aber davor
Hier die Information eintragen.
{panel}
{code}
x
{code}
Zeile2
```

## Reproduktion

1. Beschreibung: `Zeile1\nZeile2`, Cursor ans Ende von `Zeile1`.
2. *Code* -> Text `x` -> *Einfuegen*.
3. Sofort *Panel* -> *Info*.
4. Panel steht ueber dem Codeblock.

## Vorschlag

- `openCodeDialog()` uebergibt das Feld als `opener` (wie es
  `TemplateDialog` bereits mit `opener: customButton` vorsieht - dort
  allerdings ebenfalls der Button; besser die Schreibflaeche
  `Editors.editingSurface(field)`).
- Nach jedem programmatischen Einfuegen `Editors.rememberCaret(field)`
  synchron aufrufen, statt auf `selectionchange` zu warten - in
  `insertIntoTextarea()` direkt nach `setSelectionRange()`.
- Test im Modul `content`: Code einfuegen, danach Panel einfuegen, Reihenfolge
  im Feld pruefen; Fokus nach `close()` liegt auf dem Feld.
