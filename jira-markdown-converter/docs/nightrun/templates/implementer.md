Du setzt Sub-Task {{SUBTASK}} aus dem Plan {{PLAN}} um. Repo {{REPO}},
Projekt `jira-markdown-converter` (Chrome/Edge-Erweiterung, Manifest V3,
ES5 mit `var` und `'use strict'`, UMD-Module mit `module.exports` + Global,
kein Bundler, keine Runtime-Abhaengigkeiten, `converter.js` bleibt DOM-frei).
GitHub-Issues: {{ISSUES}}. Branch: {{BRANCH}} (Base: {{BASE}}).
Letzter Sub-Task dieses Issues: {{IS_LAST}}. Du fragst nichts und mergst nichts.

Vorgehen:
1. Lies {{PLAN}} vollstaendig, dann `{{REPO}}/CLAUDE.md` und
   `{{REPO}}/jira-markdown-converter/CLAUDE.md`. Oeffne nur die im Sub-Task
   genannten Quellen, das betroffene `test/modules/<modul>/` und `test/lib/`.
2. Branch: `cd {{REPO}} && git fetch -q origin && git checkout {{BRANCH}} 2>/dev/null || git checkout -b {{BRANCH}} {{BASE}}`.
   Der Working Tree muss sauber sein; ist er es nicht, brich mit
   `RESULT: pr=- branch={{BRANCH}} sha=- tests=fail note=working tree nicht sauber` ab.
3. Test zuerst: schreibe den im Plan genannten Test, fuehre
   `npm run test:module <modul> --prefix jira-markdown-converter` aus und
   pruefe, dass er rot ist. Browser-Tests immer mit
   `CHROMIUM_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"`
   davor. Nie `npx playwright install`, nie `--watch`.
4. Umsetzung nach den Schritten des Plans. Leere `catch`-Bloecke sind in
   diesem Projekt Absicht (Jira baut das DOM staendig um). Neue
   Content-Script-Dateien gehoeren in `manifest.json` **und** in
   `CONTENT_FILES` in `src/background.js` (der Package-Test vergleicht beide).
   Kein Zugriff auf Seiten-Globals (`window.JIRA`, `AJS`, `jQuery`) - die
   Erweiterung laeuft in der isolierten Welt.
5. Modultest gruen. Waehrend der Arbeit keinen Gesamtlauf.
6. Nur wenn {{IS_LAST}} = true: genau einmal
   `npm run lint --prefix jira-markdown-converter` und
   `CHROMIUM_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" npm test --prefix jira-markdown-converter`.
   Rot heisst: zurueck in den Modullauf und beheben, nicht erneut Gesamtlauf
   raten. Bleibt es nach zwei Versuchen rot: committen, nicht pushen,
   `tests=fail` melden.
7. Commit: `git add` nur der eigenen Dateien (nie `git add -A` ueber
   `node_modules` oder fremde Ordner). Nachricht:
   `<typ>(jira): <betreff im imperativ, klein, ohne punkt>` - erste Zeile
   hoechstens 72 Zeichen, Typen feat|fix|refactor|test|docs|chore, Details
   in den Body, letzte Zeile `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
   Deutsch ohne Umlaute (ue, ae, oe) in Commit, Kommentaren und UI-Texten.
8. Nur wenn {{IS_LAST}} = true und Tests gruen: `git push -u origin {{BRANCH}}` und
   `gh pr create --repo pascallink/webkit-ext --base {{BASE}} --head {{BRANCH}} --title "<erste Commit-Zeile>" --body "<Body>"`.
   Body: je Issue eine Zeile `Closes #<nummer>`, dann drei bis sechs Zeilen
   was geaendert wurde und wie getestet, abschliessend die Zeile
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   Titel = erste Commit-Zeile (commitlint prueft auch den PR-Titel nicht,
   aber die Commits).
9. Wenn {{IS_LAST}} = false: nicht pushen, keinen PR anlegen.

Nichts ausserhalb `jira-markdown-converter/` aendern (Ausnahme laut Plan:
Issue 17 und `.github/` mit eigenem Commit `ci(ci)`/`docs(ci)`).
`test/fixtures/` bestehende Dateien nicht veraendern. Keine Versionsnummern
anfassen (hebt die CI).

Antworte ausschliesslich mit dieser Zeile, kein Fliesstext:
`RESULT: pr=<nummer oder -> branch={{BRANCH}} sha=<kurzer commit-sha> tests=<ok|fail> note=<eine Zeile>`
