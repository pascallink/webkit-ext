# Changelog

Alle nennenswerten Aenderungen an "PowerEdit for Jira" werden hier
festgehalten. Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/), Versionierung an
[SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Geaendert

- Die Sperre faellt weg, sobald das Feld nicht mehr bedienbar ist (versteckt,
  entfernt, Modus umgeschaltet).
- Nachfrage beim Verlassen nur noch bei sichtbarem, geaendertem Feld (Issue #89).
- Die vier OTRS-Dateien (`otrslink`, `jiraui`, `otrsflow`, `otrsdialog`) waren
  zwischenzeitlich aus `manifest.json` genommen, weil sie noch nicht
  verdrahtet waren (Issue #103); mit dem OTRS-Link-Helfer aus 1.4.0 stehen
  sie wieder in `manifest.json` und `CONTENT_FILES`. Abweichende Selektoren
  gegen die echte Jira-9.12.2-Instanz bleiben als offener Befund in Issue #26.
- Aus Azure DevOps kopierte Bildgroessen, Anhangspfade, TOC-Marker,
  GUID-Erwaehnungen und fremde HTML-Tags landen nicht mehr roh im Ticket
  (Issue #99).

### Behoben

- *In Jira einfuegen* aus dem Popup beachtet jetzt *Vorher auf den
  Markup-Modus umschalten* und *Im Rich-Text-Editor*; bisher landete bei
  aktivem Rich-Text-Editor Rohtext (Issue #105).
- Die Buttonleiste erscheint jetzt auch an Feldern, die beim ersten Scan noch zu
  klein oder verdeckt waren (Dialog *Vorgang bearbeiten*, Reiter *Vorschau*,
  eingeklapptes Kommentarfeld) - Issue #101.
- Der schwebende Button erscheint nur noch auf Seiten mit Eingabefeld oder auf
  Vorgangsseiten; die Loginseite bleibt unberuehrt (Issue #102).
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
- Toolbar-Links und Dialoge oeffnen bei eingefrorenem Feld wieder normal,
  statt die Seite zu verlassen (Issue #112).
- Abbrechen und die Knoepfe im Dialog *Vorgang bearbeiten* sind wieder
  bedienbar; Escape ausserhalb des eingefrorenen Feldes wirkt wieder, im
  Feld selbst bleibt es gesperrt (Issue #90).
- Kleine Auswahlfelder (Labels, Versionen, Picker) frieren nicht mehr ein
  (Issue #111).
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
- Verschachtelte Zitate landen in einer Huelle statt als verschachtelte
  `{quote}`-Bloecke (Issue #100).
- E-Mail-Adressen ohne Schema (`<max@x.de>`) werden zu `mailto:`-Links verlinkt
  (Issue #100).
- Senkrechte Striche in Link-Zielen werden kodiert, damit sie nicht als
  Tabellentrenner wirken (Issue #100).
- Backslash am Zeilenende erzeugt einen harten Umbruch statt roh durchgereicht
  zu werden (Issue #100).
- Ein eingerueckter Absatz nach einer Leerzeile wird an den Listeneintrag
  angehaengt; eine eingerueckte Ueberschrift, ein Zitat, eine Tabellenzeile
  oder ein Trenner beendet die Liste weiterhin (Issue #100).
- Setext-Ueberschriften (Titel mit Strichreihe darunter) werden als
  Ueberschriften erkannt (Issue #100).
- Inline-Code mit maskierten geschweiften Klammern (`` `\{x\}` ``) landet jetzt
  in `{noformat}` statt als `{{\{x\}}}`, das Jira 9.12.2 woertlich rendert;
  in einer Tabellenzelle mit maskiertem Strich bleibt es bewusst bei `{{ }}`,
  damit die Spaltenaufteilung haelt (Issue #155, Wurzel aus Issue #98).

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

## [1.3.6] - 2026-09-11

Nur interne Doku und Planung (Fehlersammlung, Testprotokoll, Nachbau der
Jira-9.12-Instanz), keine nutzersichtbaren Aenderungen.

## [1.3.5] - 2026-09-11

### Hinzugefuegt

- `JiraOtrsDialog`: Dialog "OTRS-Link einpflegen", nimmt einen OTRS-Verweis
  in beliebigem Format entgegen und zeigt per `JiraOtrsLink` eine
  Live-Vorschau der drei Zielwerte (Label, Kunden Referenz, Web-Link) - Teil
  der OTRS-Anbindung aus Issue #17, noch nicht verdrahtet.

## [1.3.4] - 2026-09-11

Nur interne Planungsnotiz zum OTRS-Ablauf, keine nutzersichtbaren
Aenderungen.

## [1.3.3] - 2026-09-11

### Hinzugefuegt

- `JiraOtrsFlow`: traegt einen geparsten OTRS-Verweis strikt sequenziell in
  drei Stellen des Jira-Vorgangs ein - Label, Custom Field "Kunden
  Referenz", Web-Link im Dialog "Link" - mit Tastatur-Shortcut und
  DOM-Fallback fuer Jira Server / Data Center 9.12 LTS (Issue #17, noch
  nicht verdrahtet).

## [1.3.2] - 2026-09-11

### Geaendert

- `playwright` als Entwicklungsabhaengigkeit exakt auf die Version des
  vorinstallierten Chromium gepinnt statt auf einen Bereich - vermeidet
  einen Versions-Mismatch beim Cloud-Sandbox-Setup.

## [1.3.1] - 2026-09-11

### Hinzugefuegt

- `JiraOtrsLink`: zerlegt einen OTRS-Verweis (Markdown-Link, HTML-Anker oder
  Rohtext mit eingebetteter URL) in Ticketnummer, Titel und URL - DOM-frei,
  Grundlage der OTRS-Anbindung aus Issue #17.
- `JiraUi`: generische DOM-Helfer gegen die klassische AUI-Oberflaeche von
  Jira Server / Data Center - Warten auf Elemente per MutationObserver,
  Werte setzen, Tastendruecke und Klicks nachbilden, ohne OTRS-Wissen.

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
