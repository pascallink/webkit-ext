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
- **Releases nur auf `x.y.0`.** `release.yml` bricht bei jedem anderen Tag mit
  einem Fehler ab - absichtlich laut. Ein Release ohne Assets wird zum
  neuesten Release, und danach laeuft `/releases/latest/download/...` ins
  Leere. Wer trotzdem eines braucht, markiert es als Prerelease; dann zieht
  GitHub es nicht als "latest" heran.
- **Versions-Drift**: weichen `manifest.json` und `package.json` voneinander
  ab, bricht der Release-Build ab. Passt die Version nicht zum Release-Tag,
  gibt es nur eine Warnung - bei mehreren Projekten kann ein Tag nicht fuer
  alle stimmen.
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

**Ein gepushter PR ist erledigt.** Der Auftrag endet mit dem Push und der
Meldung, was drin ist. Danach:

- keine Workflow-Runs pollen, kein `sleep`, keine Selbst-Termine, kein
  Abonnieren von PR-Ereignissen;
- nicht fragen, ob du den PR beobachten, CI reparieren oder auf Review-
  Kommentare antworten sollst. Die Frage kostet Token und die Antwort ist
  immer dieselbe.

Pascal liest den PR selbst und kommt aktiv zurueck, wenn etwas zu tun ist.
Erst dann wird gearbeitet - und nur an dem, was er nennt.

Kommt er wegen eines roten Laufs zurueck: `ai-build-checker.yml` hat die
Fehleranalyse samt Log-Auszug bereits als PR-Kommentar hinterlegt, das
vollstaendige Log haengt am Lauf. Den Kommentar lesen, statt den Lauf zu
beobachten. Die Analyse ist vom Modell erzeugt und ungeprueft - ein Hinweis auf
die Ursache, kein Nachweis.

Was das nicht aufweicht: Vor jedem Push `npm run lint --prefix <projekt>` und
`npm test --prefix <projekt>` laufen lassen. Gruen wird vor dem Push
hergestellt, nicht danach.
