# Ausfuehrungsplan Issue #71 - Release-Assets an immutable Releases

Zerlegung von [Issue #71](https://github.com/pascallink/webkit-ext/issues/71)
in zwei atomare Sub-Tasks. Jeder Sub-Task ist genau ein Branch und ein Pull
Request; die PRs stapeln aufeinander (Stacked PRs). Ablage unter `.github/`
statt `<projekt>/docs/plans/`, weil der Scope `ci` und `repo` ist und kein
Projekt beruehrt wird.

## Befund

`release.yml` haengt am Event `release: published` und laedt die ZIPs erst
**nach** dem Publish an das Release. GitHub hat Releases auf *immutable*
umgestellt (`"immutable": true` an Release 1.3.0, id 384293890) - nach dem
Publish nimmt ein Release keine Assets mehr an. Der Lauf vom 2026-09-07
scheitert genau daran:

```
##[error]Cannot upload asset jira-markdown-converter-1.2.23.zip to an
immutable release. GitHub only allows asset uploads before a release is
published, so upload assets to a draft release before you publish it.
```

Zwei Ursachen, beide belegt:

1. **Strukturfehler (der rote Lauf).** Release 1.3.0 wurde 19:42 als Draft
   angelegt, 20:00:16 publiziert, der Workflow lief 20:01:53 - zu spaet. Das
   Release traegt heute `assets: []`, damit laeuft der in der `README.md`
   verlinkte Dauerlink
   `/releases/latest/download/jira-markdown-converter.zip` ins 404. Das
   Publish-Event kann diesen Fehler prinzipiell nicht vermeiden: wenn es
   feuert, ist das Release bereits eingefroren.
2. **Falscher ZIP-Name (Folgefehler).** Tag `1.3.0` zeigt auf `401202e`
   (`chore(repo): patch-versionen anheben [skip ci]`); dort steht die Version
   noch auf `1.2.23`, der Bump auf 1.3.0 kam erst mit `c3a3e61`. Tag/Version-
   Drift ist heute nur ein `::warning::` (`release.yml`, Zeilen 72-74), also
   ist ein `jira-markdown-converter-1.2.23.zip` unter Tag 1.3.0 stillschweigend
   durchgegangen.

Roter Lauf:
<https://github.com/pascallink/webkit-ext/actions/runs/34157717811>

## Zielbild

| Vorher | Nachher |
| --- | --- |
| Release im UI anlegen und publishen | Version auf `x.y.0` setzen, mergen |
| Workflow triggert auf `release: published` | Tag `x.y.0` auf den Merge-Commit setzen und pushen |
| Upload scheitert (immutable) | Workflow baut die ZIPs und legt einen **Draft** mit Assets an |
| - | Titel und Notes im UI ergaenzen, **Publish von Hand** |

Name und Beschreibung eines Releases bleiben auch nach dem Publish editierbar;
eingefroren sind Tag und Assets. Der manuelle Publish kostet also nichts an
Flexibilitaet, verhindert aber genau den Fehler aus dem Issue.

---

## Sub-Task 1: release.yml auf Tag-Push und Draft-Upload umstellen

* **Git Branch:** `fix/issue-71-release-draft` (Base Branch: `main`)
* **Scope / Ziel:** Die ZIPs entstehen vor dem Publish und haengen an einem
  Draft-Release. Tag/Version-Drift bricht den Lauf ab, statt ihn zu warnen.
* **Dateiebene:**
  * Zu aendern: `.github/workflows/release.yml`

### Schritt-fuer-Schritt Anweisungen

1. **Trigger tauschen.** `on: release: types: [published]` entfaellt:

   ```yaml
   on:
     push:
       tags:
         - '[0-9]+.[0-9]+.0'
         - 'v[0-9]+.[0-9]+.0'
     workflow_dispatch:
       inputs:
         tag:
           description: 'Tag, der gebaut werden soll'
           required: true
         dry_run:
           description: 'Nur bauen und auflisten, kein Release anfassen'
           type: boolean
           default: true
   ```

   Der `workflow_dispatch`-Pfad ist der Probelauf: bauen, `ls -la release` und
   `unzip -l` ausgeben, Release unangetastet lassen. Kein
   `actions/upload-artifact` - `v5` laeuft laut [`CI.md`](../CI.md) noch auf
   Node 20, und ein Major-Sprung gehoert nicht in diesen Fix.

2. **Tag ermitteln** (erster Step, `id: meta`): bei Tag-Push
   `${{ github.ref_name }}`, bei Dispatch `${{ inputs.tag }}`, als `tag` nach
   `$GITHUB_OUTPUT` schreiben. Alle Folge-Steps lesen
   `steps.meta.outputs.tag`.

3. **Tag-Gate behalten** (heute Zeilen 29-36): Regex
   `^v?[0-9]+\.[0-9]+\.0$`, sonst `::error::` und `exit 1`. Der Tag-Filter
   deckt den Push-Pfad ab, das Gate faengt den Dispatch-Pfad. Fehlertext
   anpassen: es entsteht kein Release ohne Assets mehr, sondern gar nichts.

4. **Neuer Guard vor dem Build - ein publiziertes Release blockiert:**

   ```yaml
   - name: Kein publiziertes Release ueberschreiben
     if: ${{ !inputs.dry_run }}
     env:
       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
       TAG: ${{ steps.meta.outputs.tag }}
     run: |
       state=$(gh release view "$TAG" --json isDraft --jq .isDraft 2>/dev/null || echo "none")
       if [ "$state" = "false" ]; then
         echo "::error::Release '$TAG' ist bereits publiziert und damit immutable - Assets lassen sich nicht mehr anhaengen. Release loeschen und den Tag neu setzen, oder die naechste Minor-Version waehlen."
         exit 1
       fi
   ```

   `gh` ist auf `ubuntu-latest` vorinstalliert. `none` (kein Release) und
   `true` (Draft) laufen weiter.

5. **Checkout auf den Tag:** `actions/checkout@v5` mit
   `ref: ${{ steps.meta.outputs.tag }}` statt
   `github.event.release.tag_name`.

6. **Build-Block (Zeilen 46-114) bleibt** - Versionsabgleich
   `manifest.json`/`package.json`, Staging, `rm -rf` der Entwicklungsdateien,
   Alias ueber `stableZipAlias`. Geaendert wird nur die Drift-Pruefung: die
   Per-Projekt-Warnung bleibt (bei mehreren Erweiterungen kann ein Tag nicht
   fuer alle passen), dazu ein Zaehler. Passt am Ende der Schleife **kein**
   Projekt zum Tag, ist das ein `::error::` mit `exit 1`. Genau das haette
   `1.3.0` -> `jira-markdown-converter-1.2.23.zip` gestoppt.

7. **Upload-Step ersetzen** (heute Zeilen 116-122):

   ```yaml
   - name: Draft-Release mit ZIPs anlegen
     if: ${{ !inputs.dry_run }}
     uses: softprops/action-gh-release@v2
     with:
       tag_name: ${{ steps.meta.outputs.tag }}
       draft: true
       generate_release_notes: true
       fail_on_unmatched_files: true
       files: release/*.zip
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

   `draft: true` ist der Kern des Fixes - die Assets landen vor dem Publish.
   `fail_on_unmatched_files: true` verhindert ein leeres Release, wenn der
   Build nichts erzeugt hat. `overwrite_files` ist ohnehin Default `true`, ein
   erneuter Lauf ersetzt die Assets des Drafts also sauber.

8. **Abschluss-Step:** Draft-URL und `ls -la release` nach
   `$GITHUB_STEP_SUMMARY` schreiben, mit dem Hinweis, dass Titel und Notes im
   UI zu ergaenzen sind und das Publish von Hand erfolgt.

9. **Kopfkommentar der Datei** (Zeilen 3-12) nachziehen: Trigger ist der
   Tag-Push, Ergebnis ein Draft, Publish bleibt manuell, Grund dafuer ist die
   Immutability jedes publizierten Releases.

### Definition of Done

* [ ] `on:` triggert auf Tag-Push `x.y.0` plus `workflow_dispatch`.
* [ ] Guard gegen bereits publizierte Releases vorhanden.
* [ ] Upload laeuft mit `draft: true` und `fail_on_unmatched_files: true`.
* [ ] Kein Projekt passt zum Tag => harter Fehler statt Warnung.
* [ ] YAML gueltig:
      `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/release.yml'))"`
* [ ] Trockenlauf der Pack-Schleife lokal gruen (siehe Verifikation).
* [ ] Commit und Push, Header maximal 72 Zeichen.

### Agent-Start-Prompt

```
Repository webkit-ext, Branch fix/issue-71-release-draft von main abzweigen.

Aufgabe: .github/workflows/release.yml so umbauen, dass die Release-ZIPs an
ein Draft-Release gehen statt an ein bereits publiziertes. Grund: GitHub
Releases sind immutable, nach dem Publish nimmt ein Release keine Assets mehr
an - der Lauf 34157717811 ist genau daran gescheitert (Issue #71).

Lies zuerst .github/plans/issue-71-release-immutable.md, Abschnitt
"Sub-Task 1", und setze die neun Schritte dort exakt um. Zusammengefasst:

1. Trigger von "release: published" auf Tag-Push (x.y.0 und vx.y.0) plus
   workflow_dispatch mit den Inputs tag und dry_run (Boolean, Default true)
   umstellen.
2. Ersten Step "meta" ergaenzen, der den Tag aus github.ref_name bzw.
   inputs.tag nach GITHUB_OUTPUT schreibt; alle Folge-Steps lesen
   steps.meta.outputs.tag.
3. Das bestehende Tag-Gate (Regex ^v?[0-9]+\.[0-9]+\.0$) behalten,
   Fehlertext an den neuen Ablauf anpassen.
4. Vor dem Build einen Guard einbauen: existiert fuer den Tag bereits ein
   publiziertes (nicht-Draft) Release, mit ::error:: abbrechen. Per
   "gh release view "$TAG" --json isDraft --jq .isDraft", GH_TOKEN aus
   secrets.GITHUB_TOKEN, nur wenn dry_run false ist.
5. actions/checkout@v5 auf steps.meta.outputs.tag checken.
6. Die Pack-Schleife inhaltlich unveraendert lassen. Einzige Aenderung: die
   Warnung bei Tag/Version-Drift bleibt pro Projekt bestehen, zusaetzlich
   einen Zaehler fuehren - passt am Ende KEIN Projekt zum Tag, ::error:: und
   exit 1.
7. Den Upload-Step durch softprops/action-gh-release@v2 mit draft: true,
   generate_release_notes: true, fail_on_unmatched_files: true und
   files: release/*.zip ersetzen; nur wenn dry_run false ist.
8. Abschluss-Step, der die Draft-URL und ls -la release nach
   GITHUB_STEP_SUMMARY schreibt, inklusive Hinweis auf den manuellen Publish.
9. Kopfkommentar der Datei auf den neuen Ablauf umschreiben.

Regeln: Kommentare auf Deutsch ohne Umlaute (ue, ae, oe). Kein
actions/upload-artifact ergaenzen (v5 haengt an Node 20). Keine weiteren
Dateien anfassen - die Doku ist Sub-Task 2.

Pruefen vor dem Commit:
- python3 -c "import yaml;yaml.safe_load(open('.github/workflows/release.yml'))"
- Die Pack-Schleife in ein Scratch-Skript kopieren und mit TAG=1.3.0 gegen den
  Arbeitsbaum laufen lassen: es muessen
  release/jira-markdown-converter-1.3.0.zip und der Alias
  release/jira-markdown-converter.zip entstehen, und unzip -l darf weder
  test/ noch docs/ noch node_modules/ noch package.json zeigen.
- Denselben Trockenlauf mit TAG=9.9.0: muss mit ::error:: abbrechen.

Commit: fix(ci): release-zips an draft statt publiziertes release
(Header maximal 72 Zeichen, ein Scope). Danach pushen und den PR anlegen.
Die Session endet mit dem Review-Prompt (Stufe 1) aus .github/PROMPTS.md.
```

---

## Sub-Task 2: Dokumentation und Wiederherstellungs-Runbook

* **Git Branch:** `docs/issue-71-release-flow`
  (Base Branch: `fix/issue-71-release-draft`)
* **Scope / Ziel:** Doku und Workflow beschreiben denselben Ablauf, und der
  Weg aus einem kaputten Release steht schriftlich fest.
* **Dateiebene:**
  * Zu aendern: `.github/CI.md`, `README.md`

### Schritt-fuer-Schritt Anweisungen

1. **`.github/CI.md`**
   * Workflow-Tabelle (Zeile 12): Trigger `Release published` ->
     `Tag-Push x.y.0`; Zweck: baut die ZIPs und haengt sie an ein
     Draft-Release, publiziert wird von Hand.
   * Abschnitt "Versionen und Releases": den Minor-Ablauf neu schreiben -
     Version auf `x.y.0` setzen, mergen, Tag auf den Merge-Commit setzen und
     pushen, Workflow erzeugt den Draft, Publish von Hand. Ausdruecklich:
     **kein Release im UI vorab anlegen und publishen.**
   * Immutability-Absatz (Zeilen 57-59) verallgemeinern: nicht nur `latest`
     ist immutable, sondern jedes publizierte Release - deshalb der Draft.
   * Drift-Regel korrigieren: passt kein Projekt zum Tag, bricht der Build ab.
   * Neuer Unterabschnitt "Kaputtes Release reparieren" mit dem Runbook unten.

2. **`README.md`** (Zeilen 18-22 und Abschnitt "Versionierung"): "sobald ein
   Release auf eine neue Minor-Version veroeffentlicht wird" -> Tag-Push. Der
   Absatz zum Downloadlink bleibt inhaltlich, bekommt aber den Hinweis, dass
   der Link erst nach dem manuellen Publish des Drafts wieder zieht.

3. Deutsch, **ohne Umlaute** (`ue`, `ae`, `oe`).

### Definition of Done

* [ ] `CI.md` und `README.md` beschreiben denselben Ablauf wie `release.yml`.
* [ ] Kein Verweis auf das alte Publish-Event bleibt stehen:
      `grep -rn "release: published\|veroeffentlicht wird" README.md .github/`
* [ ] Runbook steht in `CI.md`.
* [ ] Commit und Push, Header maximal 72 Zeichen.

### Agent-Start-Prompt

```
Repository webkit-ext, Branch docs/issue-71-release-flow von
fix/issue-71-release-draft abzweigen (Stacked PR, Sub-Task 2 zu Issue #71).

Aufgabe: Doku an den in Sub-Task 1 geaenderten Release-Ablauf angleichen.
Lies zuerst .github/workflows/release.yml im aktuellen Stand und danach
.github/plans/issue-71-release-immutable.md, Abschnitt "Sub-Task 2".

.github/CI.md:
- Workflow-Tabelle: Trigger von "Release published" auf "Tag-Push x.y.0"
  aendern, Zweck: baut die ZIPs und haengt sie an ein Draft-Release,
  publiziert wird von Hand.
- Abschnitt "Versionen und Releases": Minor-Ablauf neu schreiben - Version
  auf x.y.0, mergen, Tag auf den Merge-Commit setzen und pushen, Workflow
  erzeugt den Draft, Publish von Hand. Ausdruecklich festhalten: kein Release
  im UI vorab anlegen und publishen.
- Den Absatz zur rollierenden Release "latest" verallgemeinern: jedes
  publizierte Release ist immutable, nicht nur latest - daher der Draft.
- Drift-Regel korrigieren: passt kein Projekt zum Tag, bricht der Build ab
  (bisher stand dort: nur eine Warnung).
- Neuen Unterabschnitt "Kaputtes Release reparieren" ergaenzen, mit dem
  Runbook aus der Plandatei (Notes sichern, Release loeschen, Tag neu setzen
  und pushen, Draft publishen; Fallback naechste Minor-Version).

README.md:
- Zeilen 18-22 und den Abschnitt "Versionierung": "sobald ein Release auf eine
  neue Minor-Version veroeffentlicht wird" durch den Tag-Push ersetzen.
- Beim Downloadlink ergaenzen, dass er erst nach dem manuellen Publish des
  Drafts wieder zieht.

Regeln: Deutsch ohne Umlaute (ue, ae, oe). Keine Codedateien anfassen.

Pruefen vor dem Commit:
grep -rn "release: published\|veroeffentlicht wird" README.md .github/
darf nichts mehr liefern.

Commit: docs(ci): release-ablauf auf tag-push umschreiben
(Header maximal 72 Zeichen). Danach pushen und den PR anlegen.
Die Session endet mit dem Review-Prompt (Stufe 1) aus .github/PROMPTS.md.
```

---

## Runbook: Release 1.3.0 wiederherstellen

Nicht Teil der PRs - manuell auszufuehren, nachdem Sub-Task 1 auf `main`
liegt. Release 1.3.0 ist publiziert, immutable und leer; reparieren laesst es
sich nur ueber Loeschen und neu Taggen.

```bash
# 1. Release-Notes sichern (der Body geht beim Loeschen verloren)
gh release view 1.3.0 --json body --jq .body > /tmp/notes-1.3.0.md

# 2. Release loeschen (loest die Tag-Sperre der Immutability)
gh release delete 1.3.0 --yes

# 3. Tag auf den Commit mit Version 1.3.0 umsetzen
git push origin :refs/tags/1.3.0
git tag -f 1.3.0 origin/main        # HEAD steht auf 1.3.0 in manifest+package
git push origin 1.3.0

# 4. Workflow laeuft, Draft entsteht -> Notes einsetzen, im UI publishen
```

Weigert sich GitHub, den Tag `1.3.0` erneut zu vergeben, ist der Ausweg keine
Bastelei am Tag, sondern die naechste Minor-Version: `1.4.0` setzen, taggen,
pushen. Nur `x.y.0` erzeugt ZIPs.

Das Alt-Release `latest` (id 383351525) ist laut `CI.md` bereits Geschichte
und kann bei der Gelegenheit mitgeloescht werden - optional, nicht Teil des
Fixes.

## Verifikation (ueber beide Sub-Tasks)

1. **Statisch:**
   `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/release.yml'))"`
2. **Pack-Schleife lokal trockenlaufen lassen** (reines Bash und jq): Block in
   ein Scratch-Skript kopieren, mit `TAG=1.3.0` gegen den Arbeitsbaum laufen
   lassen. Erwartung: `release/jira-markdown-converter-1.3.0.zip` und der
   Alias `release/jira-markdown-converter.zip`; `unzip -l` zeigt weder
   `test/` noch `docs/` noch `node_modules/` noch `package.json`.
3. **Drift-Gate:** derselbe Trockenlauf mit `TAG=9.9.0` muss mit `::error::`
   abbrechen (heute liefe er mit einer Warnung durch).
4. **Im Repo, ohne Nebenwirkung:** nach dem Merge `workflow_dispatch` mit
   `tag: 1.3.0` und `dry_run: true` starten. Der Lauf muss gruen sein, die
   ZIP-Liste ausgeben und kein Release anfassen.
5. **Scharf:** Runbook ausfuehren. Erwartung: Lauf gruen, Draft 1.3.0 mit zwei
   Assets, nach dem manuellen Publish liefert
   `curl -IL https://github.com/pascallink/webkit-ext/releases/latest/download/jira-markdown-converter.zip`
   wieder `200`.
6. Kein Laufzeitcode beruehrt; vor dem finalen Commit trotzdem einmal
   `npm run lint --prefix jira-markdown-converter` und
   `npm test --prefix jira-markdown-converter`.

## Nicht im Scope

* Automatisches Taggen aus der Version heraus - waere ein eigener Workflow.
* Die Repo-Einstellung "Immutable releases" abschalten: der Fix soll
  unabhaengig davon tragen.
* Major-Sprung bei `actions/upload-artifact` (`v5` haengt an Node 20).
