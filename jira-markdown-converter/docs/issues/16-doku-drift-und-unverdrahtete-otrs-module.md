# Doku-Drift: OTRS-Module ausgeliefert aber unverdrahtet, CHANGELOG ohne 1.3.1-1.3.4, TESTS.md und CLAUDE.md veraltet

**Labels:** docs, package, chore, low
**Schwere:** niedrig - kostet jede neue Claude-Code-Session Kontext und fuehrt zu falschen Annahmen
**Nachgewiesen:** Vergleich `manifest.json`, `src/`, `CHANGELOG.md`, `.github/TESTS.md`, `jira-markdown-converter/CLAUDE.md`, `test/modules/`

## Befunde

1. **OTRS-Module werden geladen, aber nirgends benutzt.** `src/otrslink.js`,
   `src/jiraui.js`, `src/otrsflow.js` stehen im Manifest und in
   `CONTENT_FILES`, `content.js` referenziert weder `JiraOtrsFlow` noch
   `JiraOtrsLink` (Sub-Tasks 4 und 5 aus `docs/issue-17-ausfuehrungsplan.md`
   fehlen). Jede Jira-Seite laedt drei Dateien ohne Nutzen; die
   Store-Unterlagen erwaehnen die Funktion nicht.
2. **`pingJiraTrace()` kann nie greifen.** Content-Scripts laufen in der
   isolierten Welt; `window.JIRA` der Seite ist dort nicht sichtbar. Die
   Browser-Tests laden die Quellen per `addScriptTag` in die Hauptwelt und
   sehen den Unterschied nicht (siehe Issue 17).
3. **CHANGELOG endet bei 1.3.0**, Manifest und `package.json` stehen auf
   1.3.4 (die CI hebt Patch-Versionen automatisch). Was in 1.3.1-1.3.4
   passiert ist (OTRS-Parser, DOM-Helfer, Flow, Playwright-Pin), steht nur im
   Git-Log.
4. **`.github/TESTS.md`** fuehrt `otrs` als "reserviert, `src/otrs.js`
   geplant" - tatsaechlich existiert `test/modules/otrs/` mit
   `otrslink.test.js`, `jiraui.test.js`, `otrsflow.test.js` und dem
   Fixture `mock-jira-otrs.html`. Auch die Verzeichnisstruktur und die
   Testzahlen (aktuell 228 Node + 162 Browser) sind veraltet.
5. **Projekt-`CLAUDE.md`**: UMD-Pflichtliste ohne `JiraOtrsLink`, `JiraUi`,
   `JiraOtrsFlow`; Modulliste fuer `test:<modul>` ohne `otrs`; Struktur-
   Tabelle ohne die drei Dateien.
6. **README** nennt "Smart-Link-Parsing ist fuer eine kommende Version
   geplant" - der Parser ist da, nur der Dialog fehlt.

## Vorschlag

- Entweder die drei OTRS-Dateien bis zur Verdrahtung aus Manifest und
  `CONTENT_FILES` nehmen (Tests laufen weiter ueber `require`), oder die
  Sub-Tasks 4/5 umsetzen. `pingJiraTrace()` streichen.
- `CHANGELOG.md` um 1.3.1-1.3.4 ergaenzen; CI-Bump-Commits koennten den
  Eintrag "Unreleased" automatisch umbenennen.
- `TESTS.md`, `CLAUDE.md`, README nachziehen. `node test/run.js --list`
  liefert die Zahlen.
- Test im Modul `package`: jede Datei in `content_scripts[0].js` muss von
  `content.js` oder einer anderen Content-Datei ueber ihr Global referenziert
  werden (`grep` auf `window.<Global>`), sonst rot.
