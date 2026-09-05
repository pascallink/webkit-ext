# webkit-ext

Monorepo fuer Browser-Erweiterungen (Chrome/Edge, MV3). **Kein pnpm/turbo/nx**,
kein Workspace-Root, keine gemeinsamen Dependencies. Jeder Top-Level-Ordner mit
`manifest.json` ist ein Projekt mit eigenem `package.json` **und eigener
`CLAUDE.md`** (max. 40 Zeilen, Vorlage `.github/CLAUDE.template.md`) - die
Projektdetails stehen dort.

## Projekte

| Pfad | Scope | Zweck |
| --- | --- | --- |
| `jira-markdown-converter/` | `jira` | PowerEdit for Jira - Markdown, Vorlagen und Codebloecke in der Ticket-Bearbeitung. |
| `.github/workflows/` | `ci` | Lint + Test je Projekt, ZIPs in die Release `latest`; Commit-Pruefung. |
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

## CI-Workflows

| Workflow | Trigger | Zweck |
| --- | --- | --- |
| `build-extension.yml` | Push auf `main`, jeder PR | Lint, Test, ZIP je Projekt; auf `main` zusaetzlich Release `latest` |
| `commitlint.yml` | Jeder PR | Prueft die Commit-Konvention |
| `ai-build-checker.yml` | `workflow_run` nach rotem `Build Extensions` | Baut nichts selbst: analysiert das Log des fehlgeschlagenen Jobs und postet es als PR-Kommentar |
| `haiku-pr-summary.yml` | PR `opened`/`reopened`/`ready_for_review` | Schreibt eine generierte Zusammenfassung in den PR-Body |

Die beiden KI-Workflows brauchen das Repository-Secret `ANTHROPIC_API_KEY`.
Gemeinsamer API-Client: `scripts/lib/anthropic.js` - Modell-ID und
Retry-Verhalten stehen dort an *einer* Stelle und gelten fuer beide Skripte.

`ai-build-checker.yml` haengt bewusst als `workflow_run` am Build, statt ihn
ein zweites Mal auszufuehren. Zwei Konsequenzen: Aenderungen daran wirken erst,
wenn sie auf `main` liegen (GitHub nimmt bei `workflow_run` immer die Version
des Default-Branch), und der Lauf traegt ein Token mit Schreibrecht, weshalb
der Kommentar auch bei Fork-PRs funktioniert.

### Action-Versionen

Der Node-20-Runtime entkommt man nicht pauschal ueber eine Major-Nummer:
`upload-artifact@v5` laeuft noch auf Node 20, `checkout@v5` und
`setup-node@v5` nicht. Massgeblich ist `runs.using` in der `action.yml` des
Tags; die Warnung am Ende des Job-Logs nennt die Nachzuegler namentlich.
Stand jetzt: `checkout@v5`, `setup-node@v5`, `upload-artifact@v6`.

## Repo-Regeln

- Jedes Projekt: `manifest.json`, `package.json` mit `lint` **und** `test`,
  `CLAUDE.md`; Laufzeitcode getrennt von `test/` und `docs/` (fliegen raus).
- Deutsch in Kommentaren und UI-Texten, **ohne Umlaute** (`ue`, `ae`, `oe`).
- Release: Versionen synchron, `CHANGELOG.md` + `README.md` pflegen, gruen nach `main`.

## Commit-Konventionen

`<typ>(<scope>): <Betreff im Imperativ, ohne Punkt>`, erzwungen per commitlint
(`.github/workflows/commitlint.yml`).

- Typen: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Scope = Spalte oben; `commitlint.config.js` liest sie aus den Projektordnern
  (Kurzformen dort in `ALIASES`).
- Ein Commit, ein Scope; repoweit `chore(repo):`. Breaking Change fuer Nutzer:
  `feat(jira)!:` plus `CHANGELOG.md`-Eintrag.

## Hinweis fuer Claude

Bei einem fehlgeschlagenen CI-Lauf im PR **nicht** die Workflow-Runs pollen und
nicht mit `sleep` auf Ergebnisse warten. `ai-build-checker.yml` postet die
Fehleranalyse samt Log-Auszug von selbst als PR-Kommentar; das vollstaendige
Log haengt am Lauf. Lies den Kommentar, statt den Lauf zu beobachten.

Das entbindet nicht von der Arbeit: Ein roter PR bleibt zu reparieren, und die
Analyse ist vom Modell erzeugt und ungeprueft - sie ist ein Hinweis auf die
Ursache, kein Nachweis. Vor dem Push weiterhin `npm run lint --prefix <projekt>`
und `npm test --prefix <projekt>` laufen lassen.
