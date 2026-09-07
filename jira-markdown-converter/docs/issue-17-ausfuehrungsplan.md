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
| XCTest / UI-Tests | `node:test` unter `test/modules/<modul>/`, Playwright in `test/modules/<modul>/browser/` |

## Zielbild

Ein Helfer-Dialog nimmt einen OTRS-Verweis in beliebigem Format entgegen,
zerlegt ihn und pflegt ihn nach Klick auf "Absenden" an drei Stellen des
Jira-Vorgangs ein: Label, Custom Field "Kunden Referenz", Web-Link.

Zielumgebung ist **Jira Server / Data Center 9.12 LTS**. Die Dialogstruktur
ist nicht geraten, sondern am DOM-Auszug der produktiven Instanz belegt:
[`docs/jira-dialogs-referenz.md`](jira-dialogs-referenz.md). Jeder Sub-Task, der
Selektoren anfasst, liest diese Datei zuerst - sie schlaegt jede Annahme.
Zusaetzliche Hosts (z. B. `jira.firma.de`) laufen ueber die bestehende
Mechanik `extraHosts` + `optional_host_permissions`. **Am Manifest sind keine
neuen Berechtigungen noetig** - `test/modules/package/manifest.test.js` prueft
die Liste hart.

## Modul-Schnitt

| Datei | Global (UMD) | Rolle | DOM? |
| --- | --- | --- | --- |
| `src/otrslink.js` | `JiraOtrsLink` | Eingabe zerlegen (Markdown/HTML/Text) | nein |
| `src/jiraui.js` | `JiraUi` | `waitForElement`, Tasten, Werte setzen | ja |
| `src/otrsflow.js` | `JiraOtrsFlow` | Die drei Schritte gegen die AUI | ja |
| `src/otrsdialog.js` | `JiraOtrsDialog` | Eingabedialog | ja |
| `src/content.js` | - | Verdrahtung, Toast, Warnung | ja |

Ladereihenfolge im Manifest (neu **hinten angehaengt**, `content.js` bleibt
letzte Datei, damit die bestehenden Zusicherungen in
`test/modules/package/manifest.test.js` unberuehrt bleiben):

```
settings -> converter -> editors -> codedialog -> templatedialog -> editlock
        -> otrslink -> jiraui -> otrsflow -> otrsdialog -> content
```

> **Stolperfalle fuer jeden Sub-Task, der das Manifest anfasst:**
> `src/background.js` fuehrt dieselbe Liste als `var CONTENT_FILES = [...]`.
> `test/modules/package/sources.test.js` vergleicht beide mit `deepStrictEqual`.
> Immer beide aendern. `test/lib/browser.js` liest `SOURCES`/`STYLES` aus dem
> Manifest - ein Eintrag dort genuegt, damit die Datei in **allen**
> Browser-Tests mitlaeuft.

## Testmodul `otrs` und die Kontext-Regeln aus PR #65

[PR #65](https://github.com/pascallink/webkit-ext/pull/65) teilt die Testsuite in
Module und reserviert in `.github/TESTS.md` bereits den Namen `otrs` fuer dieses
Issue. Der Plan folgt dem: **alle** Sub-Tasks arbeiten unter `test/modules/otrs/`.

> **Vorbedingung:** PR #65 ist offen und hat Konflikte mit `main`.
> `.github/TESTS.md` und `test/modules/package/isolation.test.js` liegen noch
> nicht in `main`. Sub-Task 1 startet erst, wenn #65 gemergt ist - sonst fehlen
> Landkarte und Guard, und die Sub-Tasks bauen gegen eine Struktur, die es noch
> nicht gibt.

**Ablage**

| Was | Wohin |
| --- | --- |
| Node-Tests (DOM-frei) | `test/modules/otrs/<name>.test.js` |
| Browser-Tests (Playwright) | `test/modules/otrs/browser/<name>.test.js` |
| Geteilte Helfer | `test/lib/` - nie in den Modulordner kopieren |
| Fixture | `test/fixtures/mock-jira-otrs.html` + Konstante in `test/lib/fixtures.js` |

**Was maschinell geprueft wird** (`test/modules/package/isolation.test.js`):

* `test:otrs` muss in `package.json` stehen, sobald `test/modules/otrs/`
  existiert - und umgekehrt. Beide Richtungen sind Zusicherung.
* `require()` nur aus dem **eigenen** Modulordner, `test/lib/`,
  `test/fixtures/`, `src/`, `options/`, `popup/`, Node-Builtins, `playwright`.
* `require()`-Argumente nur als String-Literal oder
  `path.join(__dirname, '...')` mit Literalen. Jede andere Form gilt dem Guard
  als nicht auswertbar und faellt durch.

**Kontext-Regeln fuer jede Session** (Root-`CLAUDE.md`, "Test-Kontext-Regeln"):

* Waehrend der Arbeit **nur** den Modullauf. Kein Gesamtlauf, um zwischendurch
  zu schauen, ob noch alles gruen ist - das ist die teuerste Gewohnheit.
* Gesamtlauf `npm test` und `npm run lint` **genau einmal**, unmittelbar vor dem
  finalen Commit. Rot heisst zurueck in den Modullauf, nicht in den naechsten
  Gesamtlauf.
* Nur die Quellen des betroffenen Moduls oeffnen. Fremde Modulordner bleiben zu -
  auch beim Suchen.

| Sub-Task | Beruehrte Module | Modullauf waehrend der Arbeit |
| --- | --- | --- |
| 1 | `otrs`, `settings`, `package` | `npm run test:module otrs settings package --prefix <p>` |
| 2 | `otrs`, `package` | `npm run test:module otrs package --prefix <p>` |
| 3 | `otrs` | `npm run test:module otrs --prefix <p>` |
| 4 | `otrs`, `package` | `npm run test:module otrs package --prefix <p>` |
| 5 | `otrs`, `content`, `options`, `popup` | `npm run test:module otrs content options popup --prefix <p>` |
| 6 | `package` | `npm run test:module package --prefix <p>` |

`run.js` nimmt mehrere Modulnamen in einem Aufruf entgegen - das bleibt ein
Modullauf, kein Gesamtlauf.

**Warum vier Quelldateien statt `src/otrs.js`**

Die Landkarte fuehrt `src/otrs.js` als geplant. Der Plan schneidet stattdessen
vier kleine Dateien (`otrslink`, `jiraui`, `otrsflow`, `otrsdialog`) - aus
demselben Motiv, aus dem #65 die Suite geteilt hat: eine Session oeffnet dann
eine Datei statt einer grossen. Alle vier gehoeren zum Modul `otrs`; die Zeile
in `.github/TESTS.md` wird in Sub-Task 1 entsprechend korrigiert.

## Abschluss jeder Session: Review-Prompt fuer Opus

Jeder Sub-Task endet nicht mit dem Push. Die Sonnet-Session gibt zum Schluss
**einen Review-Prompt zum Kopieren aus**, mit dem Pascal den PR von Opus
gegenreichen laesst. Der Auftrag an die Session lautet woertlich:

> Erstelle einen Review-Prompt fuer Opus, der die Code-Aenderungen, deine
> Designentscheidungen, potenzielle Edge Cases und 3-4 konkrete Pruefpunkte
> fuer diesen PR zusammenfasst.

Form der Ausgabe - ein einzelner Codeblock, sonst nichts drumherum:

```text
Review von PR "<Titel>" (Branch feature/issue-17-part-<X>, Base <Base>).
Projekt: jira-markdown-converter, MV3-Erweiterung, ES5 + UMD, keine Deps.

Aenderungen
- <Datei>: <was und warum, ein Satz>
- ...

Designentscheidungen
- <Entscheidung>: <Alternative, die verworfen wurde, und der Grund>
- ...

Edge Cases, die ich bedacht habe
- <Fall> -> <Verhalten>
- ...

Bitte pruefe gezielt
1. <konkreter Pruefpunkt mit Datei und Funktion>
2. <...>
3. <...>
(4. <...>)

Bekannte Luecken: <was bewusst offen blieb, oder "keine">
```

Regeln fuer diesen Prompt:

* **Beruehrte Testmodule nennen.** Opus soll wissen, welche Module gelaufen
  sind und welche bewusst zu blieben.

* **Selbsttragend.** Opus sieht den Chatverlauf der Session nicht. Jede
  Behauptung nennt Datei und Funktion.
* **Pruefpunkte sind Fragen an den Code, keine Zusammenfassung.** Gut:
  "raeumt `waitForElement` den MutationObserver auch im Timeout-Zweig ab?".
  Schlecht: "bitte die neuen Tests anschauen".
* **Ehrlich bei den Luecken.** Was nicht getestet ist, steht drin - erfundene
  Sicherheit kostet die Runde.
* Kein Selbstlob, keine Wiederholung des Plans, hoechstens 40 Zeilen.

## Uebersicht der Sub-Tasks

| # | Branch | Base | Ergebnis |
| --- | --- | --- | --- |
| 1 | `feature/issue-17-part-1` | `main` | Parser, Einstellungen, Testmodul `otrs` |
| 2 | `feature/issue-17-part-2` | part-1 | DOM-Helfer + AUI-Fixture |
| 3 | `feature/issue-17-part-3` | part-2 | Automationsablauf |
| 4 | `feature/issue-17-part-4` | part-3 | Eingabedialog |
| 5 | `feature/issue-17-part-5` | part-4 | Verdrahtung, Schalter, Meldungen |
| 6 | `feature/issue-17-part-6` | part-5 | Doku, Store-Unterlagen, Version |

---

## Sub-Task 1: Parser, Einstellungen und das Testmodul `otrs`

* **Git Branch:** `feature/issue-17-part-1` (Base Branch: `main`)
* **Scope / Ziel:** Ein DOM-freies Modul, das die drei Eingabeformen
  (Markdown-Link, HTML-Anker, Rohtext mit eingebetteter URL) in ein Objekt mit
  Ticketnummer, Titel und URL zerlegt. Kein Zugriff auf `document`, damit der
  Node-Runner das Modul direkt laden kann - dieselbe Regel wie bei
  `converter.js`. Dazu die Einstellungen und das Testmodul `otrs`: beides
  Fundament, das die Sub-Tasks 3 und 5 sonst mitschleppen muessten.
* **Dateiebene:**
  * Zu erstellen: `jira-markdown-converter/src/otrslink.js`,
    `jira-markdown-converter/test/modules/otrs/otrslink.test.js`
  * Zu aendern: `jira-markdown-converter/package.json`,
    `jira-markdown-converter/src/settings.js`,
    `jira-markdown-converter/test/modules/settings/settings.test.js`,
    `.github/TESTS.md`
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
  7. `test/modules/otrs/otrslink.test.js` nach dem Muster von
     `test/modules/settings/settings.test.js` schreiben: `node:test` mit
     `describe`/`test`, `assert`, und das Modul per
     `require(path.join(__dirname, '..', '..', '..', 'src', 'otrslink.js'))` -
     **nur diese Form**, `isolation.test.js` wertet nichts anderes aus.
     Mindestens diese Faelle:
     * Markdown-Beispiel aus dem Issue - alle vier Felder korrekt
     * HTML-Anker mit `target="_blank"` und Entities im Titel
     * Rohtext `Ticket#2026... siehe https://support.inxire.com/...`
     * URL mit Semikolon-Parametern bleibt unveraendert
     * mehrzeilige Eingabe mit fuehrenden Leerzeichen
     * leere Eingabe -> `ok: false`
     * Eingabe ohne URL -> `ok: false`
     * `javascript:alert(1)` -> `ok: false`
     * Titel ohne `Ticket#`, aber 16-stellige Nummer -> erkannt
  8. In `package.json` das Skript `"test:otrs": "node test/run.js otrs"`
     ergaenzen - alphabetisch einsortiert wie die uebrigen. Der Guard
     `isolation.test.js` verlangt es, sobald `test/modules/otrs/` existiert.
     Die `test`-Kette bleibt unberuehrt: `test` ruft `test/run.js` ohne
     Argumente auf und findet den neuen Ordner selbst.
  9. `src/settings.js`: `DEFAULTS` um drei Schluessel erweitern -
     `otrsHelper: true` (Helfer anbieten),
     `otrsFieldName: 'Kunden Referenz'` (Name des Custom Fields im Shifter)
     und `otrsFieldId: 'customfield_10027'` (Fallback-Selektor; die id ist
     instanzabhaengig und muss darum einstellbar sein). `withDefaults`
     haerten: leerer oder nicht-String-Wert faellt bei beiden Textwerten auf
     den Standard zurueck. Passende Faelle in
     `test/modules/settings/settings.test.js` ergaenzen.
     Die Schluessel entstehen hier, damit Sub-Task 3 und 5 sie nur noch lesen -
     und das Modul `settings` in keiner spaeteren Session mehr geoeffnet wird.
 10. `.github/TESTS.md`: die reservierte Zeile `otrs` in der Modul-Landkarte auf
     den tatsaechlichen Stand bringen (Quellen `src/otrslink.js` ... , Tests,
     Issue #17) und die Reservierung im Abschnitt "Reservierte Module" auf
     `mapping` eindampfen.
 11. Modullauf: `npm run test:module otrs settings package --prefix jira-markdown-converter`.
     Erst wenn der gruen ist, einmal `npm run lint` und `npm test`.
* **Definition of Done:**
  * [ ] Modullauf `test:module otrs settings package` gruen
  * [ ] `npm run lint --prefix jira-markdown-converter` ohne Befund
  * [ ] `npm test --prefix jira-markdown-converter` gruen - genau einmal, am Ende
  * [ ] `test:otrs` in `package.json`, Zeile `otrs` in `.github/TESTS.md` gepflegt
  * [ ] `src/otrslink.js` enthaelt kein `document`, kein `window`, kein `console.log`
  * [ ] Keine Umlaute in Kommentaren und Meldungen
  * [ ] Commit `feat(jira): otrs-verweise zerlegen` und Push auf `feature/issue-17-part-1`
  * [ ] Review-Prompt fuer Opus ausgegeben (Form siehe oben)

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies zuerst CLAUDE.md im Repo-Root und in jira-markdown-converter/, dann
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - dort Sub-Task 1.

Aufgabe: Setze Sub-Task 1 aus diesem Plan um, nichts darueber hinaus.
Branch: von main abzweigen als feature/issue-17-part-1.

Lies ausserdem .github/TESTS.md und den Abschnitt "Test-Kontext-Regeln" der
Root-CLAUDE.md - die Testsuite ist in Module geteilt, du arbeitest im Modul
otrs.

Neu: src/otrslink.js (UMD-Modul JiraOtrsLink mit parse(input), DOM-frei, ES5,
'use strict', nur var - Vorbild ist src/settings.js) und
test/modules/otrs/otrslink.test.js (node:test mit describe/test, Vorbild
test/modules/settings/settings.test.js).
Geaendert: package.json (Skript "test:otrs": "node test/run.js otrs"),
src/settings.js (DEFAULTS um otrsHelper, otrsFieldName, otrsFieldId),
test/modules/settings/settings.test.js, .github/TESTS.md (Zeile otrs).

Halte dich strikt an die Schritte 1-11 des Sub-Tasks, inklusive der genannten
Regexe, der Rueckgabestruktur und der neun Testfaelle.

require() nur als String-Literal oder path.join(__dirname, '...') mit
Literalen - test/modules/package/isolation.test.js wertet nichts anderes aus
und meldet jede andere Form als Verstoss.

Regeln: Deutsch ohne Umlaute (ue/ae/oe/ss), keine Runtime-Dependencies, kein
Bundler, kein console.log. Fasse content.js, manifest.json und background.js
in diesem Schritt NICHT an.

Waehrend der Arbeit ausschliesslich:
  npm run test:module otrs settings package --prefix jira-markdown-converter
Kein Gesamtlauf zum Zwischendurchschauen.

Erst wenn der Modullauf gruen ist, genau einmal:
  npm install --prefix jira-markdown-converter
  npm run lint --prefix jira-markdown-converter
  npm test  --prefix jira-markdown-converter
Beides muss gruen sein. Dann committen als
"feat(jira): otrs-verweise zerlegen" und mit
git push -u origin feature/issue-17-part-1 pushen. PR gegen main anlegen.

Zum Schluss, nach dem Push: Erstelle einen Review-Prompt fuer Opus, der die
Code-Aenderungen, deine Designentscheidungen, potenzielle Edge Cases und 3-4
konkrete Pruefpunkte fuer diesen PR zusammenfasst. Halte dich an die Form im
Abschnitt "Abschluss jeder Session: Review-Prompt fuer Opus" des Plans und gib
ihn als einzelnen Codeblock aus.
```

---

## Sub-Task 2: DOM-Helfer fuer AUI und Testfixture

* **Git Branch:** `feature/issue-17-part-2` (Base Branch: `feature/issue-17-part-1`)
* **Scope / Ziel:** Die Bausteine gegen Race Conditions: auf Elemente warten
  (`MutationObserver`), Tastendruecke senden, Werte so setzen, dass die
  AUI-Handler sie mitbekommen. Dazu eine Jira-9.12-Fixture, gegen die die
  Sub-Tasks 3 bis 5 testen. Noch keine Fachlogik.
* **Dateiebene:**
  * Zu lesen: `jira-markdown-converter/docs/jira-dialogs-referenz.md`
  * Zu erstellen: `jira-markdown-converter/src/jiraui.js`,
    `jira-markdown-converter/test/fixtures/mock-jira-otrs.html`
  * Zu aendern: `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/src/background.js`,
    `jira-markdown-converter/test/lib/fixtures.js`,
    `jira-markdown-converter/test/modules/package/manifest.test.js`
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
  2. `test/fixtures/mock-jira-otrs.html` bauen. **Alle Selektoren stammen aus
     [`docs/jira-dialogs-referenz.md`](jira-dialogs-referenz.md)** - dem
     verifizierten Auszug aus der produktiven Instanz. Nichts davon raten und
     nichts davon "verbessern": Markup aus der Referenz uebernehmen, nur Texte
     und Ticketnummern erfinden. Die Dialoge kommen **verzoegert per
     `setTimeout` (120 ms)** ins DOM - das ist der Punkt, an dem
     `waitForElement` sich beweisen muss. Enthalten sein muessen:
     * Kopf mit `#key-val`, `.issue-header`
     * Shifter `#shifter-dialog` mit `#shifter-dialog-field`
       (Platzhalter "Find Actions...") und `#shifter-dialog-suggestions`;
       Trefferlisten `ul#edit-fields` und `ul#issue-actions` mit Eintraegen
       `li.aui-list-item.aui-list-item-li-<slug>[role="option"]`, aktiver
       Eintrag mit `.active`
     * Labels-Dialog `#edit-labels-dialog.jira-dialog.jira-dialog-open` mit
       `#labels-multi-select`, `textarea#labels-textarea`, `select#labels`,
       `#send-notifications` und `button#submit`
     * Custom-Field-Dialog `#modal-field-view.jira-dialog.jira-dialog-open`
       mit `h2#modal-field-view-title`, `input#customfield_10027`
       (vorbelegbar) und `.buttons input[type="submit"]`
     * **Zweiter** `#modal-field-view` fuer "Customer Jira Key" mit
       `#customfield_10900-textarea` - er darf vom Ablauf nie getroffen werden
     * Link-Dialog `#link-issue-dialog.jira-dialog.jira-dialog-open` mit
       `ul.dialog-menu`, `button#add-web-link-link[data-url]`, Formular
       `#web-issue-link`, `input#web-link-url` **mit Vorbelegung `http://`**,
       `input#web-link-title` und `input[name="Link"][type="submit"]`
     * Ein Skript im Fixture, das auf `keydown` mit `l` bzw. `.` reagiert und
       den passenden Dialog verzoegert einblendet; der Klick auf
       `#add-web-link-link` laedt `#web-issue-link` verzoegert nach - so wie
       Jira es per AJAX aus `data-url` tut.
  3. `manifest.json`: `"src/jiraui.js"` und `"src/otrslink.js"` in
     `content_scripts[0].js` **vor** `src/content.js` eintragen
     (Reihenfolge: ... `templatedialog`, `editlock`, `otrslink`, `jiraui`,
     `content`).
  4. `src/background.js`: `var CONTENT_FILES = [...]` exakt gleich anpassen -
     `test/modules/package/sources.test.js` vergleicht beide Listen mit
     `deepStrictEqual`.
  4b. `test/lib/fixtures.js`: die neue Fixture als Konstante `OTRS`
     eintragen. Browser-Tests referenzieren sie nur darueber, nie ueber den
     Dateinamen. `SOURCES`/`STYLES` sind **nicht** anzufassen -
     `test/lib/browser.js` liest sie aus `manifest.json`, Schritt 3 genuegt.
  5. Neue Datei `test/modules/otrs/browser/jiraui.test.js` (node:test,
     `describe(..., { skip: !hasPlaywright })`, Vorbild
     `test/modules/settings/browser/toggle.test.js`), Seite ueber
     `browserLib.newPage(browser, settings, fixtures.OTRS)`. Testfaelle:
     * `waitForElement` findet ein sofort vorhandenes Element
     * `waitForElement` findet ein nach 120 ms eingefuegtes Element
     * `waitForElement` laeuft bei `timeout: 200` auf einen Fehler
     * `setValue` schreibt den Wert und loest genau ein `input`-Ereignis aus
     * `setValue` **ersetzt** eine Vorbelegung (`#web-link-url` steht auf
       `http://`) statt sie zu ergaenzen
     * `sendKey(document.body, 'l')` blendet den Labels-Dialog ein
  6. `test/modules/package/manifest.test.js`: die Reihenfolgezusicherung um
     `otrslink < content` und `jiraui < content` ergaenzen.
  7. Modullauf `npm run test:module otrs package --prefix jira-markdown-converter`.
     Erst danach einmal Lint und Gesamtlauf. Fehlt Chromium:
     `npx --prefix jira-markdown-converter playwright install chromium`
     (oder `CHROMIUM_PATH` auf ein vorhandenes setzen).
* **Definition of Done:**
  * [ ] Modullauf `test:module otrs package` gruen
  * [ ] Lint ohne Befund, `npm test` gruen - genau einmal, am Ende
  * [ ] `manifest.json` und `CONTENT_FILES` in `background.js` identisch
  * [ ] Fixture nur ueber `test/lib/fixtures.js` referenziert
  * [ ] `waitForElement` raeumt Observer und Timer in allen Ausgaengen ab
  * [ ] Kein `console.log`, keine Umlaute
  * [ ] Commit `feat(jira): dom-helfer fuer aui-dialoge` und Push auf `feature/issue-17-part-2`
  * [ ] Review-Prompt fuer Opus ausgegeben (Form siehe oben)

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 2.

Vorbedingung: Branch feature/issue-17-part-1 existiert und enthaelt
src/otrslink.js. Zweige feature/issue-17-part-2 davon ab (NICHT von main).

Lies ausserdem jira-markdown-converter/docs/jira-dialogs-referenz.md - die
verifizierte Dialogstruktur aus der produktiven Instanz. Alle Selektoren der
Fixture kommen daher, nichts wird geraten.

Aufgabe: Nur Sub-Task 2. Neu: src/jiraui.js (UMD-Modul JiraUi mit
waitForElement, waitForGone, setValue, sendKey, click, visible, delay) und
test/fixtures/mock-jira-otrs.html (Jira Server 9.12: #shifter-dialog,
#edit-labels-dialog, zwei #modal-field-view, #link-issue-dialog - alle als
.jira-dialog, NICHT .aui-dialog2 -, die per setTimeout 120 ms verzoegert
erscheinen).
Geaendert: manifest.json und src/background.js (CONTENT_FILES - beide Listen
MUESSEN identisch sein, test/modules/package/sources.test.js vergleicht sie mit
deepStrictEqual), test/lib/fixtures.js (Konstante OTRS),
test/modules/package/manifest.test.js (Reihenfolge otrslink/jiraui vor content).
Neu ausserdem: test/modules/otrs/browser/jiraui.test.js.

SOURCES/STYLES nicht anfassen - test/lib/browser.js liest sie aus manifest.json.

Folge den Schritten 1-7 samt der dort genannten Selektoren woertlich - die
Sub-Tasks 3 bis 5 bauen genau auf diesen Selektoren auf.

Regeln: ES5, 'use strict', nur var, UMD wie src/settings.js, keine
Runtime-Dependencies, Deutsch ohne Umlaute, kein console.log.
Fasse src/content.js in diesem Schritt NICHT an.

Waehrend der Arbeit ausschliesslich:
  npm run test:module otrs package --prefix jira-markdown-converter
Erst wenn der gruen ist, genau einmal npm run lint und npm test
(--prefix jira-markdown-converter). Fehlt der Browser:
npx --prefix jira-markdown-converter playwright install chromium.
Commit "feat(jira): dom-helfer fuer aui-dialoge",
git push -u origin feature/issue-17-part-2, PR gegen feature/issue-17-part-1.

Zum Schluss, nach dem Push: Erstelle einen Review-Prompt fuer Opus, der die
Code-Aenderungen, deine Designentscheidungen, potenzielle Edge Cases und 3-4
konkrete Pruefpunkte fuer diesen PR zusammenfasst. Halte dich an die Form im
Abschnitt "Abschluss jeder Session: Review-Prompt fuer Opus" des Plans und gib
ihn als einzelnen Codeblock aus.
```

---

## Sub-Task 3: Automationsablauf gegen Jira 9.12

* **Git Branch:** `feature/issue-17-part-3` (Base Branch: `feature/issue-17-part-2`)
* **Scope / Ziel:** Die drei Schritte aus dem Issue sequenziell ausfuehren:
  Label, Custom Field "Kunden Referenz" (vorherigen Wert vorher auslesen),
  Web-Link. Jeder Schritt zuerst per Tastatur-Shortcut, bei Misserfolg ueber
  direkte DOM-Selektoren. Noch keine Oberflaeche.
* **Dateiebene:**
  * Zu lesen: `jira-markdown-converter/docs/jira-dialogs-referenz.md`
  * Zu erstellen: `jira-markdown-converter/src/otrsflow.js`
  * Zu aendern: `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/src/background.js`,
    `jira-markdown-converter/test/fixtures/mock-jira-otrs.html`,
    `jira-markdown-converter/test/modules/otrs/browser/flow.test.js` (neu)
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
  **Alle Selektoren stammen aus
  [`docs/jira-dialogs-referenz.md`](jira-dialogs-referenz.md)** und sind am
  DOM-Auszug der produktiven Instanz belegt. Nicht abweichen.

  1b. Hilfsfunktion `openViaShifter(begriff, gruppe, dialogSelector)`:
     `sendKey(document.body, '.')` ->
     `waitForElement('#shifter-dialog-field')` -> `setValue(feld, begriff)` ->
     im Treffer-Container `#shifter-dialog-suggestions` auf
     `<gruppe> li.aui-list-item-li-<slug(begriff)>` warten
     (`slug` = kleingeschrieben, Leerzeichen zu `-`) -> diesen Eintrag per
     `JiraUi.click` waehlen, **nicht** blind `Enter` senden: `Enter` nimmt
     `li.active`, und das ist bei mehreren Treffern nicht zwingend der
     gemeinte. `Enter` bleibt Fallback, wenn der Eintrag `.active` traegt.
     Danach auf `dialogSelector` warten.
  2. Schritt 1 `addLabel(ticketNumber)`:
     `JiraUi.sendKey(document.body, 'l')`, dann
     `waitForElement('#edit-labels-dialog.jira-dialog-open', { timeout: 1500 })`.
     Fallback bei Timeout: `openViaShifter('Labels', '#edit-fields', '#edit-labels-dialog')`.
     Wert in `textarea#labels-textarea` schreiben, `Enter` senden (das
     uebernimmt den Eintrag in die Multi-Select-Darstellung), dann mit
     `#edit-labels-dialog #submit` bestaetigen und `waitForGone` abwarten.
     `#send-notifications` bleibt unberuehrt.
  3. Schritt 2 `setReference(text, fieldName, fieldId)`:
     `openViaShifter(fieldName, '#edit-fields', '#modal-field-view')`.
     **Den geoeffneten Dialog verifizieren, bevor geschrieben wird** - beide
     Custom-Field-Dialoge teilen sich die id `#modal-field-view`:
     `h2#modal-field-view-title` muss `fieldName` enthalten **und** das
     Zielfeld muss ein `input[type="text"]` sein. Trifft das nicht zu (etwa
     beim Label-Picker `#customfield_10900-textarea`), abbrechen mit
     `step: 'reference'` statt zu schreiben.
     Feld suchen in dieser Reihenfolge: `#modal-field-view #' + fieldId`,
     sonst `#modal-field-view .form-body input.textfield[type="text"]`.
     **Vor dem Ueberschreiben** `field.value` lesen und getrimmt als
     `previousReference` merken (leer -> `''`).
     Dann `setValue(feld, text)` und mit
     `#modal-field-view .buttons input[type="submit"]` bestaetigen,
     `waitForGone('#modal-field-view')`.
  4. Schritt 3 `addWebLink(linkText, url)`:
     `openViaShifter('Link', '#issue-actions', '#link-issue-dialog')`.
     Fallback: `#link-issue` per `click`.
     Reiter wechseln: `button#add-web-link-link` nur klicken, wenn er **nicht**
     schon `.selected` traegt; danach auf `form#web-issue-link` warten - der
     Rumpf kommt per AJAX aus `data-url`, der Dialog ist vorher schon da.
     Dann `setValue('#web-link-url', url)` - das Feld ist mit `http://`
     vorbelegt, der Wert wird **ersetzt** -, `setValue('#web-link-title', linkText)`,
     Kommentarfeld leer lassen, mit `#web-issue-link input[name="Link"]`
     bestaetigen, `waitForGone('#link-issue-dialog')`.
  5. Jeder Schritt kapselt seine Fallbacks; Ablauf strikt sequenziell per
     Promise-Kette (kein `async/await`, ES5). Zwischen den Schritten
     `JiraUi.delay(150)`, damit Jira den vorherigen AJAX-Zyklus abschliesst.
  6. Optionaler Zusatz-Fallback: ist `window.JIRA` vorhanden, nach jedem
     Schritt `JIRA.trace` ignorieren - **keine** Abhaengigkeit davon aufbauen,
     nur nutzen, wenn vorhanden, in `try/catch` (leere `catch`-Bloecke sind in
     diesem Projekt Absicht).
  7. Manifest und `CONTENT_FILES` um `src/otrsflow.js` erweitern
     (nach `jiraui`, vor `content`).
  8. Fixture erweitern: `#customfield_10027` bekommt einen vorbelegten Wert,
     damit `previousReference` pruefbar ist; die Shifter-Trefferliste liefert
     abhaengig vom eingegebenen Text den passenden Eintrag und oeffnet beim
     Klick den zugehoerigen Dialog. Fuer den Verwechslungstest muss die
     Eingabe "Customer Jira Key" den **zweiten** `#modal-field-view` mit
     `#customfield_10900-textarea` oeffnen.
  9. Integrationstests ergaenzen:
     * kompletter Durchlauf mit dem Beispiel aus dem Issue - Label gesetzt,
       Custom Field gesetzt, Web-Link mit Text und URL gesetzt
     * `previousReference` liefert den alten Wert, wenn das Feld belegt war
     * `previousReference` ist `''`, wenn das Feld leer war
     * `#web-link-url` enthaelt am Ende genau die URL, nicht `http://` plus URL
     * oeffnet der Shifter den Label-Picker "Customer Jira Key" statt des
       Textfelds, bricht der Ablauf ab (`error.step === 'reference'`) und
       schreibt **nichts** - `#customfield_10900-textarea` bleibt leer
     * Fallback greift: Tastendruck wird im Fixture unterdrueckt, der Ablauf
       gelingt trotzdem ueber Shifter und DOM-Selektoren
     * fehlender Link-Dialog -> Promise wird abgelehnt, `error.step === 'link'`
* **Definition of Done:**
  * [ ] Modullauf `test:module otrs` gruen
  * [ ] Lint ohne Befund, `npm test` gruen - genau einmal, am Ende
  * [ ] Alle drei Schritte laufen im Browser-Test gegen die Fixture durch
  * [ ] Jeder Schritt hat einen DOM-Fallback, der getestet ist
  * [ ] `previousReference` wird vor dem Ueberschreiben gelesen
  * [ ] `manifest.json` und `CONTENT_FILES` identisch
  * [ ] Commit `feat(jira): otrs-verweis in drei feldern eintragen` und Push
  * [ ] Review-Prompt fuer Opus ausgegeben (Form siehe oben)

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 3.

Vorbedingung: feature/issue-17-part-2 enthaelt src/jiraui.js und
test/fixtures/mock-jira-otrs.html. Zweige feature/issue-17-part-3 davon ab.

Lies ausserdem jira-markdown-converter/docs/jira-dialogs-referenz.md - alle
Selektoren stammen von dort und sind am echten DOM belegt. Weiche nicht ab.

Aufgabe: Nur Sub-Task 3. Neu: src/otrsflow.js (UMD-Modul JiraOtrsFlow mit
run(parsed, options) -> Promise). Der Ablauf ist strikt sequenziell:
1. Label mit der Ticketnummer, 2. Custom Field "Kunden Referenz" - den
bestehenden Wert VOR dem Ueberschreiben auslesen und als previousReference
zurueckgeben, 3. Web-Link im Reiter "Web Link".
Jeder Schritt zuerst per Tastatur-Shortcut (l bzw. .), sonst ueber den Shifter
(#shifter-dialog-field, Treffer li.aui-list-item-li-<slug> gezielt anklicken).

Zwei Fallen, die im echten DOM belegt sind:
- Beide Custom-Field-Dialoge heissen #modal-field-view. Vor dem Schreiben
  pruefen, dass h2#modal-field-view-title den Feldnamen enthaelt UND das Ziel
  ein input[type="text"] ist - sonst abbrechen, nie in den Label-Picker
  #customfield_10900-textarea schreiben.
- #web-link-url ist mit "http://" vorbelegt. Ersetzen, nicht ergaenzen. Nutze ausschliesslich JiraUi aus Sub-Task 2 fuer
Warten, Klicken, Tasten und Werte - kein eigenes setTimeout-Polling.
Geaendert: manifest.json + src/background.js (CONTENT_FILES identisch halten),
test/fixtures/mock-jira-otrs.html. Neu:
test/modules/otrs/browser/flow.test.js.

Folge Schritt 1-9 samt Selektoren und den fuenf Testfaellen woertlich.

Regeln: ES5, 'use strict', nur var, Promise-Ketten statt async/await, keine
Runtime-Dependencies, Deutsch ohne Umlaute, kein console.log. Kein Zugriff auf
src/content.js und keine Oberflaeche in diesem Schritt.

Waehrend der Arbeit ausschliesslich:
  npm run test:module otrs --prefix jira-markdown-converter
Erst danach genau einmal npm run lint und npm test
(--prefix jira-markdown-converter).
Commit "feat(jira): otrs-verweis in drei feldern eintragen",
git push -u origin feature/issue-17-part-3, PR gegen feature/issue-17-part-2.

Zum Schluss, nach dem Push: Erstelle einen Review-Prompt fuer Opus, der die
Code-Aenderungen, deine Designentscheidungen, potenzielle Edge Cases und 3-4
konkrete Pruefpunkte fuer diesen PR zusammenfasst. Halte dich an die Form im
Abschnitt "Abschluss jeder Session: Review-Prompt fuer Opus" des Plans und gib
ihn als einzelnen Codeblock aus.
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
    `jira-markdown-converter/test/modules/package/sources.test.js`
* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/otrsdialog.js` als UMD-Modul `JiraOtrsDialog` anlegen, Aufbau
     analog `src/codedialog.js`. API: `open(handlers)`, `close()`, `isOpen()`.
     `handlers = { onSubmit: function (parsed) {}, onError: function (msg) {} }`.
  2. Markup als feste Vorlage `var DIALOG_HTML = [...].join('\n')` -
     `test/modules/package/sources.test.js` erlaubt `innerHTML` nur mit einer
     solchen Konstanten.
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
  8. `test/modules/package/sources.test.js`: `src/otrsdialog.js` in die
     Datei-Liste des Tests "keine console-Ausgaben" aufnehmen und in die
     `templates`-Zuordnung von "kein innerHTML mit Fremddaten" mit
     `/DIALOG_HTML/` eintragen.
  9. Neue Datei `test/modules/otrs/browser/dialog.test.js`. `SOURCES`/`STYLES`
     bleiben unberuehrt - Schritt 7 im Manifest genuegt. Testfaelle:
     * Dialog oeffnet und schliesst wieder
     * Eingabe des Beispiels fuellt alle drei Vorschauzeilen
     * unbrauchbare Eingabe zeigt den Fehlertext und sperrt "Absenden"
     * `onSubmit` bekommt das Objekt aus `JiraOtrsLink.parse`
     * `Escape` schliesst den Dialog
* **Definition of Done:**
  * [ ] Modullauf `test:module otrs package` gruen
  * [ ] Lint ohne Befund, `npm test` gruen - genau einmal, am Ende
  * [ ] `innerHTML` nur mit `DIALOG_HTML`, erkannte Werte per `textContent`
  * [ ] Dialog laesst sich per Tastatur vollstaendig bedienen
  * [ ] `manifest.json` und `CONTENT_FILES` identisch
  * [ ] Commit `feat(jira): dialog fuer den otrs-link-helfer` und Push
  * [ ] Review-Prompt fuer Opus ausgegeben (Form siehe oben)

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
test/modules/package/sources.test.js (otrsdialog.js in die console-Pruefung und
in die templates-Zuordnung von "kein innerHTML mit Fremddaten" mit
/DIALOG_HTML/). Neu: test/modules/otrs/browser/dialog.test.js (fuenf Faelle).
SOURCES/STYLES nicht anfassen - test/lib/browser.js liest sie aus manifest.json.

Wichtig: innerHTML ausschliesslich mit der Konstanten DIALOG_HTML; erkannte
Werte immer per textContent setzen - test/modules/package/sources.test.js
prueft das.

Folge Schritt 1-9 des Sub-Tasks woertlich, inklusive der data-role- und
data-otrs-action-Attribute; Sub-Task 5 verdrahtet genau diese.

Regeln: ES5, 'use strict', nur var, keine Runtime-Dependencies, Deutsch ohne
Umlaute, kein console.log. src/content.js bleibt in diesem Schritt unberuehrt.

Waehrend der Arbeit ausschliesslich:
  npm run test:module otrs package --prefix jira-markdown-converter
Erst danach genau einmal npm run lint und npm test
(--prefix jira-markdown-converter).
Commit "feat(jira): dialog fuer den otrs-link-helfer",
git push -u origin feature/issue-17-part-4, PR gegen feature/issue-17-part-3.

Zum Schluss, nach dem Push: Erstelle einen Review-Prompt fuer Opus, der die
Code-Aenderungen, deine Designentscheidungen, potenzielle Edge Cases und 3-4
konkrete Pruefpunkte fuer diesen PR zusammenfasst. Halte dich an die Form im
Abschnitt "Abschluss jeder Session: Review-Prompt fuer Opus" des Plans und gib
ihn als einzelnen Codeblock aus.
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
    `jira-markdown-converter/src/content.css`,
    `jira-markdown-converter/popup/popup.html`,
    `jira-markdown-converter/popup/popup.js`,
    `jira-markdown-converter/options/options.html`,
    `jira-markdown-converter/options/options.js`,
    `jira-markdown-converter/test/modules/content/browser/` (neue Datei
    `otrs.test.js`), `jira-markdown-converter/test/modules/options/browser/`,
    `jira-markdown-converter/test/modules/popup/browser/`
* **Schritt-fuer-Schritt Anweisungen:**
  1. Die Einstellungen `otrsHelper`, `otrsFieldName` und `otrsFieldId` stehen
     seit Sub-Task 1 in `src/settings.js`. **`src/settings.js` und
     `test/modules/settings/` bleiben in dieser Session zu** - hier wird nur
     gelesen.
  2. `src/content.js`: Modul-Referenzen oben ergaenzen
     (`var OtrsLink = window.JiraOtrsLink;` usw., Muster der bestehenden Zeilen
     11-15). Funktion `openOtrsDialog()` anlegen, die
     `JiraOtrsDialog.open({ onSubmit: runOtrsFlow })` aufruft.
  3. `runOtrsFlow(parsed)`:
     ```
     JiraOtrsFlow.run(parsed, { fieldName: settings.otrsFieldName,
                                fieldId: settings.otrsFieldId })
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
     zwei Textfelder auf der Optionsseite: `otrsFieldName` ("Feldname der
     Kundenreferenz") und `otrsFieldId` ("Feld-ID, falls der Name nicht
     gefunden wird").
  6. `src/content.css`: Klassen fuer den neuen Feldleisten-Button und die
     langlebige Warnung ergaenzen.
  7. Browser-Tests fuer Popup und Optionsseite in den jeweiligen Modulen
     ergaenzen (`test/modules/popup/browser/popup.test.js`,
     `test/modules/options/browser/`): Schalter `otrsHelper` startet mit dem
     gespeicherten Zustand und schreibt beim Umschalten in den Storage;
     `otrsFieldName` und `otrsFieldId` landen beim Speichern im Storage.
  8. Neue Datei `test/modules/otrs/browser/verdrahtung.test.js`. Faelle
     * Panel-Button oeffnet den OTRS-Dialog
     * vollstaendiger Durchlauf gegen `mock-jira-otrs.html` endet mit dem
       Toast "OTRS Link im Ticket eingepflegt."
     * belegtes Referenzfeld erzeugt zusaetzlich die Warnung samt altem Wert
     * `otrsHelper: false` blendet Panel-Button und Feldleisten-Eintrag aus
     * Fehler im Ablauf zeigt die Fehlermeldung als Fehler-Toast
  9. Modullauf `npm run test:module otrs content options popup --prefix jira-markdown-converter`.
     Erst danach einmal Lint und Gesamtlauf.
* **Definition of Done:**
  * [ ] Modullauf `test:module otrs content options popup` gruen
  * [ ] Lint ohne Befund, `npm test` gruen - genau einmal, am Ende
  * [ ] `src/settings.js` unveraendert - die Schluessel kamen in Sub-Task 1
  * [ ] Erfolgsmeldung lautet woertlich "OTRS Link im Ticket eingepflegt."
  * [ ] Warnung lautet woertlich "Achtung: Kundenreferenz wurde ueberschrieben.
        Vorheriger Wert: <alter Wert>" und steht mindestens 10 Sekunden
  * [ ] Schalter `otrsHelper` in Popup und Optionsseite vorhanden
  * [ ] `otrsFieldName` und `otrsFieldId` auf der Optionsseite pflegbar
  * [ ] Commit `feat(jira): otrs-link-helfer verdrahten` und Push
  * [ ] Review-Prompt fuer Opus ausgegeben (Form siehe oben)

* **Agent-Start-Prompt:**

```text
Repo: pascallink/webkit-ext, Projekt jira-markdown-converter.
Lies CLAUDE.md (Root und Projekt) und
jira-markdown-converter/docs/issue-17-ausfuehrungsplan.md - Sub-Task 5.

Vorbedingung: feature/issue-17-part-4 enthaelt src/otrslink.js, src/jiraui.js,
src/otrsflow.js, src/otrsdialog.js. Zweige feature/issue-17-part-5 davon ab.

Aufgabe: Nur Sub-Task 5 - die Verdrahtung. Die Einstellungen otrsHelper,
otrsFieldName und otrsFieldId stehen bereits in src/settings.js; diese Datei
und test/modules/settings/ bleiben zu, du liest die Werte nur.
Geaendert: src/content.js (openOtrsDialog, runOtrsFlow, Panel-Button
data-action="otrs", Feldleisten-Eintrag), src/content.css,
popup/popup.html+js, options/options.html+js, Browser-Tests in
test/modules/popup/ und test/modules/options/.
Neu: test/modules/otrs/browser/verdrahtung.test.js.

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

Waehrend der Arbeit ausschliesslich:
  npm run test:module otrs content options popup --prefix jira-markdown-converter
Erst danach genau einmal npm run lint und npm test
(--prefix jira-markdown-converter).
Commit "feat(jira): otrs-link-helfer verdrahten",
git push -u origin feature/issue-17-part-5, PR gegen feature/issue-17-part-4.

Zum Schluss, nach dem Push: Erstelle einen Review-Prompt fuer Opus, der die
Code-Aenderungen, deine Designentscheidungen, potenzielle Edge Cases und 3-4
konkrete Pruefpunkte fuer diesen PR zusammenfasst. Halte dich an die Form im
Abschnitt "Abschluss jeder Session: Review-Prompt fuer Opus" des Plans und gib
ihn als einzelnen Codeblock aus.
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
  2b. `docs/jira-dialogs-referenz.md` gegen den Stand der Umsetzung pruefen:
     was Sub-Task 3 an Selektoren korrigieren musste, wird dort nachgezogen -
     die Datei ist die Referenz fuer den naechsten Jira-Umbau.
  3. `CLAUDE.md` des Projekts: die vier neuen Module in die Struktur-Tabelle
     und in die UMD-Aufzaehlung aufnehmen. **Grenze 40 Zeilen einhalten** -
     dafuer bestehende Zeilen straffen, nicht anhaengen.
  4. Version in `package.json` **und** `manifest.json` auf `1.3.0` setzen -
     `test/modules/package/manifest.test.js` vergleicht beide. Der Meilenstein
     des Issues lautet
     ebenfalls 1.3.0.
  5. Store-Unterlagen: Funktionsliste in `listing-de.md` und `listing-en.md`
     um den Helfer erweitern. **Die Laenge der Textbloecke bleibt innerhalb
     der von `test/modules/package/store.test.js` geprueften Grenzen** -
     `npm run test:module package` vor dem Commit laufen lassen. `review-notes.md` um einen Satz ergaenzen, dass die
     Erweiterung Formularfelder auf der Jira-Seite im Auftrag des Nutzers
     befuellt; es kommen keine neuen Berechtigungen hinzu.
  6. Pruefen, dass `manifest.json` unveraendert bei
     `permissions`, `host_permissions` und `optional_host_permissions` bleibt.
  6b. `.github/TESTS.md` und `README.md`: Testzahlen des Moduls `otrs`
     nachtragen (`node test/run.js --list` im Projektordner liefert sie).
  7. Modullauf `npm run test:module package --prefix jira-markdown-converter`,
     danach einmal `npm run lint`, `npm test` und im Repo-Root
     `npm install && npm run lint:commits`.
* **Definition of Done:**
  * [ ] Modullauf `test:module package` gruen
  * [ ] Lint ohne Befund, `npm test` gruen, `lint:commits` gruen
  * [ ] `package.json` und `manifest.json` beide auf `1.3.0`
  * [ ] `CLAUDE.md` des Projekts hoechstens 40 Zeilen
  * [ ] Keine neuen Berechtigungen im Manifest
  * [ ] Keine Umlaute in allen geaenderten Texten
  * [ ] Commit `docs(jira): otrs-link-helfer dokumentieren` und Push
  * [ ] Review-Prompt fuer Opus ausgegeben (Form siehe oben)

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
package.json und manifest.json (beide auf 1.3.0 -
test/modules/package/manifest.test.js vergleicht sie), docs/store/listing-de.md,
listing-en.md, review-notes.md, .github/TESTS.md (Testzahlen des Moduls otrs).

Wichtig: keine neuen Berechtigungen im Manifest; die Textbloecke der
Store-Listings haben von test/modules/package/store.test.js gepruefte
Laengengrenzen.

Waehrend der Arbeit ausschliesslich:
  npm run test:module package --prefix jira-markdown-converter

Erst danach genau einmal:
  npm run lint --prefix jira-markdown-converter
  npm test  --prefix jira-markdown-converter
  npm install && npm run lint:commits
Alles gruen. Commit "docs(jira): otrs-link-helfer dokumentieren",
git push -u origin feature/issue-17-part-6, PR gegen feature/issue-17-part-5.

Zum Schluss, nach dem Push: Erstelle einen Review-Prompt fuer Opus, der die
Code-Aenderungen, deine Designentscheidungen, potenzielle Edge Cases und 3-4
konkrete Pruefpunkte fuer diesen PR zusammenfasst. Halte dich an die Form im
Abschnitt "Abschluss jeder Session: Review-Prompt fuer Opus" des Plans und gib
ihn als einzelnen Codeblock aus.
```

---

## Risiken und offene Punkte

| Punkt | Bewertung |
| --- | --- |
| Die Selektoren stammen aus einem DOM-Auszug der produktiven Instanz, nicht aus einem Live-Lauf. | Deutlich entschaerft: Struktur, ids und Klassen sind belegt ([`docs/jira-dialogs-referenz.md`](jira-dialogs-referenz.md)). Offen bleiben Ladezeiten und Fehlerpfade - dafuer `waitForElement` und die Fallback-Ebene. Ein manueller Durchlauf vor dem Release bleibt noetig. |
| Custom-Field-ID (`customfield_10027`) ist instanzabhaengig. | Der Ablauf sucht ueber den Feldnamen im Shifter; die id ist nur Fallback und ueber `otrsFieldId` einstellbar. |
| Zwei Dialoge teilen sich `#modal-field-view` - "Kunden Referenz" (Textfeld) und "Customer Jira Key" (Label-Picker). | Groesste verbliebene Fehlerquelle: ein zu weiter Selektor schreibt in das falsche Feld. Sub-Task 3 verifiziert Titel und Feldtyp vor jedem Schreibzugriff und hat dafuer einen eigenen Testfall. |
| PR #65 ist noch nicht gemergt. | Sub-Task 1 haengt daran: ohne `.github/TESTS.md` fehlt die Landkarte, ohne `isolation.test.js` faellt der Guard aus. Erst mergen, dann starten. |
| Die Jira-Oberflaeche ist englisch, nur der Feldname deutsch. | Selektoren haengen an ids und Klassen, nie an UI-Texten; der Feldname kommt aus den Einstellungen. |
| `support.inxire.com` und die Jira-Server-Hosts sind nicht im Manifest. | Absicht - die bestehende Mechanik `extraHosts` plus `optional_host_permissions` deckt das ab, ohne die Store-Pruefung zu belasten. |
