# Jira-Sonderzeichen im Fliesstext werden nicht maskiert (`[...]`, `-x-`, `~x~`, `^x^`, `??x??`)

**Labels:** bug, converter, medium
**Schwere:** mittel - Fehlerdarstellung (roter Text), Durchstreichung, Tief-/Hochstellung im Ticket
**Nachgewiesen:** Kommentar in DBREFI-10549 (Jira 9.12.2) gespeichert und gerendertes HTML gelesen

## Beschreibung

`JIRA_DIALECT.escapeText()` maskiert nur `{` und `}`. Was Jira 9.12.2 aus
unmaskiertem Text macht (gemessen):

| Eingabe | Jira rendert | Befund |
| --- | --- | --- |
| `[INFO] gestartet` | `<span class="error">[INFO]</span>` | roter Fehlertext (ungueltiger Link) |
| `Kosten -oder- mehr` | `Kosten <del>oder</del> mehr` | durchgestrichen |
| `Dauer ~30 ms~` | tiefgestellt | nur bei Wortgrenze vor und nach dem Zeichen |
| `x^2^` | hochgestellt | wie oben |
| `Dauer ~30 ms bis ~50 ms` | unveraendert | kein Paar an Wortgrenzen - harmlos |
| `5 * 3 * 2` | unveraendert | Leerzeichen innen verhindern Fett |

Maskierung mit Backslash funktioniert nachweislich: `\[INFO\]`, `\-oder\-`,
`\~30 ms\~`, `x\^2\^` erscheinen woertlich.

Markdown-Emphasen werden vorher korrekt uebersetzt; betroffen ist der
Klartext, der uebrig bleibt.

## Reproduktion

```bash
node -e "console.log(require('./src/converter.js').convert('[INFO] gestartet, Kosten -oder- mehr'))"
```

Ausgabe unveraendert; in DBREFI-10549 als Kommentar gespeichert erscheint
`[INFO]` rot und `oder` durchgestrichen.

## Vorschlag

- `escapeText()` im Jira-Dialekt maskiert zusaetzlich `[`, `]` sowie an
  Wortgrenzen paarige `-`, `~`, `^`, `+` und `??`. Bereits erzeugtes Markup
  liegt in Platzhaltern und bleibt unberuehrt - dasselbe Muster wie fuer die
  Klammern.
- Paarigkeit nach Jira-Regel pruefen (Zeichen direkt am Wort, davor/danach
  Leerzeichen oder Satzzeichen), sonst `-5 bis -1` nicht anfassen.
- Option `escapeBraces` zu `escapeJiraSyntax` verallgemeinern.
- Tests: die Tabelle oben als Node-Faelle im Modul `converter`.
