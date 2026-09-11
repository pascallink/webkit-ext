# Fehlersammlung PowerEdit for Jira 1.3.4 - Stand 2026-09-11

Ergebnis einer Analyse- und Testsession: Quellen gelesen, 228 Node- und 162
Browser-Tests (gruen), Konverter-Sondierung mit 55 Markdown-Faellen, echte
Erweiterung in Edge 152 gegen die Fixtures, gegen den Nachbau
`docs/mockup/mock-jira-912-issue-view.html` **und gegen die Instanz
`http://jira.inxire.com` (Jira Server 9.12.2, Rich-Text-Editor aktiv)** am
Spielwiesen-Ticket DBREFI-10549. Protokoll und Ergebnisse:
`docs/testprotokoll-DBREFI-10549.md`.

Jede Datei ist ein GitHub-Issue zum Kopieren: erste Zeile = Titel, danach
Labels und Body.

| # | Datei | Schwere | Nachweis |
| --- | --- | --- | --- |
| 01 | [Konverter haengt bei Zeile mit nur Listenmarker](01-konverter-endlosschleife-listenmarker.md) | kritisch | Node + Edge |
| 25 | [Toolbar-Links navigieren weg, solange eingefroren](25-toolbar-links-navigieren-weg-solange-eingefroren.md) | kritisch | Instanz |
| 24 | [Unsichtbares Einfrieren an kleinen Textareas](24-unsichtbares-einfrieren-an-kleinen-textareas.md) | hoch | Instanz |
| 20 | [Visueller Modus nach Oeffnen nicht eingefroren](20-visueller-modus-nicht-eingefroren-nach-oeffnen.md) | hoch | Instanz |
| 21 | [Code-Dialog im RTE liefert keinen Codeblock](21-codedialog-im-rte-liefert-keinen-codeblock.md) | hoch | Instanz |
| 22 | [Panel-Vorlage im RTE kommt als fetter Text an](22-panel-vorlage-im-rte-kommt-als-fetter-text-an.md) | hoch | Instanz |
| 19 | [HTTP-Instanz: Zwischenablage-Knoepfe tot](19-http-instanz-zwischenablage-knoepfe-tot.md) | hoch | Instanz |
| 03 | [Abbrechen und Escape im Bearbeiten-Dialog blockiert](03-editlock-abbrechen-und-escape-blockiert.md) | hoch | Instanz |
| 04 | [Blockmarkup klebt mitten in der Zeile](04-blockmarkup-klebt-mitten-in-der-zeile.md) | hoch | Instanz + Edge |
| 05 | [Automatik zerstoert vorhandenes Jira-Markup](05-automatik-zerstoert-vorhandenes-jira-markup.md) | hoch | Instanz + Node |
| 06 | [Jira-Sonderzeichen unmaskiert](06-jira-sonderzeichen-im-fliesstext-unmaskiert.md) | mittel | Instanz (Rendering) |
| 07 | [`\|` in Tabellenzelle bricht Tabelle](07-tabelle-escaped-pipe-bricht-zelle.md) | mittel | Node + Instanz (Rendering) |
| 08 | [Code-Dialog: Fokus und Cursorposition](08-codedialog-fokus-und-cursorposition.md) | mittel | Edge + Instanz |
| 09 | [Undo nach Automatik loescht das Feld](09-undo-nach-automatik-wirkungslos.md) | mittel | Instanz |
| 10 | [Kontextmenue injiziert Oberflaeche ueberall](10-kontextmenue-injiziert-ganze-oberflaeche-ueberall.md) | mittel | Code |
| 11 | [Inline-Code mit geschweiften Klammern](11-inline-code-mit-geschweiften-klammern.md) | mittel | Node + Instanz (Rendering) |
| 23 | [Umschalten auf Markup-Modus findet Umschalter nicht](23-umschalten-auf-markup-modus-findet-umschalter-nicht.md) | mittel | Instanz |
| 26 | [OTRS-Flow-Selektoren passen nicht zu 9.12.2](26-otrs-flow-selektoren-passen-nicht-zu-912.md) | mittel | Instanz (DOM) |
| 17 | [Browser-Tests laufen nicht als Erweiterung](17-browsertests-laufen-nicht-als-erweiterung.md) | mittel | Vergleich |
| 12 | [Azure-DevOps-Spezifika roh im Ticket](12-azure-devops-spezifika-landen-roh-im-ticket.md) | niedrig | Node |
| 13 | [Kleinere Konverter-Luecken](13-kleinere-konverter-luecken.md) | niedrig | Node |
| 14 | [Leiste fehlt bei anfangs kleinem Feld](14-leiste-fehlt-bei-anfangs-kleinem-feld.md) | niedrig | Code |
| 15 | [FAB auf jeder Jira-Seite](15-fab-auf-jeder-jira-seite.md) | niedrig | Instanz (Loginseite) |
| 16 | [Doku-Drift, unverdrahtete OTRS-Module](16-doku-drift-und-unverdrahtete-otrs-module.md) | niedrig | Vergleich |
| 18 | [Popup-Einfuegen ignoriert RTE-Einstellungen](18-popup-einfuegen-ignoriert-rte-einstellungen.md) | niedrig | Code |
| 02 | [Sperre haengt nur an isConnected (Haertung)](02-editlock-sperre-bleibt-bei-verstecktem-feld.md) | niedrig | in 9.12.2 nicht reproduzierbar |

Empfohlene Reihenfolge: 25 und 24 zusammen (Einfrieren stoppt `click` nicht
mehr, sperrt nur Wiki-Felder), dann 01 und 05 (Datenverlust), dann 20/21/22
(Rich-Text-Editor ist der Standardmodus der Instanz), dann 17 als Grundlage
fuer alles Weitere.

Was in der Instanz **funktioniert** hat (kein Issue): Leiste unter der
Formatierungsleiste an Kommentar, Beschreibung (inline und Dialog) und an
Custom-Field-Textareas; Automatik-Schalter; *Umwandeln* im Textmodus;
Panel mit Vorschau und formatiertem Einfuegen in den Rich-Text-Editor
(Ueberschrift, fett, Code, Link, Liste, Tabelle kommen als echtes Wiki an);
Strg+V im Rich-Text-Editor; Einfrieren im Textmodus inklusive Escape und
Klick daneben; Speichern ueber Submit-Knoepfe; Abbrechen im
Kommentarformular und in der Inline-Beschreibung; eigene Vorlagen ueber die
Optionsseite.
