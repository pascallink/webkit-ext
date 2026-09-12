Bringe den Working Tree von {{REPO}} in einen sauberen Zustand, ohne
Aenderungen zu verwerfen. Du fragst nichts.

1. `cd {{REPO}} && git status --porcelain`.
2. Gibt es Aenderungen oder unversionierte Dateien innerhalb des Repos:
   `git stash push -u -m "nightrun-{{DOCS}}-$(date +%H%M)"`.
   Nie `git checkout -- .`, nie `git clean`, nie `git reset --hard`.
3. `git checkout {{BASE}} && git pull -q --ff-only`.
4. `git status --porcelain` muss leer sein.

Antworte ausschliesslich mit dieser Zeile, kein Fliesstext:
`RESULT: clean=<yes|no> stashed=<yes|no> branch=<aktueller branch>`
