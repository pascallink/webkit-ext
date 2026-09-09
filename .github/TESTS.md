# Testmodule (jira-markdown-converter)

Ausgelagert aus der Projekt-`CLAUDE.md` (dort auf 40 Zeilen gedeckelt): Details
zur Testsuite braucht man nur, wenn man an Tests selbst arbeitet oder ein neues
Modul anlegt. Hintergrund und Migration: Issue #55.

Zielplattform ist ausschliesslich Jira Server / Data Center 9.12 LTS (9.12.2).
Neue Tests werden gegen die Server-Fixtures geschrieben (`mock-jira-server.html`,
`mock-jira-rte.html`, `mock-jira-inline-edit.html`,
`mock-jira-issue-description.html`). Das Cloud-Fixture `mock-jira.html` und die
darauf laufenden Faelle bleiben bestehen, damit der ausgelieferte Stand gruen
ist - sie werden aber nicht mehr ausgebaut.

## Modul-Landkarte

Ein Modul = ein Ordner unter `test/modules/`. Jede Quelldatei gehoert genau
einem Modul, Schnitt entlang der Verantwortung im Quellcode.

| Modul | Quellen | Tests | Issues |
| --- | --- | --- | --- |
| `converter` | `src/converter.js` | 108 Node | - |
| `settings` | `src/settings.js` | 64 Node + 10 Browser | #31, #32 |
| `editors` | `src/editors.js` | 18 Browser | #31, #32 |
| `content` | `src/content.js`, `src/content.css` | 38 Browser | #31, #32 |
| `dialogs` | `src/codedialog.js`, `src/templatedialog.js`, `src/codedialog.css` | 44 Browser | #31 |
| `editlock` | `src/editlock.js` | 21 Browser | #63 |
| `options` | `options/` | 8 Browser | #31, #32 |
| `popup` | `popup/` | 5 Browser | - |
| `background` | `src/background.js` | 7 Node | #32 |
| `package` | `manifest.json`, `docs/store/` | 31 Node + Guard | alle |
| `mapping` *(reserviert)* | `src/mapping.js` *(geplant)* | - | **#32** |
| `otrs` | `src/otrslink.js` | 12 Node | #17 |

`mapping` bekommt seinen Ordner erst mit dem jeweiligen Feature -
die Zeile hier reserviert nur den Namen, damit ein neues Modul nicht zufaellig
kollidiert. Aktuelle Testzahlen: `node test/run.js --list` (im Projektordner).

## Verzeichnisstruktur

```
jira-markdown-converter/test/
  run.js                       CLI: Modul- und Artauswahl, spawnt node --test
  lib/                         modulunabhaengig, von jedem Modul nutzbar
    chrome-stub.js             Node-Stub: withChromeStub, storageStub,
                                onChangedStub, backgroundStub
    page-stub.js                chrome-Stub als Quelltext-String fuer die Seite
    browser.js                 withBrowser, newPage, optionsPage, popupPage,
                                SOURCES/STYLES aus manifest.json
    dom.js                     pasteInto, stubClipboard, setCaret, setRichCaret
    fixtures.js                 CLOUD, SERVER, RTE, INLINE, ISSUE - Pfade
  fixtures/                    die 5 HTML-Mocks, unveraendert und schreibgeschuetzt
  modules/
    converter/    converter.test.js  blocks.test.js  html.test.js
    settings/     settings.test.js   storage.test.js   browser/toggle.test.js
    editors/      browser/{server,rte,caret}.test.js
    content/      browser/{fab,panel,paste,blockmakros,fieldbar,robustheit}.test.js
    dialogs/      browser/{code,panel,placeholder}.test.js
    editlock/     browser/{inline,description}.test.js
    options/      browser/templates.test.js
    otrs/         otrslink.test.js
    popup/        browser/popup.test.js
    background/   background.test.js
    package/      manifest.test.js  sources.test.js  store.test.js
                  isolation.test.js
```

Drei Achsen der Granularitaet, alle ohne Glob-Muster:

1. **Modul** = Ordner unter `test/modules/`. Das ist die Kontext-Einheit -
   siehe "Test-Kontext-Regeln" in der Root-`CLAUDE.md`.
2. **Art**: `*.test.js` direkt im Modulordner (Node, schnell) gegen
   `browser/*.test.js` (Playwright, startet Chromium).
3. **Einzelfall** ueber `--test-name-pattern`. `describe()`-Bloecke bilden
   diese Achse ab, keine zusaetzliche Tag-Konvention noetig.

## `test/run.js` - CLI

`node --test <verzeichnis>` waere naheliegend, taugt hier aber nicht: die
Datei-Erkennung variiert zwischen den Node-Majors und wuerde `test/lib/*.js`
je nach Version als Testdateien einsammeln. `run.js` uebergibt stattdessen
eine **explizite Dateiliste** an `node --test` und umgeht die Frage.

```
node test/run.js                       alles (Node + Browser)
node test/run.js settings              ein Modul, beide Arten
node test/run.js settings editors      mehrere Module
node test/run.js --node                nur Node-Tests, kein Chromium
node test/run.js --browser             nur Playwright-Tests
node test/run.js dialogs --name x      -> --test-name-pattern
node test/run.js --list                Module und Testzahlen auflisten
```

Verhalten: unbekannter Modulname -> Exit 1 mit der Liste der bekannten Module.
Playwright nicht installiert -> Browser-Dateien werden uebersprungen, Exit 0.
Browser-Laeufe fahren mit `--test-concurrency=1` (sonst starten mehrere
Chromium-Instanzen parallel). Der Exit-Code von `node --test` wird
durchgereicht. `package.json` bindet die haeufigsten Aufrufe als Skripte:
`test`, `test:node`, `test:browser` und `test:<modul>` je Modul (siehe
Modul-Landkarte oben).

## Mocking-Vertrag

- **Ein Stub, zwei Formen.** `lib/chrome-stub.js` liefert den Node-seitigen
  Stub, `lib/page-stub.js` denselben Vertrag als Quelltext-String fuer
  `page.addInitScript`/`page.addScriptTag`. Beide bilden die sync/local-
  Trennung aus `Settings.LOCAL_KEYS` ab. Keine dritte Kopie.
- **`SOURCES`/`STYLES` aus dem Manifest lesen**, nicht hart verdrahten
  (`lib/browser.js`). Ein neuer Eintrag in `manifest.json` reicht, damit eine
  neue Content-Script-Datei in allen Browser-Tests mitlaeuft.
- **Modulspezifische Mocks** liegen unter `test/modules/<modul>/mocks/` und
  werden nur dort verwendet - noch nicht gebraucht, aber vorgesehen.
- **Fixtures bleiben geteilt und schreibgeschuetzt.** Fuenf HTML-Dateien fuer
  fuenf Jira-Varianten, ueber `lib/fixtures.js` referenziert - je Modul zu
  duplizieren wuerde nichts entkoppeln, sondern nur Drift erzeugen.
- **Service-Worker ohne UMD** (`src/background.js`): laedt seine
  Abhaengigkeiten per `importScripts()` und liest sie ueber `self.JiraMd*`
  statt per `require()`. Der Node-Test setzt dafuer `globalThis.self =
  globalThis` und `globalThis.importScripts = function () {}`, laedt
  `settings.js`/`converter.js` regulaer per `require()` (ihre UMD-Huelle
  haengt sich selbst an `self` bzw. `globalThis`) und requiret
  `background.js` danach frisch - der `require`-Cache wird vorher geleert,
  weil `chrome.runtime.onMessage.addListener(...)` beim Laden auf den zu
  diesem Zeitpunkt aktuellen `chrome`-Stub zeigt. `backgroundStub()` in
  `lib/chrome-stub.js` liefert dafuer `contextMenus`, `commands` und
  `runtime.onMessage/onInstalled/onStartup` als Listener-Stubs.
- **Die Regel wird geprueft, nicht nur dokumentiert:** `package/isolation.test.js`
  liest alle Dateien unter `test/modules/`, wertet jeden `require()`-Pfad aus
  und laesst nur zu: eigener Modulordner, `test/lib/`, `test/fixtures/`,
  Projektquellen (`src/`, `options/`, `popup/`), Node-Builtins und
  `playwright`. Derselbe Test prueft, dass jedes Modul ein
  `test:<modul>`-Skript in `package.json` hat und umgekehrt. Der Guard liest
  nur `test/modules/` - `test/lib/` ist per Definition geteilt und wird
  selbst nicht geprueft.

## Browser-Binary und Playwright-Version

`playwright` steht in der `package.json` **exakt** (`1.56.0`), nicht mit `^`.
Grund: Jede Playwright-Minor bringt eine neue Chromium-Revision mit. Die
Sandbox der Agenten (Claude Code) hat Chromium vorinstalliert
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, Revision 1194 = Playwright
1.56.x). Loest `^1.56.0` auf eine neuere Minor auf, sucht Playwright eine
Revision, die dort nicht liegt - die Browser-Tests scheitern mit
"Executable doesn't exist" und jede Sitzung laedt mehrere hundert MB nach.

- **In einer Agenten-Sitzung nie `npx playwright install` aufrufen.** Passt
  die Version, ist der Browser schon da; passt sie nicht, gehoert die
  Version korrigiert. Auf den GitHub-Runnern ist er nicht vorinstalliert,
  dort holt ihn `build-extension.yml` bewusst selbst.
- Anheben nur bewusst und nur zusammen mit der Revision der Umgebung. Probe:
  `node -e "require('playwright').chromium.launch().then(b=>b.close())"` -
  passt die Revision nicht, nennt die Fehlermeldung den fehlenden Pfad.
- `CHROMIUM_PATH` bleibt der Notausgang fuer lokale Rechner ohne
  vorinstallierten Browser (siehe `test/lib/browser.js`).

Nachladen ist in der Sandbox ohnehin keine Option: die Netz-Allowlist der
Stufe **Trusted** kennt npm, aber nicht `cdn.playwright.dev` und
`playwright.download.prss.microsoft.com`. Ein `playwright install` laeuft dort
in ein 403 des Proxys. Die Version muss also passen, sie laesst sich nicht
zurechtinstallieren.

### Setup-Script fuer das Cloud-Environment

Optionale Absicherung, kein Muss - der Stand oben laeuft auch ohne. Das Script
gehoert in das Feld **Setup script** des Environments (claude.ai/code ->
Environment-Einstellungen) und laeuft einmal je Snapshot, nicht je Sitzung.
Passt die Version zum Image, ist es nach zwei Sekunden fertig und laedt nichts.

```bash
#!/bin/bash
# Setup-Script fuer das Cloud-Environment von webkit-ext.
# Laeuft einmal pro Environment-Snapshot, nicht pro Sitzung.
PW_VERSION=1.56.0
WARMUP=/opt/pw-warmup

mkdir -p "$WARMUP" && cd "$WARMUP" || exit 0

npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund "playwright@${PW_VERSION}" >/dev/null 2>&1

if npx playwright install chromium >/dev/null 2>&1; then
  echo "webkit-ext: Chromium fuer Playwright ${PW_VERSION} liegt bereit."
else
  echo "webkit-ext: ACHTUNG - Chromium fuer Playwright ${PW_VERSION} fehlt und"
  echo "  liess sich nicht laden. Entweder passt die gepinnte Version nicht zum"
  echo "  Image (Revisionen: ls /opt/pw-browsers), oder cdn.playwright.dev und"
  echo "  playwright.download.prss.microsoft.com fehlen in der Netz-Allowlist"
  echo "  des Environments (Network access: Custom)."
  echo "  Solange das gilt, laufen nur die Node-Tests: npm run test:node."
fi

exit 0
```

Zwei Dinge daran sind Absicht:

- **`exit 0` am Ende, kein `set -e`.** Ein Setup-Script, das nicht mit 0
  endet, laesst die Sitzung gar nicht erst starten. Ein fehlender Browser darf
  die Arbeit an `converter.js` nicht blockieren.
- **`PW_VERSION` steht hier doppelt** (Environment und `package.json`). Das
  Script sieht das Repo nicht zuverlaessig, darum die Kopie. Beim Anheben der
  Playwright-Version also beide Stellen - und dann braucht das Environment
  einmalig **Network access: Custom** mit den beiden Download-Hosts oben, sonst
  meldet das Script genau das.

## Neues Modul anlegen

1. Ordner unter `test/modules/<modul>/` anlegen; Browser-Tests kommen in
   `test/modules/<modul>/browser/`, Node-Tests direkt in den Modulordner.
2. `test:<modul>` in `package.json` eintragen (`node test/run.js <modul>`).
   `run.js` findet den Ordner danach selbst, `isolation.test.js` verlangt
   das Skript ab dem naechsten Testlauf.
3. Zeile in der Modul-Landkarte oben ergaenzen.
4. Nur aus dem eigenen Modulordner, `test/lib/` und den Projektquellen
   requiren - alles Geteilte gehoert nach `test/lib/`, nichts aus einem
   fremden Modulordner.
5. In Dateien unter `test/modules/` keine rohen Anfuehrungszeichen (") oder
   Apostrophe (') in Regex-Literalen verwenden, sondern `\x22` (") und `\x27` (').
   Der Zustandsscan in `package/isolation.test.js` kennt keinen Regex-Zustand und
   haelt ein solches Anfuehrungszeichen sonst fuer einen Stringanfang; die Datei
   wird dann als "nicht auswertbar" gemeldet. `test/lib/` und `test/run.js` sind
   davon nicht betroffen, weil der Guard nur `test/modules/` liest.

## Reservierte Module

`mapping` (Issue #32, CustomerKey-Mapping) ist in der Modul-Landkarte
reserviert, existiert aber noch nicht: `src/mapping.js` ist geplant, nicht
vorhanden. Der Testordner entsteht mit dem jeweiligen Feature, nach
derselben Anleitung wie oben.
