Die CI von PR #{{PR}} (Repo {{REPO}}, `pascallink/webkit-ext`, Projekt
`jira-markdown-converter`, Branch {{BRANCH}}, Base {{BASE}}, Issues {{ISSUES}})
ist rot. Modus: {{MODE}}. Du behebst die Ursache, fragst nichts, mergst nichts.

Vorgehen:
1. `cd {{REPO}} && git checkout {{BRANCH}} && git pull -q --ff-only`.
2. `gh pr checks {{PR}} --repo pascallink/webkit-ext --json name,bucket,workflow,link`
   und `gh run list --repo pascallink/webkit-ext --branch {{BRANCH}} --limit 5 --json databaseId,name,conclusion`.

Modus `commitlint`:
- `gh run view <id der Commit-Convention-Laufs> --repo pascallink/webkit-ext --log-failed | tail -60`
  zeigt den beanstandeten Commit. Regeln: `<typ>(jira): <betreff>` mit
  Typ aus feat|fix|refactor|test|docs|chore|build|ci, Scope Pflicht (`jira`,
  fuer `.github/` `ci`), Betreff klein, ohne Punkt, Header <= 72 Zeichen.
- Nur eigene Commits oberhalb von {{BASE}} umformulieren
  (`git rebase -i` ist nicht verfuegbar: fuer den letzten Commit
  `git commit --amend`, fuer aeltere `git rebase --onto` mit
  `GIT_SEQUENCE_EDITOR`-freiem Weg, z. B. `git reset --soft <base>` und
  neu committen, wenn es nur ein bis zwei Commits sind). Trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` beibehalten.
- `git push --force-with-lease origin {{BRANCH}}`.

Modus `build`:
- `gh run view <id des Build-Extensions-Laufs> --repo pascallink/webkit-ext --log-failed | tail -150`.
  Zusaetzlich den Kommentar des "AI Build Checker" auf dem PR lesen
  (`gh pr view {{PR}} --comments`), als Hinweis, nicht als Nachweis.
- Lokal reproduzieren: betroffenes Modul mit
  `CHROMIUM_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" npm run test:module <modul> --prefix jira-markdown-converter`.
  Laeuft es lokal gruen und auf dem Runner (Chromium statt Edge, Linux)
  rot, den Test robuster machen (Wartebedingungen, Timing, Fokus) - nie
  ueberspringen, nie `skip`, nie Assertions abschwaechen.
- `npm ci`-Fehler: `package-lock.json` passt nicht zu `package.json` - nur
  mit `npm install --package-lock-only --prefix jira-markdown-converter`
  angleichen, keine Versionen aendern.
- Lint-Fehler: `npm run lint --prefix jira-markdown-converter` lokal beheben.
- Danach genau einmal lint + `CHROMIUM_PATH="..." npm test --prefix jira-markdown-converter`,
  Commit `fix(jira): ...` bzw. `test(jira): ...` (Header <= 72, Deutsch ohne
  Umlaute, Trailer wie oben), `git push origin {{BRANCH}}`.

Regeln: keine Aenderungen ausserhalb `jira-markdown-converter/` (Ausnahme
`.github/` bei Issue 17 mit Commit `ci(ci): ...`), nie `npx playwright
install`, keine Versionsnummern anfassen, bestehende Fixtures nicht aendern.

Antworte ausschliesslich mit dieser Zeile, kein Fliesstext:
`RESULT: sha=<kurzer commit-sha> pushed=<yes|no> cause=<eine Zeile: Testname oder Regel> note=<eine Zeile>`
