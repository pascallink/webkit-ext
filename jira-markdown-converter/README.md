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

Dazu kommen ein Symbolleisten-Popup (Konverter ohne Jira-Seite), ein
Kontextmenue-Eintrag und das Tastenkuerzel `Strg+Umschalt+M`
(macOS: `Cmd+Umschalt+M`), das die aktuelle Auswahl im Editor umwandelt.

## Installation

Die Erweiterung ist nicht signiert und wird als entpacktes Paket geladen:

1. `chrome://extensions` oeffnen (Edge: `edge://extensions`).
2. **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** und den Ordner `jira-markdown-converter`
   auswaehlen.

Danach laeuft sie auf allen `*.atlassian.net`-Seiten. Fuer **Jira Server oder
Data Center** die eigene Adresse (z. B. `jira.firma.de`) in den Einstellungen
der Erweiterung eintragen und auf *Zugriff erlauben* klicken – der Browser
fragt dann einmalig nach der Freigabe fuer diesen Host.

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

## Jira Cloud: Rich-Text-Editor

Jira Cloud benutzt fuer Beschreibung und Kommentar einen Rich-Text-Editor, kein
reines Textfeld. Dort gibt es zwei sinnvolle Wege, zwischen denen die
Einstellung *Rich-Text-Editor von Jira Cloud* umschaltet:

* **Jira-Markup einfuegen** (Voreinstellung) – es wird fertiges Jira-Markup
  eingefuegt. Richtig fuer Textfelder, den Wiki-Markup-Modus und Jira
  Server/Data Center.
* **Markdown durchreichen** – das Markdown wandert unveraendert in den Editor,
  der es beim Einfuegen selbst in formatierten Text umsetzt. Wenn das Feld ein
  echter Rich-Text-Editor ist, ist das oft das schoenere Ergebnis.

In reine Textfelder (`textarea`) wird immer Jira-Markup geschrieben,
unabhaengig von dieser Einstellung.

## Einstellungen

Erreichbar ueber das Popup („Einstellungen") oder
`chrome://extensions` → *Details* → *Erweiterungsoptionen*:

* Automatik beim Einfuegen an/aus
* Schwebenden Button und Bestaetigungen an/aus
* Zielformat fuer den Rich-Text-Editor
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
| `https://*.atlassian.net/*` | Jira Cloud |
| optional: weitere Hosts | nur nach ausdruecklicher Freigabe durch den Nutzer |

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
```

### Tests

```bash
npm test                  # alle Tests
npm run test:unit         # Konverter (71 Faelle, ohne Abhaengigkeiten)
npm run test:package      # Manifest und Paketstruktur
npm run test:integration  # echtes Chromium gegen eine nachgebaute Jira-Seite
npm run lint
```

Der Integrationstest braucht Playwright. Ist es global installiert, hilft
`NODE_PATH=$(npm root -g) npm run test:integration`; fehlt Playwright, wird der
Test uebersprungen statt fehlzuschlagen.

`src/converter.js` ist bewusst frei von DOM-Zugriffen und laesst sich auch
einzeln verwenden:

```js
const { convert } = require('./src/converter.js');
convert('# Titel\n\n- **a**');   // "h1. Titel\n\n* *a*"
```
