# Einfrieren: Sperre haengt nur an `isConnected` - Haertung fuer versteckte Felder

**Labels:** enhancement, editlock, low
**Schwere:** niedrig - in Jira 9.12.2 **nicht reproduzierbar**, bleibt als Robustheitsvorschlag
**Nachgewiesen:** Instanz jira.inxire.com (DBREFI-10549): Kommentarformular wird bei *Abbrechen* und nach *Hinzufuegen* aus dem DOM entfernt, die Seite reagiert danach normal. Der urspruengliche Nachbau hatte das Formular nur versteckt (`hidden`) - dort blieb die Sperre und die Seite war tot.

## Beschreibung

`EditLock.cleanup()` / `follow()` geben eine Sperre nur ab, wenn das Feld
nicht mehr im DOM ist. Ein Feld, das Jira nur ausblendet (`hidden`,
`display: none`), bleibt gesperrt: Klicks ausserhalb werden verschluckt,
`beforeunload` fragt beim Verlassen.

In 9.12.2 entfernt Jira Kommentarformular, Inline-Bearbeitung und Dialoge
beim Schliessen aus dem DOM - der Fall tritt dort nicht auf. Er kann bei
anderen Feldtypen, Add-ons oder kommenden Jira-Versionen auftreten.

## Vorschlag

- `follow()` verwirft Felder, die weder `Editors.isUsable()` sind noch einen
  brauchbaren Nachfolger haben.
- `onBeforeUnload` nur fragen, wenn ein gesperrtes Feld sichtbar ist und sich
  sein Inhalt seit dem Einfrieren geaendert hat.
- Test im Modul `editlock` gegen ein Fixture, das das Formular per `hidden`
  ausblendet.
