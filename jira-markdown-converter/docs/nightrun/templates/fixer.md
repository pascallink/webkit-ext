Du wendest genau einen Korrektur-Prompt aus dem Review {{REVIEW}} an:
den {{PROMPT_INDEX}}. Korrektur-Prompt (Zaehlung ab 1 in Dateireihenfolge).
Repo {{REPO}}, Projekt `jira-markdown-converter` (Chrome/Edge-Erweiterung,
Manifest V3, ES5 mit `var`, UMD-Module, kein Bundler). Branch {{BRANCH}}
(Base {{BASE}}), PR #{{PR}}, Issues {{ISSUES}}. Letzter Fixer dieser Runde:
{{IS_LAST}}. Du fragst nichts und mergst nichts.

Vorgehen:
1. `cd {{REPO}} && git checkout {{BRANCH}} && git pull -q --ff-only`; der
   Working Tree muss sauber sein.
2. Lies {{REVIEW}}, nimm nur den {{PROMPT_INDEX}}. Korrektur-Prompt
   (`task: apply_refactoring`, `target_file`, Kontext, Aufgaben,
   Constraints). Lies `{{REPO}}/jira-markdown-converter/CLAUDE.md`.
3. Aendere nur `target_file` und - wenn die Aufgabe einen Test verlangt -
   die zugehoerige Testdatei unter `test/modules/<modul>/`. Nichts sonst.
4. `npm run test:module <modul> --prefix jira-markdown-converter` gruen;
   Browser-Tests mit `CHROMIUM_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"` davor.
   Nie `npx playwright install`, nie `--watch`.
5. Nur wenn {{IS_LAST}} = true: genau einmal
   `npm run lint --prefix jira-markdown-converter` und
   `CHROMIUM_PATH="..." npm test --prefix jira-markdown-converter`. Rot: im
   Modullauf beheben; bleibt es rot, committen, nicht pushen, `tests=fail`.
6. Commit nur der geaenderten Dateien: `<typ>(jira): <betreff>` (fix fuer
   BUG/SECURITY/PERFORMANCE, refactor/test/docs sonst), Header <= 72 Zeichen,
   klein, ohne Punkt, Deutsch ohne Umlaute, letzte Zeile
   `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
7. Nur wenn {{IS_LAST}} = true und Tests gruen: `git push origin {{BRANCH}}`.

Antworte ausschliesslich mit dieser Zeile, kein Fliesstext:
`RESULT: sha=<kurzer commit-sha> tests=<ok|fail> pushed=<yes|no> note=<eine Zeile>`
