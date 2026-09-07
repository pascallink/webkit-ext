# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, MV3). **Kein pnpm/turbo/nx**,
kein Workspace-Root, keine gemeinsamen Dependencies. Jeder Top-Level-Ordner mit
`manifest.json` ist ein Projekt mit eigenem `package.json` und eigener
`CLAUDE.md` (max. 40 Zeilen, Vorlage `.github/CLAUDE.template.md`). Vorlage fuer
Ausfuehrungsplaene aus Issues: [`.github/PLAN.template.md`](.github/PLAN.template.md).

## Projekte

| Pfad | Scope | Zweck |
| --- | --- | --- |
| `jira-markdown-converter/` | `jira` | PowerEdit for Jira - Markdown, Vorlagen und Codebloecke in der Ticket-Bearbeitung. |
| `.github/workflows/` | `ci` | Lint + Test, Versionierung, Releases - Details in [`.github/CI.md`](.github/CI.md). |
| Root | `repo` | Metadaten und commitlint, kein Produktivcode. |

## Workspace-Befehle

| Zweck | Befehl |
| --- | --- |
| Install | `npm install --prefix <projekt>` |
| Lint | `npm run lint --prefix <projekt>` |
| Test | `npm test --prefix <projekt>` |
| Commits | `npm install && npm run lint:commits` (prueft `origin/main..HEAD`) |

### CLI & Build-Rules

- **Nie global, immer gefiltert**: ein Task pro Projekt (`--prefix <projekt>`),
  Sammellauf ueber alle Ordner nur vor einem Release.
- Kein turbo/nx, keine Build-Targets - der MV3-Quellcode geht unveraendert raus.
  Kaeme ein Runner dazu: `turbo run <task> --filter=<projekt>` bzw.
  `nx run <projekt>:<task>`. Keine `packages/`-Ebene.

## Repo-Regeln

- Jedes Projekt: `manifest.json`, `package.json` mit `lint` **und** `test`,
  `CLAUDE.md`; Laufzeitcode getrennt von `test/` und `docs/` (fliegen raus).
- Deutsch in Kommentaren und UI-Texten, **ohne Umlaute** (`ue`, `ae`, `oe`).
- Release: Versionen synchron (hebt die CI, nicht die Hand), `CHANGELOG.md` + `README.md` pflegen, gruen nach `main`.
- Store-Einreichung: Unterlagen je Projekt unter `<projekt>/docs/store/`,
  Datenschutz (`PRIVACY.md`) und Lizenz (`LICENSE`) liegen im Root.
- Nach dem Push endet die Arbeit: PR anlegen, Ergebnis melden, fertig. Nicht
  beobachten, nicht nachfassen, nicht anbieten es zu tun - Pascal kommt aktiv
  zurueck, wenn etwas ansteht. Siehe `.github/CI.md`.

## Workflow & QA-Regeln

- **Subtask-Abschluss (Sonnet):** Jede umsetzende Session beendet ihre Arbeit
  verpflichtend mit einem standardisierten Review-Prompt fuer Opus, Form und
  Inhalt gemaess [`.github/PLAN.template.md`](.github/PLAN.template.md).
- **QA & Review (Opus):** Opus fuehrt das Review durch, prueft Code-Logik,
  MV3-Konformitaet, Tests sowie Sicherheit und bewertet den PR.
- **Korrektur-Routing (Opus-Abschluss):** Opus entscheidet am Ende des
  Reviews dynamisch, wie viele Korrektur-Prompts noetig sind (0, 1 oder 2),
  und gibt diese direkt gebrauchsfertig aus.
- **Korrektur-Ausfuehrung:**
  - **Haiku:** verarbeitet Prompts fuer triviale Aufgaben (Linter-Fehler,
    Syntax, Formatierung, Umlaute, reine Doku- oder Typ-Fixes).
  - **Sonnet:** verarbeitet Prompts fuer komplexe Logikfehler,
    Architekturaenderungen, Testanpassungen oder gemischte Korrekturen.

## Test-Kontext-Regeln

Tests liegen je Projekt unter `test/modules/<modul>/`, geteilte Helfer unter
`test/lib/`. Modul-Landkarte und Runner: [`.github/TESTS.md`](.github/TESTS.md).

- **Dateiauswahl:** Bei Bugfix oder Feature nur die Quelldateien des
  betroffenen Moduls, dessen `test/modules/<modul>/` und `test/lib/` oeffnen.
  Fremde Modulordner bleiben zu - auch beim Suchen.
- **Testausfuehrung waehrend der Arbeit:** ausschliesslich
  `npm run test:module <modul> --prefix <projekt>`. Kein Gesamtlauf, um
  zwischendurch zu schauen, ob noch alles gruen ist.
- **PR-Check:** `npm test --prefix <projekt>` und
  `npm run lint --prefix <projekt>` genau einmal, unmittelbar vor dem finalen
  Commit. Rot heisst: zurueck in den Modullauf, nicht in den naechsten
  Gesamtlauf.
- **Neues Modul:** Ordner unter `test/modules/`, Zeile in `.github/TESTS.md`,
  `test:<modul>` in der `package.json`. `test/run.js` findet ihn dann selbst.
- **Kein Modul importiert aus einem fremden Modulordner.** Geteiltes gehoert
  nach `test/lib/`; `package/isolation.test.js` erzwingt das.

## Commit-Konventionen

`<typ>(<scope>): <Betreff im Imperativ, ohne Punkt>`, erzwungen per commitlint
(`.github/workflows/commitlint.yml`).

- Typen: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Scope = Spalte oben; `commitlint.config.js` liest sie aus den Projektordnern
  (Kurzformen dort in `ALIASES`).
- Ein Commit, ein Scope; repoweit `chore(repo):`. Breaking Change fuer Nutzer:
  `feat(jira)!:` plus `CHANGELOG.md`-Eintrag.
- **Header (erste Zeile) streng maximal 72 Zeichen** - `header-max-length` in
  `commitlint.config.js` blockt die CI sonst hart. Betreff im Zweifel kuerzen,
  Details in den Commit-Body.
