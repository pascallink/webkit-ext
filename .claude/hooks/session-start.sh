#!/bin/bash
#
# SessionStart-Hook: stellt die Abhaengigkeiten jeder Sitzung in der Cloud
# bereit, damit Lint und Tests ohne vorheriges npm install laufen, und
# aktiviert dort die Git-Hooks aus .githooks.
#
# Laeuft nur in einer Cloud-Sitzung - lokal aendert der Hook nichts, dort
# entscheidet Pascal selbst, wann installiert und was konfiguriert wird;
# fehlt lokal die Hook-Konfiguration, gibt es nur einen Hinweis.
#
# Die Ordnersuche ist dieselbe wie in .github/workflows/build-extension.yml:
# Repo-Wurzel plus jeder oberste Ordner mit package.json. Eine neue
# Erweiterung braucht hier also keine Aenderung.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Die Kosten einer Session landen erst im pre-commit-Hook in den CSVs
# (Details in .github/CI.md). Ohne core.hooksPath greift dieser Hook nicht
# und die Session wird nie verbucht.
hooks_path=$(git config --get core.hooksPath 2>/dev/null || true)

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  if [ "$hooks_path" != ".githooks" ]; then
    echo "Git-Hooks sind nicht aktiv - ohne sie werden die Session-Kosten nie"
    echo "verbucht. Einmalig: npm run hooks:install"
  fi
  exit 0
fi

# Der Container ist ohnehin fluechtig, hier ist das Setzen unkritisch.
if [ "$hooks_path" != ".githooks" ]; then
  git config core.hooksPath .githooks 2>/dev/null || true
fi

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
