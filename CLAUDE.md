# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, MV3). **Kein pnpm/turbo/nx**,
kein Workspace-Root, keine gemeinsamen Dependencies. Jeder Top-Level-Ordner mit
`manifest.json` ist ein Projekt mit eigenem `package.json` und eigener
`CLAUDE.md` (max. 40 Zeilen, Vorlage `.github/CLAUDE.template.md`).

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
- Roter CI-Lauf: nicht pollen, nicht mit `sleep` warten - die Analyse kommt als PR-Kommentar. Siehe `.github/CI.md`.

## Commit-Konventionen

`<typ>(<scope>): <Betreff im Imperativ, ohne Punkt>`, erzwungen per commitlint
(`.github/workflows/commitlint.yml`).

- Typen: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Scope = Spalte oben; `commitlint.config.js` liest sie aus den Projektordnern
  (Kurzformen dort in `ALIASES`).
- Ein Commit, ein Scope; repoweit `chore(repo):`. Breaking Change fuer Nutzer:
  `feat(jira)!:` plus `CHANGELOG.md`-Eintrag.
