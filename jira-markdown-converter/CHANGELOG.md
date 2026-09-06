# Changelog

Alle nennenswerten Aenderungen an "PowerEdit for Jira" werden hier
festgehalten. Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/), Versionierung an
[SemVer](https://semver.org/lang/de/).

## [Unveroeffentlicht]

### Hinzugefuegt

- Unterlagen fuer die Einreichung im Microsoft Edge Add-ons Store unter
  `docs/store/`: Listungstexte (deutsch und englisch), Begruendung je
  Berechtigung, Hinweise fuer die Pruefer und der Veroeffentlichungsprozess.
- Bild-Artefakte fuer die Listung - Logo 300x300, Promo-Tile 1400x560 und
  fuenf Screenshots 1280x800 - reproduzierbar gebaut ueber
  `npm run store:assets`.
- `homepage_url` im Manifest, `license` und `homepage` in der `package.json`.
- Tests fuer die Store-Vorgaben: Laenge der Beschreibungen, Groesse der
  Bilder, Version synchron zwischen `manifest.json` und `package.json`,
  kein nachgeladener Code im Paket.

### Geaendert

- `description` nennt Codebloecke statt der noch nicht gebauten Smart-Links.
- Panel-Vorlagen (Info, Hinweis, Warnung, Standard) im Rich-Text-Editor ohne
  umlaufenden Rahmen: Statusfarbe steckt jetzt in einer linken Akzentleiste,
  dazu modernere Rundung, Innen- und Aussenabstaende.

### Entfernt

- Optionale Berechtigung `clipboardRead`: sie wurde nie angefordert. Die
  Zwischenablage wird ueber `navigator.clipboard` hinter einem Klick des
  Nutzers gelesen, wofuer es keine Berechtigung braucht.

## [1.2.1] - 2026-09-05

### Behoben

- `eslint` fehlte als Projekt-Abhaengigkeit, dadurch schlug `npm run lint`
  in der CI fehl (lief lokal nur durch, weil ESLint dort global installiert
  war). Jetzt als `devDependency` in `package.json` eingetragen.

## [1.2.0] - 2026-09-05

### Hinzugefuegt

- Dialog "Code einfuegen": Sprache waehlen, Code eintippen, als Codeblock an
  der Cursorposition einsetzen - erreichbar ueber Feldleiste und Panel.
- Menue "Panel aus Vorlage": vier farbige Jira-Panels (Info, Hinweis,
  Warnung, Standard) per Knopfdruck einsetzen, Platzhalter danach markiert.
- Codeblock im Rich-Text-Editor als eigener Block statt als Zitat.
- Blockmakros (Panels, Codebloecke) werden auf eigenen Zeilen eingefuegt.
- Bearbeitungsmodus einfrieren: das Feld wird beim Bearbeiten festgehalten
  und per Schloss-Symbol wieder freigegeben; laesst sich in den
  Einstellungen abschalten.
- Schalter fuer die Einfuege-Automatik jetzt ueberall sichtbar und
  umschaltbar: Popup, Optionsseite, Panel und direkt in der Buttonleiste am
  Feld.

### Geaendert

- Projekt umbenannt zu "PowerEdit for Jira".
- Beschriftungen der Buttonleiste verkuerzt, Fixieren-Knopf klarer benannt.

### Behoben

- Diverse Bug-Issues rund um die Feldleiste und die Einfrieren-Funktion.

## [1.1.0] - 2026-09-04

### Hinzugefuegt

- Erste Version von PowerEdit for Jira (vormals Jira-Markdown-Converter):
  Markdown-Support, Formatierungsvorlagen und Umwandlung von Azure-DevOps-
  Markdown in Jira-Markup.
