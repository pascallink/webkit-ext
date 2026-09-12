# Changelog

Alle nennenswerten Aenderungen an "PowerEdit for Jira" werden hier
festgehalten. Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/), Versionierung an
[SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Geaendert

- Aus Azure DevOps kopierte Bildgroessen, Anhangspfade, TOC-Marker,
  GUID-Erwaehnungen und fremde HTML-Tags landen nicht mehr roh im Ticket
  (Issue #99).

### Behoben

- Erweiterung nistet sich nicht mehr auf fremden Seiten ein.
- Feldleisten, schwebender Button und Einfrieren nur noch auf erkannten
  Jira-Instanzen; das Kuerzel oeffnet ueberall das Panel ohne Leisten.
- *Vorher auf den Markup-Modus umschalten* findet den Umschalter von Jira 9.12
  jetzt und schaltet wirklich um, statt still auf formatiertes Einfuegen
  zurueckzufallen (Issue #110).
- Strg+Z nach der Einfuege-Automatik loescht nicht mehr das ganze Feld (Issue #96).
- Nach dem Code-Dialog steht der Cursor hinter dem Codeblock; das naechste
  Panel oder die naechste Vorlage landet dort und nicht mehr davor (Issue #95).
- Ein mit `\|` maskierter senkrechter Strich bleibt in der
  Tabellenzelle stehen, statt die Spalten zu verschieben (Issue #94).
- Sonderzeichen im Fliesstext werden maskiert, damit Jira sie nicht als
  Markup liest (Issue #93).
- Auf `http://`-Instanzen kopieren Panel, Feldleiste und Code-Dialog wieder;
  Einfuegen verweist dort jetzt auf Strg+V statt eine leere Zwischenablage zu
  melden (Issue #106).
- Panel-Vorlagen im visuellen Modus kommen jetzt als echtes Panel an statt als
  fetter Titel mit Absatz (Issue #109).
- Code-Dialog liefert im visuellen Modus einen echten Codeblock statt
  Inline-Monospace (Issue #108).
- Beim Einfuegen von bereits vorhandenem Jira-Markup wird nicht mehr
  konvertiert; Makros wie `{code}` bleiben heil (Issue #92).
- Einfrieren sperrte die Navigation und Dialoge; nun bleiben Toolbar,
  Bedienelemente ausserhalb des Feldes und Escape funktionieren normal
  (Issue #112).
- Bearbeiten-Dialog und Abbrechen werden vom Einfrieren nicht blockiert
  (Issue #90).
- Label-Felder und andere kleine Auswahlfelder frieren nicht ein (Issue #111).
- Tab friert nicht mehr ein, wenn eine Zeile nur aus einem Listenmarker
  besteht (Issue #88).
- Eingefuegter Text geht bei einem Fehler in der Umwandlung nicht mehr
  verloren.
- Inline-Code mit geschweiften Klammern (`{{key}}`, `${var}`, JSON-Schnipsel)
  kommt in Jira 9.12 woertlich an (Issue #98).
- Im visuellen Editor (Rich Text) ist die Beschreibung schon beim ersten
  Oeffnen eingefroren; ein Klick daneben speichert den halb getippten Text
  nicht mehr (Issue #107).
- Ueberschrift, Liste und Tabelle kleben beim Einfuegen mitten in einer Zeile
  nicht mehr am Text, sondern ruecken auf eigene Zeilen (Issue #91).

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
