# Panel-Vorlage im visuellen Modus kommt als fetter Titel plus Absatz an - kein Panel

**Labels:** bug, converter, content, high
**Schwere:** hoch - vier Vorlagen, alle wirkungslos im Standardmodus der Instanz
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Kommentar im visuellen Modus, danach auf *Text* umgeschaltet

## Beschreibung

`Converter.panelHtml()` erzeugt `<div style="border-left: ...; background-color: ...">
<p><strong>Warnung</strong></p><p>...</p></div>`. TinyMCE (Jira-Konfiguration)
entfernt das `style`-Attribut des `div`; uebrig bleibt ein nackter `div`:

```
im Editor:   <div><p><strong>Warnung</strong></p><p>Hier die Warnung eintragen.</p></div>
als Wiki:    *Warnung*

             Hier die Warnung eintragen.
```

Kein `{panel}`, keine Farbe. Jira stellt ein Panel im Editor so dar:

```html
<div class="plain panel" style="background-color: #ffebe6; border-color: #de350b; border-width: 1px;">
  <panel-title style="border-bottom-width: 1px; border-bottom-color: #de350b; background-color: #ffebe6;">Warnung</panel-title>
  <p>Hier die Warnung eintragen.</p>
</div>
```

Diese Form akzeptiert der Editor beim Einfuegen und wandelt sie beim
Umschalten und Speichern nach `{panel:title=...|borderColor=...|bgColor=...}`.

Zusatzbefund: das Panel landete **vor** dem eben eingefuegten Codeblock
(Issue 08, gemerkte Cursorposition veraltet).

## Reproduktion

1. Kommentar, Modus *Visuell*, *Panel* -> *Warnung*.
2. Auf *Text* umschalten: `*Warnung*` statt `{panel...}`.

## Vorschlag

- `panelHtml()` erzeugt die Jira-Form (`div.plain.panel` mit
  `background-color`/`border-color`, `panel-title` mit den drei Attributen).
  README-Abschnitt "Panel aus Vorlage" entsprechend anpassen (kein eigener
  Akzentbalken mehr - Jira zeichnet das Panel selbst).
- `selectPlaceholder()` findet den Platzhaltertext weiterhin ueber den
  Textknoten.
- Test: Nachbau-Roundtrip (`docs/mockup`) und Instanz.
