# Azure-DevOps-Spezifika landen roh im Ticket (Bildgroesse, `[[_TOC_]]`, Anhang-Pfade, HTML-Tags)

**Labels:** enhancement, converter, low
**Schwere:** niedrig bis mittel - kein Absturz, aber sichtbarer Muell im Ticket bei genau der Quelle, fuer die die Erweiterung gebaut ist
**Nachgewiesen:** Node (`convert()`)

## Beschreibung

| Eingabe aus Azure DevOps | Jira-Ausgabe heute | Problem |
| --- | --- | --- |
| `![shot.png](/.attachments/shot-1.png =300x)` | unveraendert (`![...](...)`) | Groessen-Suffix `=300x` verhindert die Bild-Regel; relativer Pfad waere ohnehin tot |
| `[[_TOC_]]` | `[[_TOC_]]` | Jira liest `[_TOC_]` als Link; HTML-Dialekt macht `[[<em>TOC</em>]]` |
| `<div><img src="https://x/a.png" width="200"><br/>Text <span style="color:red">rot</span></div>` | `<div><img ...>\\Text <span ...>rot</span></div>` | Jira zeigt `<div>`, `<img>`, `<span>` woertlich |
| `<details><summary>Mehr</summary>` | unveraendert | woertlich |
| `<table><tr><th>a</th>...` | unveraendert | woertlich |
| `@<GUID>`-Erwaehnungen | unveraendert | GUID im Ticket |

`convertHtml` kennt nur `<br>`, `<b>`, `<i>`, `<u>`, `<s>`, `<sub>`, `<sup>`,
`<code>`. Beim Kopieren aus der ADO-Beschreibung (die intern HTML ist) kommen
regelmaessig `<div>`, `<span style>`, `<img>` und `<table>` mit.

## Vorschlag

- Bild-Regel: optionales ` =WxH` bzw. ` =Wx` vor der schliessenden Klammer
  akzeptieren und verwerfen. Relative `/.attachments/`-Pfade als Klartext
  mit Hinweis (`!shot-1.png!` funktioniert nur nach Upload) ausgeben.
- `[[_TOC_]]` und `@<GUID>` entfernen bzw. auf `@Name` reduzieren, wenn ein
  Name im Text steht.
- Unbekannte HTML-Tags im Jira-Dialekt entfernen (Inhalt behalten);
  `<img src>` -> `!src!`; einfache `<table>` in Wiki-Tabellen uebersetzen;
  `<span style="color:...">` -> `{color:...}`.
- Alternativ ueber die Zwischenablage: `text/html` lesen, wenn vorhanden, und
  daraus einen HTML->Jira-Pfad bauen (groesseres Vorhaben, eigenes Issue).
- Node-Tests mit den Zeilen aus der Tabelle.
