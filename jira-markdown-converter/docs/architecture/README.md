# Architekturdiagramme

Erzeugt mit dem Archify-Skill (`.claude/skills/archify/`, MIT, `tt-a1i/archify`).
Quelle ist die typisierte JSON-Spezifikation, das HTML ist reines Ergebnis und
wird nie von Hand bearbeitet.

| Datei | Rolle |
| --- | --- |
| `poweredit-runtime.architecture.json` | Spezifikation - hier wird gepflegt. |
| `poweredit-runtime.html` | Erzeugtes, eigenstaendiges Diagramm. |

## Neu erzeugen

Vom Repo-Root, `<a>` = `.claude/skills/archify`:

```bash
export ARCHIFY_UPDATE_CHECK_DISABLED=1
node <a>/bin/archify.mjs validate architecture \
  jira-markdown-converter/docs/architecture/poweredit-runtime.architecture.json \
  --quality showcase --repo-root . --json
node <a>/bin/archify.mjs deliver architecture \
  jira-markdown-converter/docs/architecture/poweredit-runtime.architecture.json \
  jira-markdown-converter/docs/architecture/poweredit-runtime.html \
  --quality showcase --repo-root . --json
```

`validate` muss 9 von 9 Pruefungen mit 0 Fehlern und 0 Warnungen melden, sonst
nimmt `deliver` die Spezifikation nicht ab. Optional prueft
`visual-check <html> --json` die gerenderte Seite im Browser; dafuer
`ARCHIFY_CHROME` auf den vorinstallierten Chromium zeigen lassen. Die dabei
entstehenden Sidecars (`*.visual-check.*`) sind per `.gitignore` ausgeschlossen.

## Pflege vor einem Release

`meta.repository.revision` in der JSON auf den Commit heben, gegen den die
Quellverweise geprueft wurden - `deliver` verifiziert jeden `sources`-Eintrag
gegen diesen Stand und bricht bei Abweichung ab.
