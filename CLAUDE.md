# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, Manifest V3).

**Kein pnpm/turbo/nx** - kein Workspace-Root, keine gemeinsamen Deps. Jeder
Top-Level-Ordner mit `manifest.json` ist ein eigenstaendiges Projekt mit eigenem
`package.json`; `.github/workflows/build-extension.yml` findet sie generisch und
baut jedes einzeln. Neue Erweiterung = neuer Ordner, keine Workflow-Aenderung.

## Workspace-Befehle

Immer mit `--prefix <projekt>` vom Root aus - nie in den Ordner wechseln:

| Zweck | Befehl |
| --- | --- |
| Install | `npm install --prefix <projekt>` |
| Lint | `npm run lint --prefix <projekt>` |
| Test (alle) | `npm test --prefix <projekt>` |
| Einzelsuite | `npm run test:unit --prefix <projekt>` (auch `test:settings`, `test:package`, `test:integration`) |
| Browser fuer Integration | `npx --prefix <projekt> playwright install chromium` |
| Alle Projekte | `for d in */; do [ -f "$d/manifest.json" ] && npm run lint --prefix "$d" && npm test --prefix "$d"; done` |

Kein Build-Schritt - der Quellcode ist die Auslieferung. Lokal laden ueber
`chrome://extensions` -> "Entpackte Erweiterung laden" -> Projektordner.

## Repository-Landkarte

| Pfad | Commit-Scope | Zweck |
| --- | --- | --- |
| `jira-markdown-converter/` | `jira` | PowerEdit for Jira: Markdown-Support, Formatierungsvorlagen und Codebloecke in der Jira-Ticket-Bearbeitung. |
| `.github/workflows/` | `ci` | Findet jede Erweiterung, laesst lint + test laufen, packt ZIPs in die rollierende Release `latest`. |
| `package.json`, `README.md` (Root) | `repo` | Reine Repo-Metadaten, kein Code. Root hat keine Dependencies. |

Es gibt bewusst **keine** `packages/`-Ebene: gemeinsamer Code wird erst
extrahiert, wenn eine zweite Erweiterung ihn wirklich braucht.

### Module in `jira-markdown-converter/`

| Datei | Zweck |
| --- | --- |
| `src/converter.js` | `markdownToJira()`, reine Textumwandlung, **kein DOM** - laeuft in Node und im Browser. |
| `src/editors.js` | Erkennt die Jira-Eingabefelder: `<textarea>` (Server/DC), ProseMirror (Cloud), CodeMirror/Ace. |
| `src/content.js` | Einstieg im Tab, baut die Bedienelemente ein. IIFE mit Guard `window.__jiraMarkdownConverterLoaded`. |
| `src/codedialog.js` | Dialog "Code einfuegen"; Code umgeht den Markdown-Parser. |
| `src/editlock.js` | Haelt Jiras Inline-Bearbeitung offen (Schloss-Button). |
| `src/settings.js` | Gemeinsame Defaults und Storage-Zugriffe fuer alle Kontexte. |
| `src/background.js` | Service-Worker: Tastenkuerzel, Kontextmenue, weitere Jira-Hosts. Laedt per `importScripts`. |
| `popup/`, `options/` | UI-Seiten, konsumieren `settings.js` + `converter.js`. |
| `test/` | Eigene Node-Runner ohne Framework, Fixtures in `test/fixtures/`. |

Ladereihenfolge der Content-Scripts steht in `manifest.json` und ist
abhaengigkeitsgetrieben: settings -> converter -> editors -> codedialog ->
editlock -> content.

## Scope-Konventionen

Commits folgen Conventional Commits mit **Pflicht-Scope** aus der Landkarte:

```
<typ>(<scope>): <Betreff im Imperativ, klein, ohne Punkt>
```

- Typen: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Scope = Spalte "Commit-Scope" oben. Neues Projekt -> neue Zeile in der
  Landkarte, Scope ist der Ordnername ohne Suffix.
- Ein Commit, ein Scope. Betrifft eine Aenderung zwei Projekte, wird sie
  aufgeteilt - Ausnahme: `chore(repo):` fuer echte repoweite Umbauten.
- Breaking Change fuer Nutzer der Erweiterung: `!` vor dem Doppelpunkt
  (`feat(jira)!: ...`) plus Eintrag in `CHANGELOG.md`.

Beispiele: `feat(jira): Codeblock-Dialog um Sprachwahl erweitern`,
`fix(ci): Download-Link auf feste Tag-URL umstellen`, `chore(repo): .claudeignore ergaenzen`.

Die Historie vor dieser Regel ist unscoped - nicht nachtraeglich umschreiben.

## Code-Konventionen

- ES5-Stil, `var`, `'use strict'`, keine Bundler, keine Runtime-Dependencies.
- Wiederverwendbare Module nutzen UMD (`module.exports` + Global):
  `JiraMarkdown`, `JiraMdSettings`, `JiraEditors`, `JiraCodeDialog`,
  `JiraEditLock`. Ohne dieses Muster laden die Node-Tests das Modul nicht.
- Dateinamen klein und ohne Trennzeichen (`codedialog.js`, `editlock.js`).
- Kommentare und UI-Texte auf Deutsch, **ohne Umlaute** (`ue`, `ae`, `oe`, `ss`).
- Leere `catch`-Bloecke sind Absicht (Jira baut das DOM staendig um).

## Release

READMEs sind gross und selten noetig - nicht ungefragt einlesen, vor einem
Release aber Pflicht.

1. Version in `manifest.json` und `package.json` synchron anheben.
2. `CHANGELOG.md` um die nutzer-sichtbaren Aenderungen ergaenzen.
3. Projekt-`README.md` aktualisieren: Funktionen, Einstellungen, Tastenkuerzel,
   Screenshots in `docs/images/`.
4. Root-`README.md` nur bei neuer/entfallener Erweiterung anfassen.
5. Lint und Tests gruen, dann auf `main` - die CI veroeffentlicht das ZIP.
