# CI, Versionierung und Releases

Ausgelagert aus der Root-`CLAUDE.md`: diese Details braucht man beim Arbeiten
an der CI, nicht in jeder Sitzung.

## CI-Workflows

| Workflow | Trigger | Zweck |
| --- | --- | --- |
| `build-extension.yml` | Push auf `main`, jeder PR | Install, Lint, Test je Projekt - **keine ZIPs** |
| `version-bump.yml` | Push auf `main` | Hebt die Patch-Stelle beruehrter Projekte an und schreibt sie zurueck |
| `release.yml` | Release `published` | Baut die ZIPs, aber nur bei einer neuen Minor-Version `x.y.0` |
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

### Versionen und Releases

Die Version steht je Projekt doppelt: `manifest.json` **und** `package.json`
(plus `package-lock.json`, dort an zwei Stellen). `scripts/bump-patch.js`
haelt alle drei synchron - nie einzeln von Hand anfassen.

- **Patch (`z`)**: automatisch nach jedem Merge auf `main`, nur fuer Projekte,
  deren Dateien der Push beruehrt hat. Der Bump-Commit traegt `[skip ci]`.
  Hat der Push die Version selbst geaendert, bumpt nichts nach.
- **Minor (`y`)**: von Hand auf `x.y.0` setzen, taggen, Release anlegen. Erst
  das erzeugt ZIPs, und zwar als `<projekt>-<version>.zip`.
- **Direktlink ohne Version** ist die Ausnahme, nicht die Regel: nur Projekte
  mit `"stableZipAlias": true` in ihrer `package.json` bekommen zusaetzlich
  ein `<projekt>.zip`, das `/releases/latest/download/<projekt>.zip` bedient.
  Gesetzt ist das aktuell nur bei `jira-markdown-converter`, dessen alte Links
  im Umlauf sind. Neue Projekte verlinken die Release-Uebersicht.
- Die rollierende Release `latest` ist Geschichte: sie ist immutable, ihre
  Assets lassen sich nicht mehr ersetzen. Deshalb `/releases/latest/download/`
  statt `/releases/download/latest/`.

### Action-Versionen

Der Node-20-Runtime entkommt man nicht pauschal ueber eine Major-Nummer:
`upload-artifact@v5` laeuft noch auf Node 20, `checkout@v5` und
`setup-node@v5` nicht. Massgeblich ist `runs.using` in der `action.yml` des
Tags; die Warnung am Ende des Job-Logs nennt die Nachzuegler namentlich.
Stand jetzt in Benutzung: `checkout@v5`, `setup-node@v5`,
`softprops/action-gh-release@v2` (laeuft bereits auf Node 24). Fuer
`upload-artifact` waere `v6` der erste taugliche Major - `v5` nicht.

## Hinweis fuer Claude

Bei einem fehlgeschlagenen CI-Lauf im PR **nicht** die Workflow-Runs pollen und
nicht mit `sleep` auf Ergebnisse warten. `ai-build-checker.yml` postet die
Fehleranalyse samt Log-Auszug von selbst als PR-Kommentar; das vollstaendige
Log haengt am Lauf. Lies den Kommentar, statt den Lauf zu beobachten.

Das entbindet nicht von der Arbeit: Ein roter PR bleibt zu reparieren, und die
Analyse ist vom Modell erzeugt und ungeprueft - sie ist ein Hinweis auf die
Ursache, kein Nachweis. Vor dem Push weiterhin `npm run lint --prefix <projekt>`
und `npm test --prefix <projekt>` laufen lassen.
