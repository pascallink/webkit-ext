# Qualitaet der Erweiterung: Vorschlaege - Stand 2026-09-11

Ausgangslage: 390 Tests gruen, trotzdem 18 Befunde in einer Session
(`docs/issues/`). Der Grund ist weniger fehlende Testmenge als fehlende
Testtiefe an drei Stellen: der Konverter wird nur mit Positivbeispielen
gefuettert, die Browser-Tests laufen nicht als Erweiterung, und die Fixtures
sind Nachbauten aus dem Gedaechtnis statt aus der Instanz. Die Vorschlaege
setzen genau dort an und sind so gedacht, dass eine Claude-Code-Session
(Cloud oder iOS, also ohne Zugriff auf `jira.inxire.com`) sie eigenstaendig
umsetzen und pruefen kann.

## 1. Nachbau der Vorgangsansicht aus der echten Instanz (Mockup)

**Problem:** Die fuenf Fixtures modellieren je ein Teilverhalten. Wie
Kommentarformular, Bearbeiten-Dialog und Inline-Beschreibung in 9.12.2
wirklich verschachtelt sind, weiss kein Test - Issue 02 und 03 haben sich
genau dort versteckt.

**Vorschlag:** Ein Fixture `mock-jira-912-issue-view.html`, das die ganze
Vorgangsansicht traegt und **aus dem DOM-Auszug der Instanz** gebaut ist.
Das liegt jetzt vor: `docs/mockup/mock-jira-912-issue-view.html` wurde am
2026-09-11 aus dem Geruest von DBREFI-10549 gebaut und reproduziert alle
in der Instanz gefundenen Einfrier- und Rich-Text-Befunde (Tabelle in
`docs/mockup/README.md`). Naechster Schritt ist der Umzug nach
`test/fixtures/` und die Umstellung der Module `editlock`, `editors`,
`content`, `otrs` auf dieses eine Fixture. Was die echte Instanz gelehrt
hat und ein Nachbau aus dem Gedaechtnis nicht wusste:

- Der Editor-Modus (Visuell/Text) ist eine Nutzereinstellung fuer alle
  Felder; Tests muessen beide Modi fahren, und ein Umschalten im Test
  veraendert den Zustand fuer die naechsten Tests.
- Die Inline-Beschreibung **speichert** beim Klick daneben, sie verwirft
  nicht.
- Toolbar-Knoepfe sind Links mit `href`; gestoppte Klicks werden zu
  Navigationen.
- Die Knoepfe des Kommentarformulars liegen innerhalb der `.field-group`,
  die des Bearbeiten-Dialogs ausserhalb.
- Der Rich-Text-Editor hat feste HTML-Formen fuer Makros
  (`pre.code.panel[data-language]`, `div.plain.panel > panel-title`, `tt`)
  und entfernt fremde Stile.

Benoetigte Zustaende:

| Zustand | Warum |
| --- | --- |
| Vorgang, nichts offen | FAB-Regel, keine Leisten |
| Kommentarfeld offen (Text und Visuell) | Leiste, Einfrieren, Absenden/Abbrechen, RTE-Paste |
| Beschreibung inline (Text und Visuell) | Moduswechsel, Speichern/Abbrechen in `.save-options` |
| Dialog *Vorgang bearbeiten* | zwei Wiki-Felder, Knoepfe ausserhalb der `.field-group`, Escape |
| Loginseite, Dashboard | FAB darf nicht stoeren |

Was das Mockup zusaetzlich koennen muss, damit Tests aussagekraeftig sind:

- **Jira-Handler protokollieren** (`window.__mock.log`): submit, cancel,
  Klick-daneben, Escape, RTE-Toggle. Ein Test prueft dann "Jira hat den
  Klick gesehen" bzw. "nicht gesehen" statt nur DOM-Zustaende.
- **Schliessen in der Erfassungsphase am Dokument**, so wie Jira, und
  Verstecken per `hidden` statt Entfernen (Issue 02).
- **TinyMCE-Nachbau** mit `<textarea-id>_ifr`, contenteditable-Body und
  `text/html`-Uebernahme beim Paste; Toggle tauscht Rahmen und Textarea.
- **Ein Mockup, viele Zustaende:** Zustand ueber Query-Parameter
  (`?state=comment-open`) oder per Klick, nicht fuenf fast identische Dateien.

Pflegeregel: Aendert sich ein Selektor in der Instanz, wird zuerst der
Auszug erneuert, dann das Mockup, dann der Code. Der Auszug selbst bleibt
ausserhalb des Repos (oeffentlich); ein `.gitignore`-Ordner `docs/dom-local/`
haelt ihn lokal vor.

## 2. Test-Ebene "ext": die echte Erweiterung im echten Browser

**Problem:** Issue 17 - Hauptwelt statt isolierter Welt, Stub statt
`chrome.storage`, kein Service-Worker, kein Popup, kein echtes Paste.

**Vorschlag:** `test/lib/extension.js` mit `launchExtension()`:

```js
// Kern, siehe docs/mockup/edge-harness.js
var context = await chromium.launchPersistentContext(profileDir, {
  channel: process.env.PW_CHANNEL || 'chromium',   // lokal 'msedge'
  headless: false,                                  // Erweiterungen brauchen headed oder headless=new
  args: ['--load-extension=' + extDir, '--disable-extensions-except=' + extDir]
});
var worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
var extensionId = worker.url().split('/')[2];
```

- Fixtures ueber einen Mini-HTTP-Server (`http.createServer`, Port frei)
  auf `localhost`; das Test-Manifest ist eine Kopie mit `localhost` in
  `matches` und `host_permissions` (wird beim Start erzeugt, nie
  eingecheckt).
- Popup/Optionsseite ueber `chrome-extension://<id>/popup/popup.html`;
  `chrome.storage` aus einer Erweiterungsseite lesen statt aus der Fixture.
- Echte Zwischenablage: `context.grantPermissions(['clipboard-read',
  'clipboard-write'])`, dann `page.keyboard.press('Control+V')`.
- Dialoge (`beforeunload`) ueber `page.on('dialog')` protokollieren - ein
  unerwarteter Dialog ist ein Fehler.
- Auf GitHub-Runnern liegt Edge vor (`channel: 'msedge'`); in der
  Claude-Sandbox das vorinstallierte Chromium (`PLAYWRIGHT_BROWSERS_PATH`).
  Laeuft `test:ext` nicht (kein Display, keine Erweiterungsunterstuetzung),
  wird es uebersprungen - wie heute bei fehlendem Playwright.
- Modul `ext` in `test/modules/ext/` mit Skript `test:ext`; `isolation.test.js`
  bleibt gueltig.

## 3. Konverter: Fuzz, Korpus und Roundtrip

- **Terminierung als Eigenschaft:** ein Property-Test erzeugt 2000 zufaellige
  Texte aus Markern (`-`, `*`, `1.`, `>`, `|`, `#`, Backticks, Leerzeilen,
  Woerter) und verlangt nur: `convert()` terminiert unter 50 ms und wirft
  nicht. Issue 01 waere damit am ersten Tag aufgefallen. Dazu eine
  Iterationsbremse in `convertBlocks()`.
- **Idempotenz:** `convert(convert(x))` darf Jira-Markup nicht weiter
  veraendern (Issue 05) - fuer eine Liste bekannter Jira-Konstrukte.
- **Korpus statt Einzelfaelle:** `test/modules/converter/corpus/<fall>.md`
  mit `<fall>.jira` und `<fall>.html` daneben; der Test iteriert das
  Verzeichnis. Neue Faelle aus echten Azure-DevOps-Work-Items sind dann ein
  Datei-Paar, kein JavaScript - auch vom iPhone aus pflegbar.
- **Renderer-Roundtrip (opt-in):** ein Skript schreibt das erzeugte Markup
  ueber die REST-API in die Beschreibung von DBREFI-10549 und liest
  `renderedFields.description` zurueck (`?expand=renderedFields`). Prueft,
  ob `\|`, `&#124;`, `\{` und `\~` in 9.12.2 wirklich so rendern wie
  angenommen (Issues 06, 07, 11). Laeuft nur mit `JIRA_PAT` in der
  Umgebung, nie in der CI.

## 3b. Einfrieren neu schneiden

Die Instanz zeigt, dass der Wachposten zu breit ist: er stoppt `click`
(damit Links und Dialoge, Issue 25), er sperrt jede Textarea (Issue 24),
und er greift im visuellen Modus zu spaet (Issue 20). Vorschlag fuer den
Umbau, bevor einzelne Symptome geflickt werden:

- Nur `pointerdown`, `mousedown`, `focusout`, `blur` stoppen - das sind die
  Ereignisse, an denen Jira das Schliessen festmacht. `click`, `dblclick`,
  `submit`, `keydown` durchlassen; `Escape` nur im gesperrten Feld selbst
  abfangen.
- Sperren nur fuer Felder mit Leiste (Wiki-Felder und Rich-Text-Rahmen),
  nie fuer Picker-Textareas.
- Rahmen sofort beim Einhaengen verdrahten und einen bereits fokussierten
  Rahmen sofort sperren.
- Abnahme: die sechs Faelle aus `docs/mockup/scenario-mock2.js` als Tests.

## 4. Robustheit im Content-Script

- `onPaste`: `preventDefault()` erst nach erfolgreicher Konvertierung;
  jede Ausnahme laesst den nativen Paste durch.
- Alle `deliver()`-Pfade nutzen `insertModeFor()` (Issue 04).
- Nach programmatischem Einfuegen `rememberCaret()` synchron (Issue 08).
- `EditLock.cleanup()` beruecksichtigt `isUsable()` (Issue 02) und loest
  bei `submit` des umschliessenden Formulars.
- Lint-Regel gegen Seiten-Globals (`window.JIRA`, `AJS`, `jQuery`) im
  Quellcode - sie existieren in der isolierten Welt nicht.

## 5. Arbeitsweise mit Claude Code

- **Jeder Bug beginnt mit einem roten Test** im passenden Modul; der
  Fix-PR zeigt beide Commits (`test(jira): ...` vor `fix(jira): ...`).
  Das passt zur Kette Sonnet -> Opus -> Korrektur in `.github/PROMPTS.md`.
- **Szenario-Skripte statt Handklicks:** `docs/mockup/scenario-3.js` zeigt
  das Muster - ein Skript, das die Erweiterung durch eine Bedienfolge
  fuehrt und ein Protokoll schreibt. Solche Skripte sind der Ausgangspunkt
  fuer `test/modules/ext/`.
- **Screenshots als Artefakte:** `test:ext` legt je Szenario ein PNG unter
  `test-results/` ab; die CI haengt den Ordner an den Lauf. Ein Review am
  Handy kann dann sehen, was die Leiste tut.
- **Instanz-Tests bleiben manuell und protokolliert:**
  `docs/testprotokoll-DBREFI-10549.md` ist die Checkliste fuer den einen
  Durchlauf gegen die echte Instanz vor einem Release; Ergebnisse als
  Kommentar in das Release-Issue.
- **Doku als Vertrag:** Aussagen der README ("Strg+Z macht das
  rueckgaengig", "Abbrechen funktioniert normal") bekommen je einen Test mit
  der README-Zeile als Testnamen. Issue 09 und 03 sind Aussagen ohne Test.
- **Versionsdrift automatisch bremsen:** `package`-Test, der verlangt, dass
  `CHANGELOG.md` einen Abschnitt fuer die Manifest-Version oder
  "Unreleased" hat, und dass jede Datei in `content_scripts` von
  `content.js` benutzt wird (Issue 16).

## 6. Reihenfolge

1. Issue 01 und 05 fixen (Datenverlust), Property-Test dazu.
2. DOM-Auszug aus DBREFI-10549 ziehen, Mockup auf `[belegt]` bringen,
   Issues 02/03 bestaetigen oder schliessen.
3. `test/lib/extension.js` + Modul `ext` mit den drei Szenarien aus
   `docs/mockup/` als erste Faelle.
4. Rest der Issues nach Schwere.
