# Unsichtbares Einfrieren: jede kleine Textarea (Labels, Versionen, Komponenten) sperrt die Seite ohne Schloss

**Labels:** bug, editlock, high
**Schwere:** hoch - Escape und Abbrechen im Label-Dialog und im Bearbeiten-Dialog sind blockiert, und es gibt keinen Knopf, um die Sperre zu loesen
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Edge 152

## Beschreibung

`EditLock.lock()` wird bei `focusin` fuer **jedes** Element ausgeloest, das
`Editors.editableFrom()` als Feld erkennt - also jede Textarea, die nicht in
`IGNORED_SELECTOR` steht. Die Buttonleiste (und damit das Schloss) bekommt
dagegen nur ein Feld ab 48 px Hoehe. Jiras Auswahlfelder sind Textareas mit
29 px:

- Label-Dialog (`l`): `textarea#labels-textarea`
- Bearbeiten-Dialog: `#fixVersions-textarea`, `#versions-textarea`,
  `#components-textarea`, `#labels-textarea`, `#issuelinks-issues-textarea`,
  weitere Custom-Field-Picker
- Link-Dialog: `#jira-issue-keys-textarea`

Gemessen im Label-Dialog nach Tippen im Feld:

| Aktion | Ergebnis |
| --- | --- |
| `Escape` | nichts (Jira-Handler gestoppt) |
| Klick *Abbrechen* (`a#cancel[href="/browse/KEY"]`) | Jira-Handler gestoppt, der Browser folgt dem `href`: **Seite laedt neu**, `beforeunload` fragt vorher |
| Schloss | existiert nicht - keine Leiste an einem 29-px-Feld |

Im Bearbeiten-Dialog nach Klick in *Fix Version/s*: `Escape` und
*Abbrechen* blockiert; die Schloesser an Beschreibung und Kommentar zeigen
"Einfrieren" (offen), weil die Sperre am Versions-Feld haengt.
Gegenprobe mit Fokus in *Zusammenfassung* (ein `input`): `Escape` schliesst.

## Reproduktion

1. DBREFI-10549, Taste `l`, in das Label-Feld tippen, `Escape`.
2. *Abbrechen* klicken: Seite laedt neu.

## Vorschlag

- Sperren nur fuer Felder, die auch eine Leiste bekommen haben
  (`dataset.jmdButtonAttached`), oder nur fuer Wiki-Felder
  (`.wiki-textfield`, `.jira-wikifield textarea`, Rahmen des Rich-Text-
  Editors). Picker-Textareas (`.jira-multi-select textarea`,
  `[role="combobox"]`) in `IGNORED_SELECTOR` aufnehmen.
- Grundsaetzlich: Jira-Handler nie fuer Klicks auf `.cancel`, `.submit`,
  `[type="submit"]` und Links mit `href` stoppen (siehe Issue 25).
- Test im Modul `editlock` gegen den Nachbau (`?state=labels`): Escape
  schliesst den Dialog, *Abbrechen* kommt bei Jira an.
