# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, Manifest V3). Jeder
Top-Level-Ordner mit `manifest.json` ist eine eigenstaendige Erweiterung mit
eigenem `package.json`; die CI baut sie generisch.

Aktuell: `jira-markdown-converter/` (PowerEdit for Jira).

## Befehle

Alle Befehle im Erweiterungsordner ausfuehren, z. B.
`npm run lint --prefix jira-markdown-converter`.

| Zweck | Befehl |
| --- | --- |
| Install | `npm install` |
| Lint | `npm run lint` (ESLint ueber `src test popup options`) |
| Test (alle) | `npm test` |
| Unit | `npm run test:unit` |
| Settings | `npm run test:settings` |
| Packaging | `npm run test:package` |
| Integration | `npm run test:integration` (Playwright, `npx playwright install chromium`) |

Kein Build-Schritt: der Quellcode ist die Auslieferung. Laden per
`chrome://extensions` -> "Entpackte Erweiterung laden" -> Erweiterungsordner.
Lint und Test muessen gruen sein, sonst packt
`.github/workflows/build-extension.yml` kein ZIP.

## Architektur (jira-markdown-converter)

- `src/converter.js` - `markdownToJira()`, reine Textumwandlung, **kein DOM**,
  laeuft in Node (Tests) und im Content-Script.
- `src/editors.js` - Erkennung der Jira-Eingabefelder und Schreibzugriff.
  Drei Varianten: `<textarea>` (Server/DC), ProseMirror (Cloud),
  CodeMirror/Ace (wie ProseMirror behandelt).
- `src/content.js` - Einstieg im Tab: baut die Bedienelemente ein, orchestriert
  Konvertieren und Einfuegen. Guard `window.__jiraMarkdownConverterLoaded`.
- `src/codedialog.js` - Dialog "Code einfuegen"; Code umgeht den Markdown-Parser.
- `src/editlock.js` - haelt Jiras Inline-Bearbeitung offen (Schloss-Button).
- `src/settings.js` - gemeinsame Defaults/Storage-Zugriffe fuer alle Kontexte.
- `src/background.js` - Service-Worker: Tastenkuerzel, Kontextmenue,
  Nachruesten weiterer Jira-Hosts. Laedt via `importScripts`.
- `popup/`, `options/` - UI-Seiten, konsumieren `settings.js` + `converter.js`.
- `test/` - Node-eigene Runner (kein Framework), Fixtures in `test/fixtures/`.

Ladereihenfolge der Content-Scripts steht in `manifest.json` und ist
abhaengigkeitsgetrieben: settings -> converter -> editors -> codedialog ->
editlock -> content.

## Konventionen

- ES5-Stil, `var`, `'use strict'`, keine Module/Bundler, keine Runtime-Deps.
- Wiederverwendbare Module nutzen das UMD-Factory-Pattern (`module.exports` +
  Global): `JiraMarkdown`, `JiraMdSettings`, `JiraEditors`, `JiraCodeDialog`,
  `JiraEditLock`. Neues Modul -> gleiches Muster, sonst laden die Node-Tests es
  nicht. `content.js` ist kein UMD-Modul, sondern eine IIFE.
- Dateinamen klein und ohne Trennzeichen (`codedialog.js`, `editlock.js`).
- Kommentare und UI-Texte auf Deutsch, **ohne Umlaute** (`ue`, `ae`, `oe`, `ss`).
- Leere `catch`-Bloecke sind Absicht (Jira baut das DOM staendig um).
- Neue Erweiterung: Ordner + `manifest.json` + `package.json` mit `lint`/`test`;
  Laufzeitcode getrennt von `test/`, `docs/` (die werden beim Packen entfernt).

## Release

READMEs sind per `.claudeignore` aus dem Standardkontext genommen, weil sie
gross und selten relevant sind - **vor jedem Release aber Pflicht**: gezielt
oeffnen, pruefen, aktualisieren.

1. Version in `manifest.json` und `package.json` synchron anheben.
2. `CHANGELOG.md` um die nutzer-sichtbaren Aenderungen ergaenzen.
3. `jira-markdown-converter/README.md` aktualisieren: neue oder geaenderte
   Funktionen, Einstellungen, Tastenkuerzel, Screenshots in `docs/images/`.
4. Root-`README.md` nur anfassen, wenn eine Erweiterung dazukommt, wegfaellt
   oder ihre Kurzbeschreibung nicht mehr stimmt.
5. `npm run lint` und `npm test` gruen, dann auf `main` - der Workflow
   veroeffentlicht das ZIP unter der rollierenden Release `latest`.
