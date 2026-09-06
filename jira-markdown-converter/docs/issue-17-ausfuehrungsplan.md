# Ausfuehrungsplan Issue #17 - OTRS Link Helper

Zerlegung von [Issue #17](https://github.com/pascallink/webkit-ext/issues/17) in
sechs atomare Sub-Tasks. Jeder Sub-Task ist ein Branch und ein Pull Request
(Stacked PRs: PR 1 auf `main`, PR 2 auf PR 1 usw.) und laeuft in einer eigenen
Chat-Session.

## Abweichung von der Issue-Vorlage

Die Vorlage im Issue nennt "Senior iOS Lead Architect", Swift und `xcodebuild`.
Das ist ein Rest aus einem fremden Template. Das Zielprojekt ist
`jira-markdown-converter`, eine Chrome/Edge-Erweiterung (MV3) in ES5-JavaScript
ohne Bundler. Struktur und Regeln der Vorlage bleiben, der Stack wird ersetzt:

| Vorlage | Hier |
| --- | --- |
| Swift, kompilierbar | ES5, `npm run lint` fehlerfrei |
| `xcodebuild ... test` | `npm test --prefix jira-markdown-converter` |
| XCTest / UI-Tests | Node-Runner in `test/`, Playwright in `test/integration.test.js` |

## Zielbild

Ein Helfer-Dialog nimmt einen OTRS-Verweis in beliebigem Format entgegen,
zerlegt ihn und pflegt ihn nach Klick auf "Absenden" an drei Stellen des
Jira-Vorgangs ein: Label, Custom Field "Kunden Referenz", Web-Link.

Zielumgebung ist **Jira Server / Data Center 9.12 LTS** mit klassischer AUI.
Zusaetzliche Hosts (z. B. `jira.firma.de`) laufen ueber die bestehende
Mechanik `extraHosts` + `optional_host_permissions`. **Am Manifest sind keine
neuen Berechtigungen noetig** - `package.test.js` prueft die Liste hart.

## Modul-Schnitt

| Datei | Global (UMD) | Rolle | DOM? |
| --- | --- | --- | --- |
| `src/otrslink.js` | `JiraOtrsLink` | Eingabe zerlegen (Markdown/HTML/Text) | nein |
| `src/jiraui.js` | `JiraUi` | `waitForElement`, Tasten, Werte setzen | ja |
| `src/otrsflow.js` | `JiraOtrsFlow` | Die drei Schritte gegen die AUI | ja |
| `src/otrsdialog.js` | `JiraOtrsDialog` | Eingabedialog | ja |
| `src/content.js` | - | Verdrahtung, Toast, Warnung | ja |

Ladereihenfolge im Manifest (neu **hinten angehaengt**, `content.js` bleibt
letzte Datei, damit die bestehenden Zusicherungen in `package.test.js`
unberuehrt bleiben):

```
settings -> converter -> editors -> codedialog -> editlock
        -> otrslink -> jiraui -> otrsflow -> otrsdialog -> content
```

> **Stolperfalle fuer jeden Sub-Task, der das Manifest anfasst:**
> `src/background.js` fuehrt dieselbe Liste als `var CONTENT_FILES = [...]`.
> `package.test.js` vergleicht beide mit `deepStrictEqual`. Immer beide aendern.

## Uebersicht der Sub-Tasks

| # | Branch | Base | Ergebnis |
| --- | --- | --- | --- |
| 1 | `feature/issue-17-part-1` | `main` | Parser + Unit-Tests |
| 2 | `feature/issue-17-part-2` | part-1 | DOM-Helfer + AUI-Fixture |
| 3 | `feature/issue-17-part-3` | part-2 | Automationsablauf |
| 4 | `feature/issue-17-part-4` | part-3 | Eingabedialog |
| 5 | `feature/issue-17-part-5` | part-4 | Verdrahtung, Schalter, Meldungen |
| 6 | `feature/issue-17-part-6` | part-5 | Doku, Store-Unterlagen, Version |

---

## Sub-Task 1: Parser fuer OTRS-Verweise

* **Git Branch:** `feature/issue-17-part-1` (Base Branch: `main`)
* **Scope / Ziel:** Ein DOM-freies Modul, das die drei Eingabeformen
  (Markdown-Link, HTML-Anker, Rohtext mit eingebetteter URL) in ein Objekt mit
  Ticketnummer, Titel und URL zerlegt. Kein Zugriff auf `document`, damit der
  Node-Runner das Modul direkt laden kann - dieselbe Regel wie bei
  `converter.js`.
* **Dateiebene:**
  * Zu erstellen: `jira-markdown-converter/src/otrslink.js`,
    `jira-markdown-converter/test/otrslink.test.js`
  * Zu aendern: `jira-markdown-converter/package.json`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/otrslink.js` nach dem UMD-Muster aus `src/settings.js` anlegen
     (`module.exports` **und** `root.JiraOtrsLink`), `'use strict'`, nur `var`.
  2. Exportiere `parse(input)`. Rueckgabe bei Erfolg:
     ```js
     {
       ok: true,
       ticketNumber: '2026070710000078',
       title: 'Ticket#2026070710000078 - REFI PU 47.2 - Probleme mit ...',
       url: 'https://support.inxire.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=15285;ArticleID=102557',
       label: '2026070710000078',    // Wert fuer das Label
       reference: '<title>',          // Wert fuer "Kunden Referenz"
       linkText: '<title>'            // Beschriftung des Web-Links
     }
     ```
     Bei Fehlschlag `{ ok: false, error: '<Meldung auf Deutsch, ohne Umlaute>' }`.
     Nie werfen - der Aufrufer zeigt `error` im Dialog an.
  3. Erkennung in dieser Reihenfolge, erste Uebereinstimmung gewinnt:
     1. Markdown `[Titel](URL)` - `/\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)\s*\)/`
     2. HTML-Anker - `/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i`,
        Tags im Anker-Text entfernen, Entities `&amp; &lt; &gt; &quot; &#39; &nbsp;`
        aufloesen (kein `innerHTML`, reine Textersetzung).
     3. Rohtext - erste `https?://`-URL herausziehen, der Rest (getrimmt,
        Mehrfach-Leerzeichen zusammengezogen) ist der Titel.
  4. Ticketnummer: zuerst `/Ticket#\s*(\d{6,})/i` im Titel, sonst
     `/\bTicketNumber=(\d{6,})/i` in der URL, sonst die laengste Ziffernfolge
     mit mindestens 12 Stellen im Titel. Wird keine gefunden: `ok: false` mit
     `error: 'Keine Ticketnummer gefunden.'`.
  5. URL pruefen: nur `http:` und `https:` zulassen (`javascript:`, `data:`
     verwerfen), am Ende haengende `>` `)` `.` `,` abschneiden. Ohne gueltige
     URL: `ok: false`, `error: 'Keine gueltige URL gefunden.'`.
  6. Titel normalisieren: trimmen, `\s+` zu einem Leerzeichen, Laenge auf 255
     Zeichen begrenzen (Grenze des Jira-Textfelds).
  7. `test/otrslink.test.js` nach dem Muster von `test/settings.test.js`
     schreiben (`require`, `assert`, eigener `test()`-Helfer, Exit-Code 1 bei
     Fehlern). Mindestens diese Faelle:
     * Markdown-Beispiel aus dem Issue - alle vier Felder korrekt
     * HTML-Anker mit `target="_blank"` und Entities im Titel
     * Rohtext `Ticket#2026... siehe https://support.inxire.com/...`
     * URL mit Semikolon-Parametern bleibt unveraendert
     * mehrzeilige Eingabe mit fuehrenden Leerzeichen
     * leere Eingabe -> `ok: false`
     * Eingabe ohne URL -> `ok: false`
     * `javascript:alert(1)` -> `ok: false`
     * Titel ohne `Ticket#`, aber 16-stellige Nummer -> erkannt
  8. In `package.json` das Skript `"test:otrs": "node test/otrslink.test.js"`
     ergaenzen und `test:otrs` in die `test`-Kette aufnehmen (**nach**
     `test:settings`, vor `test:package`).
  9. Lint und Tests ausfuehren.
* **Definition of Done:**
  * [ ] `npm run lint --prefix jira-markdown-converter` ohne Befund
  * [ ] `npm test --prefix jira-markdown-converter` gruen, `otrslink.test.js` laeuft mit
  * [ ] `src/otrslink.js` enthaelt kein `document`, kein `window`, kein `console.log`
  * [ ] Keine Umlaute in Kommentaren und Meldungen
  * [ ] Commit `feat(jira): otrs-verweise zerlegen` und Push auf `feature/issue-17-part-1`

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies zuerst CLAUDE.md im Repo-Root und in jira-markdown-converter/, dann
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - dort Sub-Task 1.

Aufgabe: Setze Sub-Task 1 aus diesem Plan um, nichts darueber hinaus.
Branch: von main abzweigen als feature/issue-17-part-1.

Neu: src/otrslink.js (UMD-Modul JiraOtrsLink mit parse(input), DOM-frei, ES5,
'use strict', nur var - Vorbild ist src/settings.js) und
test/otrslink.test.js (Vorbild test/settings.test.js).
Geaendert: package.json - Skript test:otrs anlegen und in die test-Kette
zwischen test:settings und test:package einhaengen.

Halte dich strikt an die Schritte 1-9 des Sub-Tasks, inklusive der genannten
Regexe, der Rueckgabestruktur und der neun Testfaelle.

Regeln: Deutsch ohne Umlaute (ue/ae/oe/ss), keine Runtime-Dependencies, kein
Bundler, kein console.log. Fasse content.js, manifest.json und background.js
in diesem Schritt NICHT an.

Abschluss:
  npm install --prefix jira-markdown-converter
  npm run lint --prefix jira-markdown-converter
  npm test  --prefix jira-markdown-converter
Beides muss gruen sein. Dann committen als
"feat(jira): otrs-verweise zerlegen" und mit
git push -u origin feature/issue-17-part-1 pushen. PR gegen main anlegen.
```

---

## Sub-Task 2: DOM-Helfer fuer AUI und Testfixture

* **Git Branch:** `feature/issue-17-part-2` (Base Branch: `feature/issue-17-part-1`)
* **Scope / Ziel:** Die Bausteine gegen Race Conditions: auf Elemente warten
  (`MutationObserver`), Tastendruecke senden, Werte so setzen, dass die
  AUI-Handler sie mitbekommen. Dazu eine Jira-9.12-Fixture, gegen die die
  Sub-Tasks 3 bis 5 testen. Noch keine Fachlogik.
* **Dateiebene:**
  * Zu erstellen: `jira-markdown-converter/src/jiraui.js`,
    `jira-markdown-converter/test/fixtures/mock-jira-otrs.html`
  * Zu aendern: `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/src/background.js`,
    `jira-markdown-converter/test/integration.test.js`,
    `jira-markdown-converter/test/package.test.js`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/jiraui.js` als UMD-Modul `JiraUi` anlegen (ES5, `'use strict'`).
     Exportiere:
     * `waitForElement(selector, options)` -> `Promise<Element>`;
       `options = { root, timeout (Standard 5000), visible }`. Zuerst direkt
       `querySelector`, sonst `MutationObserver` auf
       `{ childList: true, subtree: true, attributes: true }`; Observer und
       Timer in **jedem** Ausgang abraeumen. Timeout lehnt mit
       `new Error('Element nicht gefunden: ' + selector)` ab.
     * `waitForGone(selector, options)` -> `Promise` - fuer geschlossene Modale.
     * `setValue(field, value)` - Wert setzen ueber den nativen
       `value`-Setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`),
       danach `input` und `change` als `Event(..., { bubbles: true })` feuern,
       damit AUI und jQuery reagieren.
     * `sendKey(target, key, options)` - `keydown`, `keypress`, `keyup` mit
       `key`, `code`, `keyCode`, `which`, `bubbles: true`.
     * `click(element)` - `focus()` plus echter `MouseEvent('click', { bubbles: true })`.
     * `visible(element)` - `offsetParent !== null` oder Rechteck > 0.
     * `delay(ms)` -> `Promise`.
  1b. **Liegt ein DOM-Auszug aus der echten Instanz vor** (Vorgehen:
     [`docs/dom-auszug.md`](dom-auszug.md)), leite die Fixture daraus ab: Tags,
     `id`, Klassen und `data-*` eins zu eins uebernehmen, Texte und Inhalte
     erfinden. Der Auszug selbst wird **nicht** eingecheckt. Ohne Auszug gelten
     die unten genannten Selektoren als Annahme - dann in Sub-Task 3 auf die
     Fallback-Ebene achten.
  2. `test/fixtures/mock-jira-otrs.html` bauen: eine nachgestellte
     Jira-Server-9.12-Vorgangsseite, deren Dialoge **verzoegert per
     `setTimeout` (120 ms)** ins DOM kommen - das ist der Punkt, an dem
     `waitForElement` sich beweisen muss. Enthalten sein muessen:
     * Kopf mit `#key-val`, `.issue-header`
     * Label-Modal `#edit-labels-dialog.aui-dialog2` mit
       `#labels-textarea`, Liste `.labels-wrap`, Button
       `.aui-dialog2-footer .aui-button-primary` und `#labels-multi-select`
     * Quick-Search-Dialog `#quick-search-dialog` mit Eingabe
       `#quick-search-input` und Trefferliste `.aui-list li a`
     * Custom-Field-Dialog `#customfield-dialog.aui-dialog2` mit
       `input#customfield_11000` (vorbelegbar) und Primaerbutton
     * Link-Dialog `#link-issue-dialog.aui-dialog2` mit Reitern
       `.aui-tabs .menu-item a[href="#web-link"]` und `#jira-link`,
       Panel `#web-link` mit `#weblink-url` und `#weblink-linktext`
     * Ein Skript im Fixture, das auf `keydown` mit `l` bzw. `.` reagiert und
       den passenden Dialog verzoegert einblendet - damit die
       Tastatur-Variante testbar ist.
  3. `manifest.json`: `"src/jiraui.js"` und `"src/otrslink.js"` in
     `content_scripts[0].js` **vor** `src/content.js` eintragen
     (Reihenfolge: ... `editlock`, `otrslink`, `jiraui`, `content`).
  4. `src/background.js`: `var CONTENT_FILES = [...]` exakt gleich anpassen -
     `package.test.js` vergleicht beide Listen mit `deepStrictEqual`.
  5. `test/integration.test.js`: `SOURCES` um die beiden neuen Dateien
     erweitern (gleiche Reihenfolge). Neue Testfaelle gegen die Fixture:
     * `waitForElement` findet ein sofort vorhandenes Element
     * `waitForElement` findet ein nach 120 ms eingefuegtes Element
     * `waitForElement` laeuft bei `timeout: 200` auf einen Fehler
     * `setValue` schreibt den Wert und loest genau ein `input`-Ereignis aus
     * `sendKey(document.body, 'l')` blendet das Label-Modal ein
  6. `test/package.test.js`: die Reihenfolgezusicherung um
     `otrslink < content` und `jiraui < content` ergaenzen.
  7. Lint und Tests ausfuehren. Fehlt Chromium:
     `npx --prefix jira-markdown-converter playwright install chromium`.
* **Definition of Done:**
  * [ ] Lint ohne Befund, `npm test` gruen (inkl. Integrationstest mit Chromium)
  * [ ] `manifest.json` und `CONTENT_FILES` in `background.js` identisch
  * [ ] `waitForElement` raeumt Observer und Timer in allen Ausgaengen ab
  * [ ] Kein `console.log`, keine Umlaute
  * [ ] Commit `feat(jira): dom-helfer fuer aui-dialoge` und Push auf `feature/issue-17-part-2`

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 2.

Vorbedingung: Branch feature/issue-17-part-1 existiert und enthaelt
src/otrslink.js. Zweige feature/issue-17-part-2 davon ab (NICHT von main).

Aufgabe: Nur Sub-Task 2. Neu: src/jiraui.js (UMD-Modul JiraUi mit
waitForElement, waitForGone, setValue, sendKey, click, visible, delay) und
test/fixtures/mock-jira-otrs.html (Jira Server 9.12, AUI-Modale, die per
setTimeout 120 ms verzoegert erscheinen).
Geaendert: manifest.json und src/background.js (CONTENT_FILES - beide Listen
MUESSEN identisch sein, package.test.js vergleicht sie mit deepStrictEqual),
test/integration.test.js (SOURCES erweitern, fuenf neue Faelle),
test/package.test.js (Reihenfolge otrslink/jiraui vor content).

Folge den Schritten 1-7 samt der dort genannten Selektoren woertlich - die
Sub-Tasks 3 bis 5 bauen genau auf diesen Selektoren auf.

Regeln: ES5, 'use strict', nur var, UMD wie src/settings.js, keine
Runtime-Dependencies, Deutsch ohne Umlaute, kein console.log.
Fasse src/content.js in diesem Schritt NICHT an.

Abschluss: npm run lint und npm test (jeweils --prefix jira-markdown-converter)
muessen gruen sein; fehlt der Browser:
npx --prefix jira-markdown-converter playwright install chromium.
Commit "feat(jira): dom-helfer fuer aui-dialoge",
git push -u origin feature/issue-17-part-2, PR gegen feature/issue-17-part-1.
```

---

## Sub-Task 3: Automationsablauf gegen Jira 9.12

* **Git Branch:** `feature/issue-17-part-3` (Base Branch: `feature/issue-17-part-2`)
* **Scope / Ziel:** Die drei Schritte aus dem Issue sequenziell ausfuehren:
  Label, Custom Field "Kunden Referenz" (vorherigen Wert vorher auslesen),
  Web-Link. Jeder Schritt zuerst per Tastatur-Shortcut, bei Misserfolg ueber
  direkte DOM-Selektoren. Noch keine Oberflaeche.
* **Dateiebene:**
  * Zu erstellen: `jira-markdown-converter/src/otrsflow.js`
  * Zu aendern: `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/src/background.js`,
    `jira-markdown-converter/test/fixtures/mock-jira-otrs.html`,
    `jira-markdown-converter/test/integration.test.js`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/otrsflow.js` als UMD-Modul `JiraOtrsFlow` anlegen. Oeffentliche API:
     ```js
     run(parsed, options) -> Promise<{
       ok: true,
       steps: ['label', 'reference', 'link'],
       previousReference: '<alter Wert oder leerer String>'
     }>
     ```
     `options = { fieldName: 'Kunden Referenz', timeout: 5000, doc: document }`.
     Bei Fehlschlag lehnt das Promise mit einem Fehler ab, dessen `message`
     den gescheiterten Schritt auf Deutsch nennt, und dessen Eigenschaft
     `step` die Kennung traegt (`'label' | 'reference' | 'link'`).
  2. Schritt 1 `addLabel(ticketNumber)`:
     `JiraUi.sendKey(document.body, 'l')`, dann
     `waitForElement('#edit-labels-dialog', { timeout: 1500 })`.
     Fallback bei Timeout: `#edit-labels` bzw.
     `[data-fieldtype="labels"] .editable-field` per `JiraUi.click` oeffnen.
     Wert in `#labels-textarea` schreiben, `Enter` senden, mit
     `.aui-dialog2-footer .aui-button-primary` bestaetigen, mit
     `waitForGone('#edit-labels-dialog')` abwarten.
  3. Schritt 2 `setReference(text, fieldName)`:
     `sendKey(document.body, '.')` -> `waitForElement('#quick-search-dialog')`
     -> `setValue('#quick-search-input', fieldName)` -> `Enter`
     -> `waitForElement('#customfield-dialog')`.
     Fallback: Feld direkt ueber
     `[data-field-name="<fieldName>"] input, .customfield input` suchen.
     **Vor dem Ueberschreiben** den vorhandenen Wert lesen und als
     `previousReference` zurueckgeben (getrimmt; nicht vorhanden -> `''`).
     Danach `setValue(feld, text)` und bestaetigen.
  4. Schritt 3 `addWebLink(linkText, url)`:
     `sendKey(document.body, '.')` -> `'link'` eingeben -> `Enter`
     -> `waitForElement('#link-issue-dialog')`.
     Fallback: `#link-issue` per `click`.
     Reiter wechseln: `.aui-tabs .menu-item a[href="#web-link"]` klicken und
     auf `#web-link.active-pane` warten. Dann `#weblink-url` = `url`,
     `#weblink-linktext` = `linkText`, bestaetigen, `waitForGone`.
  5. Jeder Schritt kapselt seine Fallbacks; Ablauf strikt sequenziell per
     Promise-Kette (kein `async/await`, ES5). Zwischen den Schritten
     `JiraUi.delay(150)`, damit Jira den vorherigen AJAX-Zyklus abschliesst.
  6. Optionaler Zusatz-Fallback: ist `window.JIRA` vorhanden, nach jedem
     Schritt `JIRA.trace` ignorieren - **keine** Abhaengigkeit davon aufbauen,
     nur nutzen, wenn vorhanden, in `try/catch` (leere `catch`-Bloecke sind in
     diesem Projekt Absicht).
  7. Manifest und `CONTENT_FILES` um `src/otrsflow.js` erweitern
     (nach `jiraui`, vor `content`).
  8. Fixture erweitern: das Custom-Field-Eingabefeld bekommt einen
     vorbelegten Wert, damit `previousReference` pruefbar ist; die
     Quick-Search-Trefferliste oeffnet den Custom-Field-Dialog bzw. den
     Link-Dialog abhaengig vom eingegebenen Text.
  9. Integrationstests ergaenzen:
     * kompletter Durchlauf mit dem Beispiel aus dem Issue - Label gesetzt,
       Custom Field gesetzt, Web-Link mit Text und URL gesetzt
     * `previousReference` liefert den alten Wert, wenn das Feld belegt war
     * `previousReference` ist `''`, wenn das Feld leer war
     * Fallback greift: Tastendruck wird im Fixture unterdrueckt, der Ablauf
       gelingt trotzdem ueber die DOM-Selektoren
     * fehlender Link-Dialog -> Promise wird abgelehnt, `error.step === 'link'`
* **Definition of Done:**
  * [ ] Lint ohne Befund, `npm test` gruen
  * [ ] Alle drei Schritte laufen im Integrationstest gegen die Fixture durch
  * [ ] Jeder Schritt hat einen DOM-Fallback, der getestet ist
  * [ ] `previousReference` wird vor dem Ueberschreiben gelesen
  * [ ] `manifest.json` und `CONTENT_FILES` identisch
  * [ ] Commit `feat(jira): otrs-verweis in drei feldern eintragen` und Push

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 3.

Vorbedingung: feature/issue-17-part-2 enthaelt src/jiraui.js und
test/fixtures/mock-jira-otrs.html. Zweige feature/issue-17-part-3 davon ab.

Aufgabe: Nur Sub-Task 3. Neu: src/otrsflow.js (UMD-Modul JiraOtrsFlow mit
run(parsed, options) -> Promise). Der Ablauf ist strikt sequenziell:
1. Label mit der Ticketnummer, 2. Custom Field "Kunden Referenz" - den
bestehenden Wert VOR dem Ueberschreiben auslesen und als previousReference
zurueckgeben, 3. Web-Link im Reiter "Web Link".
Jeder Schritt zuerst per Tastatur-Shortcut (l bzw. .), bei Timeout ueber
direkte DOM-Selektoren. Nutze ausschliesslich JiraUi aus Sub-Task 2 fuer
Warten, Klicken, Tasten und Werte - kein eigenes setTimeout-Polling.
Geaendert: manifest.json + src/background.js (CONTENT_FILES identisch halten),
test/fixtures/mock-jira-otrs.html, test/integration.test.js.

Folge Schritt 1-9 samt Selektoren und den fuenf Testfaellen woertlich.

Regeln: ES5, 'use strict', nur var, Promise-Ketten statt async/await, keine
Runtime-Dependencies, Deutsch ohne Umlaute, kein console.log. Kein Zugriff auf
src/content.js und keine Oberflaeche in diesem Schritt.

Abschluss: npm run lint und npm test (--prefix jira-markdown-converter) gruen.
Commit "feat(jira): otrs-verweis in drei feldern eintragen",
git push -u origin feature/issue-17-part-3, PR gegen feature/issue-17-part-2.
```

---

## Sub-Task 4: Eingabedialog

* **Git Branch:** `feature/issue-17-part-4` (Base Branch: `feature/issue-17-part-3`)
* **Scope / Ziel:** Der Dialog, in den der Verweis eingefuegt wird: Textfeld,
  Live-Vorschau der erkannten Werte, "Absenden". Der Dialog kennt Jira nicht -
  er reicht das geparste Ergebnis an den Aufrufer weiter, genau wie
  `codedialog.js`.
* **Dateiebene:**
  * Zu erstellen: `jira-markdown-converter/src/otrsdialog.js`,
    `jira-markdown-converter/src/otrsdialog.css`
  * Zu aendern: `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/src/background.js`,
    `jira-markdown-converter/test/package.test.js`,
    `jira-markdown-converter/test/integration.test.js`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/otrsdialog.js` als UMD-Modul `JiraOtrsDialog` anlegen, Aufbau
     analog `src/codedialog.js`. API: `open(handlers)`, `close()`, `isOpen()`.
     `handlers = { onSubmit: function (parsed) {}, onError: function (msg) {} }`.
  2. Markup als feste Vorlage `var DIALOG_HTML = [...].join('\n')` -
     `package.test.js` erlaubt `innerHTML` nur mit einer solchen Konstanten.
     **Erkannte Werte niemals per `innerHTML` einsetzen**, immer
     `textContent`.
  3. Inhalt des Dialogs (Klassenpraefix `jmd-`, bestehende Bausteine
     `jmd-dialog__box`, `jmd-label`, `jmd-textarea`, `jmd-btn` wiederverwenden):
     * Titel "OTRS-Link einpflegen"
     * `textarea[data-role="otrs-input"]`, Platzhalter
       `Markdown-Link, HTML-Anker oder Text mit OTRS-Link einfuegen ...`
     * Vorschaublock mit drei Zeilen: Label, Kunden Referenz, Web-Link
       (`data-role="preview-label"`, `-reference"`, `-link"`)
     * Fehlerzeile `data-role="otrs-error"`, standardmaessig leer
     * Buttons `data-otrs-action="submit"` ("Absenden", primaer) und
       `data-otrs-action="close"` ("Abbrechen")
  4. Bei jedem `input` `JiraOtrsLink.parse()` aufrufen und die Vorschau
     aktualisieren. Ist `ok: false`: Fehlertext anzeigen und "Absenden"
     ueber `disabled` sperren.
  5. Tastatur: `Escape` schliesst, `Strg+Enter` sendet ab, Fokus beim Oeffnen
     in das Textfeld, beim Schliessen zurueck auf das oeffnende Element
     (`opener`-Muster aus `codedialog.js`).
  6. `src/otrsdialog.css` schlank halten und nur ergaenzen, was
     `content.css`/`codedialog.css` nicht schon liefern.
  7. Manifest: `src/otrsdialog.js` in `content_scripts[0].js` (nach
     `otrsflow`, vor `content`) und `src/otrsdialog.css` in `css`;
     `CONTENT_FILES` gleichziehen.
  8. `test/package.test.js`: `src/otrsdialog.js` in die Datei-Liste des Tests
     "keine console-Ausgaben" aufnehmen und in die `templates`-Zuordnung von
     "kein innerHTML mit Fremddaten" mit `/DIALOG_HTML/` eintragen.
  9. `test/integration.test.js`: `SOURCES` und `STYLES` erweitern; Testfaelle:
     * Dialog oeffnet und schliesst wieder
     * Eingabe des Beispiels fuellt alle drei Vorschauzeilen
     * unbrauchbare Eingabe zeigt den Fehlertext und sperrt "Absenden"
     * `onSubmit` bekommt das Objekt aus `JiraOtrsLink.parse`
     * `Escape` schliesst den Dialog
* **Definition of Done:**
  * [ ] Lint ohne Befund, `npm test` gruen
  * [ ] `innerHTML` nur mit `DIALOG_HTML`, erkannte Werte per `textContent`
  * [ ] Dialog laesst sich per Tastatur vollstaendig bedienen
  * [ ] `manifest.json` und `CONTENT_FILES` identisch
  * [ ] Commit `feat(jira): dialog fuer den otrs-link-helfer` und Push

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 4.

Vorbedingung: feature/issue-17-part-3 enthaelt src/otrsflow.js.
Zweige feature/issue-17-part-4 davon ab.

Aufgabe: Nur Sub-Task 4. Neu: src/otrsdialog.js (UMD-Modul JiraOtrsDialog mit
open/close/isOpen, Vorbild src/codedialog.js) und src/otrsdialog.css.
Der Dialog kennt Jira NICHT - er parst die Eingabe per JiraOtrsLink, zeigt eine
Live-Vorschau (Label, Kunden Referenz, Web-Link) und reicht das Ergebnis ueber
handlers.onSubmit weiter.
Geaendert: manifest.json + src/background.js (CONTENT_FILES identisch),
test/package.test.js (otrsdialog.js in die console-Pruefung und in die
templates-Zuordnung von "kein innerHTML mit Fremddaten" mit /DIALOG_HTML/),
test/integration.test.js (SOURCES, STYLES, fuenf neue Faelle).

Wichtig: innerHTML ausschliesslich mit der Konstanten DIALOG_HTML; erkannte
Werte immer per textContent setzen - package.test.js prueft das.

Folge Schritt 1-9 des Sub-Tasks woertlich, inklusive der data-role- und
data-otrs-action-Attribute; Sub-Task 5 verdrahtet genau diese.

Regeln: ES5, 'use strict', nur var, keine Runtime-Dependencies, Deutsch ohne
Umlaute, kein console.log. src/content.js bleibt in diesem Schritt unberuehrt.

Abschluss: npm run lint und npm test (--prefix jira-markdown-converter) gruen.
Commit "feat(jira): dialog fuer den otrs-link-helfer",
git push -u origin feature/issue-17-part-4, PR gegen feature/issue-17-part-3.
```

---

## Sub-Task 5: Verdrahtung, Schalter und Meldungen

* **Git Branch:** `feature/issue-17-part-5` (Base Branch: `feature/issue-17-part-4`)
* **Scope / Ziel:** Dialog, Parser und Ablauf zusammenfuehren: Einstiegspunkt
  im Panel und in der Feldleiste, Einstellung zum Ein- und Ausschalten,
  Erfolgsmeldung und die Warnung bei ueberschriebener Kundenreferenz. Erst mit
  diesem Sub-Task ist das Feature fuer Nutzer erreichbar.
* **Dateiebene:**
  * Zu aendern: `jira-markdown-converter/src/content.js`,
    `jira-markdown-converter/src/settings.js`,
    `jira-markdown-converter/src/content.css`,
    `jira-markdown-converter/popup/popup.html`,
    `jira-markdown-converter/popup/popup.js`,
    `jira-markdown-converter/options/options.html`,
    `jira-markdown-converter/options/options.js`,
    `jira-markdown-converter/test/settings.test.js`,
    `jira-markdown-converter/test/integration.test.js`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/settings.js`: `DEFAULTS` um zwei Schluessel erweitern -
     `otrsHelper: true` (Helfer anbieten) und
     `otrsFieldName: 'Kunden Referenz'` (Name des Custom Fields).
     `withDefaults` haerten: leerer oder nicht-String-Wert bei
     `otrsFieldName` faellt auf den Standard zurueck.
  2. `src/content.js`: Modul-Referenzen oben ergaenzen
     (`var OtrsLink = window.JiraOtrsLink;` usw., Muster der bestehenden Zeilen
     11-15). Funktion `openOtrsDialog()` anlegen, die
     `JiraOtrsDialog.open({ onSubmit: runOtrsFlow })` aufruft.
  3. `runOtrsFlow(parsed)`:
     ```
     JiraOtrsFlow.run(parsed, { fieldName: settings.otrsFieldName })
       .then(erfolg)  -> toast('OTRS Link im Ticket eingepflegt.')
                         wenn result.previousReference:
                         zusaetzlich toast(
                           'Achtung: Kundenreferenz wurde ueberschrieben. ' +
                           'Vorheriger Wert: ' + result.previousReference, true)
       .catch(fehler) -> toast(fehler.message, true)
     ```
     Die Warnung nutzt den bestehenden `toast(message, isError)`; sie muss
     auch erscheinen, wenn `showToast` aus ist - `toast` zeigt Fehlermeldungen
     unabhaengig von der Einstellung an (siehe `content.js`, Zeile 1083).
     Die Warnung darf nicht nach 3 Sekunden verschwinden, solange sie den
     alten Wert nennt: dafuer eine Variante mit laengerer Standzeit
     (mindestens 10 Sekunden) und einer Schaltflaeche zum Schliessen.
  4. Einstiegspunkte, jeweils nur wenn `settings.otrsHelper` an ist:
     * Button im Panel (`PANEL_HTML`) mit `data-action="otrs"` und Titel
       "OTRS-Link einpflegen", Behandlung in `handleAction`
     * Eintrag in der Feldleiste (`addButtonBar`) mit
       `jmd-fieldbar__btn--otrs`
  5. Schalter `otrsHelper` in Popup und Optionsseite ergaenzen - dieselbe
     Optik wie `convertOnPaste` (`switch__track`), sowie ein Textfeld
     `otrsFieldName` auf der Optionsseite mit Beschriftung
     "Feldname der Kundenreferenz".
  6. `src/content.css`: Klassen fuer den neuen Feldleisten-Button und die
     langlebige Warnung ergaenzen.
  7. `test/settings.test.js`: Faelle fuer die neuen Standardwerte und fuer
     das Zuruecksetzen eines leeren `otrsFieldName`.
  8. `test/integration.test.js`: Faelle
     * Panel-Button oeffnet den OTRS-Dialog
     * vollstaendiger Durchlauf gegen `mock-jira-otrs.html` endet mit dem
       Toast "OTRS Link im Ticket eingepflegt."
     * belegtes Referenzfeld erzeugt zusaetzlich die Warnung samt altem Wert
     * `otrsHelper: false` blendet Panel-Button und Feldleisten-Eintrag aus
     * Fehler im Ablauf zeigt die Fehlermeldung als Fehler-Toast
  9. Prueflauf: `npm run lint` und `npm test`.
* **Definition of Done:**
  * [ ] Lint ohne Befund, `npm test` gruen
  * [ ] Erfolgsmeldung lautet woertlich "OTRS Link im Ticket eingepflegt."
  * [ ] Warnung lautet woertlich "Achtung: Kundenreferenz wurde ueberschrieben.
        Vorheriger Wert: <alter Wert>" und steht mindestens 10 Sekunden
  * [ ] Schalter `otrsHelper` in Popup und Optionsseite vorhanden
  * [ ] `otrsFieldName` auf der Optionsseite pflegbar
  * [ ] Commit `feat(jira): otrs-link-helfer verdrahten` und Push

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 5.

Vorbedingung: feature/issue-17-part-4 enthaelt src/otrslink.js, src/jiraui.js,
src/otrsflow.js, src/otrsdialog.js. Zweige feature/issue-17-part-5 davon ab.

Aufgabe: Nur Sub-Task 5 - die Verdrahtung. Keine neuen Dateien.
Geaendert: src/settings.js (DEFAULTS um otrsHelper: true und
otrsFieldName: 'Kunden Referenz'), src/content.js (openOtrsDialog,
runOtrsFlow, Panel-Button data-action="otrs", Feldleisten-Eintrag),
src/content.css, popup/popup.html+js, options/options.html+js,
test/settings.test.js, test/integration.test.js.

Meldungen woertlich:
  Erfolg:  "OTRS Link im Ticket eingepflegt."
  Warnung: "Achtung: Kundenreferenz wurde ueberschrieben. Vorheriger Wert: <alt>"
Die Warnung erscheint nur, wenn previousReference nicht leer ist, nutzt den
Fehlerzweig von toast() (erscheint also auch bei showToast=false) und muss
mindestens 10 Sekunden stehen bleiben plus manuell schliessbar sein.

Folge Schritt 1-9 des Sub-Tasks, inklusive der fuenf Integrationstests und der
zwei Settings-Tests.

Regeln: ES5, 'use strict', nur var, keine Runtime-Dependencies, Deutsch ohne
Umlaute, kein console.log, innerHTML nur mit fester Vorlage (PANEL_HTML).
Die Module aus Sub-Task 1-4 nur benutzen, nicht umbauen.

Abschluss: npm run lint und npm test (--prefix jira-markdown-converter) gruen.
Commit "feat(jira): otrs-link-helfer verdrahten",
git push -u origin feature/issue-17-part-5, PR gegen feature/issue-17-part-4.
```

---

## Sub-Task 6: Dokumentation, Store-Unterlagen und Version

* **Git Branch:** `feature/issue-17-part-6` (Base Branch: `feature/issue-17-part-5`)
* **Scope / Ziel:** Das Feature dokumentieren und den Release vorbereiten.
  Kein Produktivcode ausser der Versionsnummer.
* **Dateiebene:**
  * Zu aendern: `jira-markdown-converter/README.md`,
    `jira-markdown-converter/CHANGELOG.md`,
    `jira-markdown-converter/CLAUDE.md`,
    `jira-markdown-converter/package.json`,
    `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/docs/store/listing-de.md`,
    `jira-markdown-converter/docs/store/listing-en.md`,
    `jira-markdown-converter/docs/store/review-notes.md`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `README.md`: Abschnitt "OTRS-Link einpflegen" - was der Helfer tut, welche
     Eingabeformate er versteht, welche drei Felder er befuellt, wo der Schalter
     sitzt und dass er auf Jira Server / Data Center 9.12 zielt.
  2. `CHANGELOG.md`: neuer Eintrag `## 1.3.0` mit `### Neu` und dem Verweis
     auf Issue #17. Format der bestehenden Eintraege uebernehmen.
  3. `CLAUDE.md` des Projekts: die vier neuen Module in die Struktur-Tabelle
     und in die UMD-Aufzaehlung aufnehmen. **Grenze 40 Zeilen einhalten** -
     dafuer bestehende Zeilen straffen, nicht anhaengen.
  4. Version in `package.json` **und** `manifest.json` auf `1.3.0` setzen -
     `package.test.js` vergleicht beide. Der Meilenstein des Issues lautet
     ebenfalls 1.3.0.
  5. Store-Unterlagen: Funktionsliste in `listing-de.md` und `listing-en.md`
     um den Helfer erweitern. **Die Laenge der Textbloecke bleibt innerhalb
     der von `package.test.js` geprueften Grenzen** - Test vor dem Commit
     laufen lassen. `review-notes.md` um einen Satz ergaenzen, dass die
     Erweiterung Formularfelder auf der Jira-Seite im Auftrag des Nutzers
     befuellt; es kommen keine neuen Berechtigungen hinzu.
  6. Pruefen, dass `manifest.json` unveraendert bei
     `permissions`, `host_permissions` und `optional_host_permissions` bleibt.
  7. `npm run lint`, `npm test` und `npm install && npm run lint:commits` im
     Repo-Root ausfuehren.
* **Definition of Done:**
  * [ ] Lint ohne Befund, `npm test` gruen, `lint:commits` gruen
  * [ ] `package.json` und `manifest.json` beide auf `1.3.0`
  * [ ] `CLAUDE.md` des Projekts hoechstens 40 Zeilen
  * [ ] Keine neuen Berechtigungen im Manifest
  * [ ] Keine Umlaute in allen geaenderten Texten
  * [ ] Commit `docs(jira): otrs-link-helfer dokumentieren` und Push

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 6.

Vorbedingung: feature/issue-17-part-5 enthaelt den fertig verdrahteten
OTRS-Link-Helfer. Zweige feature/issue-17-part-6 davon ab.

Aufgabe: Nur Sub-Task 6 - Dokumentation und Release-Vorbereitung, kein neuer
Produktivcode ausser der Versionsnummer.
Geaendert: README.md (Abschnitt "OTRS-Link einpflegen"), CHANGELOG.md
(Eintrag 1.3.0 mit Verweis auf Issue #17), CLAUDE.md des Projekts (die vier
neuen Module aufnehmen, Grenze 40 Zeilen durch Straffen halten),
package.json und manifest.json (beide auf 1.3.0 - package.test.js vergleicht
sie), docs/store/listing-de.md, listing-en.md, review-notes.md.

Wichtig: keine neuen Berechtigungen im Manifest; die Textbloecke der
Store-Listings haben von package.test.js gepruefte Laengengrenzen - Test vor
dem Commit laufen lassen.

Abschluss:
  npm run lint --prefix jira-markdown-converter
  npm test  --prefix jira-markdown-converter
  npm install && npm run lint:commits
Alles gruen. Commit "docs(jira): otrs-link-helfer dokumentieren",
git push -u origin feature/issue-17-part-6, PR gegen feature/issue-17-part-5.
```

---

## Risiken und offene Punkte

| Punkt | Bewertung |
| --- | --- |
| Die AUI-Selektoren sind Annahmen, solange kein DOM-Auszug aus einer echten Jira-9.12-Instanz vorliegt. | Groesstes Risiko - und das billigste zu beseitigen: ein Auszug nach [`docs/dom-auszug.md`](dom-auszug.md) vor Sub-Task 2 macht die Fixture belastbar. Bis dahin traegt die Fallback-Ebene aus Sub-Task 3; ein manueller Test gegen die echte Instanz bleibt vor dem Release noetig. |
| Custom-Field-ID (`customfield_11000`) ist instanzabhaengig. | Deshalb sucht der Ablauf ueber den Feldnamen, und der Name ist ueber `otrsFieldName` einstellbar. |
| Quick-Search (`.`) trifft je nach Sprache der Jira-Oberflaeche andere Eintraege. | Der Feldname kommt aus den Einstellungen; der DOM-Fallback laeuft ohne Quick-Search. |
| `support.inxire.com` und die Jira-Server-Hosts sind nicht im Manifest. | Absicht - die bestehende Mechanik `extraHosts` plus `optional_host_permissions` deckt das ab, ohne die Store-Pruefung zu belasten. |
