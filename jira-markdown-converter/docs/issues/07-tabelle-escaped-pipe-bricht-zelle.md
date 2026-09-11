# Tabellen: maskierter senkrechter Strich (`\|`) wird roh ausgegeben und bricht die Zelle

**Labels:** bug, converter, medium
**Schwere:** mittel - jede Markdown-Tabelle mit `\|` (Regex, Shell-Pipes, Typ-Unions) kommt mit verschobenen Spalten an
**Nachgewiesen:** Node (`convert()`); Jira 9.12.2 rendert `a\|b` nachweislich als eine Zelle `a|b` (Kommentar in DBREFI-10549), ebenso `a&#124;b`

## Beschreibung

GitHub/Azure DevOps schreiben einen senkrechten Strich in einer Zelle als
`\|`. `splitTableRow()` loest das zu `|` auf und gibt das Zeichen roh in die
Jira-Zelle:

```
| Regex | a\|b |      ->     |Regex|a|b|      (drei Zellen)
```

Jira 9.12.2 versteht in Tabellenzellen sowohl `\|` als auch `&#124;` als
literalen Strich - der Fix ist also trivial.

## Reproduktion

```bash
node -e "console.log(require('./src/converter.js').convert('| Feld | Wert |\n| --- | --- |\n| Regex | a\\\\|b |'))"
```

## Vorschlag

- `cell()` in `readTable()` maskiert nach `convertInline()` verbleibende `|`
  als `\|` - egal ob sie aus `\|`, aus Inline-Code oder aus einem Link-Label
  stammen.
- Test: Zelle mit `\|`, Zelle mit Link-Label `a\|b`, Zelle mit Inline-Code
  `` `x|y` `` (GFM trennt dort ebenfalls - erwartetes Verhalten dokumentieren).
