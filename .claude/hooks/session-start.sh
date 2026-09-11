#!/bin/bash
#
# SessionStart-Hook: stellt die Abhaengigkeiten jeder Sitzung in der Cloud
# bereit, damit Lint und Tests ohne vorheriges npm install laufen.
#
# Laeuft nur in einer Cloud-Sitzung - lokal macht der Hook nichts, dort
# entscheidet Pascal selbst, wann installiert wird.
#
# Die Ordnersuche ist dieselbe wie in .github/workflows/build-extension.yml:
# Repo-Wurzel plus jeder oberste Ordner mit package.json. Eine neue
# Erweiterung braucht hier also keine Aenderung.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

installed=""
failed=""

for dir in . */ ; do
  dir=${dir%/}
  [ -f "$dir/package.json" ] || continue

  # Schon installiert und seit dem letzten Lockfile-Stand unveraendert.
  if [ -d "$dir/node_modules" ] && [ ! "$dir/package-lock.json" -nt "$dir/node_modules" ]; then
    continue
  fi

  if npm install --prefix "$dir" --no-audit --no-fund >/dev/null 2>&1; then
    installed="$installed $dir"
  else
    failed="$failed $dir"
  fi
done

[ -n "$installed" ] && echo "Abhaengigkeiten installiert:$installed"
[ -n "$failed" ] && echo "npm install fehlgeschlagen:$failed - vor dem Testen von Hand nachholen."

# Browser-Tests brauchen einen Chromium, der zur gepinnten Playwright-Version
# passt. Nachladen geht in der Sandbox nicht (Netz-Allowlist), darum hier nur
# die Ansage - Hintergrund in .github/TESTS.md.
for dir in */ ; do
  dir=${dir%/}
  [ -d "$dir/node_modules/playwright" ] || continue

  if ( cd "$dir" && node -e "require('playwright').chromium.launch().then(function (b) { return b.close(); })" ) >/dev/null 2>&1; then
    echo "Chromium bereit fuer $dir - Browser-Tests laufen."
  else
    echo "Chromium passt nicht zur Playwright-Version in $dir. Browser-Tests"
    echo "fallen aus, bis die Versionen zusammenpassen (.github/TESTS.md)."
    echo "Bis dahin: npm run test:node --prefix $dir"
  fi
done

exit 0
