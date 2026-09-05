# webkit-ext

Browser Erweiterungen

## Enthaltene Erweiterungen

| Ordner | Beschreibung |
| --- | --- |
| [`jira-markdown-converter/`](jira-markdown-converter/) | **PowerEdit for Jira** - erweitert die Jira-Ticket-Bearbeitung um Markdown-Support, Formatierungsvorlagen und Code-Bloecke (Smart-Links geplant). |

Fertiges, installierbares ZIP (immer die neueste veroeffentlichte Version,
automatisch gebaut per GitHub Actions):
[jira-markdown-converter.zip](https://github.com/pascallink/webkit-ext/releases/latest/download/jira-markdown-converter.zip)

## Ablage neuer Erweiterungen

Jeder Ordner mit einer `manifest.json` wird von
[`build-extension.yml`](.github/workflows/build-extension.yml) automatisch
erkannt und bei jedem PR geprueft. Gepackt wird er von
[`release.yml`](.github/workflows/release.yml), sobald ein Release auf eine
neue Minor-Version (`x.y.0`) veroeffentlicht wird - ohne Aenderung am
Workflow. Voraussetzung:

* `manifest.json` direkt im Ordner (Chrome/Edge-Erweiterung, Manifest V3).
* eigenes `package.json` mit `lint`- und `test`-Skripten; beide muessen vor
  dem Packen gruen sein.
* Laufzeitcode getrennt von Entwicklungsdateien - `test/`, `docs/`,
  `package.json`, `package-lock.json`, `eslint.config.mjs` und `CLAUDE.md`
  werden beim Packen automatisch ausgeschlossen.

Jedes Release traegt je Erweiterung zwei Dateien: `foo-1.3.0.zip` als
archivierte Fassung und `foo.zip` mit identischem Inhalt unter festem Namen.
Der dauerhafte Download-Link lautet deshalb
`https://github.com/pascallink/webkit-ext/releases/latest/download/foo.zip` -
er zeigt immer auf das neueste Release. Die frueher genutzte rollierende
Release `latest` faellt weg; sie ist immutable und laesst sich nicht mehr
aktualisieren.

## Versionierung

Nach jedem Merge auf `main` hebt
[`version-bump.yml`](.github/workflows/version-bump.yml) die Patch-Stelle der
beruehrten Erweiterungen an und schreibt sie zurueck. Fuer eine
Veroeffentlichung setzt du die Version von Hand auf `x.y.0`, taggst sie und
legst dazu ein Release an - erst das erzeugt ZIPs.
