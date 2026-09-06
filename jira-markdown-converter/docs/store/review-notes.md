# Hinweise fuer die Pruefer

Text fuer das Feld "Notes for certification" im Partner Center. Beide Fassungen
sagen dasselbe; eingereicht wird die englische, weil das Review-Team englisch
arbeitet.

Der Punkt, der ohne Hinweis schiefgeht: Die Erweiterung wirkt auf Jira-Seiten,
und ein Pruefer hat in aller Regel keine Jira-Instanz. Deshalb steht der Weg,
der **ohne Jira** funktioniert, ganz oben - das Popup ist ein vollstaendiger
Konverter.

## English (einzureichen)

```
NO ACCOUNT OR LOGIN IS NEEDED TO TEST THIS EXTENSION.

The fastest way to see everything it does, without access to a Jira instance:

1. Click the extension icon in the toolbar. The popup is a complete converter.
2. Paste or type Markdown into the upper field, for example:

   # Release notes
   Some **bold** text and a `snippet`.
   - [x] done
   - [ ] open

   | Column | Value |
   | --- | --- |
   | a | 1 |

3. The lower field immediately shows the converted Jira wiki markup
   ("h1. Release notes", "*bold*", "{{snippet}}", "* (/) done", "||Column||").
4. "Kopieren" copies the result to the clipboard. "In Jira einfuegen" is only
   active when a Jira page is open in the current tab.
5. Open the options page (link "Einstellungen" in the popup, or
   edge://extensions -> Details -> Extension options). It contains a live
   preview field at the bottom that converts as you type - a second way to
   exercise the converter with no Jira page involved.

The user interface is German. The extension is aimed at German-speaking Jira
users; the English store listing describes the same functionality.

TESTING AGAINST A REAL JIRA (optional)

On https://*.atlassian.net the extension activates automatically - any free
Jira Cloud trial site works. Open an issue, start editing the description, and
a button bar appears above the field.

HOST PERMISSIONS

The extension declares "*://*/*" under optional_host_permissions, never under
host_permissions. It is not granted at install time and the extension is
inactive on every site outside *.atlassian.net until the user grants a host
explicitly.

The reason for the broad pattern: self-hosted Jira Server / Data Center runs
under an arbitrary company address (jira.example.com, http://jira:8080/) that
cannot be known at build time. The user enters that address himself - in the
popup ("Diese Jira-Adresse freigeben") or in the options - and the extension
then calls chrome.permissions.request() for exactly one origin,
"*://<that-host>/*", which triggers the browser's own consent prompt. The
pattern is an upper bound on what the user can grant, not a permission the
extension holds. Relevant code: hostPattern() in src/settings.js,
chrome.permissions.request() in popup/popup.js and options/options.js,
chrome.scripting.registerContentScripts() in src/background.js.

PRIVACY AND REMOTE CODE

No data is collected or transmitted. All conversion happens locally. The
package contains no eval(), no new Function(), and loads no external scripts
or styles - every referenced file ships inside the package. The only stored
data is the user's own settings, via chrome.storage.

Source code: https://github.com/pascallink/webkit-ext
```

## Deutsch (Referenz)

```
ZUM TESTEN WIRD KEIN KONTO UND KEIN LOGIN GEBRAUCHT.

Der schnellste Weg, ohne Zugang zu einer Jira-Instanz:

1. Auf das Symbol der Erweiterung in der Symbolleiste klicken. Das Popup ist
   ein vollstaendiger Konverter.
2. Markdown ins obere Feld einfuegen oder tippen.
3. Das untere Feld zeigt sofort das umgewandelte Jira-Wiki-Markup.
4. "Kopieren" legt das Ergebnis in die Zwischenablage. "In Jira einfuegen" ist
   nur aktiv, wenn im aktuellen Tab eine Jira-Seite offen ist.
5. Die Einstellungsseite (Link "Einstellungen" im Popup) hat unten ein
   Probierfeld mit Sofortvorschau - der zweite Weg ohne Jira-Seite.

Auf https://*.atlassian.net aktiviert sich die Erweiterung von selbst; jede
kostenlose Jira-Cloud-Testinstanz genuegt.

Das breite Muster "*://*/*" steht unter optional_host_permissions, nicht unter
host_permissions - es wird beim Installieren nicht erteilt. Selbst gehostete
Jira-Instanzen laufen unter beliebigen Firmenadressen, die zur Bauzeit
unbekannt sind; der Nutzer traegt seine Adresse selbst ein, und die Erweiterung
fordert daraufhin genau diese eine Origin an.

Es werden keine Daten erhoben oder uebertragen, es wird kein Code nachgeladen,
das Paket enthaelt kein eval() und keine externen Skripte.

Quelltext: https://github.com/pascallink/webkit-ext
```

## Testzugang zu einer Jira-Instanz

Es werden bewusst **keine** Zugangsdaten mit eingereicht. Der Konverter im
Popup und das Probierfeld auf der Einstellungsseite decken die Pruefung
vollstaendig ab; eine Jira-Cloud-Testinstanz legt sich das Review-Team in
Minuten selbst an, falls es die Buttonleiste im Ticket sehen will.

Wird trotzdem nach einem Zugang gefragt: eine frische Jira-Cloud-Testinstanz
anlegen, einen Nutzer mit Leserechten auf ein einzelnes Testprojekt einrichten
und die Daten **ueber die Rueckfrage im Partner Center** nachreichen, nicht im
Repository ablegen.
