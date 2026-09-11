# Browser-Tests laden die Quellen in die Seite statt als Erweiterung - isolierte Welt, Storage, Service-Worker und Popup bleiben ungeprueft

**Labels:** test, infrastructure, medium
**Schwere:** mittel - eine ganze Fehlerklasse ist fuer die Suite unsichtbar, obwohl alle 390 Tests gruen sind
**Nachgewiesen:** `test/lib/browser.js` (`addScriptTag` + `CHROME_STUB`); Gegenprobe mit echter Erweiterung in Edge 152 (siehe `docs/mockup/`)

## Beschreibung

`newPage()` injiziert `settings.js` ... `content.js` per `page.addScriptTag`
in die **Hauptwelt** der Fixture und stellt `chrome.*` ueber einen Stub nach.
Die echte Erweiterung laeuft dagegen in der **isolierten Welt** mit echtem
`chrome.storage`, echtem Service-Worker und echten Popup-/Optionsseiten.
Unterschiede, die die Suite darum nicht sehen kann:

| Thema | Suite | Erweiterung |
| --- | --- | --- |
| `window.JIRA`, `window.AJS`, jQuery der Seite | sichtbar | nicht sichtbar (`pingJiraTrace()` ist tot) |
| Expando-Eigenschaften (`bar.__jmdField`, `menu.__jmdAnchor`) | von Tests lesbar | nur in der isolierten Welt, fuer Seiten-Skripte unsichtbar |
| `chrome.storage.onChanged` ueber Tabs, Debounce 50 ms | Stub ohne Events | echt (zwei Events je `save()`) |
| Badge, Kontextmenue, `scripting.registerContentScripts` | 7 Node-Tests mit Stub | echt |
| Popup "In Jira einfuegen" -> `tabs.sendMessage` | nicht getestet | echt |
| Freigabe eines Hosts (`permissions.request`) | nicht getestet | nativer Dialog |
| Echte Zwischenablage + Tastatur-Paste + Undo | synthetisches `paste` | echt (Issue 09 wurde erst so sichtbar) |
| `beforeunload`-Dialog | nicht getestet | echt (Issue 02) |

## Vorschlag

Zweite Test-Ebene `ext` neben `node` und `browser` (Details in
`docs/qualitaets-vorschlaege.md`):

- Playwright `launchPersistentContext` mit `channel: 'msedge'` bzw.
  Chromium, `--load-extension=<projekt>`, Fixtures ueber einen kleinen
  HTTP-Server auf `localhost`, Host per Test-Manifest-Kopie freigegeben.
- Zugriff auf Service-Worker (`context.serviceWorkers()`), Popup und
  Optionsseite ueber `chrome-extension://<id>/...`.
- Assertions nur ueber das DOM und ueber `chrome.storage` aus einer
  Erweiterungsseite heraus - keine Expandos.
- Regel fuer alle Module: kein Zugriff auf Globals der Seite
  (`window.JIRA`, `AJS`, `jQuery`) im Quellcode; Lint-Regel
  `no-restricted-globals` dafuer.
- Vorlage: `docs/mockup/edge-harness.js`, `docs/mockup/cdp.js`,
  `docs/mockup/scenario-3.js`.
