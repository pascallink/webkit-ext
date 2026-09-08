# Prompt-Vertrag fuer Modell-Uebergaben

Feste Vorlagen fuer die Uebergabe zwischen Sessions: Opus reviewt, Haiku oder
Sonnet korrigiert. Prosa-Prompts driften und kosten Tokens - die Struktur steht
deshalb genau einmal hier, nicht in der Root-`CLAUDE.md`. Wer wann uebergibt,
steht dort ("Workflow & QA-Regeln"). Das Planungstemplate verweist auf diese
Datei: [`.github/PLAN.template.md`](PLAN.template.md).

## Ausgaberegeln (gelten fuer jede Stufe)

- **Kein Wrapper:** keine Begruessung, kein "Hier ist ...", kein "Ich habe
  analysiert ...", keine Signatur, keine Nachbemerkung. Stufe 1 beginnt mit der
  Status-Ueberschrift, ein Folge-Prompt mit den drei Backticks.
- **Struktur strikt:** nur die definierten Abschnitte, Enums exakt wie notiert,
  kein Zusatzabschnitt. Was der Diff nicht belegt, wird nicht behauptet - lieber
  weglassen als raten.
- **Kontext beschneiden:** vor der Uebergabe Kommentare, Leerzeilen und
  unveraenderte Bloecke entfernen. Weiter geht der Ausschnitt, nie die ganze
  Datei.
- **Kopierbar:** jeder Prompt fuer eine Folge-Session steht als reiner Text in
  einem eigenen Codeblock (drei Backticks, ohne Sprache), die Modellwahl als
  Ueberschrift davor. Nichts, was zum Prompt gehoert, steht ausserhalb.

## Stufe 1 - Review-Ergebnis (Opus)

Eingabe: Diff gegen `main`, PR-Titel, PR-Beschreibung.
Ausgabe: Markdown-Fliesstext, kein JSON-Bericht.

```
## Review PR #<nummer> - <APPROVED | CHANGES_REQUESTED>

<Zwei bis drei Absaetze: was bricht, warum, und was daraus folgt. Datei- und
Zeilenangaben inline als `datei.yml:18`. Keine Tabelle, keine Befundliste,
kein Wiederholen des Diffs.>

**Empfehlung:** <ein Satz zur Richtung der Korrektur.>
```

- Status ist `CHANGES_REQUESTED`, sobald ein Befund `CRITICAL` oder `MAJOR` ist,
  sonst `APPROVED`.
- Schweregrade (`CRITICAL`, `MAJOR`, `MINOR`) und Typen (`SECURITY`, `BUG`,
  `PERFORMANCE`, `STYLE`) gelten weiter: sie benennen den Befund im Fliesstext
  und steuern das Routing der Stufe 2.
- Keine Befunde heisst: kein Korrektur-Prompt, das Review endet nach der
  Empfehlung.

## Stufe 2 - Korrektur (Haiku oder Sonnet)

Direkt im Anschluss an Stufe 1: 0, 1 oder 2 Prompts, je Prompt genau **eine**
Zieldatei, jeweils mit Modellwahl als Ueberschrift davor
(`### Korrektur-Prompt -> Sonnet`).

```
task: apply_refactoring
target_file: <pfad/zur/datei>
branch: <branch, auf dem die Korrektur landet>
base: <branch, von dem er abzweigt>

Kontext: <zwei bis drei Saetze: was defekt ist und warum.>

Aufgaben:
1. <konkrete Anweisung mit Zielzustand>
2. <konkrete Anweisung mit Zielzustand>

Constraints:
- Auf `branch` arbeiten, von `base` abzweigen. Keinen neuen Branch von `main`
  anlegen.
- Nur `target_file` committen. Vor dem Commit `git status` pruefen, kein
  `git add -A`; alles andere im Worktree bleibt liegen, auch Unversioniertes.
- Deutsch ohne Umlaute in Kommentaren und UI-Texten.
- Bestehende Struktur beibehalten, wenn nicht ausdruecklich anders verlangt.
- Vor dem Commit `npm run lint --prefix <projekt>` und
  `npm test --prefix <projekt>`.
- Nur die geaenderte Datei ausgeben, kein Fliesstext.
```

- **Branch-Bindung:** `branch` und `base` sind Pflichtfelder. Eine Korrektur zu
  einem laufenden Review geht auf den Branch des reviewten PR - nie auf einen
  frischen Branch von `main`. Sonst entstehen zwei PRs, von denen jeder den
  Stand des anderen voraussetzt: beide sind einzeln falsch, und wer zuerst
  merged, trennt Doku von Implementierung.
- **Ein Prompt, eine Datei, ein Commit:** was sonst im Worktree liegt - alte
  Plandateien, Scratch-Skripte, Reste vorheriger Sub-Tasks - gehoert nicht in
  den Commit. `git status` vor dem Commit ist Pflicht, `git add -A` verboten.
- **Routing:** ausschliesslich `STYLE`/`MINOR` (Linter, Syntax, Formatierung,
  Umlaute, Doku- und Typ-Fixes) geht an Haiku. Alles andere - `BUG`,
  `SECURITY`, `PERFORMANCE`, Testanpassungen, gemischte Korrekturen - an Sonnet.
- Repo-Regeln bleiben bindend, auch wenn der Prompt sie nicht wiederholt.
