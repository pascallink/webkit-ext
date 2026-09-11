# Kontextmenue und Tastenkuerzel injizieren die komplette Oberflaeche samt Einfrieren auf beliebigen Seiten

**Labels:** bug, background, security, medium
**Schwere:** mittel - nach einem Klick auf "Markdown in Jira-Markup umwandeln" auf GitHub, Confluence oder einer Mail-Oberflaeche friert die Erweiterung dort Textfelder ein und schluckt Klicks
**Nachgewiesen:** Code-Lesung `src/background.js` `sendToTab()`; Ablauf ueber `activeTab` ist im Manifest angelegt

## Beschreibung

`sendToTab()` schickt die Nachricht an das Content-Script. Antwortet keines
(`chrome.runtime.lastError`), spielt es **alle** `CONTENT_FILES` und beide
CSS-Dateien in den Tab - egal welche Seite. Die Kontextmenue-Eintraege stehen
auf `editable`, `selection` und `page`, das Kuerzel `Strg+Umschalt+M` gilt
global; `activeTab` erlaubt die Injektion nach der Nutzergeste.

Danach laeuft auf der fremden Seite:

- `attachFieldButtons()` haengt die Leiste an jede Textarea ab 48 px Hoehe.
- `EditLock` friert beim ersten Fokus im Textfeld ein: Klicks daneben werden
  gestoppt, `Escape` gestoppt, `beforeunload` fragt nach.
- Der schwebende Button erscheint unten rechts.

Fuer den Nutzer ist nicht erkennbar, warum GitHub ploetzlich keine Klicks
mehr annimmt. Die Store-Pruefung (Edge Add-ons) wird ebenfalls fragen, warum
ein "Jira"-Werkzeug sich auf beliebigen Seiten einnistet.

## Reproduktion

1. `https://github.com/<repo>/issues/new` oeffnen, in das Kommentarfeld
   klicken, Rechtsklick -> *Markdown-Konverter oeffnen*.
2. Panel erscheint, Leiste ueber dem Feld, Schloss zu.
3. Auf *Preview* oder einen Link der Seite klicken: nichts passiert.

## Vorschlag

- Vor dem Injizieren pruefen, ob die Seite eine Jira-Instanz ist
  (`document.querySelector('meta[name="ajs-version-number"]')` oder
  `#jira` im Body-Attribut) - per `chrome.scripting.executeScript` mit einer
  kleinen Sondierfunktion. Sonst nur das Panel ohne Leisten und ohne
  Einfrieren laden (`content.js` bekommt einen Modus `standalone`).
- Mindestens: `EditLock.configure({ enabled: false })`, wenn die Seite kein
  Jira ist, und die Kontextmenue-Eintraege auf `documentUrlPatterns` der
  freigegebenen Hosts begrenzen.
- Test im Modul `background`: `sendToTab` auf einer Nicht-Jira-Seite laedt
  nicht `editlock.js`.
