# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, MV3). **Kein pnpm/turbo/nx**,
kein Workspace-Root, keine gemeinsamen Dependencies. Jeder Top-Level-Ordner mit
`manifest.json` ist ein eigenes Projekt mit eigenem `package.json` **und eigener
`CLAUDE.md`** (max. 40 Zeilen, Vorlage: `.github/CLAUDE.template.md`).
Projektdetails stehen dort, nicht hier; die CI findet neue Ordner von selbst.

## Projekte

| Pfad | Scope | Zweck |
| --- | --- | --- |
| `jira-markdown-converter/` | `jira` | PowerEdit for Jira - Markdown, Vorlagen und Codebloecke in der Ticket-Bearbeitung. |
| `.github/workflows/` | `ci` | Lint + Test je Projekt, ZIPs in die Release `latest`; Commit-Pruefung. |
| Root | `repo` | Metadaten und commitlint, kein Produktivcode. |

## Workspace-Befehle

Vom Root aus mit `--prefix`, nie in den Ordner wechseln:

| Zweck | Befehl |
| --- | --- |
| Install | `npm install --prefix <projekt>` |
| Lint | `npm run lint --prefix <projekt>` |
| Test | `npm test --prefix <projekt>` |
| Alle | `for d in */; do [ -f "$d/manifest.json" ] && npm run lint --prefix "$d" && npm test --prefix "$d"; done` |
| Commits | `npm install && npm run lint:commits` (prueft `origin/main..HEAD`) |

Kein Build - der Quellcode ist die Auslieferung. Keine `packages/`-Ebene:
gemeinsamer Code wird erst extrahiert, wenn ihn ein zweites Projekt braucht.

## Repo-Regeln

- Jedes Projekt: `manifest.json`, `package.json` mit `lint` **und** `test`,
  `CLAUDE.md`. Laufzeitcode getrennt von `test/` und `docs/` (fliegen raus).
- Deutsch in Kommentaren und UI-Texten, **ohne Umlaute** (`ue`, `ae`, `oe`).
- Release: Version in `manifest.json` + `package.json` synchron, `CHANGELOG.md`
  und Projekt-`README.md` pflegen, lint/test gruen, dann `main`.

## Commit-Konventionen

`<typ>(<scope>): <Betreff im Imperativ, ohne Punkt>` - erzwungen per commitlint
(`.github/workflows/commitlint.yml`).

- Typen: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Scope = Spalte oben. `commitlint.config.js` liest sie aus den Projektordnern;
  Kurzformen stehen dort in `ALIASES`.
- Ein Commit, ein Scope. Repoweite Umbauten: `chore(repo):`.
- Breaking Change fuer Nutzer: `feat(jira)!:` plus `CHANGELOG.md`-Eintrag.
- Historie vor dieser Regel ist unscoped - nicht umschreiben.
