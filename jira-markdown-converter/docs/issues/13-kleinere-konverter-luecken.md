# Kleinere Konverter-Luecken (verschachtelte Zitate, mailto-Label, `|` in URLs, Backslash-Umbruch, Listen-Fortsetzung)

**Labels:** bug, converter, low
**Schwere:** niedrig - jeweils selten, aber leicht zu beheben und gut testbar
**Nachgewiesen:** Node (`convert()`)

Sammel-Issue; jeder Punkt kann einzeln als Commit erledigt werden.

## 1. Verschachtelte Zitate erzeugen ungueltiges `{quote}`-Nesting

```
> a            {quote}
>> b     ->    a
>>> c          {quote}
               b
               bq. c
               {quote}
               {quote}
```

Jira kann `{quote}` nicht schachteln. Vorschlag: innere Ebenen flach als
eingerueckten Text oder mit `bq.` je Zeile ausgeben, nur eine `{quote}`-Huelle.

## 2. Autolink auf E-Mail bekommt `mailto:` als sichtbaren Text

`<max@x.de>` -> `[mailto:max@x.de]` (Jira zeigt "mailto:max@x.de").
Vorschlag: `[max@x.de|mailto:max@x.de]`.

## 3. `|` in der URL bricht den Jira-Link

`[a|b](https://x.de/?q=1|2)` -> `[a\|b|https://x.de/?q=1|2]`. Der Strich in
der URL beendet den Link. Vorschlag: `|` in URLs als `%7C` kodieren.

## 4. Backslash am Zeilenende (CommonMark-Hardbreak) wird nicht erkannt

`Zeile zwei\` -> `Zeile zwei\` (Jira) bzw. `Zeile zwei\<br>` (HTML).
Vorschlag: `\\$` wie zwei Leerzeichen behandeln.

## 5. Fortsetzungsabsatz in Listen behaelt Einrueckung und bricht die Liste

```
- erster Punkt

  Fortsetzung.          ->   * erster Punkt
                             (leer)
- zweiter                      Fortsetzung.   (mit 2 Leerzeichen)
                             (leer)
                             * zweiter
```

Jira beginnt nach `* zweiter` eine neue Liste. Vorschlag: eingerueckten
Absatz an den Eintrag anhaengen (`\\` als Umbruch) oder Einrueckung entfernen.

## 6. Setext-Ueberschriften ohne `looksLikeMarkdown()`-Treffer

`Titel\n=====` wird korrekt zu `h1. Titel`, aber `looksLikeMarkdown()` meldet
`false` - per Automatik passiert also nichts, per Button schon. Vorschlag:
Muster `^={2,}\s*$` / `^-{2,}\s*$` unter einer Textzeile ergaenzen.

## 7. Indented-Code-Fence in Liste verliert die Position nicht, aber die Liste wird zerteilt

`- schritt\n\n  ```bash ...` -> Codeblock zwischen zwei getrennten Listen
(`* schritt`, `{code}`, `* naechster`). Jira nummeriert `#`-Listen danach
neu. Hinweis in der README oder Umbau auf Fortsetzung ohne Leerzeile.

## Tests

Je Punkt ein Node-Fall in `test/modules/converter/`.
