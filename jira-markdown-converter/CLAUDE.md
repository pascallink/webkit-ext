# PowerEdit for Jira (`jira-markdown-converter`)

Chrome/Edge-Erweiterung (MV3) fuer die Jira-Ticket-Bearbeitung. Scope: `jira`.

## Befehle

Vom Repo-Root, `<p>` = `jira-markdown-converter`. Kein Build - Laden per
`chrome://extensions` -> "Entpackte Erweiterung laden".
- Lint: `npm run lint --prefix <p>` (ESLint ueber `src test popup options`)
- Test: `npm test --prefix <p>`
- Einzeln: `npm run test:node|test:browser|test:<modul> --prefix <p>` (modul: content, converter, dialogs, editlock, editors, options, package, settings)
- Browser fuer `test:browser`: `npx --prefix <p> playwright install chromium` (CHROMIUM_PATH setzt Pfad bei Bedarf)

## Tech-Stack-Vorgaben

- **ES5**: `var`, `'use strict'`, kein Bundler, keine Runtime-Deps.
- **UMD-Pflicht** fuer wiederverwendbare Module (`module.exports` + Global):
  `JiraMarkdown`, `JiraMdSettings`, `JiraEditors`, `JiraCodeDialog`,
  `JiraEditLock`, `JiraTemplateDialog` - sonst laden die Node-Tests das Modul nicht.
- `converter.js` bleibt **DOM-frei** - reine Textumwandlung, laeuft in Node.
- Drei Editorvarianten immer mitdenken: `<textarea>` (Server/DC),
  ProseMirror (Cloud), CodeMirror/Ace. Erkennung nur in `editors.js`.
- Leere `catch`-Bloecke sind Absicht: Jira baut das DOM staendig um.
- Neue Content-Script-Datei in `manifest.json` eintragen; die Reihenfolge dort
  ist abhaengigkeitsgetrieben: `settings.js` zuerst, `content.js` zuletzt.

## Struktur

| Pfad | Rolle |
| --- | --- |
| `manifest.json` | Permissions, Ladereihenfolge, Shortcut `Ctrl+Shift+M`. |
| `src/content.js` | Haupteinstieg im Tab (IIFE, Guard `__jiraMarkdownConverterLoaded`). |
| `src/converter.js` | `markdownToJira()` - Kern der Umwandlung. |
| `src/editors.js` | Felderkennung und Schreibzugriff. |
| `src/codedialog.js`, `src/templatedialog.js`, `src/editlock.js` | Code-Dialog (umgeht Parser), Dialog fuer Platzhalterwerte, Bearbeitung offen. |
| `src/settings.js` | Defaults + `chrome.storage` fuer alle Kontexte. |
| `src/background.js` | Service-Worker: Shortcut, Kontextmenue, Hosts. |
| `popup/`, `options/` | UI-Seiten. |
| `test/` | `test/run.js` - Module in `test/modules/<modul>/` (Node + `browser/` Playwright), Helfer+Mocks in `test/lib/`+`fixtures/`. |
| `docs/store/` | Store-Einreichung: Texte, Berechtigungsgruende, Bilder (`npm run store:assets`). |
