# Prompt-Vertrag fuer Modell-Uebergaben

Feste Vorlagen fuer die Uebergabe zwischen Sessions: Opus reviewt, Haiku oder
Sonnet korrigiert. Prosa-Prompts driften und kosten Tokens - die Struktur steht
deshalb genau einmal hier, nicht in der Root-`CLAUDE.md`. Wer wann uebergibt,
steht dort ("Workflow & QA-Regeln"). Das Planungstemplate verweist auf diese
Datei: [`.github/PLAN.template.md`](PLAN.template.md). Die Subagents unter
`.claude/agents/` fahren dieselbe Kette ohne Copy-Paste - siehe "Subagents"
am Ende.

## Ausgaberegeln (gelten fuer jede Stufe)

- **Kein Wrapper:** keine Begruessung, kein "Hier ist ...", kein "Ich habe
  analysiert ...", keine Signatur, keine Nachbemerkung. Stufe 1 beginnt mit der
  Status-Ueberschrift, ein Folge-Prompt mit den drei Backticks.
- **Struktur strikt:** nur die definierten Abschnitte, Enums exakt wie notiert,
  kein Zusatzabschnitt. Was der Diff nicht belegt, wird nicht behauptet - lieber
  weglassen als raten.
- **Ohne Befund kein Satz:** was in Ordnung ist, bleibt unerwaehnt. Kein Absatz
  ueber Geprueftes und fuer sauber Befundenes, keine Messwerte ohne Befund,
  keine Randnotiz und nichts "bewusst nicht als Befund gefuehrt". Entweder es
  ist ein Befund und steht im Fliesstext, oder es faellt weg. Dass hingeschaut
  wurde, belegen die Befunde.
- **Kontext beschneiden:** vor der Uebergabe Kommentare, Leerzeilen und
  unveraenderte Bloecke entfernen. Weiter geht der Ausschnitt, nie die ganze
  Datei.
- **Kopierbar:** jeder Prompt fuer eine Folge-Session steht als reiner Text in
  einem eigenen Codeblock (drei Backticks, ohne Sprache), die Modellwahl als
  Ueberschrift davor. Nichts, was zum Prompt gehoert, steht ausserhalb.

## Stufe 1 - Review-Ergebnis (Opus)

Eingabe: Diff gegen `main`, PR-Titel, PR-Beschreibung, Branch und Head-SHA.
Ausgabe: Markdown-Fliesstext, kein JSON-Bericht.

```
## Review PR #<nummer> (<branch> @ <head-sha>) - <APPROVED | CHANGES_REQUESTED>

<Ein Absatz je Befund: was bricht, warum, und was daraus folgt. Datei- und
Zeilenangaben inline als `datei.yml:18`. Keine Tabelle, keine Befundliste,
kein Wiederholen des Diffs. Keine Befunde, kein Absatz - dann folgt direkt
die Empfehlung.>

**Empfehlung:** <ein Satz zur Richtung der Korrektur.>
```

- Status ist `CHANGES_REQUESTED`, sobald ein Befund `CRITICAL` oder `MAJOR` ist,
  sonst `APPROVED`.
- Schweregrade (`CRITICAL`, `MAJOR`, `MINOR`) und Typen (`SECURITY`, `BUG`,
  `PERFORMANCE`, `STYLE`) gelten weiter: sie benennen den Befund im Fliesstext
  und steuern das Routing der Stufe 2.
- Keine Befunde heisst: kein Korrektur-Prompt, das Review endet nach der
  Empfehlung.
- Branch und Head-SHA stehen in der Ueberschrift, damit jede Stufe 2 sie
  erbt. Ohne diesen Anker korrigiert die Folge-Session auf irgendeinem Stand.

## Stufe 2 - Korrektur (Haiku oder Sonnet)

Direkt im Anschluss an Stufe 1: 0, 1 oder 2 Prompts, je Prompt genau **eine**
Zieldatei, jeweils mit Modellwahl als Ueberschrift davor
(`### Korrektur-Prompt -> Sonnet`).

```
task: apply_refactoring
branch: <branch des PR, z. B. feature/issue-49-part-1>
base_sha: <head-sha, auf dem das Review basiert>
target_file: <pfad/zur/datei>

Kontext: <zwei bis drei Saetze: was defekt ist und warum.>

Aufgaben:
1. <konkrete Anweisung mit Zielzustand>
2. <konkrete Anweisung mit Zielzustand>

Constraints:
- Vor der ersten Aenderung `git fetch origin <branch>` und
  `git checkout <branch>`. Kein neuer Branch, Push nur mit
  `git push -u origin <branch>`.
- Passt `target_file` auf diesem Branch nicht zum Kontext oben: abbrechen und
  melden. Nichts nachbauen, nichts erfinden.
- Deutsch ohne Umlaute in Kommentaren und UI-Texten.
- Bestehende Struktur beibehalten, wenn nicht ausdruecklich anders verlangt.
- Vor dem Commit `npm run lint --prefix <projekt>` und
  `npm test --prefix <projekt>`.
- Nur die geaenderte Datei ausgeben, kein Fliesstext.
- Abschluss melden: Branch, Commit-SHA, geaenderte Dateien, Testergebnis.
```

- **Routing:** ausschliesslich `STYLE`/`MINOR` (Linter, Syntax, Formatierung,
  Umlaute, Doku- und Typ-Fixes) geht an Haiku. Alles andere - `BUG`,
  `SECURITY`, `PERFORMANCE`, Testanpassungen, gemischte Korrekturen - an Sonnet.
- **Branch-Vorgabe schlaegt Default:** eine Cloud-Sitzung bekommt vom Harness
  einen eigenen `claude/...`-Branch auf aktuellem `main`. Nennt der Prompt den
  PR-Branch nicht, gewinnt diese Vorgabe - die Korrektur landet am PR vorbei,
  im schlimmsten Fall auf einem Stand ohne die reviewte Datei.
- **Ohne Rueckmeldung kein Abschluss:** Stufe 1 beobachtet nicht nach (siehe
  Root-`CLAUDE.md`). Bleibt die Abschlussmeldung aus, gilt die Korrektur als
  nicht geliefert, nicht als erledigt.
- Repo-Regeln bleiben bindend, auch wenn der Prompt sie nicht wiederholt.

## Subagents

Dieselbe Kette ohne neuen Chat: `.claude/agents/` haelt je Stufe einen Agenten,
das Frontmatter setzt Modell und Werkzeuge, der Rumpf die Rolle.

| Stufe | Agent | Modell | Zustaendig fuer |
| --- | --- | --- | --- |
| Umsetzung | `umsetzer` | Sonnet | ein Subtask, ein Modul, ein Scope |
| Review | `reviewer` | Opus | Stufe 1 plus 0 bis 2 Folge-Prompts, ohne Edit |
| Korrektur | `korrektur-style` | Haiku | `STYLE`/`MINOR`, eine Datei, kein Verhalten |
| Korrektur | `korrektur-logik` | Sonnet | alles andere, Testanpassung erlaubt |

- **Diese Datei bleibt die Quelle der Formate.** Die Agenten wiederholen sie
  nicht, sie verweisen darauf - der `reviewer` liest sie zu Beginn seines Laufs.
  Aendert sich ein Format, aendert es sich hier und nirgends sonst.
- **Der Rumpf traegt nur, was hier nicht steht:** Rolle, Scope-Grenzen,
  Abbruchbedingung, Ausgabeform. Repo- und Test-Kontext-Regeln kommen aus der
  Root-`CLAUDE.md` und gelten fuer jeden Agenten ohnehin.
- **Werkzeuge beschneiden ist Teil des Vertrags.** Der `reviewer` hat kein
  `Edit`, die Korrektur-Agenten kein `Glob` - was ein Agent nicht hat, kann er
  auch nicht an Kontext verbrennen.
- **Ein Agent startet kalt.** Er kennt die rufende Sitzung nicht, der Auftrag
  muss vollstaendig sein. Deshalb stehen `branch` und `base_sha` im Stufe-2-
  Block: ohne diesen Anker korrigiert der Agent auf irgendeinem Stand.
- **Parallel nur getrennt.** Zwei Agenten gleichzeitig auf demselben Branch
  kollidieren im Arbeitsbaum - entweder nacheinander oder je in einem eigenen
  Worktree.
