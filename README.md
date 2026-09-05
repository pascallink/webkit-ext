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

Jedes Release traegt je Erweiterung ein `foo-1.3.0.zip` - die Version steht
im Dateinamen. Wer zusaetzlich einen Direktlink ohne Version braucht, setzt
in seiner `package.json` `"stableZipAlias": true`; dann entsteht derselbe
Inhalt noch einmal als `foo.zip` und
`https://github.com/pascallink/webkit-ext/releases/latest/download/foo.zip`
zeigt dauerhaft auf das neueste Release. Ohne das Flag gibt es nur die
versionierte Datei, verlinkt wird dann die
[Release-Uebersicht](https://github.com/pascallink/webkit-ext/releases/latest).

`jira-markdown-converter` hat das Flag gesetzt, weil Links dieser Form bereits
im Umlauf sind. Die frueher genutzte rollierende Release `latest` faellt weg;
sie ist immutable und laesst sich nicht mehr aktualisieren.

## Versionierung

Nach jedem Merge auf `main` hebt
[`version-bump.yml`](.github/workflows/version-bump.yml) die Patch-Stelle der
beruehrten Erweiterungen an und schreibt sie zurueck. Fuer eine
Veroeffentlichung setzt du die Version von Hand auf `x.y.0`, taggst sie und
legst dazu ein Release an - erst das erzeugt ZIPs.
