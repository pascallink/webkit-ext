# PowerEdit for Jira (`jira-markdown-converter`)

Chrome/Edge-Erweiterung (MV3) **nur fuer Jira Server / Data Center 9.12 LTS (9.12.2)**. Scope: `jira`.

## Befehle

Vom Repo-Root, `<p>` = `jira-markdown-converter`. Kein Build - Laden per `chrome://extensions` -> "Entpackte Erweiterung laden".
- Lint: `npm run lint --prefix <p>` (ESLint ueber `src test popup options`)
- Test: `npm test --prefix <p>`
- Einzeln: `npm run test:node|test:browser|test:<modul> --prefix <p>` (modul: background, content, converter, dialogs, editlock, editors, options, package, popup, settings)
- Module und Testzahlen: [`.github/TESTS.md`](../.github/TESTS.md)
- Browser fuer `test:browser`: **nicht installieren** - `playwright` ist exakt auf die Version des vorinstallierten Chromium gepinnt ([`.github/TESTS.md`](../.github/TESTS.md))

## Tech-Stack-Vorgaben

- **ES5**: `var`, `'use strict'`, kein Bundler, keine Runtime-Deps.
- **UMD-Pflicht** fuer wiederverwendbare Module (`module.exports` + Global):
  `JiraMarkdown`, `JiraMdSettings`, `JiraEditors`, `JiraCodeDialog`,
  `JiraEditLock`, `JiraTemplateDialog` - sonst laden die Node-Tests das Modul nicht.
- `converter.js` bleibt **DOM-frei** - reine Textumwandlung, laeuft in Node.
- Nur die Editoren von 9.12 LTS: `<textarea>` im Wiki-Feld, TinyMCE-Rahmen.
  ProseMirror (Cloud) ist ausser Scope. Erkennung nur in `editors.js`.
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
