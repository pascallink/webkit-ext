# Popup "In Jira einfuegen" ignoriert die Rich-Text-Einstellungen und fuegt Markup als Text ein

**Labels:** bug, popup, content, low
**Schwere:** niedrig - nur bei aktivem Rich-Text-Editor sichtbar, dann aber Rohtext im Editor
**Nachgewiesen:** Code-Lesung `popup/popup.js` (`insert-text`) und `src/content.js` (`onMessage`)

## Beschreibung

Das Popup schickt das fertig konvertierte Jira-Markup als `insert-text`.
`onMessage` ruft dafuer direkt `Editors.insert(field, message.text, mode)`
auf - ohne `deliver()`. Damit gelten weder `switchToMarkup` noch
`richEditorFormat`: im TinyMCE-Rahmen landet `h1. Titel` als Klartext,
waehrend derselbe Text ueber Panel oder Leiste formatiert ankaeme.

Ausserdem waehlt `currentTarget()` ohne Fokus das groesste sichtbare Feld -
nach dem Klick ins Popup hat kein Jira-Feld mehr den Fokus, die gemerkte
Position greift nur, wenn vorher im Feld getippt wurde.

## Vorschlag

- Popup schickt das **Markdown** (`input.value`) statt des Markups; der
  Content-Script laeuft ueber `deliver()` wie ueberall sonst.
- `insert-text` bleibt fuer Fremdaufrufer, wird aber ebenfalls ueber
  `deliver()` mit `richEditorFormat: 'jira'` abgewickelt.
- Test im Modul `popup`/`content`: Nachricht gegen `mock-jira-rte.html`,
  im Rahmen kommt `text/html` an.
