# Nachtlauf: Fehlersammlung automatisch abarbeiten

Orchestrator-Prompt und Agenten-Vorlagen, mit denen ein Claude-Code-Chat
(Modell Fable) die Issues aus `docs/issues/` ohne Rueckfragen abarbeitet:
je Issue plant ein Opus-Agent, Sonnet oder Haiku setzen um, ein PR entsteht,
Opus reviewt, Sonnet/Haiku korrigieren, bis der PR mergefaehig ist - dann
das naechste Issue. Gemergt wird nichts; die PRs stapeln sich auf
`claude/analyse-issues-mockup-912`, Pascal mergt morgens von unten nach oben.

| Datei | Zweck |
| --- | --- |
| `PROMPT.md` | Der Orchestrator-Prompt: Start/Resume, Loop mit den Phasen select, plan, implement, ci, review, fix, done, park; Stop-Bedingungen; Kontext-Hygiene; Abschluss. |
| `issues.json` | Reihenfolge (Gruppen), GitHub-Nummern je Doc, `max_rounds` je Issue. Wird von `scratch/create-issues.py` beim Anlegen der Issues erzeugt. |
| `templates/planner.md` | Opus: Plan je Issue nach `.github/PLAN.template.md` mit `model:` je Sub-Task. |
| `templates/implementer.md` | Sonnet/Haiku: ein Sub-Task, Test zuerst, Commit, beim letzten Sub-Task Push und PR. |
| `templates/reviewer.md` | Opus: Review nach `.github/PROMPTS.md` (Stufe 1 + Stufe-2-Prompts), postet als PR-Kommentar. |
| `templates/fixer.md` | Haiku/Sonnet: genau ein Korrektur-Prompt. |
| `templates/ci-fixer.md` | Sonnet: Commitlint- oder Build-Fehler beheben. |
| `templates/cleanup.md` | Haiku: Working Tree per Stash saeubern. |

## Start im neuen Chat

```
Du bist der Nacht-Orchestrator fuer pascallink/webkit-ext. Lies
/Volumes/sources/tools/webkit-ext/jira-markdown-converter/docs/nightrun/PROMPT.md
vollstaendig und fuehre ihn aus. Der Nutzer schlaeft: keine Rueckfragen, du
entscheidest. Arbeite alle Issues aus issues.json in der dort genannten
Reihenfolge ab; beende erst, wenn eine Stop-Bedingung aus PROMPT.md greift.
```

Voraussetzungen: `gh auth status` ok, `npm install --prefix jira-markdown-converter`
gelaufen, Edge unter `/Applications/Microsoft Edge.app` (Browser-Tests laufen
mit `CHROMIUM_PATH`), Working Tree sauber, Base-Branch ausgecheckt.

## Zustand und Wiederaufnahme

Der Orchestrator haelt seinen Zustand ausserhalb des Repos in
`$HOME/nightrun-webkit-ext/` (`state.json`, `log.md`, `plans/`, `reviews/`,
`SUMMARY.md`). Ein neuer Chat mit demselben Start-Prompt nimmt den Lauf an
der gespeicherten Phase wieder auf. `SUMMARY.md` und der Kommentar auf PR #87
nennen am Ende je Issue PR, Status, Runden und die Merge-Reihenfolge.

## Leitplanken

PRs entstehen als Draft und werden erst nach gruener CI und Opus-APPROVED
auf "ready" gesetzt; geparkte PRs bleiben Draft. Hoechstens 3 Korrekturrunden je PR (Issue 17: 2), derselbe Fehler zweimal
oder mehr als 90 Minuten je Issue fuehren zum Parken (PR als Draft plus
Kommentar), drei geparkte Issues in Folge oder 9 Stunden Laufzeit beenden
den Lauf. Geparkte Branches werden nie Base fuer den naechsten PR.
