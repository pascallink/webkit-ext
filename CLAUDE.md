# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, Manifest V3). **Kein
pnpm/turbo/nx**, kein Workspace-Root, keine gemeinsamen Dependencies.

Jeder Top-Level-Ordner mit `manifest.json` ist ein eigenes Projekt mit eigenem
`package.json` **und eigener `CLAUDE.md`** (max. 40 Zeilen: lokale Befehle,
Tech-Stack, Einstiegspunkte). Projektdetails stehen dort, nicht hier. Die CI
findet neue Projekte generisch - ein neuer Ordner braucht nur eine Zeile unten.

## Projekte

| Pfad | Scope | Zweck |
| --- | --- | --- |
| `jira-markdown-converter/` | `jira` | PowerEdit for Jira - Markdown, Vorlagen und Codebloecke in der Ticket-Bearbeitung. |
| `.github/workflows/` | `ci` | Lint + Test je Projekt, packt ZIPs in die rollierende Release `latest`. |
| Root | `repo` | Nur Metadaten, keine Dependencies. |

## Workspace-Befehle

Vom Root aus mit `--prefix`, nie in den Ordner wechseln:

| Zweck | Befehl |
| --- | --- |
| Install | `npm install --prefix <projekt>` |
| Lint | `npm run lint --prefix <projekt>` |
| Test | `npm test --prefix <projekt>` |
| Alle | `for d in */; do [ -f "$d/manifest.json" ] && npm run lint --prefix "$d" && npm test --prefix "$d"; done` |

Kein Build-Schritt - der Quellcode ist die Auslieferung. Keine `packages/`-Ebene:
gemeinsamer Code wird erst extrahiert, wenn ihn ein zweites Projekt braucht.

## Repo-Regeln

- Jedes Projekt: `manifest.json`, eigenes `package.json` mit `lint` **und**
  `test`, `CLAUDE.md`. Laufzeitcode getrennt von `test/` und `docs/` - beide
  werden beim Packen entfernt.
- Deutsch in Kommentaren und UI-Texten, **ohne Umlaute** (`ue`, `ae`, `oe`, `ss`).
- Release: Version in `manifest.json` + `package.json` synchron, `CHANGELOG.md`
  und Projekt-`README.md` pflegen, lint/test gruen, dann `main`. READMEs sind
  gross - nur fuer Releases oeffnen.

## Commit-Konventionen

`<typ>(<scope>): <Betreff im Imperativ, klein, ohne Punkt>`

- Typen: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Scope = Spalte oben; neues Projekt = neue Zeile, Scope ist der Ordnername.
- Ein Commit, ein Scope. Repoweite Umbauten: `chore(repo):`.
- Breaking Change fuer Nutzer: `feat(jira)!:` plus `CHANGELOG.md`-Eintrag.
- Historie vor dieser Regel ist unscoped - nicht umschreiben.
