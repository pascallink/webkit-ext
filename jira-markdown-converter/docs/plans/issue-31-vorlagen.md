# Ausfuehrungsplan Issue #31 - Benutzerdefinierte Vorlagen mit Platzhaltern

Zerlegung von [Issue #31](https://github.com/pascallink/webkit-ext/issues/31) in
sechs atomare Sub-Tasks. Jeder Sub-Task ist genau ein Branch und ein Pull
Request; die PRs stapeln aufeinander (Stacked PRs). Jede Stufe ist lauffaehig,
lintbar und testbar - kein Zwischenstand laesst die Erweiterung kaputt.

Zielumgebung: Jira Server / Data Center 9.12 LTS, MV3, ES5, kein Bundler.

## Architekturentscheidungen (verbindlich fuer alle Sub-Tasks)

Diese Punkte weichen bewusst von der groben Skizze im Issue ab. Sie gelten fuer
alle Agenten und sind nicht neu zu verhandeln.

1. **Platzhalter-Syntax ist `${Name}`, nicht `{{Name}}`.**
   `{{text}}` ist in Jira-Wiki-Markup bereits belegt (Monospace). Bleibt ein
   Platzhalter unersetzt stehen, wuerde er im Ticket als Monospace-Text
   gerendert - stiller Fehler. `${...}` hat im Wiki-Renderer keine Bedeutung.
   Erkennung: `/\$\{\s*([^}\r\n]{1,40}?)\s*\}/g`, Name case-sensitiv.

2. **Die Ersetzung ist reine Textlogik und liegt in `src/settings.js`, nicht in
   `src/editors.js`.** `converter.js` bleibt fuer Markdown reserviert,
   `editors.js` ist DOM-Code und in Node nicht testbar. Die Fuellfunktion
   gehoert neben das Schema, das sie kennt - dort laeuft sie unter
   `node test/settings.test.js`.

3. **Eingefuegt wird ueber das vorhandene `Editors.insertFormatted(field,
   markup, null, 'block')`.** `editors.js` bekommt keine neue Funktion; die
   Cursorlogik (`rememberCaret` / `restoreCaret`) steht bereits.

4. **Vorlagen liegen in `chrome.storage.local`, alle uebrigen Einstellungen
   bleiben in `chrome.storage.sync`.**
   `storage.sync` erlaubt 8192 Byte **pro Item**; `customTemplates` waere ein
   einziges Item und damit nach wenigen Vorlagen voll - ein Limit, das der
   Nutzer weder sieht noch versteht. `storage.local` bietet mindestens 5 MB
   (ab Chrome 114: 10 MB), das Feature braucht keine kuenstliche Obergrenze.
   Die Berechtigung `storage` deckt beide Bereiche ab, das Manifest bleibt
   unveraendert.

   Konsequenzen, die jeder Sub-Task mittragen muss:
   * `Settings.load()` liest aus **beiden** Bereichen und fuehrt sie zusammen.
   * `Settings.save()` teilt auf: `customTemplates` nach `local`, der Rest nach
     `sync`. Vorlagen duerfen nie in `sync` landen, sonst ist das 8-KB-Limit
     zurueck.
   * `Settings.onChange()` reagiert auf `area === 'sync'` **und**
     `area === 'local'`.
   * Grenzen bleiben trotzdem gesetzt, aber als Vernunftgrenze statt als
     Speicherzwang: 50 Vorlagen, 5000 Zeichen Markup je Vorlage.
   * Der Preis: Vorlagen wandern **nicht** auf andere Geraete mit. Das gehoert
     sichtbar in die Optionsseite und in die README, nicht in eine Fussnote.
   * `chrome.storage.local` ist im Content-Script genauso lesbar wie `sync` -
     an der Verteilung an `content.js` aendert sich nichts.

5. **Rich-Text-Editor: Markup wird als Text eingefuegt.** Anders als bei den
   Panel-Vorlagen gibt es zu einer freien Markup-Vorlage kein aequivalentes
   HTML. Ist `switchToMarkup` gesetzt, wird vorher umgeschaltet (bestehender
   Pfad). Sonst landet das Markup als Text - mit Hinweis im Toast. Das ist eine
   dokumentierte Einschraenkung, kein Bug.

6. **Kein `innerHTML` mit Fremddaten.** `test/package.test.js` erzwingt das
   bereits. Vorlagentitel und Platzhalternamen sind Benutzereingaben und werden
   ausschliesslich ueber `document.createElement` und `textContent` in das DOM
   gebracht.

## Datenmodell

```js
// Teil von DEFAULTS in src/settings.js - gespeichert wird der Schluessel
// aber in chrome.storage.local, nicht in sync (Architekturentscheidung 4).
customTemplates: []

// Ein Eintrag nach der Normalisierung:
{
  id: 'tpl-1730000000000-4f2',   // stabil, wird nie neu vergeben
  title: 'Bug-Report',           // 1..60 Zeichen, ohne Umlaute erlaubt aber ungeprueft
  templateMarkup: 'h3. ${Titel}\n\n{panel}${Beschreibung}{panel}',  // 1..5000 Zeichen
  placeholders: ['Titel', 'Beschreibung']   // 0..5 Eintraege, je 1..40 Zeichen, eindeutig
}
```

## Uebersicht der Sub-Tasks

| # | Branch | Base | Ergebnis |
| --- | --- | --- | --- |
| 1 | `feature/issue-templates-part-1` | `main` | Schema, Validierung, Fuelllogik in `settings.js` |
| 2 | `feature/issue-templates-part-2` | part-1 | CRUD-Oberflaeche in `options/` |
| 3 | `feature/issue-templates-part-3` | part-2 | Dropdown "Vorlagen" in der Feldleiste |
| 4 | `feature/issue-templates-part-4` | part-3 | Modal-Dialog fuer die Platzhalterwerte |
| 5 | `feature/issue-templates-part-5` | part-4 | Cursor, Rich-Text-Pfad, Escaping haerten |
| 6 | `feature/issue-templates-part-6` | part-5 | Doku, Changelog, Store-Unterlagen |

---

## Sub-Task 1: Schema, geteilter Storage und Fuelllogik in `src/settings.js`

* **Git Branch:** `feature/issue-templates-part-1` (Base Branch: `main`)
* **Scope / Ziel:** `customTemplates` als Einstellung verankern, den Storage
  auf `sync` (Einstellungen) und `local` (Vorlagen) aufteilen, Eingaben robust
  normalisieren und die Platzhalter-Ersetzung als reine, in Node testbare
  Funktion bereitstellen. Keine Oberflaeche, kein DOM.

  Der geteilte Storage ist der heikelste Teil dieses Sub-Tasks: `load`, `save`
  und `onChange` sind die Strecke, ueber die Popup, Optionsseite und
  Content-Script **alle** Einstellungen beziehen. Geht dort etwas kaputt, ist
  nicht nur das neue Feature betroffen. Die bestehenden Tests in
  `test/settings.test.js` und `test/integration.test.js` sind die Absicherung -
  sie muessen unveraendert gruen bleiben.

* **Dateiebene:**
  * Zu erstellen: -
  * Zu aendern: `jira-markdown-converter/src/settings.js`,
    `jira-markdown-converter/test/settings.test.js`

* **Schritt-fuer-Schritt Anweisungen:**
  1. In `src/settings.js` in `DEFAULTS` `customTemplates: []` ergaenzen
     (hinter `extraHosts`), mit Kommentar in der Tonlage der Nachbarzeilen.
  2. Konstanten direkt unter `DEFAULTS` anlegen:
     `MAX_TEMPLATES = 50`, `MAX_PLACEHOLDERS = 5`,
     `MAX_TEMPLATE_LENGTH = 5000`, `MAX_TITLE_LENGTH = 60`,
     `MAX_PLACEHOLDER_LENGTH = 40`. Kein Byte-Budget - die Vorlagen liegen in
     `chrome.storage.local`, die Grenzen sind Vernunft, nicht Speicherzwang.
     Ausserdem `LOCAL_KEYS = ['customTemplates']` mit Kommentar, warum dieser
     eine Schluessel nicht in `sync` gehoert.
  3. `PLACEHOLDER_PATTERN = /\$\{\s*([^}\r\n]{1,40}?)\s*\}/g` ergaenzen.
     Wichtig: bei jedem Einsatz `lastIndex` zuruecksetzen oder pro Aufruf ein
     frisches RegExp bauen - ein globales RegExp haelt Zustand.
  4. `function newTemplateId()` - `'tpl-' + Date.now() + '-' +
     Math.random().toString(36).slice(2, 5)`.
  5. `function normalizeTemplate(entry)` - liefert einen sauberen Eintrag oder
     `null`:
     * `id`: vorhandener String oder `newTemplateId()`.
     * `title`: getrimmt, auf `MAX_TITLE_LENGTH` gekuerzt; leer -> `null`.
     * `templateMarkup`: `String(...)`, CRLF zu LF, auf
       `MAX_TEMPLATE_LENGTH` gekuerzt; leer -> `null`.
     * `placeholders`: nur Strings, getrimmt, leere raus, auf
       `MAX_PLACEHOLDER_LENGTH` gekuerzt, Duplikate raus (case-sensitiv),
       auf `MAX_PLACEHOLDERS` gekuerzt.
  6. `function normalizeTemplates(list)` - kein Array -> `[]`; jeden Eintrag
     durch `normalizeTemplate`, `null` verwerfen, doppelte `id` verwerfen,
     auf `MAX_TEMPLATES` kuerzen.
  7. `function templateById(list, id)` - Eintrag oder `null` (Muster:
     `panelTemplate`).
  8. Den Storage aufteilen. Drei kleine Helfer, dann `load`/`save` umbauen:
     * `function splitKeys(source)` - liefert `{ sync: {...}, local: {...} }`,
       verteilt nach `LOCAL_KEYS`. Ein Schluessel landet in genau einem der
       beiden Objekte.
     * `SYNC_DEFAULTS` und `LOCAL_DEFAULTS` einmalig aus
       `splitKeys(DEFAULTS)` ableiten - `chrome.storage.*.get` bekommt nur die
       Defaults seines eigenen Bereichs.
     * `function readArea(area, defaults)` - kapselt einen `get`-Aufruf als
       Promise und faengt `chrome.runtime.lastError` ab, indem es dann die
       Defaults liefert. Ein fehlender Bereich darf die andere Haelfte nicht
       mit herunterreissen.
     Danach:
     * `load()` ruft beide `readArea`-Aufrufe ueber `Promise.all` und gibt
       `withDefaults(Object.assign({}, syncTeil, localTeil))` zurueck. Der
       bisherige Kurzschluss "kein `chrome.storage` -> Defaults" bleibt.
     * `save(settings)` normalisiert wie bisher ueber `withDefaults`, teilt
       dann per `splitKeys` auf und schreibt mit zwei `set`-Aufrufen, die
       ueber `Promise.all` zusammenlaufen. Scheitert einer, lehnt das Promise
       mit der Meldung aus `chrome.runtime.lastError` ab.
     * `onChange(callback)` prueft kuenftig `if (area !== 'sync' && area !==
       'local') return;` - sonst bemerkt das Content-Script neue Vorlagen erst
       nach einem Reload.
  9. `function escapeValue(value)` - haertet eine Benutzereingabe gegen das
     Markup: `String(value || '')`, Zeilenumbrueche und Tabs zu einem
     Leerzeichen, dann `\\`, `{`, `}`, `[`, `]`, `|` je mit `\` voranstellen
     (Reihenfolge: Backslash zuerst). Begruendung als Kommentar: `{}` starten
     Makros, `[]` Links, `|` trennt Tabellenzellen.
 10. `function fillPlaceholders(markup, values)` - ersetzt jedes `${Name}`
     durch `escapeValue(values[Name])`. Nicht belegte Namen (kein Schluessel
     oder leerer Wert) werden durch den **Namen selbst** ersetzt, damit im
     Ticket nie `${...}` stehen bleibt. Rueckgabe ist ein String.
 11. `function placeholdersInMarkup(markup)` - Liste der im Markup
     vorkommenden Namen in Reihenfolge, ohne Duplikate. Wird von der
     Optionsseite fuer den Abgleich gebraucht.
 12. In `withDefaults` nach dem `extraHosts`-Block:
     `result.customTemplates = normalizeTemplates(result.customTemplates);`
 13. Alle neuen Funktionen und Konstanten im `return`-Objekt exportieren:
     `MAX_TEMPLATES`, `MAX_PLACEHOLDERS`, `MAX_TEMPLATE_LENGTH`,
     `MAX_TITLE_LENGTH`, `MAX_PLACEHOLDER_LENGTH`, `normalizeTemplate`,
     `normalizeTemplates`, `templateById`, `escapeValue`, `fillPlaceholders`,
     `placeholdersInMarkup`. `splitKeys`, `readArea`, `SYNC_DEFAULTS` und
     `LOCAL_DEFAULTS` bleiben modulintern.
 14. In `test/settings.test.js` einen neuen Abschnitt
     `console.log('\nEigene Vorlagen');` am Ende vor der Auswertungszeile
     ergaenzen, mit mindestens diesen Faellen:
     * `DEFAULTS.customTemplates` ist ein leeres Array.
     * `withDefaults(null).customTemplates` ist `[]`.
     * `withDefaults({ customTemplates: 'kaputt' }).customTemplates` ist `[]`.
     * Eintrag ohne Titel oder ohne Markup faellt raus.
     * mehr als 5 Platzhalter werden auf 5 gekuerzt.
     * doppelte Platzhalternamen werden entfernt.
     * mehr als `MAX_TEMPLATES` Eintraege werden gekuerzt.
     * doppelte `id` wird verworfen.
     * `fillPlaceholders('h3. ${Titel}', { Titel: 'Login' })` ergibt
       `'h3. Login'`.
     * `fillPlaceholders('${A} ${A}', { A: 'x' })` ersetzt beide Vorkommen.
     * unbelegter Platzhalter faellt auf den Namen zurueck:
       `fillPlaceholders('${Datum}', {})` ergibt `'Datum'`.
     * `escapeValue('a{b}c|d[e]')` maskiert alle fuenf Zeichen.
     * `escapeValue('erste\nzweite')` enthaelt keinen Zeilenumbruch.
     * `escapeValue('C:\\tmp')` maskiert den Backslash genau einmal.
     * `placeholdersInMarkup('${A} ${B} ${A}')` ergibt `['A', 'B']`.
 15. Zweiter Testabschnitt `console.log('\nGeteilter Storage');` mit einem
     `chrome`-Stub, den der Test selbst baut (`global.chrome = { storage: {
     sync: {...}, local: {...} }, runtime: { lastError: null } }`) und danach
     wieder abraeumt. Weil `load` und `save` Promises liefern, laeuft dieser
     Abschnitt asynchron - entweder die Datei auf eine `main()`-Kette mit
     `await` umstellen oder die Faelle in einem `Promise`-Nachlauf vor der
     Auswertungszeile abarbeiten. Faelle:
     * `save()` legt `customTemplates` **nur** in `local` ab; das an `sync`
       uebergebene Objekt enthaelt den Schluessel nicht.
     * `save()` legt `convertOnPaste` **nur** in `sync` ab.
     * `load()` fuehrt beide Bereiche zusammen: Einstellung aus `sync`,
       Vorlagen aus `local`.
     * Liefert `local.get` einen `lastError`, kommen die uebrigen
       Einstellungen aus `sync` trotzdem an, `customTemplates` ist `[]`.
     * Ohne `chrome` liefert `load()` weiter die Defaults.
 16. In `test/integration.test.js` den `CHROME_STUB` um einen
     `local`-Bereich erweitern - gleiche Bauart wie `sync`, aber auf einem
     eigenen Speicher `window.__local` (Startwert `{}`). Ohne diesen Schritt
     laufen die Tests der Sub-Tasks 2 bis 5 in ein `undefined`. Die
     bestehenden Testfaelle bleiben dabei unveraendert.
 17. Pruefen: `npm run lint --prefix jira-markdown-converter` und
     `npm test --prefix jira-markdown-converter`.

* **Definition of Done:**
  * [ ] `customTemplates` steht in `DEFAULTS` und wird von `withDefaults`
        normalisiert.
  * [ ] `save()` schreibt `customTemplates` ausschliesslich nach
        `chrome.storage.local`, alle uebrigen Schluessel ausschliesslich nach
        `chrome.storage.sync`.
  * [ ] `load()` fuehrt beide Bereiche zusammen und ueberlebt einen Fehler in
        einem der beiden.
  * [ ] `onChange` feuert fuer `sync` und `local`.
  * [ ] `CHROME_STUB` in `test/integration.test.js` kennt `storage.local`;
        alle bestehenden Integrationstests bleiben unveraendert gruen.
  * [ ] Alle in Schritt 13 genannten Symbole sind exportiert.
  * [ ] `settings.js` bleibt ES5 (`var`, keine Pfeilfunktionen, kein `let`).
  * [ ] Kein DOM-Zugriff in `settings.js`.
  * [ ] Alle Testfaelle aus Schritt 14 vorhanden und gruen.
  * [ ] `npm run lint --prefix jira-markdown-converter` ohne Befund.
  * [ ] `npm test --prefix jira-markdown-converter` komplett gruen.
  * [ ] Kein neuer Eintrag in `permissions` von `manifest.json` - `storage`
        deckt beide Bereiche ab.
  * [ ] Commit `feat(jira): schema und fuelllogik fuer eigene vorlagen`
        auf `feature/issue-templates-part-1`, gepusht.

* **Agent-Start-Prompt:**

  > Du arbeitest im Repo `pascallink/webkit-ext` am Projekt
  > `jira-markdown-converter` (Chrome MV3, ES5, kein Bundler). Lies zuerst
  > `CLAUDE.md` im Root und in `jira-markdown-converter/`, danach
  > `jira-markdown-converter/docs/plans/issue-31-vorlagen.md` - dort gelten die
  > Architekturentscheidungen 1 bis 6 verbindlich.
  >
  > Lege den Branch an: `git checkout main && git pull && git checkout -b
  > feature/issue-templates-part-1`.
  >
  > Setze **ausschliesslich Sub-Task 1** aus dem Plan um: Schema
  > `customTemplates`, Normalisierung, `escapeValue` und `fillPlaceholders` in
  > `jira-markdown-converter/src/settings.js`, dazu der geteilte Storage
  > (Vorlagen nach `chrome.storage.local`, alle uebrigen Einstellungen weiter
  > nach `chrome.storage.sync`) und die im Plan aufgelisteten Tests in
  > `jira-markdown-converter/test/settings.test.js`. Ausserdem den
  > `CHROME_STUB` in `test/integration.test.js` um `storage.local` erweitern.
  > Fasse sonst keine Dateien an - keine Oberflaeche, kein `content.js`, kein
  > `manifest.json` (`storage` deckt beide Bereiche bereits ab).
  >
  > Achtung, das ist die empfindliche Stelle: `load`, `save` und `onChange`
  > versorgen Popup, Optionsseite und Content-Script mit **allen**
  > Einstellungen. `customTemplates` darf nie nach `sync` geschrieben werden,
  > und `onChange` muss kuenftig auf `sync` **und** `local` reagieren. Alle
  > bestehenden Tests muessen unveraendert gruen bleiben - wenn nicht, hast du
  > die Aufteilung falsch gebaut, nicht den Test.
  >
  > Randbedingungen: ES5 (`var`, `'use strict'`), UMD-Muster von `settings.js`
  > nicht aufbrechen, Kommentare auf Deutsch **ohne Umlaute** (`ue`, `ae`,
  > `oe`), Platzhalter-Syntax ist `${Name}`.
  >
  > Pruefe mit `npm run lint --prefix jira-markdown-converter` und
  > `npm test --prefix jira-markdown-converter`. Erst wenn beides gruen ist:
  > committe als `feat(jira): schema und fuelllogik fuer eigene vorlagen` und
  > pushe mit `git push -u origin feature/issue-templates-part-1`. Danach einen
  > PR gegen `main` anlegen, der auf Issue #31 verweist. Melde das Ergebnis,
  > danach ist die Aufgabe beendet.

---

## Sub-Task 2: CRUD-Oberflaeche in `options/`

* **Git Branch:** `feature/issue-templates-part-2`
  (Base Branch: `feature/issue-templates-part-1`)
* **Scope / Ziel:** Auf der Optionsseite Vorlagen anlegen, bearbeiten,
  loeschen. Validierung sichtbar, Speichern ueber die bestehende
  `Settings.save`-Strecke. Die Jira-Seite selbst bleibt in diesem Schritt
  unberuehrt.

* **Dateiebene:**
  * Zu erstellen: -
  * Zu aendern: `options/options.html`, `options/options.js`,
    `options/options.css`, `test/package.test.js`, `test/integration.test.js`

* **Schritt-fuer-Schritt Anweisungen:**
  1. In `options/options.html` eine neue `<section class="card">` **vor** dem
     Abschnitt "Ausprobieren" einfuegen:
     * `<h2>Eigene Vorlagen</h2>` plus `<p class="hint">` mit Erklaerung der
       `${Name}`-Syntax und dem Hinweis "hoechstens 5 Platzhalter je Vorlage".
     * `<div id="templateList" class="tpl-list"></div>` (wird per Skript
       gefuellt, niemals per `innerHTML` mit Benutzerdaten).
     * Formular mit festen IDs: `tplTitle` (`input type="text"`),
       `tplMarkup` (`textarea class="area area--mono" rows="6"`),
       `tplPlaceholders` (`input type="text"`, kommagetrennt),
       `tplSave` (Button, Beschriftung "Vorlage speichern"),
       `tplCancel` (Button, "Abbrechen") und `<p class="hint" id="tplError"
       role="alert"></p>`.
     * In den Hinweistext gehoert ein Satz zur Ablage: Vorlagen liegen im
       lokalen Speicher des Browsers und wandern **nicht** auf andere Geraete
       mit - anders als die uebrigen Einstellungen. Das ist eine bewusste
       Entscheidung (kein 8-KB-Limit), keine Panne, und der Nutzer erfaehrt
       sie an der Stelle, an der er die Vorlagen anlegt.
  2. In `options/options.js`:
     * Modulzustand `var editingId = null;` und
       `var templates = [];` ergaenzen.
     * `readForm()` um `next.customTemplates = templates;` erweitern, damit die
       Vorlagen bei jedem Speichern mitgehen und nicht von den Checkboxen
       ueberschrieben werden.
     * `writeForm()` ruft `templates = settings.customTemplates.slice();` und
       `renderTemplates();`.
     * `renderTemplates()` baut die Liste **nur** mit `document.createElement`
       und `textContent`: je Eintrag Titel, die Platzhalternamen als
       `<code>`-Chips, Buttons "Bearbeiten" und "Loeschen"
       (`data-tpl-action`, `data-tpl-id`). Leere Liste -> Hinweistext
       "Noch keine Vorlage angelegt."
     * `parsePlaceholders(value)` - an `,` trennen, trimmen, leere raus.
     * `validateTemplate(entry)` liefert eine Fehlermeldung oder `''`. Faelle:
       Titel leer, Markup leer, mehr als `Settings.MAX_PLACEHOLDERS`
       Platzhalter, doppelte Platzhalternamen, Titel oder Markup zu lang
       (`Settings.MAX_TITLE_LENGTH`, `Settings.MAX_TEMPLATE_LENGTH`),
       mehr als `Settings.MAX_TEMPLATES` Eintraege.
       Zusaetzlich als **Warnung** (nicht blockierend, in `tplError` mit
       anderer Formulierung): im Markup steht ein `${Name}`, der nicht in der
       Platzhalterliste vorkommt, oder umgekehrt - Abgleich ueber
       `Settings.placeholdersInMarkup`.
     * `tplSave` legt bei `editingId === null` einen neuen Eintrag an
       (`Settings.normalizeTemplate`), sonst ersetzt es den bestehenden unter
       Beibehaltung der `id`. Danach `save()`, `resetTemplateForm()`,
       `renderTemplates()`.
     * "Bearbeiten" fuellt das Formular und setzt `editingId`; "Loeschen"
       entfernt den Eintrag nach `window.confirm` und speichert.
     * Ein einziger Listener auf `templateList` (Delegation ueber
       `data-tpl-action`), keine Listener pro Zeile.
  3. In `options/options.css` die Klassen `.tpl-list`, `.tpl-item`,
     `.tpl-item__title`, `.tpl-item__tags`, `.tpl-item__actions` ergaenzen -
     Optik an den bestehenden Karten orientieren, keine neuen Farbwerte
     erfinden.
  4. In `test/package.test.js` einen Test
     `'Optionsseite bietet eigene Vorlagen an'` ergaenzen: `options.html`
     enthaelt `id="templateList"`, `id="tplMarkup"` und `id="tplSave"`.
     Zweiter Test: `options/options.js` enthaelt kein `.innerHTML =`.
     Dritter Test: `src/settings.js` fuehrt `customTemplates` in `LOCAL_KEYS` -
     eine billige Absicherung gegen ein spaeteres Zurueckrutschen in den
     8-KB-Bereich von `storage.sync`.
  5. In `test/integration.test.js` einen Abschnitt fuer die Optionsseite
     ergaenzen. Muster: eigene Hilfsfunktion `optionsPage(browser, settings)`,
     die `page.addInitScript({ content: CHROME_STUB })` **vor**
     `page.goto('file://' + path.join(root, 'options', 'options.html'))`
     setzt - die Seite laedt `settings.js` selbst per `<script>`, der Stub muss
     vorher stehen. Der Stub kennt seit Sub-Task 1 auch `storage.local`.
     Testfaelle:
     * Anlegen einer Vorlage erzeugt eine Zeile in `#templateList`.
     * Sechs Platzhalter erzeugen eine Fehlermeldung in `#tplError` und legen
       nichts an.
     * Bearbeiten aendert den Titel, ohne die `id` zu wechseln.
     * Loeschen entfernt die Zeile (`window.confirm` im Test stubben).
     * Eine angelegte Vorlage landet in `window.__local`, **nicht** in
       `window.__settings` (dem `sync`-Speicher des Stubs).
  6. Pruefen: `npm run lint --prefix jira-markdown-converter`,
     `npm test --prefix jira-markdown-converter`. Fehlt der Browser:
     `npx --prefix jira-markdown-converter playwright install chromium`.

* **Definition of Done:**
  * [ ] Vorlagen lassen sich anlegen, bearbeiten und loeschen; ein Reload der
        Optionsseite zeigt sie wieder.
  * [ ] Mehr als 5 Platzhalter werden mit sichtbarer Meldung abgelehnt.
  * [ ] Die Seite sagt, dass Vorlagen lokal bleiben und nicht mitwandern.
  * [ ] Vorlagen landen in `storage.local`, die uebrigen Einstellungen in
        `storage.sync` - per Integrationstest belegt.
  * [ ] Kein `innerHTML` in `options/options.js`.
  * [ ] Bestehende Einstellungen (Checkboxen, Hosts) speichern unveraendert
        weiter - `customTemplates` gehen beim Umschalten einer Checkbox nicht
        verloren.
  * [ ] Neue Tests in `package.test.js` und `integration.test.js` gruen.
  * [ ] `npm run lint` und `npm test` gruen.
  * [ ] Commit `feat(jira): vorlagen in den einstellungen verwalten`, gepusht.

* **Agent-Start-Prompt:**

  > Du arbeitest im Repo `pascallink/webkit-ext` am Projekt
  > `jira-markdown-converter`. Lies `CLAUDE.md` (Root und Projekt) und
  > `jira-markdown-converter/docs/plans/issue-31-vorlagen.md`. Sub-Task 1 ist
  > bereits gemergt oder liegt im Base-Branch: `src/settings.js` exportiert
  > `normalizeTemplate`, `normalizeTemplates`, `templateById`,
  > `placeholdersInMarkup`, `MAX_TEMPLATES`, `MAX_PLACEHOLDERS`,
  > `MAX_TITLE_LENGTH`, `MAX_TEMPLATE_LENGTH`. Sieh dir diese Signaturen an,
  > bevor du beginnst. `Settings.save()` legt `customTemplates` selbsttaetig in
  > `chrome.storage.local` ab - die Optionsseite ruft weiterhin nur
  > `Settings.save(...)` und kennt die Aufteilung nicht.
  >
  > Branch: `git fetch origin && git checkout -b feature/issue-templates-part-2
  > origin/feature/issue-templates-part-1`.
  >
  > Setze **ausschliesslich Sub-Task 2** um: CRUD-Oberflaeche fuer eigene
  > Vorlagen in `options/options.html`, `options/options.js`,
  > `options/options.css`, dazu die im Plan gelisteten Tests in
  > `test/package.test.js` und `test/integration.test.js`. Fasse `src/` nicht
  > an.
  >
  > Harte Regeln: ES5, kein `innerHTML` mit Benutzerdaten (nur
  > `createElement` + `textContent`), deutsche UI-Texte **ohne Umlaute**,
  > Optik aus `options.css` uebernehmen statt neue Farben zu erfinden.
  > `readForm()` muss `customTemplates` mitfuehren, sonst loeschen die
  > Checkboxen die Vorlagen. In den Hinweistext gehoert, dass Vorlagen nur auf
  > diesem Geraet liegen.
  >
  > Pruefe mit `npm run lint --prefix jira-markdown-converter` und
  > `npm test --prefix jira-markdown-converter` (bei fehlendem Browser vorher
  > `npx --prefix jira-markdown-converter playwright install chromium`).
  > Danach committen als `feat(jira): vorlagen in den einstellungen verwalten`,
  > `git push -u origin feature/issue-templates-part-2`, PR **gegen
  > `feature/issue-templates-part-1`** anlegen und Ergebnis melden.

---

## Sub-Task 3: Dropdown "Vorlagen" in der Feldleiste

* **Git Branch:** `feature/issue-templates-part-3`
  (Base Branch: `feature/issue-templates-part-2`)
* **Scope / Ziel:** Zweiter Menue-Button in der Leiste am Feld. Vorlagen ohne
  Platzhalter werden vollstaendig eingefuegt; Vorlagen mit Platzhaltern setzen
  vorerst die Platzhalternamen als Werte ein und markieren den ersten - der
  Dialog kommt in Sub-Task 4. Damit ist auch diese Stufe voll benutzbar.

* **Dateiebene:**
  * Zu erstellen: -
  * Zu aendern: `src/content.js`, `src/content.css`, `test/package.test.js`,
    `test/integration.test.js`

* **Schritt-fuer-Schritt Anweisungen:**
  1. In `src/content.js` das vorhandene Panel-Menue verallgemeinern, **ohne**
     sein Verhalten zu aendern:
     * `openTemplateMenu(anchorButton, field)` zu
       `openMenu(anchorButton, options)` umbauen, mit
       `options = { label, items, onPick }`. `items` ist eine Liste von
       `{ id, label, hint, borderColor, bgColor }`; Farbtupfer nur rendern,
       wenn `borderColor` gesetzt ist.
     * `toggleTemplateMenu` entsprechend zu `toggleMenu(anchorButton, options)`.
     * `templateMenuItem` wird `menuItem(entry, onPick)`.
     * `closeTemplateMenu`, `placeTemplateMenu` und `followTemplateAnchor`
       bleiben inhaltlich unveraendert (nur ggf. Umbenennung auf `closeMenu`,
       `placeMenu`, `followMenuAnchor`; alle Aufrufstellen mitziehen, auch
       `closePanel`).
     * Der bestehende Panel-Button ruft danach
       `toggleMenu(button, { label: 'Panel-Vorlagen', items:
       Settings.PANEL_TEMPLATES, onPick: function (entry) {
       insertTemplate(field, Settings.panelTemplate(entry.id)); } })`.
  2. Neue Funktion `customTemplateItems()` - mappt
     `settings.customTemplates` auf `{ id, label: title, hint:
     'Vorlage einfuegen' + (Platzhalter ? ' (' + n + ' Platzhalter)' : '') }`.
  3. Neue Funktion `insertCustomTemplate(field, template, values)`:
     * ohne Feld: `toast('Kein Jira-Eingabefeld gefunden.', true)`.
     * `target = field;`
     * `var markup = Settings.fillPlaceholders(template.templateMarkup, values
       || {});`
     * `Editors.insertFormatted(field, markup, null, 'block')`; bei `false`
       `toast('Einfuegen nicht moeglich.', true)`.
     * bei Erfolg: hat die Vorlage Platzhalter, den ersten eingesetzten Wert
       ueber das vorhandene `focusPanelBody(field, wert)` markieren.
     * `toast('Vorlage "' + template.title + '" eingefuegt.')`.
  4. In `addButtonBar(field)` einen Button ergaenzen - **hinter** dem
     Panel-Button, **vor** dem Editor-Button:
     * `textContent = 'Vorlagen'`,
       `title = 'Eigene Vorlage an der Cursorposition einfuegen'`,
       `aria-haspopup="true"`, `aria-expanded="false"`,
       `className = 'jmd-fieldbar__btn'`.
     * Klick: `target = field;` dann
       `toggleMenu(button, { label: 'Eigene Vorlagen', items:
       customTemplateItems(), onPick: ... })`.
     * Ist `settings.customTemplates` leer: Button **trotzdem** rendern, aber
       `disabled` setzen und `title` auf "Noch keine Vorlage angelegt - in den
       Einstellungen anlegen". Kein Menue mit leerem Inhalt oeffnen.
  5. Der `onPick`-Handler ruft in diesem Schritt
     `insertCustomTemplate(field, tpl, defaultValues(tpl))`, wobei
     `defaultValues` jeden Platzhalternamen auf sich selbst abbildet. Diese
     Funktion wird in Sub-Task 4 durch den Dialog ersetzt.
  6. Der Button muss auf Aenderungen reagieren: in der bestehenden
     `Settings.onChange`-Strecke die Leisten aktualisieren (analog
     `updateFieldbarToggles`) - Zustand `disabled` und Menueinhalt kommen aus
     den frisch geladenen `settings`.
  7. In `src/content.css` eine Variante `.jmd-panelmenu__item--plain`
     ergaenzen (kein Farbtupfer, Text linksbuendig), damit die Eintraege ohne
     `borderColor` sauber sitzen.
  8. `test/package.test.js`: Test ergaenzen, dass `src/content.js`
     `customTemplateItems` und `insertCustomTemplate` enthaelt und dass die
     bestehende `innerHTML`-Regel weiter greift.
  9. `test/integration.test.js`: Testfaelle
     * ohne Vorlagen ist der Button `disabled`;
     * mit zwei Vorlagen im Stub-Storage oeffnet der Klick ein Menue mit zwei
       Eintraegen;
     * Klick auf eine Vorlage ohne Platzhalter schreibt das Markup in die
       Textarea;
     * Klick auf eine Vorlage mit Platzhaltern schreibt Markup ohne `${`;
     * Escape schliesst das Menue, ein zweiter Klick auf den Button ebenfalls.
     Der `CHROME_STUB` in der Datei liefert die Settings aus
     `window.__settings` - `customTemplates` dort mitgeben.
 10. Pruefen: `npm run lint --prefix jira-markdown-converter`,
     `npm test --prefix jira-markdown-converter`.

* **Definition of Done:**
  * [ ] Panel-Menue verhaelt sich exakt wie vorher (bestehende Integrationstests
        unveraendert gruen).
  * [ ] Neuer Button "Vorlagen" in jeder Feldleiste, `disabled` ohne Vorlagen.
  * [ ] Vorlage ohne Platzhalter landet vollstaendig im Feld.
  * [ ] Nach dem Einfuegen steht kein `${` mehr im Feld.
  * [ ] Menue schliesst bei Escape, Klick daneben und zweitem Klick.
  * [ ] Neue Integrationstests gruen, Lint sauber.
  * [ ] Commit `feat(jira): vorlagenmenue in der feldleiste`, gepusht.

* **Agent-Start-Prompt:**

  > Du arbeitest im Repo `pascallink/webkit-ext` am Projekt
  > `jira-markdown-converter`. Lies `CLAUDE.md` (Root und Projekt) und
  > `jira-markdown-converter/docs/plans/issue-31-vorlagen.md`.
  >
  > Branch: `git fetch origin && git checkout -b feature/issue-templates-part-3
  > origin/feature/issue-templates-part-2`.
  >
  > Setze **ausschliesslich Sub-Task 3** um: In `src/content.js` das vorhandene
  > Panel-Menue zu einem generischen `openMenu(anchorButton, { label, items,
  > onPick })` verallgemeinern und einen zweiten Leisten-Button "Vorlagen"
  > ergaenzen, der die Eintraege aus `settings.customTemplates` anbietet. Dazu
  > eine CSS-Variante ohne Farbtupfer in `src/content.css` und die im Plan
  > gelisteten Tests.
  >
  > Wichtig: Das Verhalten des Panel-Menues darf sich **nicht** aendern - die
  > bestehenden Integrationstests muessen unveraendert gruen bleiben. Der
  > Platzhalter-Dialog kommt erst in Sub-Task 4; hier werden Platzhalter
  > vorlaeufig durch ihren eigenen Namen ersetzt (`Settings.fillPlaceholders`
  > macht das bereits, wenn kein Wert uebergeben wird). Fasse `options/` und
  > `manifest.json` nicht an.
  >
  > ES5, deutsche Texte ohne Umlaute, kein `innerHTML` mit Benutzerdaten.
  >
  > Pruefe mit `npm run lint --prefix jira-markdown-converter` und
  > `npm test --prefix jira-markdown-converter`. Danach committen als
  > `feat(jira): vorlagenmenue in der feldleiste`,
  > `git push -u origin feature/issue-templates-part-3`, PR gegen
  > `feature/issue-templates-part-2` anlegen und Ergebnis melden.

---

## Sub-Task 4: Modal-Dialog fuer die Platzhalterwerte

* **Git Branch:** `feature/issue-templates-part-4`
  (Base Branch: `feature/issue-templates-part-3`)
* **Scope / Ziel:** Eigenes UMD-Modul `src/templatedialog.js` nach dem Vorbild
  von `codedialog.js`: bis zu 5 Eingabefelder, Werte zurueck an den Aufrufer.
  Das Modul kennt weder Jira-Felder noch Einstellungen.

* **Dateiebene:**
  * Zu erstellen: `src/templatedialog.js`
  * Zu aendern: `src/codedialog.css`, `src/content.js`, `manifest.json`,
    `src/background.js`, `test/package.test.js`, `test/integration.test.js`

* **Schritt-fuer-Schritt Anweisungen:**
  1. `src/templatedialog.js` anlegen - UMD-Kopf exakt wie in
     `src/codedialog.js`, Global `JiraTemplateDialog`.
     * Modulzustand: `var dialog = null; var handlers = null; var opener =
       null;`
     * `DIALOG_HTML` als feste Zeichenkettenvorlage (nur Geruest, **keine**
       Benutzerdaten): `.jmd-dialog__box` mit `role="dialog"`
       `aria-modal="true"`, Titelzeile "Vorlage einfuegen", Schliessen-Button
       `data-tpl-action="close"`, leerer Container
       `<div data-role="tpl-fields"></div>`, Buttonzeile mit
       `data-tpl-action="insert"` ("Einfuegen") und `data-tpl-action="close"`
       ("Abbrechen"), Hinweiszeile "Strg+Enter fuegt ein, Escape schliesst den
       Dialog."
     * `open(options)` mit
       `options = { title, placeholders, target, onInsert, onClose }`:
       Container leeren, je Platzhalter (max. 5) per `createElement` ein
       `<label>` mit `textContent = name` und ein `<input type="text">` mit
       `dataset.name = name` erzeugen. Erstes Feld fokussieren.
     * `values()` liest die Felder in ein Objekt `{ name: wert }`.
     * `data-tpl-action="insert"` ruft `handlers.onInsert(values())`; liefert
       das `false` (oder ein Promise darauf), bleibt der Dialog offen.
     * Tastatur: `Escape` schliesst, `Strg+Enter` fuegt ein, `Enter` im
       letzten Feld fuegt ein, `Tab` bleibt im Dialog (Fokusfalle ueber erstes
       und letztes fokussierbares Element).
     * `close()` gibt den Fokus an `opener` zurueck - das ist die
       Voraussetzung dafuer, dass die Cursorposition im Jira-Feld haelt.
     * Export: `{ open, close, isOpen }`.
  2. `src/codedialog.css` um die wenigen neuen Klassen ergaenzen
     (`.jmd-dialog__fields`, `.jmd-dialog__field`) - die Basisklassen
     `.jmd-dialog`, `.jmd-dialog__box`, `.jmd-btn` werden wiederverwendet,
     **keine** neue CSS-Datei.
  3. `manifest.json`: `src/templatedialog.js` in `content_scripts[0].js`
     **nach** `src/codedialog.js` und **vor** `src/editlock.js` eintragen.
  4. `src/background.js`: die `importScripts`-Liste bzw. die Dateiliste fuer
     `chrome.scripting` um denselben Pfad an derselben Position erweitern -
     `test/package.test.js` prueft die Uebereinstimmung mit dem Manifest.
  5. `src/content.js`: `var TemplateDialog = window.JiraTemplateDialog;` neben
     den anderen Modulreferenzen aufnehmen. Der `onPick`-Handler aus
     Sub-Task 3 wird ersetzt:
     * ohne Platzhalter: direkt `insertCustomTemplate(field, tpl, {})`.
     * mit Platzhaltern: `TemplateDialog.open({ title: tpl.title,
       placeholders: tpl.placeholders, target: Editors.describe(field),
       onInsert: function (values) { insertCustomTemplate(field, tpl, values);
       return true; } })`.
     * `closeMenu()` vor dem Oeffnen des Dialogs aufrufen.
     * Das Feld vor dem Oeffnen ueber `Editors.rememberCaret(field)` merken.
  6. `test/package.test.js`: Ladereihenfolge-Test um `templatedialog.js`
     erweitern; die `innerHTML`-Regel um
     `'src/templatedialog.js': /DIALOG_HTML/` ergaenzen; Test, dass Manifest
     und `background.js` weiterhin dieselbe Dateiliste fuehren.
  7. `test/integration.test.js`: `SOURCES` um `src/templatedialog.js` an der
     richtigen Position erweitern. Testfaelle:
     * Vorlage mit zwei Platzhaltern oeffnet den Dialog mit genau zwei
       Eingabefeldern und den richtigen Beschriftungen;
     * Vorlage mit fuenf Platzhaltern zeigt fuenf Felder;
     * Vorlage ohne Platzhalter oeffnet **keinen** Dialog und fuegt sofort ein;
     * Eingabe + "Einfuegen" schreibt die Werte ins Feld;
     * Escape schliesst ohne Einfuegen;
     * Strg+Enter fuegt ein.
  8. Pruefen: `npm run lint --prefix jira-markdown-converter`,
     `npm test --prefix jira-markdown-converter`.

* **Definition of Done:**
  * [ ] `src/templatedialog.js` folgt dem UMD-Muster und exportiert
        `JiraTemplateDialog`.
  * [ ] Dialog rendert hoechstens 5 Felder, nur ueber `createElement`.
  * [ ] Ladereihenfolge in `manifest.json` und `background.js` identisch,
        Test dazu gruen.
  * [ ] Escape, Strg+Enter und Fokusfalle funktionieren.
  * [ ] Vorlagen ohne Platzhalter oeffnen keinen Dialog.
  * [ ] Lint und alle Tests gruen.
  * [ ] Commit `feat(jira): dialog fuer platzhalterwerte`, gepusht.

* **Agent-Start-Prompt:**

  > Du arbeitest im Repo `pascallink/webkit-ext` am Projekt
  > `jira-markdown-converter`. Lies `CLAUDE.md` (Root und Projekt) und
  > `jira-markdown-converter/docs/plans/issue-31-vorlagen.md`. Nimm dir
  > `src/codedialog.js` als Vorbild - Aufbau, UMD-Kopf, `DIALOG_HTML`,
  > Fokusrueckgabe an `opener` - und weiche davon nicht ab.
  >
  > Branch: `git fetch origin && git checkout -b feature/issue-templates-part-4
  > origin/feature/issue-templates-part-3`.
  >
  > Setze **ausschliesslich Sub-Task 4** um: neues Modul
  > `src/templatedialog.js` (`JiraTemplateDialog`) fuer bis zu 5
  > Platzhalter-Eingaben, Eintrag in `manifest.json` **und** `src/background.js`
  > an derselben Position (nach `codedialog.js`, vor `editlock.js`), Anbindung
  > in `src/content.js`, kleine Ergaenzung in `src/codedialog.css` (keine neue
  > CSS-Datei), plus die im Plan gelisteten Tests. `options/` und
  > `src/settings.js` bleiben unberuehrt.
  >
  > Das Modul darf weder Jira-Felder noch Einstellungen kennen: es sammelt
  > Werte und reicht sie ueber `onInsert(values)` an den Aufrufer. Kein
  > `innerHTML` mit Benutzerdaten - Felder ausschliesslich per
  > `createElement`/`textContent`. ES5, deutsche Texte ohne Umlaute.
  >
  > Vergiss `SOURCES` in `test/integration.test.js` nicht, sonst laedt der
  > Test das neue Modul nicht.
  >
  > Pruefe mit `npm run lint --prefix jira-markdown-converter` und
  > `npm test --prefix jira-markdown-converter`. Danach committen als
  > `feat(jira): dialog fuer platzhalterwerte`,
  > `git push -u origin feature/issue-templates-part-4`, PR gegen
  > `feature/issue-templates-part-3` anlegen und Ergebnis melden.

---

## Sub-Task 5: Cursorposition, Rich-Text-Pfad und Escaping haerten

* **Git Branch:** `feature/issue-templates-part-5`
  (Base Branch: `feature/issue-templates-part-4`)
* **Scope / Ziel:** Der Weg vom Menue ueber den Dialog zurueck ins Feld
  verliert die Cursorposition nicht, der Rich-Text-Editor wird bedient, und
  Benutzereingaben koennen das Markup nicht zerlegen. Nur Haertung - keine
  neuen Oberflaechenelemente.

* **Dateiebene:**
  * Zu erstellen: -
  * Zu aendern: `src/content.js`, ggf. `src/settings.js` (nur `escapeValue`),
    `test/settings.test.js`, `test/integration.test.js`

* **Schritt-fuer-Schritt Anweisungen:**
  1. Cursorposition: In `insertCustomTemplate` vor dem Schreiben
     `Editors.restoreCaret(field)` sicherstellen. Der Weg ist: Klick auf den
     Leisten-Button -> `Editors.rememberCaret(field)`; Dialog nimmt den Fokus;
     `close()` gibt ihn an `opener` zurueck; erst danach wird geschrieben.
     Pruefen, dass zwischen Menue und Dialog kein `forgetCaret` laeuft.
  2. Rich-Text-Zweig analog zu `insertTemplate` ergaenzen:
     ```js
     var switching = !isPlainField(field) && settings.switchToMarkup &&
       Editors.isRichTextActive(field)
       ? Editors.switchToMarkup(field)
       : Promise.resolve(false);
     ```
     Danach einfuegen. Ist das Feld ein Rich-Text-Editor **und** wurde nicht
     umgeschaltet: einfuegen und `toast('Vorlage als Markup eingefuegt - der
     Editor zeigt es unformatiert.', false)`.
  3. Einfuegemodus: `'block'` nur, wenn das Markup mit einem Blockmakro oder
     einer Ueberschrift beginnt (`/^\s*(\{|h[1-6]\.|\|)/`), sonst `'insert'` -
     eine einzeilige Vorlage soll nicht ungefragt eine Leerzeile erzeugen.
     Kleine Hilfsfunktion `insertModeFor(markup)` in `content.js`, mit
     Kommentar.
  4. Escaping nachschaerfen (in `src/settings.js`, `escapeValue`):
     * fuehrende Zeichen, die Jira am Zeilenanfang als Liste oder Ueberschrift
       liest, sind unkritisch, weil Werte einzeilig eingesetzt werden - als
       Kommentar festhalten, nicht ueberimplementieren;
     * ergaenzend `!` maskieren (Jira liest `!bild.png!` als Bild), wenn der
       Wert mehr als ein `!` enthaelt.
  5. Auswahl ersetzen: Steht im Zielfeld eine Auswahl, ersetzt das Einfuegen
     sie - das leistet `insertIntoTextarea` bereits; per Test absichern, nicht
     nachbauen.
  6. Fehlerfaelle mit Toast, nicht still: kein Feld, `insertFormatted` liefert
     `false`, Vorlage inzwischen geloescht (`Settings.templateById` gibt
     `null`).
  7. Tests in `test/settings.test.js`: Faelle fuer `!`-Maskierung und fuer
     Werte, die selbst wie ein Platzhalter aussehen
     (`fillPlaceholders('${A}', { A: '${B}' })` darf **nicht** rekursiv weiter
     ersetzen - einmalige Ersetzung in einem Durchlauf).
  8. Tests in `test/integration.test.js`:
     * Einfuegen an der gesetzten Cursorposition erhaelt Text davor und danach
       (Muster: bestehender Test "Panel fuegt an der zuletzt gesetzten
       Cursorposition ein");
     * markierter Text wird durch die Vorlage ersetzt;
     * einzeilige Vorlage erzeugt keine zusaetzliche Leerzeile;
     * Rich-Text-Fixture (`mock-jira-rte.html`) mit `switchToMarkup: true`
       schaltet um und fuegt Markup ein;
     * Rich-Text-Fixture ohne `switchToMarkup` fuegt Markup als Text ein und
       stuerzt nicht ab;
     * Wert mit `{`, `|` und `[` landet maskiert im Feld.
  9. Pruefen: `npm run lint --prefix jira-markdown-converter`,
     `npm test --prefix jira-markdown-converter`.

* **Definition of Done:**
  * [ ] Vorlage landet an der Cursorposition, nicht am Feldende - auch nach
        dem Dialog.
  * [ ] Markierter Text wird ersetzt.
  * [ ] Einzeilige Vorlagen erzeugen keine Leerzeilen.
  * [ ] Rich-Text-Editor: beide Zweige (mit und ohne `switchToMarkup`) laufen
        fehlerfrei.
  * [ ] Werte mit `{ } [ ] | \` beschaedigen das Markup nicht; Werte, die wie
        Platzhalter aussehen, werden nicht erneut ersetzt.
  * [ ] Alle Fehlerfaelle melden sich per Toast.
  * [ ] Lint und alle Tests gruen.
  * [ ] Commit `fix(jira): vorlagen an der cursorposition und mit sicherem
        escaping einfuegen`, gepusht.

* **Agent-Start-Prompt:**

  > Du arbeitest im Repo `pascallink/webkit-ext` am Projekt
  > `jira-markdown-converter`. Lies `CLAUDE.md` (Root und Projekt) und
  > `jira-markdown-converter/docs/plans/issue-31-vorlagen.md`. Sieh dir in
  > `src/content.js` die bestehende Funktion `insertTemplate` an - sie zeigt
  > den Umgang mit `switchToMarkup` und `focusPanelBody`; in `src/editors.js`
  > `rememberCaret`, `restoreCaret` und `insertIntoTextarea`.
  >
  > Branch: `git fetch origin && git checkout -b feature/issue-templates-part-5
  > origin/feature/issue-templates-part-4`.
  >
  > Setze **ausschliesslich Sub-Task 5** um: Haertung der Einfuegestrecke fuer
  > eigene Vorlagen - Cursorposition ueber den Dialog hinweg halten,
  > Rich-Text-Zweig bedienen, Einfuegemodus `block` vs. `insert` abhaengig vom
  > Markup, Escaping in `Settings.escapeValue` nachschaerfen, Fehlerfaelle mit
  > Toast. Keine neuen Oberflaechenelemente, keine neuen Dateien, `options/`
  > und `manifest.json` bleiben unberuehrt.
  >
  > Ergaenze die im Plan gelisteten Faelle in `test/settings.test.js` und
  > `test/integration.test.js`. ES5, deutsche Texte ohne Umlaute.
  >
  > Pruefe mit `npm run lint --prefix jira-markdown-converter` und
  > `npm test --prefix jira-markdown-converter`. Danach committen als
  > `fix(jira): vorlagen an der cursorposition und mit sicherem escaping
  > einfuegen`, `git push -u origin feature/issue-templates-part-5`, PR gegen
  > `feature/issue-templates-part-4` anlegen und Ergebnis melden.

---

## Sub-Task 6: Dokumentation, Changelog und Store-Unterlagen

* **Git Branch:** `feature/issue-templates-part-6`
  (Base Branch: `feature/issue-templates-part-5`)
* **Scope / Ziel:** Das Feature nach aussen beschreiben. Kein Produktivcode.

* **Dateiebene:**
  * Zu erstellen: -
  * Zu aendern: `jira-markdown-converter/README.md`,
    `jira-markdown-converter/CHANGELOG.md`,
    `jira-markdown-converter/CLAUDE.md`,
    `jira-markdown-converter/docs/store/listing-de.md`,
    `jira-markdown-converter/docs/store/listing-en.md`,
    ggf. `README.md` im Root

* **Schritt-fuer-Schritt Anweisungen:**
  1. `README.md` (Projekt): Abschnitt "Eigene Vorlagen" - was das Feature
     kann, wie `${Name}` funktioniert, dass hoechstens 5 Platzhalter je
     Vorlage erlaubt sind, und zwei Einschraenkungen im Klartext:
     * Vorlagen liegen im lokalen Speicher des Browsers und wandern **nicht**
       auf andere Geraete mit - im Gegensatz zu den uebrigen Einstellungen.
       Grund in einem Halbsatz: der Sync-Speicher fasst nur 8 KB je Eintrag.
     * Im Rich-Text-Editor kommt das Markup unformatiert an, solange nicht auf
       den Markup-Modus umgeschaltet wird.
     Keine neuen Bildverweise - `test/package.test.js` prueft, dass jedes
     referenzierte Bild existiert.
  2. `CHANGELOG.md`: Eintrag unter der naechsten Minor-Version
     (`## 1.3.0`), Stil der vorhandenen Eintraege uebernehmen. Versionsnummern
     in `package.json` und `manifest.json` **nicht** von Hand anfassen - das
     macht die CI (siehe `.github/CI.md`).
  3. `CLAUDE.md` (Projekt): in der Strukturtabelle `src/templatedialog.js`
     ergaenzen und die UMD-Liste um `JiraTemplateDialog` erweitern. Die Datei
     bleibt unter 40 Zeilen - dafuer an anderer Stelle kuerzen, nicht
     anhaengen.
  4. `docs/store/listing-de.md` und `listing-en.md`: Feature in die
     Funktionsliste aufnehmen, Tonlage der vorhandenen Texte halten.
  5. `docs/store/permissions.md` pruefen: es kommen **keine** neuen
     Berechtigungen dazu, `storage` deckt `sync` und `local` gemeinsam ab.
     Steht dort, wofuer `storage` gebraucht wird, den lokalen Vorlagenspeicher
     ergaenzen - das ist die Art Angabe, nach der eine Store-Pruefung fragt.
  6. Pruefen: `npm run lint --prefix jira-markdown-converter`,
     `npm test --prefix jira-markdown-converter`.

* **Definition of Done:**
  * [ ] README beschreibt Vorlagen, `${Name}`-Syntax, 5er-Grenze, die
        Rich-Text-Einschraenkung und die geraetelokale Ablage.
  * [ ] `docs/store/permissions.md` nennt den lokalen Vorlagenspeicher, ohne
        neue Berechtigungen zu behaupten.
  * [ ] CHANGELOG-Eintrag unter `## 1.3.0` vorhanden.
  * [ ] `CLAUDE.md` nennt `templatedialog.js` und bleibt unter 40 Zeilen.
  * [ ] Store-Listings in beiden Sprachen aktualisiert.
  * [ ] Keine Versionsnummer von Hand geaendert.
  * [ ] Lint und alle Tests gruen.
  * [ ] Commit `docs(jira): eigene vorlagen dokumentieren`, gepusht.

* **Agent-Start-Prompt:**

  > Du arbeitest im Repo `pascallink/webkit-ext` am Projekt
  > `jira-markdown-converter`. Lies `CLAUDE.md` (Root und Projekt),
  > `.github/CI.md` und
  > `jira-markdown-converter/docs/plans/issue-31-vorlagen.md`.
  >
  > Branch: `git fetch origin && git checkout -b feature/issue-templates-part-6
  > origin/feature/issue-templates-part-5`.
  >
  > Setze **ausschliesslich Sub-Task 6** um: Dokumentation des Features
  > "Eigene Vorlagen" in `README.md`, `CHANGELOG.md` (unter `## 1.3.0`),
  > `CLAUDE.md` (Strukturtabelle und UMD-Liste, Datei bleibt unter 40 Zeilen)
  > sowie `docs/store/listing-de.md`, `listing-en.md` und
  > `docs/store/permissions.md`. Zwei Punkte muessen im README stehen: Vorlagen
  > liegen nur auf diesem Geraet (`chrome.storage.local`), und im
  > Rich-Text-Editor kommt Markup ohne Umschalten unformatiert an. Kein
  > Produktivcode,
  > keine neuen Bildverweise, **keine** Versionsnummern von Hand aendern - das
  > erledigt die CI.
  >
  > Deutsch ohne Umlaute, Tonlage der vorhandenen Texte halten.
  >
  > Pruefe mit `npm run lint --prefix jira-markdown-converter` und
  > `npm test --prefix jira-markdown-converter`. Danach committen als
  > `docs(jira): eigene vorlagen dokumentieren`,
  > `git push -u origin feature/issue-templates-part-6`, PR gegen
  > `feature/issue-templates-part-5` anlegen und Ergebnis melden.

---

## Merge-Reihenfolge und Risiken

* Gemergt wird von unten nach oben: part-1 nach `main`, dann Basis von part-2
  auf `main` umstellen, mergen, und so weiter. Wer die Kette umdreht, holt
  sich fremde Diffs in den PR.
* Nach jedem Merge auf `main` hebt `version-bump.yml` die Patch-Stelle an.
  Die Minor-Version `1.3.0` wird erst nach part-6 von Hand gesetzt und
  getaggt - erst das erzeugt ZIPs (siehe `.github/CI.md`).
* Der geteilte Storage aus Sub-Task 1 ist die riskanteste Aenderung des
  ganzen Plans: `load`, `save` und `onChange` versorgen jede Oberflaeche der
  Erweiterung. Ein Fehler dort trifft nicht das neue Feature, sondern alle
  Einstellungen. Absicherung sind die bestehenden Tests - bleiben sie
  unveraendert gruen, stimmt die Aufteilung.
* Vorlagen wandern nicht zwischen Geraeten. Das ist der bezahlte Preis fuer
  den Wegfall des 8-KB-Limits und muss an drei Stellen sichtbar sein:
  Optionsseite, README und Store-Listing. Falls das spaeter stoert, ist der
  naechste Schritt Export/Import als JSON-Datei - nicht der Ruecksprung nach
  `sync`.
* `chrome.storage.local` wird beim Deinstallieren der Erweiterung geleert und
  liegt ausserhalb des Browser-Profil-Sync. Ein Nutzer, der seine Vorlagen
  aufbewahren will, braucht den Export - siehe oben.
* Zweites Risiko: Jira 9.12 baut das DOM staendig um. Die Leiste haengt an
  `addButtonBar`; der neue Button erbt dieses Verhalten und braucht keine
  eigene Beobachtung.
