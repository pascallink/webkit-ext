# webkit-ext

Browser Erweiterungen

## Enthaltene Erweiterungen

| Ordner | Beschreibung |
| --- | --- |
| [`jira-markdown-converter/`](jira-markdown-converter/) | **PowerEdit for Jira** - erweitert die Jira-Ticket-Bearbeitung um Markdown-Support, Formatierungsvorlagen und Code-Bloecke (Smart-Links geplant). |

Fertiges, installierbares ZIP (immer die neueste `main`-Version, automatisch
gebaut per GitHub Actions):
[jira-markdown-converter.zip](https://github.com/pascallink/webkit-ext/releases/download/latest/jira-markdown-converter.zip)

## Ablage neuer Erweiterungen

Jeder Ordner mit einer `manifest.json` wird vom Workflow
[`build-extension.yml`](.github/workflows/build-extension.yml) automatisch
erkannt, getestet und als `<ordner>.zip` unter der Release
[`latest`](https://github.com/pascallink/webkit-ext/releases/tag/latest)
veroeffentlicht - ohne Aenderung am Workflow. Voraussetzung:

* `manifest.json` direkt im Ordner (Chrome/Edge-Erweiterung, Manifest V3).
* eigenes `package.json` mit `lint`- und `test`-Skripten; beide muessen vor
  dem Packen gruen sein.
* Laufzeitcode getrennt von Entwicklungsdateien - `test/`, `docs/`,
  `package.json`, `package-lock.json` und `eslint.config.mjs` werden beim
  Packen automatisch ausgeschlossen.

Der Download-Link fuer eine neue Erweiterung `foo/` lautet dann
`https://github.com/pascallink/webkit-ext/releases/download/latest/foo.zip`.
