# Architekturdiagramme

Erzeugt mit dem Archify-Skill (`.claude/skills/archify/`, MIT, `tt-a1i/archify`).
Quelle ist die typisierte JSON-Spezifikation, das HTML ist reines Ergebnis und
wird nie von Hand bearbeitet.

| Datei | Rolle |
| --- | --- |
| `poweredit-runtime.architecture.json` | Spezifikation - hier wird gepflegt. |
| `poweredit-runtime.html` | Erzeugtes, eigenstaendiges Diagramm. |
| `markdown-umwandlung.dataflow.json` | Datenweg: Markdown umwandeln, von der Quelle bis in das Feld. |
| `einfuegen-vorlagen.dataflow.json` | Datenweg: Vorlage, Panel und Codeblock einfuegen. |
| `otrs-link.dataflow.json` | Datenweg: OTRS-Verweis zerlegen und in den Vorgang eintragen. |
| `kunden-schluessel.dataflow.json` | Datenweg: Zuordnungstabelle pflegen, Feld anreichern, Vorgang und Leseansicht. |
| `markdown-einfuegen.workflow.json` | Ablauf: Ausloeser, Weichen und Abbrueche beim Einfuegen. |
| `vorlagen-pflegen.workflow.json` | Ablauf: Vorlage aendern, speichern, im Tab ankommen. |
| `host-freigabe.workflow.json` | Ablauf: zusaetzlichen Host freigeben und Content-Scripts nachziehen. |
| `bearbeitung-einfrieren.lifecycle.json` | Zustaende des Einfrierens: aus, wachbereit, eingefroren, offen. |
| `nachrichtenwege.sequence.json` | Nachrichten zwischen Popup, Service-Worker und Tab, inklusive Nachinjektion. |
| `testarchitektur.architecture.json` | Testaufbau: Runner, Module, geteilte Helfer, Fixtures. |
| `datenschutz.dataflow.json` | Nachweis fuer den Store: welche Daten wo bleiben. |

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

## Auslieferung an den Nutzer

Beim Tag-Push baut `release.yml` aus diesen Spezifikationen das Asset
`jira-markdown-converter-docs-<version>.zip` (zusaetzlich als
`jira-markdown-converter-docs.zip` fuer den Direktlink). Niemand muss die
Diagramme selbst erzeugen, um sie zu lesen.

Gesteuert wird das ueber `docsBundle` in der `package.json` des Projekts;
`testarchitektur.architecture.json` steht dort in `exclude`, weil es den
Testaufbau beschreibt und nicht das Produkt. Details in
[`.github/CI.md`](../../../.github/CI.md).

## Weitere Spezifikationen (Dataflows, Workflows, Lifecycles)

Nur `poweredit-runtime.html` liegt als erzeugtes HTML im Repo, weil es
verlinkt ist. Die uebrigen Spezifikationen erzeugt man bei Bedarf; jedes HTML
ist rund 800 KB gross.

Fuer jede Spezifikation (Typ = Endung vor `.json`):

```bash
export ARCHIFY_UPDATE_CHECK_DISABLED=1
node <a>/bin/archify.mjs validate <typ> <spezifikation>.json \
  --quality showcase --json
node <a>/bin/archify.mjs deliver <typ> <spezifikation>.json \
  <ziel>.html --quality showcase --json
```

`<a>` = `.claude/skills/archify`, `<typ>` ist `dataflow`, `workflow`, `lifecycle`,
`sequence` oder `architecture`. Diese Typen lehnen `--repo-root .` ab (nur `architecture`
akzeptiert es).
