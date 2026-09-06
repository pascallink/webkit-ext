# Datenschutzerklaerung

Gilt fuer alle Erweiterungen in diesem Repository, derzeit
**PowerEdit for Jira** (`jira-markdown-converter`).

Stand: 5. September 2026

## Kurz

Es werden keine Daten erhoben, gespeichert oder uebertragen. Die Erweiterung
sendet nichts an Server - weder an eigene noch an fremde. Alles passiert im
Browser.

## Welche Daten verarbeitet werden

| Daten | Wo | Wozu | Wie lange |
| --- | --- | --- | --- |
| Eigene Einstellungen (Schalter, Verhalten im Rich-Text-Editor, eingetragene Jira-Adressen) | `chrome.storage` im Browserprofil | Damit die Erweiterung sich beim naechsten Start so verhaelt wie gewuenscht | Bis die Erweiterung deinstalliert oder die Einstellung geaendert wird |
| Text im Jira-Feld, im Popup oder in der Zwischenablage | nur im Arbeitsspeicher der Seite | Umwandlung von Markdown in Jira-Markup | Nur waehrend der Umwandlung; nichts davon wird gespeichert |

Die Einstellungen liegen im Browserprofil des Nutzers. Wer die Synchronisierung
seines Browsers eingeschaltet hat, synchronisiert sie ueber sein
Microsoft- bzw. Google-Konto mit - das ist eine Funktion des Browsers, nicht
der Erweiterung.

## Was nicht passiert

- Keine Erhebung personenbezogener Daten.
- Keine Uebertragung an Server, keine Netzwerkanfragen der Erweiterung.
- Keine Weitergabe oder Verkauf von Daten an Dritte.
- Keine Telemetrie, keine Analyse, keine Werbung.
- Kein nachgeladener Code: das Paket enthaelt kein `eval`, kein `new Function`
  und keine externen Skripte oder Stylesheets. Alles, was ausgefuehrt wird,
  liegt im Paket.

## Berechtigungen

Die Erweiterung fordert nur an, was sie fuer ihre Funktion braucht. Warum
welche Berechtigung noetig ist, steht je Erweiterung in ihrer README - fuer
PowerEdit for Jira im Abschnitt
[Berechtigungen](jira-markdown-converter/README.md#berechtigungen).

Auf selbst gehosteten Jira-Instanzen (Server / Data Center) ist die Erweiterung
erst aktiv, nachdem der Nutzer die Adresse selbst freigegeben hat. Der Browser
fragt dabei mit seinem eigenen Dialog nach.

## Quelltext

Der vollstaendige Quelltext liegt offen unter
<https://github.com/pascallink/webkit-ext> und laesst sich gegen das
ausgelieferte Paket pruefen.

## Kontakt

Fragen und Hinweise bitte als Issue:
<https://github.com/pascallink/webkit-ext/issues>
