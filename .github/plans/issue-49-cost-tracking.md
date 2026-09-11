# Ausfuehrungsplan Issue #49 - Cost-Tracking

Session-Kosten je Branch erfassen, beim Merge verbuchen, taeglich reporten.
Verbindliche Grundlage fuer die Sub-Task-Sessions 1 bis 4. Ergaenzend gelten
`CLAUDE.md` im Root und [`.github/CI.md`](../CI.md).

## Context

Heute kostet jede Claude-Session Geld, aber niemand sieht wie viel - weder pro
Commit noch pro PR. `.claude/` existiert im Repo nicht, `stats/` auch nicht,
und `scripts/lib/anthropic.js` wirft `data.usage` der beiden KI-Workflows weg.

Ziel: Kosten je Session automatisch sammeln, beim Merge je Branch aggregieren
und taeglich reporten - inklusive Aufraeumen, ohne dass jemand daran denken muss.

**Stand bei Planerstellung:** Issue #49 angelegt, im Repo liegt noch nichts
davon. Der Plan folgt den Workflow-Vorgaben aus `CLAUDE.md` (Session-Abschluss
mit Review-Prompt fuer Opus, Korrektur-Routing Haiku/Sonnet) und enthaelt am
Ende alle gebrauchsfertigen Prompts.

### Technische Vorentscheidung (recherchiert, nicht geraten)

- **Hook-Payloads enthalten keine Kosten.** Claude-Code-Hooks bekommen
  `session_id`, `transcript_path`, `cwd` - aber kein `cost`-Feld.
- **Das Transcript-JSONL enthaelt keine USD, aber alles zum Rechnen**: pro
  `assistant`-Zeile `message.model`, `message.usage` (`input_tokens`,
  `output_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_5m/1h`,
  `speed`), dazu `sessionId`, `gitBranch`, `requestId`. Subagenten liegen unter
  `<session>/subagents/*.jsonl`.
- **Konsequenz:** Tokens werden lokal gegen eine versionierte Preistabelle
  gerechnet. Kein Modellaufruf, kein Token-Verbrauch, laeuft in TUI, headless
  und in Claude Code on the web.
- Der Wert ist eine **Schaetzung zu Listenpreisen** - wie `/usage`, nicht wie
  die Rechnung. Das gehoert in die Doku, nicht in eine Fussnote.

---

## Deliverables

### 1. Collector: `scripts/costs-update.mjs` (Node, keine Dependencies)

Aufloesung der Session, in dieser Reihenfolge:

1. JSON auf stdin (Claude-Code-Hook) -> `session_id`, `transcript_path`, `cwd`
2. `--transcript <pfad>` (manuell/Test)
3. Neuestes Transcript unter `~/.claude/projects/<cwd-slug>/*.jsonl`
   (Slug = absoluter Pfad, `/` -> `-`) - der Weg des git-Hooks

Ablauf:

- Transcript + `<session>/subagents/*.jsonl` zeilenweise streamen.
- Nur `type === "assistant"` mit `message.usage`; **Dedupe ueber
  `requestId` + `message.id`** (Retries/Streaming erzeugen Doppel).
- Tokens je `message.model` summieren, dann gegen `stats/pricing.json`
  verrechnen: `input`, `output`, `cache_write_5m`, `cache_write_1h`,
  `cache_read`. `usage.speed === "fast"` nutzt den `fast`-Satz, falls gesetzt.
- Unbekanntes Modell: mit 0 werten, Warnung auf stderr, **nie hart failen** -
  ein Hook darf einen Commit nicht blockieren.
- Branch: `git branch --show-current`; leer (detached HEAD) -> sauberer Exit 0.
- Upsert in `stats/costs.csv` auf `(branch, session_id)`, `updated_at` als
  ISO-8601-UTC, `cost_usd` auf 4 Stellen. Header immer anlegen. Zeilen
  deterministisch nach `branch,session_id` sortiert, atomar via `.tmp` + rename.

Format wie vorgegeben:

```
branch,session_id,updated_at,cost_usd
feature/login,sess_12345,2026-09-06T14:20:00Z,0.1420
```

Zusaetzlich schreibt derselbe Lauf die Modell-Ebene nach `stats/tokens.csv` -
`costs.csv` bleibt damit exakt im vorgegebenen 4-Spalten-Format, und der
Tagesreport kann trotzdem nach Modell gruppieren:

```
branch,session_id,model,input,output,cache_read,cache_write,cost_usd
feature/login,sess_12345,claude-opus-5,12000,3400,180000,42000,0.1420
```

Upsert-Schluessel hier: `(branch, session_id, model)`. Die Summe der
`cost_usd` je Session ist per Konstruktion die Zeile in `costs.csv`.

### 2. `stats/pricing.json` - Preistabelle (USD je 1M Token)

Listenpreise, mit Quelle und Stand im `_meta`-Feld. Startwerte:

| Modell | input | output | cache_read | cache_write_5m | cache_write_1h |
| --- | --- | --- | --- | --- | --- |
| `claude-opus-5` | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| `claude-sonnet-5` | 2.00 | 10.00 | 0.20 | 2.50 | 4.00 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 0.10 | 1.25 | 2.00 |
| `claude-fable-5-1` | 10.00 | 50.00 | 0.25 | 12.50 | 20.00 |

Cache-Saetze folgen den ueblichen Multiplikatoren (0.1x / 1.25x / 2x); Fable 5.1
liest Cache zum Sonderpreis 0.25 - deshalb Tabelle statt Formel.
Optionaler `fast`-Block fuer Opus 5 (10.00 / 50.00).

### 3. `.gitattributes` (neu, Root)

```
stats/costs.csv merge=union
stats/tokens.csv merge=union
stats/history.csv merge=union
stats/report.html -diff
```

Ohne das kollidieren zwei parallele Branches, die beide eine Zeile anhaengen,
bei jedem Merge. Der Aggregator dedupliziert danach auf `(branch, session_id)`
und behaelt das juengste `updated_at` - Union-Merge ist damit unkritisch.

### 4. Hooks - zwei Ausloeser, ein Skript

**a) Claude-Code-Hook**, `.claude/settings.json` (neu):

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command",
        "command": "node \"$CLAUDE_PROJECT_DIR/scripts/costs-update.mjs\"" } ] }
    ]
  }
}
```

Haelt die CSV am Ende jedes Turns aktuell. Claude Code fragt einmalig nach
Freigabe der Projekt-Hooks - das gehoert in die Doku.

**b) Git-Hook**, `.githooks/pre-commit` (neu, ausfuehrbar):

```sh
#!/bin/sh
node "$(git rev-parse --show-toplevel)/scripts/costs-update.mjs" || exit 0
git add stats/costs.csv 2>/dev/null || true
```

Damit ist die CSV **zum Commit-Zeitpunkt** frisch und mit im Commit - egal ob
Claude oder Pascal committet. Aktivierung einmalig per
`npm run hooks:install` (Root-Script: `git config core.hooksPath .githooks`).
`|| exit 0` ist Absicht: Kostenerfassung blockiert nie einen Commit.

### 5. Tests + CI-Anbindung

- `scripts/test/costs-update.test.mjs` mit `node:test`: Fixture-Transcript in
  einem Temp-Verzeichnis - Neuanlage der CSV, Update einer bestehenden Zeile,
  Dedupe doppelter `requestId`, unbekanntes Modell, Subagenten-Summierung,
  detached HEAD.
- Root-`package.json`: `"test": "node --test scripts/test"`,
  `"hooks:install": "git config core.hooksPath .githooks"`.
- `.github/workflows/build-extension.yml`: Step "Root-Skripte testen"
  (`npm ci && npm test` im Root) - der bestehende Loop sieht nur Ordner mit
  `manifest.json`, `scripts/` liefe sonst ungetestet.

### 6. `.github/workflows/cost-report.yml` (neu) - zwei Jobs

**Job `aggregate`** - `pull_request: [closed]`, `if: merged == true`.
Die Logik steckt in `scripts/costs-merge.mjs` (Node, testbar), nicht in
awk-Zeilen im YAML:

1. Summe aller Zeilen mit `$1 == github.head_ref` aus `stats/costs.csv`
   (Dedupe auf `(branch, session_id)`, juengstes `updated_at` gewinnt),
   Modellsummen aus `stats/tokens.csv`.
2. Job Summary + ein PR-Kommentar (mit der Attribution-Fussnote).
2a. **PR-Beschreibung patchen** - Markerblock analog `pr-summary.js`:

```
<!-- cost-summary:start -->
### Kosten dieses PR

**$0.1420** aus 3 Sessions - claude-opus-5 $0.1180, claude-haiku-4-5 $0.0240.
<!-- cost-summary:end -->
```

    Block wird ersetzt statt angehaengt, damit ein zweiter Lauf nichts doppelt.
    Nennt der PR-Body `Closes|Fixes|Resolves #N`, bekommt **auch das Issue**
    denselben Block in seine Beschreibung - so steht die Zahl dort, wo das
    Feature beschrieben ist.
2b. **Changelog** - je Projekt, dessen Dateien der PR angefasst hat (Top-Level-
    Ordner mit `manifest.json`), eine Zeile unter `## [Unveroeffentlicht]` in
    einem eigenen Abschnitt `### Kosten`:
    `- PR #44 "Vorlagen-Editor": $0.1420 (3 Sessions, claude-opus-5)`.
    Der Abschnitt wird angelegt, falls er fehlt; die kuratierten Abschnitte
    (Hinzugefuegt/Geaendert/Behoben/Entfernt) werden **nicht** angefasst.
    Beruehrt der PR kein Projekt (reine `repo`/`ci`-Aenderung), entfaellt der
    Changelog-Eintrag - PR- und Issue-Body werden trotzdem gepatcht.
3. Anhaengen an `stats/history.csv` (append-only):
   `branch,pr,merged_at,total_usd,sessions,reason` mit `reason=merged`;
   die Modellsummen des Branches gehen nach `stats/history-models.csv`
   (`merged_at,branch,model,input,output,cache_read,cache_write,cost_usd`),
   damit der Report auch nach dem Aufraeumen noch je Modell gruppieren kann.
4. Zeilen des Branches aus `costs.csv` **und** `tokens.csv` entfernen.
5. Commit als `github-actions[bot]` (CSVs **und** die geaenderte
   `CHANGELOG.md`), `chore(repo): kosten des gemergten branches verbuchen
   [skip ci]`, Push auf `main` mit `git pull --rebase` und bis zu 3 Versuchen.

**Wiederverwendung:** `scripts/pr-summary.js` beherrscht das Patchen eines
Markerblocks im PR-Body bereits (`MARKER_START`/`MARKER_END`,
`mergeIntoBody`, PATCH ueber die GitHub-API). Diese Logik wandert nach
`scripts/lib/github.js` (`mergeIntoBody(body, block, marker)`, `patchBody`,
`comment`) und wird von beiden Skripten genutzt - `pr-summary.js` verhaelt
sich danach unveraendert, das sichern die Tests ab.

**Job `daily`** - `schedule: cron "0 0 * * *"` (Mitternacht UTC) +
`workflow_dispatch`:

1. `node scripts/costs-report.mjs` liest `costs.csv`, `tokens.csv`,
   `history.csv`, `history-models.csv` und schreibt **`stats/report.html`**:
   - Kopfzeile mit Erzeugungszeitpunkt (ISO-UTC) und Gesamtsumme
   - Tabelle **je Modell**: Modell, Input, Output, Cache-Read, Cache-Write,
     Sessions, Kosten USD, Anteil in Prozent
   - Tabelle **je Branch**: Branch, Sessions, Modelle, letzte Aktivitaet,
     Kosten USD - offene Branches oben, gemergte darunter
   - Trend: gestern / 7 Tage / 30 Tage aus der Historie
   - Design: **eingebettetes CSS im `<style>`-Block**, keine externen Assets,
     keine Fonts von Drittservern (Systemschriften), Zahlen rechtsbuendig und
     tabellarisch (`font-variant-numeric: tabular-nums`), Zebra-Streifen,
     `prefers-color-scheme` fuer Dark Mode. Eine Datei, offline lesbar.
   - Der Report ist ein reines Artefakt: er wird bei jedem Lauf komplett neu
     erzeugt, nie inkrementell fortgeschrieben.
2. Dieselbe Datei zusaetzlich als Workflow-Artefakt
   (`actions/upload-artifact@v6` - `v5` laeuft noch auf Node 20, siehe CI.md).
3. Aufraeumen: Zeilen, deren Branch am Remote nicht mehr existiert **oder**
   deren `updated_at` aelter als 30 Tage ist, wandern mit `reason=abandoned`
   nach `history.csv`/`history-models.csv` und fallen aus `costs.csv` und
   `tokens.csv`.
4. Commit + Push wie oben (`report.html` inklusive), `[skip ci]`; kein Commit
   bei leerem Diff.

Kein Mailversand: der Report liegt versioniert unter `stats/report.html` im
Repo und wird von Pascals eigenem Skript gelesen. Damit braucht der Workflow
keine SMTP-Secrets und keine Fremd-Action.

`permissions`: `contents: write`, `pull-requests: write`.

**Race gegen `version-bump.yml`:** beide Workflows pushen auf `main`. Beide
bekommen `concurrency: { group: main-push, cancel-in-progress: false }` - das
ist eine Ein-Zeilen-Aenderung in `version-bump.yml` (heute `group: version-bump`).
Der Rebase-Retry ist der zweite Gurt.

### 7. Doku

- `.github/CI.md`: Zeile in der Workflow-Tabelle + Abschnitt "Kosten-Tracking"
  (Datenfluss, Preistabelle pflegen, Schaetzung != Rechnung, Hook-Freigabe).
- Root-`CLAUDE.md`: ein Stichpunkt unter *Repo-Regeln* plus `stats/`-Zeile in
  der Projekt-Tabelle. Bleibt unter der 40-Zeilen-Logik des Repos.
- `.github/PLAN.template.md`: den Abschnitt *"Abschluss jeder Session:
  Review-Prompt fuer Opus"* ergaenzen. **Warum:** `CLAUDE.md` verweist fuer
  Form und Inhalt des Review-Prompts auf die Vorlage, seit Commit `118c41d`
  steht dort aber die generische Fassung ohne diesen Abschnitt - der Verweis
  laeuft heute ins Leere. Die Form existiert im Repo, nur an der falschen
  Stelle: `jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md`,
  Abschnitt "Abschluss jeder Session". Die wird in die Vorlage gehoben,
  ergaenzt um das Korrektur-Routing (0/1/2 Prompts, Haiku vs. Sonnet).

### Nicht im Scope

`scripts/lib/anthropic.js` erfasst weiterhin keine Kosten der CI-eigenen
Haiku-Calls. Das ist ein zweiter, unabhaengiger Kostentopf (CI statt Session)
und waere ein eigenes Issue.

---

## Sub-Tasks (Stacked PRs, `.github/PLAN.template.md`)

Issue: **#49**. Jeder Sub-Task = ein Branch = ein PR, jeder in einer eigenen
Sonnet-Session.

| # | Branch (Base) | Inhalt |
| --- | --- | --- |
| 1 | `feature/issue-49-part-1` (`main`) | `scripts/costs-update.mjs`, `stats/pricing.json`, `.gitattributes`, Tests, Root-`package.json`, Step in `build-extension.yml` |
| 2 | `feature/issue-49-part-2` (part-1) | `.claude/settings.json`, `.githooks/pre-commit`, `hooks:install` |
| 3 | `feature/issue-49-part-3` (part-2) | `scripts/lib/github.js` (extrahiert aus `pr-summary.js`), `scripts/costs-merge.mjs` + Tests, `cost-report.yml` Job `aggregate` (PR-/Issue-Body + Changelog + Historie), `concurrency: main-push` in `version-bump.yml` |
| 4 | `feature/issue-49-part-4` (part-3) | `scripts/costs-report.mjs` + Tests, Job `daily` (report.html, Artefakt, Prune), `.github/CI.md`, `CLAUDE.md`, `.github/PLAN.template.md` |

Commit-Scopes: `ci` fuer `.github/` und `scripts/`, `repo` fuer `stats/`,
`.claude/`, `.githooks/`, Root-Dateien. Kein neuer commitlint-Scope noetig -
`stats/` hat keine `manifest.json` und taucht daher weder in `scope-enum` noch
im Build-Loop auf. Header maximal 72 Zeichen.

Jeder Sub-Task hat zusaetzlich zu seinen fachlichen Kriterien dieselben zwei
Punkte in der Definition of Done:

* [ ] `npm test` im Root gruen; `npm run lint --prefix jira-markdown-converter`
      und `npm test --prefix jira-markdown-converter` unveraendert gruen.
* [ ] Review-Prompt fuer Opus als **letzte Ausgabe** der Session, Form siehe
      unten.

---

## Session-Abschluss und QA-Routing (Vorgabe aus `CLAUDE.md`)

Die Workflow-Regeln des Repos sind Teil dieses Plans, nicht Beiwerk:

1. **Sonnet setzt um** und beendet die Session mit einem Review-Prompt fuer
   Opus - nicht mit dem Push.
2. **Opus reviewt**: Code-Logik, Tests, Sicherheit, und bewertet den PR.
   MV3-Konformitaet entfaellt hier, das ist Repo- und CI-Code, kein
   Erweiterungs-Laufzeitcode - dafuer treten CI-Rechte, Workflow-Trigger und
   der Umgang mit Session-IDs an ihre Stelle.
3. **Opus entscheidet 0, 1 oder 2 Korrektur-Prompts** und gibt sie fertig aus.
4. **Routing:** Haiku fuer Triviales (Lint, Formatierung, Umlaute, Doku-,
   Typo- und Typ-Fixes), Sonnet fuer Logik, Architektur, Tests und Gemischtes.

Nach dem Push endet die Arbeit der Session: kein Pollen von Workflow-Runs,
kein Beobachten des PR, kein Angebot es zu tun (`.github/CI.md`).

---

## Umsetzungsreihenfolge

1. **Plan ins Repo.** Dieser Plan wird als
   `.github/plans/issue-49-cost-tracking.md` auf `claude/code-cost-tracking-jf829x`
   committet und gepusht (`docs(repo): ausfuehrungsplan fuer kosten-tracking`).
   Grund: die Sub-Task-Sessions lesen den Plan lokal, statt sich auf
   GitHub-Zugriff zu verlassen - genauso wie bei Issue 17 und 31. Issue #49
   verweist darauf.
2. Sub-Task 1 bis 4 nacheinander, jeder in einer eigenen Sonnet-Session mit
   dem zugehoerigen Start-Prompt unten. Zwischen zwei Sub-Tasks liegt jeweils
   ein Opus-Review.

---

## Verification

**Collector (lokal, ohne CI):**

```bash
npm test                                  # Unit-Tests der Fixtures
node scripts/costs-update.mjs             # echte Session, schreibt stats/costs.csv
cat stats/costs.csv                       # Header + genau eine Zeile je Session
node scripts/costs-update.mjs && cat stats/costs.csv   # Upsert, keine zweite Zeile
```

Gegenprobe: `/usage` im Terminal - die Groessenordnung muss passen
(Abweichung durch Listenpreis-Annahme ist erwartbar, ein Faktor 10 nicht).

**Hooks:**

```bash
npm run hooks:install
git commit --allow-empty -m "test(repo): hook pruefen"   # danach verwerfen
git show --stat HEAD                                     # stats/costs.csv ist dabei
```

Claude-Hook: einen Turn beenden, `stats/costs.csv` muss ein neueres
`updated_at` tragen.

**Report lokal:**

```bash
node scripts/costs-report.mjs && open stats/report.html   # bzw. xdg-open
```

Erwartet: beide Tabellen gefuellt, Summe je Modell == Summe je Branch ==
Gesamtsumme, Datei ohne einen einzigen externen Request (Gegenprobe:
`grep -Ei 'https?://|<script' stats/report.html` liefert nichts).

**Workflows:** Job `aggregate` gegen einen Wegwerf-PR mit praeparierten
CSV-Zeilen - erwartet: Summe im Job Summary, PR-Kommentar, Kostenblock in der
PR-Beschreibung (bei `Closes #N` auch im Issue), `### Kosten`-Zeile unter
`## [Unveroeffentlicht]` in `jira-markdown-converter/CHANGELOG.md`, Zeilen in
`history.csv`/`history-models.csv`, Branch-Zeilen aus `costs.csv` und
`tokens.csv` verschwunden, ein Bot-Commit auf `main`. Zweiter Lauf desselben
Jobs (`workflow_dispatch`/Re-Run): kein doppelter Block, keine doppelte
Changelog-Zeile. Job `daily` per
`workflow_dispatch` mit einer 40 Tage alten Zeile - erwartet: neu erzeugte
`stats/report.html` im Commit, dieselbe Datei als Artefakt, Zeile als
`abandoned` in der Historie.

**Gruen vor dem Push:** `npm test` im Root und
`npm run lint --prefix jira-markdown-converter` sowie
`npm test --prefix jira-markdown-converter` (unveraendert, darf nicht brechen).

---

## Prompt-Beispiele

Vier Start-Prompts (je eine Sonnet-Session), dazu die Form des Review-Prompts
und der beiden Korrektur-Prompts. Alles zum Kopieren.

### Agent-Start-Prompt - Sub-Task 1: Collector und Preistabelle

```text
Repo: pascallink/webkit-ext. Lies zuerst CLAUDE.md im Root, dann
.github/plans/issue-49-cost-tracking.md - dort Sub-Task 1. Issue: #49.

Aufgabe: Setze Sub-Task 1 um, nichts darueber hinaus.
Branch: von main abzweigen als feature/issue-49-part-1.

Neu: scripts/costs-update.mjs, stats/pricing.json,
scripts/test/costs-update.test.mjs, .gitattributes
Geaendert: package.json (Root), .github/workflows/build-extension.yml

Das Skript errechnet die Kosten der laufenden Claude-Session aus dem
Transcript-JSONL und pflegt zwei Dateien:
  stats/costs.csv   branch,session_id,updated_at,cost_usd
  stats/tokens.csv  branch,session_id,model,input,output,cache_read,cache_write,cost_usd

Session aufloesen in dieser Reihenfolge: JSON auf stdin (Claude-Code-Hook,
Felder session_id / transcript_path / cwd) -> --transcript <pfad> -> neuestes
.jsonl unter ~/.claude/projects/<cwd-slug>/ (Slug = absoluter Pfad, / durch -
ersetzt). Subagenten unter <session>/subagents/*.jsonl mitzaehlen.

Gewertet werden Zeilen mit type === "assistant" und message.usage. Deduplizieren
ueber requestId + message.id - Retries und Streaming erzeugen sonst Doppel.
Je message.model summieren, dann mit stats/pricing.json in USD umrechnen
(input, output, cache_read, cache_write_5m, cache_write_1h; usage.speed ===
"fast" nimmt den fast-Satz, falls vorhanden).

Diese Leitplanken sind nicht verhandelbar:
- Das Skript blockiert nie einen Commit oder Turn. Unbekanntes Modell: mit 0
  werten plus Warnung auf stderr. Jeder Fehlerpfad endet mit Exit 0.
- git branch --show-current leer (detached HEAD) -> sauberer Exit, nichts
  schreiben.
- Upsert-Schluessel: (branch, session_id) bzw. (branch, session_id, model).
  Header immer anlegen, updated_at als ISO-8601-UTC, cost_usd auf 4
  Nachkommastellen, Zeilen deterministisch sortiert, atomar schreiben
  (.tmp + rename).
- Keine Dependencies. Node-Bordmittel, ES-Module.

.gitattributes: stats/costs.csv, stats/tokens.csv und stats/history.csv je
merge=union, stats/report.html mit -diff.

Tests mit node:test in scripts/test/costs-update.test.mjs gegen Fixture-
Transcripts in einem Temp-Verzeichnis: Neuanlage, Upsert ohne zweite Zeile,
Dedupe doppelter requestId, unbekanntes Modell, Subagenten-Summierung,
detached HEAD. Root-package.json: "test": "node --test scripts/test".
build-extension.yml um einen Step "Root-Skripte testen" erweitern (npm ci &&
npm test im Root) - der bestehende Loop sieht nur Ordner mit manifest.json.

Regeln: Deutsch ohne Umlaute (ue/ae/oe/ss) in Kommentaren und Meldungen.
Commit-Konvention <typ>(<scope>): <betreff>, Header maximal 72 Zeichen,
Scope ci fuer scripts/ und .github/, repo fuer den Rest.

Abschluss:
  npm test
  npm run lint --prefix jira-markdown-converter
  npm test --prefix jira-markdown-converter
Alles gruen, dann committen und mit
git push -u origin feature/issue-49-part-1 pushen, PR gegen main mit Verweis
auf #49. Danach endet die Arbeit - keine Workflow-Runs beobachten.

Zum Schluss: Erstelle einen Review-Prompt fuer Opus, der die Code-Aenderungen,
deine Designentscheidungen, potenzielle Edge Cases und 3-4 konkrete
Pruefpunkte fuer diesen PR zusammenfasst. Form siehe Abschnitt
"Review-Prompt fuer Opus" im Plan, Ausgabe als einzelner Codeblock.
```

### Agent-Start-Prompt - Sub-Task 2: Hooks

```text
Repo: pascallink/webkit-ext. Lies zuerst CLAUDE.md im Root, dann
.github/plans/issue-49-cost-tracking.md - dort Sub-Task 2. Issue: #49.

Aufgabe: Setze Sub-Task 2 um, nichts darueber hinaus.
Branch: feature/issue-49-part-2, Base feature/issue-49-part-1.

Neu: .claude/settings.json, .githooks/pre-commit
Geaendert: package.json (Root)

.claude/settings.json bekommt einen Stop-Hook, der
node "$CLAUDE_PROJECT_DIR/scripts/costs-update.mjs" ausfuehrt - damit ist die
CSV am Ende jedes Turns aktuell.

.githooks/pre-commit (Mode 100755, im Commit als 100755 sichtbar) ruft denselben
Collector ueber git rev-parse --show-toplevel auf und staged danach
stats/costs.csv und stats/tokens.csv. Fehler des Collectors duerfen den Commit
nie verhindern - || exit 0 ist Absicht, kein Schlamperei-Marker.

Root-package.json: "hooks:install": "git config core.hooksPath .githooks".

Weise beides praktisch nach und schreibe das Ergebnis in die PR-Beschreibung:
1. npm run hooks:install, dann ein Wegwerf-Commit - stats/costs.csv liegt im
   Commit, ohne dass jemand sie von Hand gestaged hat.
2. Collector absichtlich kaputt machen (z. B. Syntaxfehler), erneut committen -
   der Commit geht durch. Danach zuruecksetzen.

Regeln: Deutsch ohne Umlaute. Commit-Scope repo, Header maximal 72 Zeichen.

Abschluss: npm test im Root gruen, committen, mit
git push -u origin feature/issue-49-part-2 pushen, PR gegen
feature/issue-49-part-1 mit Verweis auf #49. Danach endet die Arbeit.

Zum Schluss: Review-Prompt fuer Opus wie im Plan beschrieben, einzelner
Codeblock.
```

### Agent-Start-Prompt - Sub-Task 3: Merge-Aggregation

```text
Repo: pascallink/webkit-ext. Lies zuerst CLAUDE.md im Root, dann
.github/plans/issue-49-cost-tracking.md - dort Sub-Task 3. Issue: #49.

Aufgabe: Setze Sub-Task 3 um, nichts darueber hinaus.
Branch: feature/issue-49-part-3, Base feature/issue-49-part-2.

Neu: scripts/lib/github.js, scripts/costs-merge.mjs,
scripts/test/costs-merge.test.mjs, .github/workflows/cost-report.yml
Geaendert: scripts/pr-summary.js, .github/workflows/version-bump.yml

Schritt 1 ist eine Extraktion, keine Neuschreibung: scripts/pr-summary.js
kann das Patchen eines Markerblocks im PR-Body bereits (MARKER_START,
MARKER_END, mergeIntoBody, PATCH ueber die GitHub-API). Diese Logik wandert
nach scripts/lib/github.js als mergeIntoBody(body, block, marker), patchBody
und comment. pr-summary.js nutzt danach das Modul und verhaelt sich
unveraendert - das ist eine Bedingung, kein Wunsch.

scripts/costs-merge.mjs summiert die Zeilen mit branch == head_ref aus
stats/costs.csv (Dedupe auf (branch, session_id), juengstes updated_at
gewinnt) samt Modellsummen aus stats/tokens.csv und erledigt dann vier Dinge:
1. Job Summary ($GITHUB_STEP_SUMMARY) und ein PR-Kommentar.
2. Markerblock <!-- cost-summary:start --> ... <!-- cost-summary:end --> in die
   PR-Beschreibung patchen: Gesamtsumme, Anzahl Sessions, Aufschluesselung je
   Modell. Nennt der PR-Body Closes|Fixes|Resolves #N, denselben Block in die
   Beschreibung dieses Issues patchen.
3. Changelog je Projekt, dessen Dateien der PR angefasst hat (Top-Level-Ordner
   mit manifest.json): unter ## [Unveroeffentlicht] einen Abschnitt ### Kosten
   fuehren und dort eintragen:
   - PR #44 "Titel": $0.1420 (3 Sessions, claude-opus-5)
   Abschnitt anlegen falls er fehlt. Die kuratierten Abschnitte Hinzugefuegt,
   Geaendert, Behoben, Entfernt werden nicht angefasst. Beruehrt der PR kein
   Projekt, entfaellt nur der Changelog-Eintrag.
4. Historie: Zeile nach stats/history.csv
   (branch,pr,merged_at,total_usd,sessions,reason=merged), Modellsummen nach
   stats/history-models.csv, danach die Branch-Zeilen aus costs.csv und
   tokens.csv entfernen.

Alles muss idempotent sein: ein zweiter Lauf (Re-Run des Jobs) doppelt weder
Markerblock noch Changelog-Zeile noch Historien-Eintrag. Das ist der Punkt,
an dem dieser Sub-Task scheitert, wenn er scheitert - teste ihn zuerst.

.github/workflows/cost-report.yml, Job aggregate:
  on: pull_request: [closed], if: github.event.pull_request.merged == true
  permissions: contents: write, pull-requests: write
  concurrency: { group: main-push, cancel-in-progress: false }
  Commit als github-actions[bot],
  "chore(repo): kosten des gemergten branches verbuchen [skip ci]",
  Push auf main mit git pull --rebase und bis zu drei Versuchen.
In version-bump.yml die Concurrency-Group von version-bump auf main-push
umstellen - beide Workflows pushen auf main, sonst rennen sie gegeneinander.

Jeder Kommentar, den der Job auf GitHub schreibt, endet mit der
Attributions-Fussnote (Trennlinie, dann kursiv "Generated by Claude Code").

Regeln: Deutsch ohne Umlaute, keine Dependencies, Commit-Scope ci,
Header maximal 72 Zeichen.

Abschluss: Tests fuer costs-merge.mjs und lib/github.js schreiben, npm test im
Root sowie Lint und Test von jira-markdown-converter gruen, committen, mit
git push -u origin feature/issue-49-part-3 pushen, PR gegen
feature/issue-49-part-2 mit Verweis auf #49. Danach endet die Arbeit.

Zum Schluss: Review-Prompt fuer Opus wie im Plan beschrieben, einzelner
Codeblock.
```

### Agent-Start-Prompt - Sub-Task 4: Tagesreport

```text
Repo: pascallink/webkit-ext. Lies zuerst CLAUDE.md im Root, dann
.github/plans/issue-49-cost-tracking.md - dort Sub-Task 4. Issue: #49.

Aufgabe: Setze Sub-Task 4 um, nichts darueber hinaus.
Branch: feature/issue-49-part-4, Base feature/issue-49-part-3.

Neu: scripts/costs-report.mjs, scripts/test/costs-report.test.mjs
Geaendert: .github/workflows/cost-report.yml, .github/CI.md, CLAUDE.md,
.github/PLAN.template.md

scripts/costs-report.mjs liest costs.csv, tokens.csv, history.csv und
history-models.csv und schreibt stats/report.html:
- Kopf mit Erzeugungszeit (ISO-UTC) und Gesamtsumme
- Tabelle je Modell: Modell, Input, Output, Cache-Read, Cache-Write, Sessions,
  Kosten USD, Anteil in Prozent
- Tabelle je Branch: Branch, Sessions, Modelle, letzte Aktivitaet, Kosten USD;
  offene Branches oben, gemergte darunter
- Trend: gestern, 7 Tage, 30 Tage aus der Historie

Design: eingebettetes CSS im <style>-Block, Systemschriften, kein JavaScript,
keine einzige externe URL, prefers-color-scheme fuer Dark Mode, Zahlen
rechtsbuendig mit font-variant-numeric: tabular-nums, Zebra-Streifen.
Branch- und Modellnamen HTML-escapen. Der Report wird bei jedem Lauf komplett
neu erzeugt, nie fortgeschrieben.

Job daily in cost-report.yml: schedule cron "0 0 * * *" plus
workflow_dispatch. Report erzeugen, per actions/upload-artifact@v6 als Artefakt
ablegen (v5 laeuft noch auf Node 20, siehe .github/CI.md), verwaiste Zeilen
aufraeumen - Branch am Remote nicht mehr vorhanden oder updated_at aelter als
30 Tage wandert mit reason=abandoned in die Historie und faellt aus costs.csv
und tokens.csv. Report und CSVs committen mit [skip ci], kein Commit bei
leerem Diff, Push wie in Sub-Task 3.

Doku:
- .github/CI.md: Zeile in der Workflow-Tabelle plus Abschnitt
  "Kosten-Tracking" - Datenfluss, wie die Preistabelle gepflegt wird, dass die
  Zahlen Listenpreis-Schaetzungen und keine Rechnung sind, die einmalige
  Freigabe der Projekt-Hooks und npm run hooks:install.
- CLAUDE.md im Root: stats/-Zeile in der Projekt-Tabelle plus ein Stichpunkt
  unter Repo-Regeln.
- .github/PLAN.template.md: den Abschnitt "Abschluss jeder Session:
  Review-Prompt fuer Opus" ergaenzen. CLAUDE.md verweist dafuer auf die
  Vorlage, dort steht der Abschnitt aber nicht mehr. Vorbild ist
  jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md, Abschnitt
  "Abschluss jeder Session". Ergaenze das Korrektur-Routing: Opus gibt 0, 1
  oder 2 Korrektur-Prompts aus, Haiku fuer Triviales, Sonnet fuer Logik.

Tests: Summe je Modell == Summe je Branch == Gesamtsumme, Prune greift ab 30
Tagen, das erzeugte HTML enthaelt keine externe URL.

Regeln: Deutsch ohne Umlaute, keine Dependencies, Commit-Scope ci bzw. repo,
Header maximal 72 Zeichen.

Abschluss: npm test im Root sowie Lint und Test von jira-markdown-converter
gruen, committen, mit git push -u origin feature/issue-49-part-4 pushen, PR
gegen feature/issue-49-part-3 mit Verweis auf #49. Danach endet die Arbeit.

Zum Schluss: Review-Prompt fuer Opus wie im Plan beschrieben, einzelner
Codeblock.
```

### Review-Prompt fuer Opus (Form, die jede Session ausgibt)

Ein einzelner Codeblock, sonst nichts drumherum, hoechstens 40 Zeilen.
Selbsttragend - Opus sieht den Verlauf der Sonnet-Session nie.

```text
Review von PR "<Titel>" (Branch feature/issue-49-part-<X>, Base <Base>).
Kontext: webkit-ext, Repo- und CI-Code (Node ohne Dependencies, GitHub
Actions, Claude-Code- und Git-Hooks). Kein MV3-Laufzeitcode.

Aenderungen
- <Datei>: <was und warum, ein Satz>
- ...

Designentscheidungen
- <Entscheidung>: <verworfene Alternative und der Grund>
- ...

Edge Cases, die ich bedacht habe
- <Fall> -> <Verhalten>
- ...

Bitte pruefe gezielt
1. <konkreter Pruefpunkt mit Datei und Funktion>
2. <...>
3. <...>
(4. <...>)

Bekannte Luecken: <was bewusst offen blieb, oder "keine">
```

Regeln fuer diesen Prompt:

* **Selbsttragend.** Jede Behauptung nennt Datei und Funktion, PR-Nummer
  ausschreiben, keine Verweise auf "wie oben besprochen".
* **Pruefpunkte sind Fragen an den Code, keine Zusammenfassung.** Gut:
  "Zaehlt `costs-update.mjs` einen Subagenten doppelt, wenn derselbe
  `requestId` im Haupt- und im Subagenten-Transcript steht?". Schlecht:
  "bitte die neuen Tests anschauen".
* **Ehrlich bei den Luecken.** Was nicht getestet wurde, was nur angenommen
  ist, steht drin. Ein Review-Prompt, der nur Erfolge meldet, verschwendet
  das Review.
* Kein Selbstlob, keine Wiederholung des Plans.

Fuer diese vier Sub-Tasks sind das die Pruefpunkte, die Opus ohnehin sehen
will - wer sie in seinem Review-Prompt vergisst, hat den Sub-Task nicht
verstanden:

| Sub-Task | Worauf das Review zielt |
| --- | --- |
| 1 | Dedupe-Schluessel, Rundung und Summenkonsistenz `tokens.csv` vs. `costs.csv`, Exit-0-Pfade |
| 2 | Hook blockiert wirklich nie, Datei-Mode 100755, keine Endlosschleife Hook -> Commit |
| 3 | Idempotenz der drei Schreibziele, Rechte des `GITHUB_TOKEN`, Race gegen `version-bump` |
| 4 | Keine externe URL im HTML, Escaping, Prune loescht nichts Lebendiges |

### Korrektur-Prompts, die Opus ausgibt (0, 1 oder 2)

Opus entscheidet nach dem Review, wie viele noetig sind, und routet sie:
Haiku fuer Triviales, Sonnet fuer alles mit Logik darin. Beide Prompts nennen
Branch und Dateien, damit die Session ohne Vorgeschichte startet.

**Haiku - trivial (Lint, Formatierung, Umlaute, Doku, Typos):**

```text
Repo: pascallink/webkit-ext, Branch feature/issue-49-part-<X> (bereits
gepusht). Kleine Korrekturen aus dem Review, nichts darueber hinaus - keine
Logik anfassen, keine Tests umschreiben, keine Dateien anlegen.

1. <Datei>:<Zeile> - <exakte Korrektur, z. B. Umlaut durch "ue" ersetzen>
2. <Datei>:<Zeile> - <...>

Danach: npm test im Root muss gruen bleiben. Committen als
"<typ>(<scope>): <betreff>" (Header maximal 72 Zeichen, Deutsch ohne Umlaute)
und auf denselben Branch pushen. Kein neuer PR. Danach endet die Arbeit.
```

**Sonnet - komplex (Logik, Architektur, Tests):**

```text
Repo: pascallink/webkit-ext, Branch feature/issue-49-part-<X> (bereits
gepusht). Lies CLAUDE.md im Root und
.github/plans/issue-49-cost-tracking.md, Sub-Task <X>.

Das Review hat folgendes gefunden:
1. <Befund>: <warum das falsch ist, mit Datei und Funktion>
   Erwartetes Verhalten: <...>
2. <...>

Setze die Korrekturen um und sichere jede mit einem Test ab, der ohne den Fix
rot ist - fuege den Test zuerst hinzu und zeige, dass er faellt. Halte den
Scope des Sub-Tasks: <was ausdruecklich nicht angefasst wird>.

Abschluss: npm test im Root sowie Lint und Test von jira-markdown-converter
gruen, committen (Header maximal 72 Zeichen, Deutsch ohne Umlaute), auf
denselben Branch pushen. Kein neuer PR.

Zum Schluss: aktualisierter Review-Prompt fuer Opus - nur die Korrekturen,
nicht der ganze PR noch einmal.
```
