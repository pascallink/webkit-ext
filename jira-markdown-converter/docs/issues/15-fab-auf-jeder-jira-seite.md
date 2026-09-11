# Schwebender MD-Button erscheint auf jeder Jira-Seite, auch Login, Dashboard und Boards

**Labels:** enhancement, content, ux, low
**Schwere:** niedrig - Oberflaechenrauschen, kein Funktionsfehler
**Nachgewiesen:** Edge 152 mit geladener Erweiterung auf `http://jira.inxire.com/login.jsp` (Loginseite von DBREFI-10549): FAB vorhanden, keine Leiste

## Beschreibung

`createFab()` haengt den Button in jedes Top-Frame-Dokument eines
freigegebenen Hosts. Auf der Loginseite, dem Dashboard, in Boards, in der
Administration und auf Suchseiten gibt es kein Feld, in das eingefuegt werden
kann - ein Klick oeffnet das Panel mit "Ziel: kein Feld gefunden".

## Vorschlag

- FAB nur zeigen, wenn `Editors.findAllTargets()` mindestens ein Feld liefert
  oder die Seite ein Vorgang ist (`#issue-content`, `meta[name="ajs-issue-key"]`).
  Nachziehen im bestehenden `scheduleScan()`.
- Auf der Loginseite grundsaetzlich nichts einbauen (`#login-form-username`
  vorhanden).
- Einstellung *Schwebenden Button anzeigen* bleibt als Hauptschalter.
- Test im Modul `content`: Fixture ohne Felder -> kein FAB; Feld wird
  eingehaengt -> FAB erscheint.
