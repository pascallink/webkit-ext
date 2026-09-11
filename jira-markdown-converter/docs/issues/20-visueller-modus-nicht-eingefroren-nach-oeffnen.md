# Visueller Modus: Beschreibung ist nach dem Oeffnen nicht eingefroren - Klick daneben speichert den halben Text

**Labels:** bug, editlock, content, high
**Schwere:** hoch - genau der Fall, gegen den das Einfrieren gebaut wurde; im Standardmodus der Instanz (Visuell) greift es beim ersten Oeffnen nicht
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Edge 152

## Beschreibung

Jira oeffnet die Inline-Bearbeitung der Beschreibung im zuletzt benutzten
Modus (Visuell/Text ist eine Nutzereinstellung fuer alle Felder). Im
visuellen Modus fokussiert Jira den TinyMCE-Rahmen (`iframe#mce_0_ifr`)
sofort. Gemessen zwei Sekunden nach dem Oeffnen:

```
Schloss: 🔓 Einfrieren      activeElement: IFRAME#mce_0_ifr
```

Tippen landet im Editor, aber die Sperre ist nicht aktiv. Ein Klick daneben
loest Jiras Inline-Verhalten aus - und das **speichert** in 9.12 (nicht
verwerfen): der halb getippte Text steht danach in der Beschreibung.

Erst ein zweiter Klick in den Rahmen friert ein (dann haelt der Klick
daneben).

Ursache: der `focusin`-Wachposten am Hauptdokument sieht Fokuswechsel in
den Rahmen nicht; `wireRichTextFrame()` haengt seine Handler erst im
naechsten `scheduleScan()` (400 ms nach der Mutation) an - da ist der
Fokus laengst drin. Im Textmodus greift `focusin` an der Textarea sofort.

## Reproduktion

1. Editor auf *Visuell*, Beschreibung anklicken, sofort tippen.
2. Auf *Details* klicken: Feld schliesst, Text ist gespeichert.

## Vorschlag

- In `wireRichTextFrame()` beim Anhaengen pruefen, ob der Rahmen bereits
  den Fokus hat (`frame.ownerDocument.activeElement === frame`) und dann
  sofort `EditLock.lock(field)` aufrufen.
- `scheduleScan()` fuer neue Rahmen ohne Verzoegerung ausfuehren
  (MutationObserver-Callback direkt, Debounce nur fuer Folgeaenderungen).
- Zusaetzlich `focus`/`focusin` am Fenster in der Erfassungsphase auswerten:
  Ziel `iframe.tox-edit-area__iframe` -> Feld ueber `fieldForFrame()` sperren.
- Test in der Ebene `ext` gegen den Nachbau (`?state=description`, Modus
  Visuell): Schloss ist innerhalb von 100 ms zu, Klick daneben speichert nicht.
