# PowerEdit for Jira (`jira-markdown-converter`)

Chrome/Edge-Erweiterung (MV3) **nur fuer Jira Server / Data Center 9.12 LTS (9.12.2)**. Scope: `jira`.

## Befehle

Vom Repo-Root, `<p>` = `jira-markdown-converter`. Kein Build - Laden per `chrome://extensions` -> "Entpackte Erweiterung laden".
- Lint: `npm run lint --prefix <p>` (ESLint ueber `src test popup options`)
- Test: `npm test --prefix <p>`
- Einzeln: `npm run test:node|test:browser|test:<modul> --prefix <p>` (modul: background, content, converter, dialogs, editlock, editors, ext, options, otrs, package, popup, settings)
- Browser-Tests: **nicht installieren** - `playwright` exakt auf Version des Chromium gepinnt ([`.github/TESTS.md`](../.github/TESTS.md))

## Tech-Stack-Vorgaben

- **ES5**: `var`, `'use strict'`, kein Bundler, keine Runtime-Deps.
- **UMD-Pflicht** fuer wiederverwendbare Module (`module.exports` + Global):
  `JiraMarkdown`, `JiraMdSettings`, `JiraEditors`, `JiraCodeDialog`,
  `JiraEditLock`, `JiraTemplateDialog`, `JiraOtrsLink`, `JiraUi`,
  `JiraOtrsFlow`, `JiraOtrsDialog` - sonst laden die Node-Tests das Modul nicht.
- `converter.js` bleibt **DOM-frei** - reine Textumwandlung, laeuft in Node.
- Nur 9.12 LTS: `<textarea>` Wiki-Feld, TinyMCE-Rahmen (nicht ProseMirror/Cloud).
- Leere `catch`-Bloecke sind Absicht: Jira baut das DOM staendig um.
- Content-Datei in `manifest.json`, Reihenfolge: `settings.js` → `content.js`.

## Struktur

| Pfad | Rolle |
| --- | --- |
| `manifest.json` | Permissions, Ladereihenfolge, Shortcut `Ctrl+Shift+M`. |
| `src/content.js` | Haupteinstieg im Tab (IIFE, Guard `__jiraMarkdownConverterLoaded`). |
| `src/converter.js` | `markdownToJira()` - Kern der Umwandlung. |
| `src/editors.js` | Felderkennung und Schreibzugriff. |
| `src/codedialog.js`, `src/templatedialog.js`, `src/editlock.js` | Dialog Code, Vorlage, Bearbeitung offen. |
| `src/settings.js` | Defaults + `chrome.storage` fuer alle Kontexte. |
| `src/background.js` | Service-Worker: Shortcut, Kontextmenue, Hosts. |
| `src/otrs*.js` | OTRS-Parser, Link-Dialog, Flow, UI-Dialog – fertig, nicht verdrahtet (#113). |
| `popup/`, `options/` | UI-Seiten. |
| `test/` | `test/run.js` - Module in `test/modules/<modul>/` (Node + `browser/` Playwright). |
| `docs/store/` | Store-Unterlagen: Texte, Gruende, Bilder. |
