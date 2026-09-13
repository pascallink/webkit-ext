# Ausfuehrungsplan Issue #32 - CustomerKey-Mapping, Anreicherung und Highlighting

Zerlegung von [Issue #32](https://github.com/pascallink/webkit-ext/issues/32) in
fuenf atomare Sub-Tasks. Jeder Sub-Task ist genau ein Branch und ein Pull
Request; die PRs stapeln aufeinander (Stacked PRs, PR 2 auf PR 1 usw.). Jede
Stufe ist lauffaehig, lintbar und testbar.

Zielumgebung: Jira Server / Data Center 9.12 LTS, MV3, ES5, kein Bundler.

## Architekturentscheidungen (verbindlich fuer alle Sub-Tasks)

1. **Eigenes Modul `src/mapping.js` (UMD `JiraMapping`), DOM-frei.**
   Die Zuordnungstabelle, das Regex-Handling und die Textanreicherung sind
   reine Textlogik und laufen damit unter Node - genau wie `converter.js`.
   `content.js` (2022 Zeilen) und `editors.js` (984) bekommen keinen
   Parser dazu; sie rufen nur auf. Testmodul ist das in
   [`.github/TESTS.md`](../../../.github/TESTS.md) reservierte `mapping`.

2. **Die Tabelle liegt in `chrome.storage.local`, das Muster in `sync`.**
   `storage.sync` erlaubt 8192 Byte je Item - eine Mapping-Tabelle mit
   einigen hundert Kunden-Schluesseln sprengt das lautlos. `customerKeyMap`
   kommt darum in `Settings.LOCAL_KEYS`, wie `customTemplates` (Issue #31).
   `customerKeyPattern`, `customerKeyFieldName` und `customerKeyHighlight`
   sind kurz und bleiben in `sync`, damit sie das Geraet wechseln.

3. **Das Regex-Muster ist Benutzereingabe und wird nie ungeprueft kompiliert.**
   `Mapping.compile()` deckelt die Laenge (120 Zeichen), verbietet die
   Flag-Syntax und faellt bei einem `SyntaxError` auf das Standardmuster
   zurueck. Ein kaputtes Muster darf das Content-Script nicht werfen lassen.
   Katastrophales Backtracking bleibt moeglich - deshalb laeuft die
   Anreicherung nur auf Knopfdruck, nicht bei jedem Tastendruck.

4. **Anreicherung im RTE aendert ausschliesslich `nodeValue` von Textknoten.**
   Kein `innerHTML`, kein neues Element, keine Tags in bearbeitbaren Text -
   das ist die harte Vorgabe aus dem Issue. Im Textarea-Modus laeuft die
   Ersetzung ueber den Wert, nicht ueber das DOM.

5. **Highlighting fasst Editoren nie an.** Der MutationObserver arbeitet nur
   auf Lese-Containern und bricht an jedem `textarea`, `input`,
   `[contenteditable]`, `.mce-*`, `iframe`, `script`, `style` und an der
   eigenen Oberflaeche (`.jmd-*`) ab. Gegenprobe gehoert in die Tests, nicht
   nur in den Kommentar.

6. **Meta-Sync laeuft ueber das DOM, nicht ueber die REST-API.** Die
   Erweiterung hat keine Cookies-/Host-Rechte fuer beliebige Jira-Instanzen
   und kein XSRF-Token. Der Weg ueber die vorhandenen AUI-Dialoge ist bereits
   mit dem OTRS-Link-Helfer (Issue #17) belegt: `src/keysync.js` nutzt
   dieselben Helfer aus `src/jiraui.js`.

7. **Ein Treffer ohne Mapping bleibt unveraendert.** Weder Klammer noch
   Platzhalter - die Anreicherung ist idempotent und darf beliebig oft
   laufen.

## Datenmodell

```js
// src/settings.js - DEFAULTS
customerKeyPattern: '(ROV|REFI)-\\d+',  // sync, Muster fuer gueltige Kunden-Schluessel
customerKeyFieldName: 'CustomerKey',    // sync, Name des Custom Fields
customerKeyHighlight: true,             // sync, Badge in der Leseansicht
customerKeyMap: {}                      // local, siehe unten

// customerKeyMap nach der Normalisierung - Schluessel in Grossschreibung,
// Werte immer ein Array ohne Duplikate:
{ 'ROV-1234': ['JIRA-567', 'JIRA-568'], 'REFI-99': ['JIRA-12'] }
```

Import-Format (JSON, beide Formen werden angenommen, exportiert wird die erste):

```json
{ "ROV-1234": ["JIRA-567", "JIRA-568"], "REFI-99": "JIRA-12, JIRA-13" }
```

## Uebersicht der Sub-Tasks

| # | Branch | Base | Inhalt |
| --- | --- | --- | --- |
| 1 | `claude/issue-32-part-1-mapping` | `main` | `src/mapping.js`, Storage-Schema, Testmodul `mapping` |
| 2 | `claude/issue-32-part-2-options` | Part 1 | Optionsseite: Muster, JSON-Import/Export, Reset |
| 3 | `claude/issue-32-part-3-anreichern` | Part 2 | Feldleisten-Aktion "Keys" fuer Textarea und RTE |
| 4 | `claude/issue-32-part-4-sync` | Part 3 | `src/keysync.js`: Label und Custom Field befuellen |
| 5 | `claude/issue-32-part-5-highlight` | Part 4 | Badge in der Leseansicht, Doku und CHANGELOG |

---

## Sub-Task 1: Mapping-Modul und Storage-Schema

* **Git Branch:** `claude/issue-32-part-1-mapping` (Base: `main`)
* **Scope / Ziel:** Zuordnungstabelle, Musterpruefung und Textanreicherung als
  testbares Modul; Einstellungen kennen die neuen Schluessel.
* **Dateiebene:**
  * Zu erstellen: `jira-markdown-converter/src/mapping.js`,
    `jira-markdown-converter/test/modules/mapping/mapping.test.js`
  * Zu aendern: `jira-markdown-converter/src/settings.js`,
    `jira-markdown-converter/manifest.json`,
    `jira-markdown-converter/src/background.js`,
    `jira-markdown-converter/package.json`, `.github/TESTS.md`
* **Definition of Done:**
  * [ ] `Mapping.enrich()` haengt genau dann an, wenn ein Mapping existiert und
        der Ziel-Key nicht schon in Klammern dahinter steht.
  * [ ] `Mapping.compile()` wirft bei keinem Eingabewert.
  * [ ] `npm run test:mapping --prefix jira-markdown-converter` ist gruen,
        `package/isolation.test.js` ebenfalls.

## Sub-Task 2: Optionsseite

* **Git Branch:** `claude/issue-32-part-2-options` (Base: Part 1)
* **Scope / Ziel:** Muster pflegen, Tabelle als JSON importieren und
  exportieren, Tabelle zuruecksetzen.
* **Dateiebene:** `options/options.html`, `options/options.js`,
  `options/options.css`, `test/modules/options/browser/customerkeys.test.js`
* **Definition of Done:**
  * [ ] Ungueltiges Muster wird am Feld gemeldet und nicht gespeichert.
  * [ ] Export liefert genau die normalisierte Tabelle zurueck, Import
        akzeptiert String- und Array-Werte.
  * [ ] Reset loescht nur `customerKeyMap`, keine anderen Einstellungen.

## Sub-Task 3: Anreicherung im Editor

* **Git Branch:** `claude/issue-32-part-3-anreichern` (Base: Part 2)
* **Scope / Ziel:** Knopf "Keys" in der Feldleiste reichert Textarea und RTE an.
* **Dateiebene:** `src/content.js`, `src/content.css`,
  `test/modules/content/browser/customerkeys.test.js`
* **Definition of Done:**
  * [ ] Textarea: Anreicherung ueber den Feldwert, Cursorposition bleibt gueltig.
  * [ ] RTE: nur `nodeValue` von Textknoten, keine neuen Elemente.
  * [ ] Zweiter Klick aendert nichts mehr (Idempotenz, im Test belegt).

## Sub-Task 4: Meta-Sync (Label und Custom Field)

* **Git Branch:** `claude/issue-32-part-4-sync` (Base: Part 3)
* **Scope / Ziel:** Kunden-Schluessel aus der Beschreibung als Label und im
  Custom Field hinterlegen.
* **Dateiebene:** `src/keysync.js`, `src/content.js`, `manifest.json`,
  `src/background.js`, `test/modules/mapping/browser/keysync.test.js`
* **Definition of Done:**
  * [ ] Mehrdeutigkeit (mehrere verschiedene Kunden-Schluessel) bricht mit
        Meldung ab, statt zu raten.
  * [ ] Fehlendes Custom Field meldet einen Fehler, das Label bleibt gesetzt.

## Sub-Task 5: Highlighting in der Leseansicht

* **Git Branch:** `claude/issue-32-part-5-highlight` (Base: Part 4)
* **Scope / Ziel:** Kunden-Schluessel in Lese-Containern als Badge.
* **Dateiebene:** `src/content.js`, `src/content.css`,
  `test/modules/content/browser/keyhighlight.test.js`, `README.md`,
  `CHANGELOG.md`
* **Definition of Done:**
  * [ ] Kein Treffer innerhalb `textarea`, `input`, `[contenteditable]`,
        `.mce-*` oder `.jmd-*` wird umschlossen - per Test belegt.
  * [ ] Der Observer laeuft nicht in eine Schleife (eigene Einfuegungen werden
        uebersprungen).
