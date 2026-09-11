# Einfrieren: Abbrechen und Escape im Dialog "Vorgang bearbeiten" sind blockiert

**Labels:** bug, editlock, high
**Schwere:** hoch - README verspricht "Speichern und Abbrechen funktionieren normal"; im Bearbeiten-Dialog geht Abbrechen nur ueber das Schloss
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2 (DBREFI-10549), Edge 152 mit geladener Erweiterung. Kommentarformular und Inline-Beschreibung sind **nicht** betroffen - dort liegen die Knoepfe innerhalb der `.field-group` bzw. `#description-val`.

## Beschreibung

Im Dialog *Vorgang bearbeiten* (`#edit-issue-dialog`, AUI-Dialog2) liegt
das Wiki-Feld in `.field-group > .jira-wikifield`, die Knoepfe aber in
`.buttons-container.form-footer` am Ende des Formulars:

```
form.aui[name=jiraform]
  .form-body ... .field-group > .jira-wikifield > .wiki-edit > #description-wiki-edit > textarea#description
  .buttons-container.form-footer > .buttons > input#edit-issue-submit + button.aui-button.aui-button-link.cancel
```

`EditLock.findArea()` endet an der `.field-group`. Sobald der Cursor in der
Beschreibung war (Schloss zu):

- *Abbrechen* (`button.cancel`) wird gestoppt, der Dialog bleibt offen.
- `Escape` wird gestoppt (`onKeydown`), der Dialog bleibt offen.
- *Aktualisieren* funktioniert nur, weil die Default-Aktion von
  `type="submit"` das `submit`-Ereignis trotzdem ausloest.
- Gegenprobe: steht der Cursor im Feld *Zusammenfassung*, schliesst Escape
  den Dialog sofort.

Nach Klick auf das Schloss funktioniert Abbrechen wieder.

## Reproduktion (Instanz)

1. DBREFI-10549, *Bearbeiten*, in *Beschreibung* klicken.
2. `Escape` - nichts. *Abbrechen* - nichts.
3. Schloss in der Leiste oeffnen, *Abbrechen* - Dialog schliesst.

## Vorschlag

- `AREA_SELECTOR` um die Formularrahmen erweitern, die Jira um ein Feld baut:
  `form.aui`, `.jira-dialog`, `.aui-dialog2`, `.jira-dialog-core`. Damit der
  Rahmen bei zwei Wiki-Feldern im selben Formular (Beschreibung und Kommentar
  im Bearbeiten-Dialog) nicht an `holdsOtherField()` scheitert, zusaetzlich
  eine Positivliste immer bedienbarer Elemente: `.buttons-container`,
  `.save-options`, `.form-footer`, `.cancel`, `.submit`, `[type="submit"]`.
- `Escape` nur stoppen, wenn das Ziel im gesperrten Feld liegt.
- Test im Modul `editlock` gegen `docs/mockup/mock-jira-912-issue-view.html?state=edit`:
  Cursor in Beschreibung, dann `Escape` und *Abbrechen* muessen im
  Mock-Protokoll ankommen.
