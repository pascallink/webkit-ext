# Store-Listung - Deutsch

Fertige Texte zum Uebernehmen ins [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge).
Sprache der Listung: **Deutsch (Deutschland)**, Standardsprache des Angebots.

## Stammdaten

| Feld | Wert |
| --- | --- |
| Name | `PowerEdit for Jira` |
| Kategorie | Produktivitaet |
| Sprachen der Listung | Deutsch (Standard), Englisch |
| Zielmaerkte | Alle Maerkte |
| Website | `https://github.com/pascallink/webkit-ext` |
| Support-Kontakt | `https://github.com/pascallink/webkit-ext/issues` |
| Datenschutzerklaerung | `https://github.com/pascallink/webkit-ext/blob/main/PRIVACY.md` |

Der Name fuehrt keine fremde Marke als Hauptbestandteil: "PowerEdit" traegt
das Angebot, "for Jira" beschreibt nur, wofuer es gedacht ist. Die
Erweiterung stammt nicht von Atlassian - das steht so auch am Ende der
ausfuehrlichen Beschreibung.

## Kurzbeschreibung (max. 132 Zeichen)

```
Wandelt Markdown beim Einfuegen in Jira-Markup um - dazu Codebloecke, Panel-Vorlagen und ein Feld, das offen bleibt.
```

## Ausfuehrliche Beschreibung (max. 10.000 Zeichen)

```
PowerEdit for Jira erweitert die Ticket-Bearbeitung in Jira um alles, was beim
Schreiben laengerer Beschreibungen und Kommentare fehlt: Markdown, fertige
Formatierungsvorlagen und Codebloecke, die auch wirklich als Codeblock ankommen.

Aus einem Text, der in Azure DevOps, GitHub oder einem Editor entstanden ist,
wird beim Einfuegen sauberes Jira-Wiki-Markup: aus "# Titel" wird "h1. Titel",
aus "**fett**" wird "*fett*", aus einer Markdown-Tabelle eine Jira-Tabelle.
Ueberschriften, Listen (auch verschachtelt), Aufgabenlisten, Zitate, Links,
Bilder, Trennlinien und Codebloecke sind abgedeckt.

WAS DIE ERWEITERUNG EINBAUT

- Buttonleiste direkt am Feld: Automatik an/aus, Umwandeln, Einfuegen, Code,
  Panel, Editor und das Schloss fuer den Bearbeitungsmodus.
- Eingabefeld mit Vorschau: links Markdown, rechts das fertige Jira-Markup -
  dann ins Ticket einfuegen, das Feld ersetzen oder das Ergebnis kopieren.
- Dialog "Code einfuegen": Sprache aus der Liste waehlen, Code eintippen,
  fertigen {code}-Block an der Cursorposition einsetzen. Der Code wird nie
  durch den Markdown-Parser geschickt.
- Menue "Panel aus Vorlage": vier farbige Jira-Panels (Info, Hinweis, Warnung,
  Standard) auf Knopfdruck, Platzhalter danach markiert.
- Automatik beim Einfuegen: Text, der nach Markdown aussieht, wird direkt beim
  Einfuegen umgewandelt. Strg+Z macht das rueckgaengig, und die Automatik
  laesst sich ueberall mit einem Klick abschalten.
- Bearbeitung einfrieren: das Beschreibungsfeld bleibt beim Bearbeiten offen,
  ein Klick daneben verwirft nichts mehr. Ein Klick auf das Schloss gibt es
  wieder frei.
- Konverter in der Symbolleiste: Markdown einfuegen, Jira-Markup herausholen -
  ohne geoeffnete Jira-Seite.
- Kontextmenue-Eintrag und Tastenkuerzel Strg+Umschalt+M (macOS:
  Cmd+Umschalt+M) fuer die aktuelle Auswahl im Editor.

JIRA CLOUD, SERVER UND DATA CENTER

Auf *.atlassian.net laeuft die Erweiterung sofort. Selbst gehostete Instanzen
(Jira Server / Data Center) gibt der Nutzer einmalig selbst frei: die
Jira-Seite oeffnen, auf das Symbol klicken, "Diese Jira-Adresse freigeben"
waehlen - oder die Adresse in den Einstellungen eintragen. Erst dann fragt die
Erweiterung den Zugriff auf genau diese Adresse ab. Ohne diese Freigabe
passiert auf fremden Seiten nichts.

Alle drei Editorvarianten sind abgedeckt: das Textfeld von Jira Server 9.x
(Wiki Style Renderer), der Rich-Text-Editor (jira.rte.enabled) und der Editor
von Jira Cloud. Im Rich-Text-Editor kommt das Markdown wahlweise als fertige
Formatierung an oder die Erweiterung schaltet vorher auf den Markup-Modus um.

DATENSCHUTZ

Es werden keine Daten erhoben, gespeichert oder an Server gesendet. Die
Umwandlung passiert vollstaendig im Browser. Gespeichert werden ausschliesslich
die eigenen Einstellungen, und zwar im Browserprofil. Es gibt keine Telemetrie,
keine Werbung, keinen nachgeladenen Code.

QUELLTEXT

Der vollstaendige Quelltext liegt offen:
https://github.com/pascallink/webkit-ext

Diese Erweiterung ist ein unabhaengiges Projekt und steht in keiner Verbindung
zu Atlassian. "Jira" ist eine Marke von Atlassian und wird hier nur
beschreibend verwendet.
```

## Suchbegriffe

`Jira`, `Markdown`, `Wiki-Markup`, `Azure DevOps`, `Konverter`, `Codeblock`,
`Panel`, `Produktivitaet`

## Versionshinweise

Fuer jede Einreichung aus [`../../CHANGELOG.md`](../../CHANGELOG.md) uebernehmen -
der Abschnitt der eingereichten Version, ohne Markdown-Ueberschriften.
