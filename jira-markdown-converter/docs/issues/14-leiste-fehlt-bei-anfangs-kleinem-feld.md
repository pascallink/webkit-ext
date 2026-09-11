# Buttonleiste fehlt, wenn das Feld beim ersten Scan kleiner als 48 px ist

**Labels:** bug, content, low
**Schwere:** niedrig bis mittel - Leiste erscheint bei zunaechst verdeckten oder noch nicht ausgemessenen Feldern nie
**Nachgewiesen:** Code-Lesung `attachFieldButtons()` in `src/content.js`; Auftreten haengt an Jiras Layout-Timing (in der Instanz zu bestaetigen)

## Beschreibung

`attachFieldButtons()` ueberspringt Felder mit `rect.height < 48` ("keine
winzigen Einzeiler"), setzt aber **kein** Merkmal. Ein erneuter Versuch
passiert nur, wenn der `MutationObserver` eine weitere DOM-Aenderung meldet.
Aendert sich danach nur die Groesse (Dialog wird fertig gelayoutet, Reiter
*Schreiben* wird sichtbar, Textarea wird per Ziehen vergroessert, Fenster
wird breiter), bleibt das Feld ohne Leiste.

Typische Faelle in Jira 9.12:

- Dialog *Vorgang bearbeiten* wird per AJAX geladen; die Textarea ist im
  ersten Durchlauf noch 0 px hoch.
- Wiki-Feld mit aktivem Reiter *Vorschau* (Textarea unsichtbar, Hoehe 0).
- Kommentarfeld im eingeklappten Zustand.

`isRichTextActive()` misst ausserdem den Rahmen - bei einem gerade erst
eingehaengten TinyMCE ist der ebenfalls kurz 0 px.

## Reproduktion (Nachbau)

Im Nachbau ein Feld mit `rows="1"` einhaengen und per Skript spaeter auf
`rows="8"` setzen (Attributaenderung loest keinen `childList`-Mutation aus):
Leiste erscheint nicht.

## Vorschlag

- Beim Ueberspringen nichts markieren, aber die Bedingung erneut pruefen bei
  `focusin` im Feld (dort haengt ohnehin `EditLock.lock`) und bei
  `resize`/`transitionend`.
- Oder: `ResizeObserver` je uebersprungenem Feld, der `scheduleScan()`
  ausloest, sobald die Hoehe die Schwelle erreicht.
- `MutationObserver` zusaetzlich mit `attributes: true` und
  `attributeFilter: ['style', 'class', 'hidden', 'rows']`.
- Test im Modul `content`: Feld startet mit `rows="1"`, wird auf `rows="8"`
  gesetzt, Leiste ist innerhalb von 500 ms da.
