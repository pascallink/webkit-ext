# Changelog

Alle nennenswerten Aenderungen an "PowerEdit for Jira" werden hier
festgehalten. Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/), Versionierung an
[SemVer](https://semver.org/lang/de/).

## [1.4.0] - 2026-09-12

### Hinzugefuegt

- OTRS-Link-Helfer: nimmt einen OTRS-Verweis als Markdown-Link, HTML-Anker
  oder Rohtext mit eingebetteter URL entgegen und pflegt ihn nach *Absenden*
  an drei Stellen des Jira-Vorgangs ein - Label, Custom Field "Kunden
  Referenz" und Web-Link. Erreichbar ueber einen Knopf im Panel und in der
  Feldleiste, abschaltbar in den Einstellungen (*OTRS-Link-Helfer*), Feldname
  der Kundenreferenz dort ebenfalls einstellbar. Zielumgebung ausschliesslich
  Jira Server / Data Center 9.12 LTS (Issue #17).
- War die Kundenreferenz bereits belegt, zeigt eine laenger stehende Warnung
  den ueberschriebenen alten Wert.

## [1.3.0] - 2026-09-07

### Hinzugefuegt

- Eigene Vorlagen: in den Einstellungen anlegbare Textbausteine mit bis zu 5
  Platzhaltern (`${Name}`). Ueber den Button *Vorlagen* in der Buttonleiste
  am Feld einfuegbar; Vorlagen mit Platzhaltern oeffnen vorher einen Dialog
  fuer die Werte. Vorlagen liegen im lokalen Speicher des Browsers und
  wandern nicht auf andere Geraete mit - anders als die uebrigen
  Einstellungen, die weiterhin synchronisiert werden.
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

- Zielplattform eingegrenzt: die Erweiterung wird ausschliesslich fuer
  **Jira Server / Data Center 9.12 LTS (9.12.2)** entwickelt, getestet und
  unterstuetzt. Jira Cloud (ProseMirror) ist damit ausser Scope; das Paket
  aktiviert sich dort technisch noch, die Plattform wird aber nicht mehr
  gepflegt. Festgehalten in `CLAUDE.md`, `README.md`, `.github/TESTS.md`
  und der Store-Checkliste.
- `description` nennt Codebloecke statt der noch nicht gebauten Smart-Links.
- Panel-Vorlagen (Info, Hinweis, Warnung, Standard) im Rich-Text-Editor ohne
  umlaufenden Rahmen: Statusfarbe steckt jetzt in einer linken Akzentleiste,
  dazu modernere Rundung, Innen- und Aussenabstaende.

### Entfernt

- Optionale Berechtigung `clipboardRead`: sie wurde nie angefordert. Die
  Zwischenablage wird ueber `navigator.clipboard` hinter einem Klick des
  Nutzers gelesen, wofuer es keine Berechtigung braucht.

### Behoben

- Panel-Vorlagen fuegten im ProseMirror-Editor von Jira Cloud rohen,
  ungestylten HTML-Code ein; dort kommt jetzt das Wiki-Markup an, zusammen
  mit einem Hinweis, dass der Editor es unformatiert zeigt (Issue #64).
- Einfrieren: baute der Editor das Feld beim erneuten Fokussieren neu auf
  (gleiche id, neuer Knoten - typisch bei Rich-Text-Editoren), erkannte die
  Sperre den neuen Knoten nicht mehr und liess Jira das Feld beim naechsten
  Klick daneben schliessen (Issue #63).

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
