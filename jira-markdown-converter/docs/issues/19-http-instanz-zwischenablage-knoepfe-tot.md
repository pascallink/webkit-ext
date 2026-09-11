# Auf einer HTTP-Instanz sind Einfuegen, "Aus Zwischenablage" und beide Kopieren-Knoepfe tot

**Labels:** bug, content, popup, high
**Schwere:** hoch - jira.inxire.com laeuft ueber `http://`; dort meldet jeder dieser Knoepfe "Zwischenablage ist leer oder nicht lesbar" bzw. "Kopieren nicht moeglich"
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Edge 152: Leisten-Button *Einfuegen* -> Toast "Zwischenablage ist leer oder nicht lesbar.", obwohl die Zwischenablage gefuellt war

## Beschreibung

`navigator.clipboard` existiert nur in sicheren Kontexten (HTTPS,
`localhost`). Auf `http://jira.inxire.com` ist es `undefined`, darum:

- `readClipboard()` liefert sofort `''` -> *Einfuegen* in der Leiste und
  *Aus Zwischenablage* im Panel tun nichts.
- `copyText()` / `copyRich()` -> *Markup kopieren*, *Formatiert kopieren* im
  Panel und im Code-Dialog melden "Kopieren nicht moeglich".

Das Popup (Erweiterungsseite, sicherer Kontext) ist nicht betroffen;
`Strg+V` funktioniert weiterhin ueber das `paste`-Ereignis.

README, Store-Text und `permissions.md` erwaehnen `http://` ausdruecklich
als unterstuetzt ("`http://jira:8080/` funktioniert also ebenso").

## Vorschlag

- Lesen: den Nutzer auf `Strg+V` verweisen, wenn `navigator.clipboard`
  fehlt - Toast "Auf http-Seiten bitte Strg+V benutzen" statt der
  irrefuehrenden Meldung; Button-Tooltip entsprechend.
- Schreiben: Rueckfall auf `document.execCommand('copy')` mit einem
  temporaeren Textfeld (funktioniert auch auf http) - fuer *Formatiert
  kopieren* ueber ein `copy`-Ereignis mit `clipboardData.setData('text/html', ...)`.
- README/Store: die Einschraenkung nennen, solange es keinen Rueckfall gibt.
- Test in der Ebene `ext`: Fixture ueber `http://127.0.0.1` ist ebenfalls
  ein sicherer Kontext - der Fall braucht eine Seite unter einem Hostnamen
  (`http://mock.local`, Eintrag in `/etc/hosts`) oder einen Stub, der
  `navigator.clipboard` entfernt.
