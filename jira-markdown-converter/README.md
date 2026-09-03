# Markdown nach Jira

Browser-Erweiterung (Manifest V3, Chrome/Edge), die aus Azure DevOps kopiertes
Markdown in Jira-Wiki-Markup umwandelt und direkt in das Jira-Ticket einfuegt.

Aus `# Titel` wird `h1. Titel`, aus `**fett**` wird `*fett*`, aus einer
Markdown-Tabelle wird eine Jira-Tabelle.

## Was die Erweiterung einbaut

Auf Jira-Seiten kommen drei Bedienelemente dazu:

1. **Buttonleiste direkt am Feld** – ueber jedem Beschreibungs- und
   Kommentarfeld:
   * *Markdown in Jira-Markup umwandeln* – wandelt den Feldinhalt (oder die
     Auswahl darin) an Ort und Stelle um.
   * *Aus Zwischenablage einfuegen* – holt das Markdown aus der Zwischenablage,
     konvertiert es und fuegt es an der Cursorposition ein.
   * *Editor oeffnen* – oeffnet das Eingabefeld mit Vorschau.
2. **Eingabefeld mit Vorschau** (schwebender `MD`-Button unten rechts) –
   links Markdown einfuegen, rechts das fertige Jira-Markup sehen, dann
   *Ins Ticket einfuegen*, *Feld ersetzen* oder *Kopieren*. Ueber
   *Feld waehlen* laesst sich das Zielfeld per Klick bestimmen.
3. **Automatik beim Einfuegen** – wird mit `Strg+V` Text in ein Jira-Feld
   eingefuegt, der nach Markdown aussieht, wandelt die Erweiterung ihn direkt
   beim Einfuegen um. `Strg+Z` macht das rueckgaengig; abschaltbar in den
   Einstellungen.

Eingefuegt wird immer an der Cursorposition im Jira-Feld, auch wenn der Text
vorher im Panel getippt wurde. Ist im Feld ein Rich-Text-Editor aktiv, kommt
der Text formatiert an; auf Wunsch schaltet die Erweiterung stattdessen vorher
auf den Markup-Modus um.

Dazu kommen ein Symbolleisten-Popup (Konverter ohne Jira-Seite), ein
Kontextmenue-Eintrag und das Tastenkuerzel `Strg+Umschalt+M`
(macOS: `Cmd+Umschalt+M`), das die aktuelle Auswahl im Editor umwandelt.

## Installation

Die Erweiterung ist nicht signiert und wird als entpacktes Paket geladen:

1. `chrome://extensions` oeffnen (Edge: `edge://extensions`).
2. **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** und den Ordner `jira-markdown-converter`
   auswaehlen.

Danach laeuft sie auf allen `*.atlassian.net`-Seiten (Jira Cloud).

### Jira Server / Data Center (z. B. 9.12.2)

Selbst gehostete Instanzen muessen einmalig freigegeben werden – sonst passiert
auf der Jira-Seite gar nichts:

* **Einfachster Weg:** die Jira-Seite oeffnen, auf das Symbol der Erweiterung
  klicken und im Popup *Diese Jira-Adresse freigeben* waehlen. Die Seite wird
  danach automatisch neu geladen.
* **Oder** in den Einstellungen unter *Eigene Jira-Adressen* die Adresse
  eintragen (z. B. `jira.firma.de`) und auf *Zugriff erlauben* klicken.

`http` und `https` sind beide abgedeckt, ein Port spielt keine Rolle
(`http://jira:8080/` funktioniert also ebenso wie `https://jira.firma.de/`).

## Umwandlungstabelle

| Markdown (Azure DevOps) | Jira-Markup |
| --- | --- |
| `# H1` … `###### H6` | `h1.` … `h6.` |
| `**fett**`, `__fett__` | `*fett*` |
| `*kursiv*`, `_kursiv_` | `_kursiv_` |
| `***beides***` | `*_beides_*` |
| `~~durchgestrichen~~` | `-durchgestrichen-` |
| `` `code` `` | `{{code}}` |
| ```` ```java … ``` ```` | `{code:java} … {code}` |
| eingerueckter Codeblock | `{noformat} … {noformat}` |
| `[Text](url)` | `[Text\|url]` |
| `![alt](url)` | `!url!` |
| `<https://…>` | `[https://…]` |
| `- a` / `1. a` (auch verschachtelt) | `* a` / `# a`, `**`, `*#` … |
| `- [x] erledigt` / `- [ ] offen` | `* (/) erledigt` / `* (x) offen` |
| Tabelle | `\|\|Kopf\|\|` und `\|Zelle\|` |
| `> Zitat` | `bq.` bzw. `{quote} … {quote}` |
| `> [!NOTE]` … | `{panel:title=Hinweis} … {panel}` |
| `---` | `----` |
| `<br>`, `<b>`, `<i>`, `<code>` | `\\`, `*`, `_`, `{{…}}` |

Sprachnamen werden auf die von Jira unterstuetzten abgebildet (`js` →
`javascript`, `yml` → `yaml`); unbekannte Sprachen fallen auf `{code}` zurueck.
Inhalte von Code-Bloecken bleiben unangetastet, geschweifte Klammern im
Fliesstext werden maskiert, damit Jira sie nicht als Makro liest.

## Jira Server / Data Center im Detail

In Jira 9.x sind Beschreibung, Kommentar und Umgebung normale Textfelder
(`textarea`) innerhalb des Wiki-Feldes mit den Reitern *Schreiben* und
*Vorschau*. Das ist der eindeutige Fall: dort wird immer fertiges Jira-Markup
eingefuegt.

Die Buttonleiste erscheint direkt ueber dem Textfeld, unterhalb der
Formatierungsleiste von Jira. Beim Inline-Bearbeiten baut Jira den Feldblock neu
auf - die Leiste wandert mit und verschwindet zusammen mit dem Feld.

**Wichtig:** Jira zeigt Wiki-Markup nur an, wenn das jeweilige Feld den
*Wiki Style Renderer* benutzt. Steht das Feld auf *Default Text Renderer*,
erscheint `h1. Titel` woertlich im Ticket. Einzustellen unter
Administration -> Vorgaenge -> Feldkonfigurationen -> *Renderer*.

Nach dem Einfuegen loest die Erweiterung `input` und `change` aus, damit Jiras
Entwurfsspeicherung die Aenderung mitbekommt.

## Aktivierter Rich-Text-Editor

Ist in Jira Server / Data Center der Rich-Text-Editor eingeschaltet
(`jira.rte.enabled`), blendet Jira die Textarea aus und legt einen
TinyMCE-Editor darueber. Ein solcher Editor wuerde `h1. Titel` woertlich
anzeigen, statt es als Ueberschrift zu setzen. Dasselbe gilt fuer den Editor
von Jira Cloud. Dafuer gibt es zwei Wege, die sich kombinieren lassen:

### Formatiert einfuegen (Voreinstellung)

Das Markdown wird zusaetzlich nach HTML uebersetzt und als solches eingefuegt.
Der Editor uebernimmt es als echte Formatierung: aus `# Titel` wird eine
Ueberschrift, aus `**fett**` fetter Text, aus einer Markdown-Tabelle eine
Tabelle. Es muss nichts umgeschaltet werden.

Technisch wird ein Einfuege-Vorgang mit `text/html` **und** `text/plain`
ausgeloest. Editoren bevorzugen `text/html`; wo das nicht greift, liegt als
Rueckfallebene weiterhin das Jira-Markup bereit. Geparst wird dabei nur einmal
(`convertBoth`), beide Formate stammen aus demselben Durchlauf.

Aus Sicherheitsgruenden erzeugt der HTML-Zweig nur eine feste Menge an Tags:
alles andere wird maskiert, und Links mit `javascript:` und aehnlichen Zielen
verlieren ihr Ziel. Rohes HTML aus dem Markdown wird nicht durchgereicht.

### Vorher auf den Markup-Modus umschalten

Alternativ (Einstellung *Vorher auf den Markup-Modus umschalten*) sucht die
Erweiterung den Umschalter des Feldes, klickt ihn, wartet bis die Textarea da
ist, und fuegt dann Jira-Markup ein.

Den Umschalter erkennt sie an bekannten Selektoren und andernfalls an der
Beschriftung (*Markup*, *Quelltext*, *Bearbeitungsmodus*, *Visual*, *Source*
...), weil Jira ihn je nach Version anders benennt. Wird keiner gefunden oder
greift der Klick nicht, faellt die Erweiterung auf das formatierte Einfuegen
zurueck - es geht also nichts verloren.

## Cursorposition

Eingefuegt wird an der Stelle, an der die Schreibmarke zuletzt im Jira-Feld
stand - auch dann, wenn der Text vorher im Panel der Erweiterung getippt wurde.
Sobald man dort hineinklickt, verliert das Jira-Feld die Auswahl; deshalb wird
sie waehrend des Tippens laufend mitgeschrieben (`selectionchange`, `mouseup`,
`keyup`, `focusout`) und vor dem Einfuegen wiederhergestellt. Eine markierte
Passage wird dabei ersetzt.

Liegt der Fokus noch im Feld, gilt immer die aktuelle Auswahl - die gemerkte
Position kommt nur zum Zug, wenn der Fokus das Feld verlassen hat. Im
Rich-Text-Editor wird der Bereich innerhalb des Editor-Rahmens gemerkt; ist er
durch zwischenzeitliches Umbauen ungueltig geworden, faellt die Erweiterung auf
die aktuelle Position zurueck.

## Einstellungen

Erreichbar ueber das Popup („Einstellungen") oder
`chrome://extensions` → *Details* → *Erweiterungsoptionen*:

* Automatik beim Einfuegen an/aus
* Schwebenden Button und Bestaetigungen an/aus
* Verhalten im Rich-Text-Editor: formatiert einfuegen, Jira-Markup als Text
  einfuegen oder Markdown durchreichen; dazu das Umschalten auf den
  Markup-Modus
* Konvertierung: Codesprache uebernehmen, Hinweisbloecke als Panel, einfaches
  HTML uebersetzen, geschweifte Klammern maskieren
* Eigene Jira-Adressen (Jira Server / Data Center)
* Ein Probierfeld mit Sofortvorschau

## Berechtigungen

| Berechtigung | Wofuer |
| --- | --- |
| `storage` | Einstellungen speichern |
| `contextMenus` | Eintrag im Rechtsklick-Menue |
| `scripting` | Nachladen auf selbst eingetragenen Jira-Adressen |
| `activeTab` | Adresse der aktuellen Seite fuer die Freigabe im Popup |
| `https://*.atlassian.net/*` | Jira Cloud |
| optional: `*://<eigener-host>/*` | Jira Server / Data Center, nur nach ausdruecklicher Freigabe |

Es werden keine Daten an Server gesendet; die Umwandlung passiert vollstaendig
im Browser.

## Entwicklung

```
jira-markdown-converter/
├── manifest.json
├── src/
│   ├── converter.js   Markdown -> Jira (ohne DOM, auch in Node nutzbar)
│   ├── editors.js     Jira-Felder finden, lesen, beschreiben
│   ├── content.js     Bedienelemente, Einfuege-Automatik
│   ├── settings.js    gemeinsame Einstellungen
│   ├── background.js  Tastenkuerzel, Kontextmenue, eigene Hosts
│   └── content.css
├── popup/             Konverter in der Symbolleiste
├── options/           Einstellungsseite
├── icons/
└── test/
    └── fixtures/      nachgebaute Jira-Seiten (Cloud, Server 9.x,
                       Server mit Rich-Text-Editor)
```

### Tests

```bash
npm test                  # alle Tests
npm run test:unit         # Konverter, Jira-Markup und HTML (ohne Abhaengigkeiten)
npm run test:settings     # Hosterkennung, Voreinstellungen
npm run test:package      # Manifest und Paketstruktur
npm run test:integration  # echtes Chromium gegen nachgebaute Jira-Seiten
                          # (Cloud-Editor, Jira Server 9.x, Rich-Text-Editor)
npm run lint
```

Der Integrationstest braucht Playwright. Ist es global installiert, hilft
`NODE_PATH=$(npm root -g) npm run test:integration`; fehlt Playwright, wird der
Test uebersprungen statt fehlzuschlagen.

`src/converter.js` ist bewusst frei von DOM-Zugriffen und laesst sich auch
einzeln verwenden:

```js
const { convert, convertToHtml, convertBoth } = require('./src/converter.js');

convert('# Titel\n\n- **a**');
// "h1. Titel\n\n* *a*"

convertToHtml('# Titel\n\n- **a**');
// "<h1>Titel</h1>\n\n<ul><li><strong>a</strong></li></ul>"

convertBoth('# Titel');   // { jira: "h1. Titel", html: "<h1>Titel</h1>" }
```

Beide Formate entstehen aus demselben Parser; die Ausgabe bestimmt ein
Dialekt-Objekt (`JIRA_DIALECT` / `HTML_DIALECT`) in `src/converter.js`.
