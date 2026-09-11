# Nachbau der Jira-9.12.2-Vorgangsansicht und Edge-Harness

Material aus der Analyse- und Testsession vom 2026-09-11 (siehe
`docs/issues/`, `docs/testprotokoll-DBREFI-10549.md`,
`docs/qualitaets-vorschlaege.md`). Nichts hiervon ist Laufzeitcode.

| Datei | Zweck |
| --- | --- |
| `mock-jira-912-issue-view.html` | Vorgangsansicht, aus dem DOM-Geruest von DBREFI-10549 auf jira.inxire.com (9.12.2, Rich-Text-Editor aktiv) gebaut: Kopf mit echten Toolbar-Links, Details mit Labels, Inline-Beschreibung, Kommentarformular, Dialog *Vorgang bearbeiten* (AUI-Dialog2), Label-Dialog (`l`), Shifter (`.`), Link-Dialog mit Web-Link-Pane, Feld-Modal *Kunden Referenz*, TinyMCE-Nachbau (`div.tox`, `iframe#mce_N_ifr`) mit Wiki<->HTML-Umschalter und den beobachteten Paste-Regeln (style auf `div` entfernt, `pre` ohne panel-Klasse ausgepackt). Jira-Handler protokollieren in `window.__mock.log` und im Kasten unten rechts. Zustaende per `?state=comment|description|edit|labels|link|shifter`. |
| `edge-harness.js` | Startet das installierte Edge (`channel: 'msedge'`) mit der Erweiterung in einem frischen Profil, CDP auf Port 9333. Erwartet `./ext` (Kopie der Erweiterung; Manifest wird um `localhost:8765` und `jira.inxire.com` ergaenzt) und `./profile`. |
| `cdp.js` | `withPage(url, fn)` per `connectOverCDP`, Dialoge werden protokolliert und bestaetigt, Screenshots nach `./shots`. |
| `jira-lib.js` | DOM-Geruest ziehen (`skeleton()`, wie `docs/dom-auszug.md`, ohne Inhalte), Zustand der Erweiterung lesen (`extState()`), Protokoll. |
| `scenario-mock2.js` | Die Instanz-Befunde gegen den Nachbau: Link-Navigation bei Sperre, Abbrechen im Kommentar, Code/Panel im RTE, Sperre im visuellen Modus, Escape/Abbrechen im Dialog, Shifter/Labels/Web-Link. |
| `jira-protocol-text.js`, `jira-protocol-visual.js` | Die Skripte, mit denen das Testprotokoll gegen die Instanz gefahren wurde (aendern das Ticket: Kommentar, Beschreibung). |
| `*.png` | Screenshots: Fixture, Nachbau, Instanz (Bearbeiten-Dialog, formatiertes Einfuegen im RTE, gerenderter Testkommentar). |

Die rohen DOM-Auszuege der Instanz liegen **nicht** im Repo (siehe
`docs/dom-auszug.md`); der Nachbau enthaelt nur Geruest und die
Custom-Field-Kennungen, die fuer den OTRS-Flow ohnehin im Code stehen.

## Ablauf

```bash
# 1. Arbeitsordner ausserhalb des Repos
mkdir -p /tmp/poweredit-harness && cd /tmp/poweredit-harness
cp <repo>/jira-markdown-converter/docs/mockup/*.js .
mkdir -p ext profile shots www
cp -R <repo>/jira-markdown-converter/{manifest.json,src,popup,options,icons} ext/
cp <repo>/jira-markdown-converter/test/fixtures/*.html <repo>/jira-markdown-converter/docs/mockup/*.html www/

# 2. Fixtures und Nachbau ausliefern
(cd www && python3 -m http.server 8765 --bind 127.0.0.1 &)

# 3. Edge mit Erweiterung starten (bleibt offen)
node edge-harness.js &

# 4. Szenario gegen den Nachbau
node scenario-mock2.js

# 5. Gegen die Instanz: im Harness-Fenster anmelden, dann
node jira-protocol-text.js
```

`edge-harness.js` und `cdp.js` laden Playwright aus
`<repo>/jira-markdown-converter/node_modules` - vorher `npm install --prefix
jira-markdown-converter`. Kein `npx playwright install`: der Harness benutzt
das installierte Edge. Die Zwischenablage wird per `pbcopy` gesetzt (macOS),
weil `grantPermissions` ueber CDP nicht greift.

## Was der Nachbau reproduziert (Lauf vom 2026-09-11)

| Befund in der Instanz | Nachbau |
| --- | --- |
| Toolbar-Link navigiert weg, solange eingefroren (Issue 25) | ja (`?left=...`-Banner) |
| Abbrechen im Kommentar funktioniert trotz Sperre | ja |
| Escape und Abbrechen im Bearbeiten-Dialog blockiert (Issue 03) | ja |
| Visueller Modus: nach dem Oeffnen nicht eingefroren, Klick daneben speichert (Issue 20) | ja |
| Code-Dialog/Panel-Vorlage im RTE verlieren `pre`/`style` (Issues 21, 22) | ja |
| Umschalter `li[data-mode] > button` (Issue 23) | ja |
| Shifter, Label-Dialog, Feld-Modal, Web-Link-Pane (Issue 26) | ja |
