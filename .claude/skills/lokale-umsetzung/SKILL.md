---
name: lokale-umsetzung
description: Delegiert Code-Implementierung an das lokale Modell ollama/qwen2.5-coder:14b via aider - Micro-Task schreiben, aider aufrufen, Diff bewerten, bei Fehlern zuruecksetzen und neu ansetzen. Nutze diesen Skill fuer Stufe 0 (Umsetzung eines Sub-Tasks) und Stufe 2 (Korrektur eines Befunds) der Kette aus .github/PROMPTS.md, statt an die Subagents umsetzer, korrektur-logik oder korrektur-style zu delegieren. Nicht fuer Review, Planung oder Release.
---

# Lokale Umsetzung (aider + Qwen 14B)

Implementierung laeuft auf Pascals Rechner, nicht auf einem Anthropic-Modell.
Du zerlegst, beauftragst, bewertest und verantwortest das Ergebnis - der Code
selbst kommt von `ollama/qwen2.5-coder:14b`.

Rollen der Kette bleiben wie in [`.github/PROMPTS.md`](../../../.github/PROMPTS.md):
Opus plant und reviewt, die Umsetzung ist delegiert. Neu ist nur, an wen.

## Eignungsgrenze - zuerst pruefen

Aider faehrt dieses Modell im **whole**-Edit-Format: das Modell gibt jede
angefasste Datei komplett neu aus. Das begrenzt den Einsatz hart.

- **Bis ~500 Zeilen je Zieldatei:** delegieren.
- **Darueber** (`src/content.js` 2021, `src/converter.js` 1464,
  `src/editors.js` 980) gibt das Modell die Datei nicht vollstaendig zurueck -
  es kuerzt stillschweigend. Entweder den Micro-Task so schneiden, dass er eine
  neue oder kleine Datei trifft, oder gar nicht delegieren und an
  `korrektur-logik` bzw. `umsetzer` geben.
- **Eine Zieldatei je Lauf.** Zwei Dateien in einem Micro-Task heisst zwei
  vollstaendige Ausgaben - das Modell verliert dabei eine davon.
- Nicht delegieren: `manifest.json` plus `CONTENT_FILES` synchron halten,
  UMD-Wrapper neu schneiden, Testfixtures, alles mit Release-Bezug.

## Ablauf

### 1. Zerlegen

Ein Micro-Task ist eine Aenderung an genau einer Datei, die in einen Absatz
Anweisung passt und deren Ergebnis am Diff pruefbar ist. Aus einem Sub-Task
werden typischerweise drei bis fuenf Micro-Tasks. Reihenfolge festlegen und
abarbeiten - nie zwei parallel, aider committet in denselben Arbeitsbaum.

Vor dem ersten Lauf muss der Arbeitsbaum sauber sein (`git status --short`
leer). Sonst nimmt aider fremde Aenderungen mit in seinen Commit und der
Revert in Schritt 5 trifft auch sie.

### 2. Micro-Task schreiben

Nach `local_task.md` im **Repo-Root**, Format und Begruendung unter
"Micro-Task" in [`.github/PROMPTS.md`](../../../.github/PROMPTS.md). Die Datei
wird vor jedem Lauf ueberschrieben, nicht angehaengt - aider schickt ihren
gesamten Inhalt.

Diese Datei wiederholt das Format nicht. Was beim Schreiben am haeufigsten
schiefgeht: Pfade ab Git-Root statt ab Projektordner, und der
Vorgaben-Block, der in jeden einzelnen Auftrag gehoert.

### 3. Aufrufen

```
aider --model ollama/qwen2.5-coder:14b --message-file local_task.md --yes
```

Vom Repo-Root, im Vordergrund, ein Lauf dauert Minuten. Nicht mit
`run_in_background` starten - du brauchst das Ergebnis, bevor der naechste
Micro-Task startet.

`OLLAMA_API_BASE`, Kontextfenster und die Modell-Warnungen stehen in
`.aider.conf.yml` und `.aider.model.settings.yml` im Repo-Root. Ohne sie fragt
aider interaktiv zurueck und `--yes` oeffnet dann Dokumentations-URLs im
Browser. Laeuft der Aufruf ins Leere: `ollama list` prueft, ob das Modell da
ist, `curl -s localhost:11434/api/tags` ob der Server laeuft.

Optional die Zieldatei als Argument anhaengen
(`aider jira-markdown-converter/src/otrslink.js --model ...`) - dann muss das
Modell sie nicht ueber die Repo-Map finden. Der Rest des Aufrufs bleibt gleich.

### 4. Bewerten

Aider committet selbst. Du liest den Diff, nicht die Zusammenfassung des
Modells:

```
git show --stat HEAD && git show HEAD
npm run test:module <modul> --prefix jira-markdown-converter
```

Fehlerhaft ist ein Lauf schon dann, wenn eine dieser Fragen mit ja beantwortet
wird - nicht erst, wenn Tests rot sind:

- Fehlen Teile der Datei, die vorher da waren? (Der typische whole-Format-Fehler.)
- Steckt eine weitere Datei im Commit, die der Task nicht genannt hat?
- ES6 (`let`, `const`, Arrow), Umlaute, ein neuer `require`?
- Kommentare, die den Auftrag nachplappern statt das Warum zu erklaeren?

Ist der Commit inhaltlich richtig, zieh die Commit-Message auf die Konvention -
aider formuliert sie selbst und trifft `<typ>(<scope>):` mit maximal 72 Zeichen
im Header nicht:

```
git commit --amend -m "fix(jira): <betreff im imperativ>" \
  -m "Umgesetzt von ollama/qwen2.5-coder:14b via aider." \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### 5. Iterieren

Der Aider-Commit ist lokal und nicht gepusht - er wird verworfen, nicht
revertiert:

```
git reset --hard HEAD~1
```

(Erst nach einem Push waere `git revert <sha>` richtig. Dann aber lieber
eskalieren als noch einen Versuch anhaengen.)

Danach `local_task.md` schaerfen: die *eine* Stelle benennen, an der das Modell
abgebogen ist. Denselben Task unveraendert erneut zu schicken, liefert
dasselbe Ergebnis.

**Nach zwei Fehlversuchen an einem Micro-Task wird nicht weiter iteriert.**
Dann ist der Task falsch geschnitten oder die Aufgabe zu gross fuer 14B:
weiter mit `korrektur-logik` (Sonnet) bzw. `umsetzer`, mit einem Satz dazu,
was lokal gescheitert ist. Das ist kein Ausnahmefall, sondern der
vorgesehene Ausgang fuer alles ueber der Eignungsgrenze.

### 6. Abschluss

Nach dem letzten Micro-Task genau einmal:

```
npm run lint --prefix jira-markdown-converter
npm test --prefix jira-markdown-converter
```

`local_task.md` bleibt liegen (per `.gitignore` ignoriert) oder wird geloescht -
sie gehoert nie in einen Commit. Danach geht der Stand ins Review (Stufe 1,
Agent `reviewer`), unveraendert wie bei einer Anthropic-Umsetzung. Dass lokal
umgesetzt wurde, steht in der Uebergabe - das Review bewertet Code, nicht
Herkunft.
