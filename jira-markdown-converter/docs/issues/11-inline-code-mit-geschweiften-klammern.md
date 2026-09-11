# Inline-Code mit geschweiften Klammern erzeugt kaputtes `{{...}}`

**Labels:** bug, converter, medium
**Schwere:** mittel - Platzhalter-Syntax wie `{{key}}`, `${var}` oder JSON-Schnipsel in Backticks sind im technischen Alltag haeufig
**Nachgewiesen:** Node (`convert()`); Rendering in Jira 9.12.2 geprueft

## Beschreibung

`JIRA_DIALECT.code()` liefert `'{{' + text + '}}'` ohne den Inhalt zu
maskieren:

```
Nutze `{{key}}` hier      ->     Nutze {{{{key}}}} hier
```

Jira beendet das Monospace-Makro beim ersten `}}`. Auch die naheliegende
Maskierung `{{\{\{key\}\}}}` hilft nicht: Jira 9.12.2 rendert sie als
`{{<tt>key</tt>}}` - Klammern ausserhalb, Monospace nur um `key`. Der
HTML-Dialekt ist korrekt (`<code>{{key}}</code>`).

## Reproduktion

```bash
node -e "console.log(require('./src/converter.js').convert('Nutze \`{{key}}\` und \`a}\`'))"
```

## Vorschlag

- Enthaelt der Code-Inhalt `{` oder `}`, im Jira-Dialekt statt `{{ }}`
  einen `{noformat}`-Einzeiler ausgeben - der einzige Weg, der in 9.12.2
  woertlich rendert. Sonst `{{ }}` wie bisher.
- Node-Tests fuer `{{key}}`, `}`, `{`, `${var}` in Backticks.
