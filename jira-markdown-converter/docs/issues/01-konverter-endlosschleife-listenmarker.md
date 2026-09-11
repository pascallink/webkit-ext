# Konverter haengt bei einer Zeile, die nur aus einem Listenmarker besteht

**Labels:** bug, converter, critical
**Schwere:** kritisch - der Jira-Tab friert ca. 25 Sekunden ein, eingefuegter Text geht verloren
**Nachgewiesen:** Node (`convert('-')` terminiert nicht) und Edge 152 mit geladener Erweiterung (Umwandeln-Button und Strg+V)

## Beschreibung

Enthaelt der Text eine Zeile, die nur aus `-`, `*`, `+` oder `1.` besteht
(ohne Text dahinter), laeuft `convert()` in eine Endlosschleife. Erst wenn das
interne Ausgabe-Array die maximale Arraylaenge erreicht, bricht der Aufruf mit
`RangeError: Invalid array length` ab - nach etwa 25 Sekunden mit eingefrorenem
Tab.

Beim Einfuegen (Strg+V) ist das besonders schmerzhaft: `onPaste` ruft
`event.preventDefault()` **vor** der Konvertierung auf. Wirft die
Konvertierung, ist der Inhalt der Zwischenablage weg und im Feld steht nichts.

Solche Zeilen entstehen im Alltag leicht: ein angefangener Listenpunkt, ein
`-` als Trennzeile in Mails, oder Azure-DevOps-Text mit leerem Aufzaehlungspunkt.

## Reproduktion

1. Beschreibung oeffnen, in das Feld eintippen:
   ```
   # Titel

   -

   Text
   ```
2. Button *Umwandeln* klicken - oder denselben Text per Strg+V einfuegen
   (die Ueberschrift laesst `looksLikeMarkdown()` anspringen).
3. Tab reagiert nicht mehr; nach ~25 s steht im Feld nichts bzw. der alte Inhalt.

Node-Kurzform:

```bash
node -e "require('./src/converter.js').convert('-')"
```

## Ursache

`src/converter.js`: `isListStart()` akzeptiert einen Marker ohne Text
(`(?:[ \t]|$)`), `readList()` verlangt aber `[ \t]+(.*)` hinter dem Marker.
Die Zeile wird darum weder als Eintrag noch als Fortsetzung genommen,
`readList()` bricht mit `next === start` ab, und `convertBlocks()` schiebt
dieselbe Zeile endlos erneut hinein. Das "Sicherheitsnetz gegen
Endlosschleifen" im Absatz-Zweig greift hier nicht, weil der Listen-Zweig davor
steht.

## Vorschlag

- `readList()` muss die Zeile entweder als leeren Eintrag uebernehmen
  (`* ` ohne Text) oder `isListStart()` muss Text hinter dem Marker verlangen -
  in beiden Faellen so, dass jeder Zweig von `convertBlocks()` `i` garantiert
  weiterschiebt.
- Zusaetzlich in `convertBlocks()` eine harte Sicherung: bewegt sich `i` in
  einem Durchlauf nicht, Zeile als Absatz uebernehmen und `i++`.
- `onPaste` in `src/content.js`: Konvertierung in `try/catch`, bei Fehler
  **nicht** `preventDefault()` - der Browser fuegt dann den Rohtext ein.
- Test: Property-Test im Modul `converter`, der zufaellige Kombinationen aus
  Markern, Leerzeilen und Text durch `convert()` schickt und nur verlangt,
  dass der Aufruf terminiert (Zeitbudget je Fall < 50 ms).
