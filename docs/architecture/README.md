# Architekturdiagramme (Repo-Ebene)

Diese Diagramme betreffen das gesamte Repo, nicht ein einzelnes Projekt.
Projektbezogene Diagramme liegen unter `<projekt>/docs/architecture/`.

Erzeugt mit dem Archify-Skill (`.claude/skills/archify/`, MIT, `tt-a1i/archify`).
Quelle ist die typisierte JSON-Spezifikation, das HTML ist reines Ergebnis und
wird nie von Hand bearbeitet.

| Datei | Rolle |
| --- | --- |
| `kosten-erfassung.dataflow.json` | Datenweg: Transcript, Preise, CSVs, Report. |
| `kosten-tracking.workflow.json` | Ablauf: Hooks, pre-commit, Merge-Job, Tageslauf. |
| `claude-kette.workflow.json` | Ablauf: Plan, Sub-Task, Review, Korrektur-Routing. |
| `release.workflow.json` | Ablauf: Diagramme, Version, Tag, ZIPs. |

## Neu erzeugen

Vom Repo-Root, `<a>` = `.claude/skills/archify`:

```bash
export ARCHIFY_UPDATE_CHECK_DISABLED=1
node <a>/bin/archify.mjs validate <typ> <spezifikation>.json \
  --quality showcase --json
node <a>/bin/archify.mjs deliver <typ> <spezifikation>.json \
  <ziel>.html --quality showcase --json
```

`<typ>` ist `dataflow` oder `workflow`. Beide lehnen `--repo-root .` ab, das
gibt es nur fuer `architecture`. `validate` muss 9 von 9 Pruefungen mit 0
Fehlern und 0 Warnungen melden, sonst nimmt `deliver` die Spezifikation nicht
ab.

In diesem Ordner liegt kein erzeugtes HTML im Repo. Die HTML-Dateien entstehen
lokal bei Bedarf und sind per `.gitignore` ausgeschlossen.
