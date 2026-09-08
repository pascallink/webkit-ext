# Prompt-Vertrag fuer Modell-Uebergaben

Maschinenlesbare Vorlagen fuer die Uebergabe zwischen Sessions: Opus reviewt,
Haiku oder Sonnet korrigiert. Prosa-Prompts driften und kosten Tokens - das
Schema steht deshalb genau einmal hier, nicht in der Root-`CLAUDE.md`. Wer wann
uebergibt, steht dort ("Workflow & QA-Regeln").

## Ausgaberegeln (gelten fuer jede Stufe)

- **Kein Wrapper:** keine Begruessung, kein "Hier ist ...", kein "Ich habe
  analysiert ...", keine Signatur, keine Nachbemerkung. Erstes Zeichen der
  Antwort ist `{`.
- **Schema strikt:** nur die definierten Felder, Enums exakt wie notiert, kein
  Zusatzfeld. Was der Diff nicht belegt, ist `null` - nicht geraten.
- **Kontext beschneiden:** vor der Uebergabe Kommentare, Leerzeilen und
  unveraenderte Bloecke entfernen. Weiter geht der Ausschnitt, nie die ganze
  Datei.
- **Kopierbar:** jeder Prompt fuer eine Folge-Session steht als reiner Text in
  einem eigenen Codeblock (drei Backticks, ohne Sprache), die Modellwahl als
  Ueberschrift davor. Nichts, was zum Prompt gehoert, steht ausserhalb.

## Stufe 1 - Review-Trigger (Opus)

Eingabe: Diff gegen `main`, PR-Titel, PR-Beschreibung.

```json
{
  "task": "code_review_trigger",
  "instructions": [
    "Analyze git diff against main branch.",
    "Identify breaking changes, security risks, performance bottlenecks, and logic errors.",
    "Output concise findings in JSON."
  ],
  "output_format": {
    "status": "APPROVED | CHANGES_REQUESTED",
    "summary": "Max 2 sentences.",
    "issues": [
      {
        "file": "path/to/file",
        "line": 0,
        "severity": "CRITICAL | MAJOR | MINOR",
        "type": "SECURITY | BUG | PERFORMANCE | STYLE",
        "description": "Short explanation",
        "suggested_fix": "Minimal code snippet or null"
      }
    ]
  }
}
```

- `status` ist `CHANGES_REQUESTED`, sobald ein Issue `CRITICAL` oder `MAJOR`
  ist, sonst `APPROVED`.
- `issues: []` heisst: kein Korrektur-Prompt, das Review endet hier.

## Stufe 2 - Korrektur (Haiku oder Sonnet)

Eingabe: die `issues` aus Stufe 1, auf **eine** Zieldatei gefiltert, plus deren
beschnittener Inhalt. Ein Prompt pro Datei, maximal zwei Prompts je Review.

```json
{
  "task": "apply_refactoring",
  "target_file": "path/to/file",
  "issues_to_fix": [
    {
      "line": 0,
      "type": "BUG",
      "instruction": "Short fix instruction"
    }
  ],
  "constraints": [
    "No conversational fluff.",
    "Return only raw file diff or updated file content.",
    "Preserve existing code structure unless explicitly requested."
  ],
  "output_format": {
    "modified_code": "Raw code block only"
  }
}
```

- **Routing:** ausschliesslich `STYLE`/`MINOR` (Linter, Syntax, Formatierung,
  Umlaute, Doku- und Typ-Fixes) geht an Haiku. Alles andere - `BUG`,
  `SECURITY`, `PERFORMANCE`, Testanpassungen, gemischte Korrekturen - an Sonnet.
- Repo-Regeln bleiben bindend: Deutsch ohne Umlaute, vor dem Commit
  `npm run lint --prefix <projekt>` und `npm test --prefix <projekt>`.
