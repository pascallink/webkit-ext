# Berechtigungen begruenden

Der Edge Add-ons Store verlangt zu jeder Berechtigung einen Grund. Die Texte
unten sind zum Uebernehmen ins Partner Center gedacht - je Zeile eine
Berechtigung, kurz und ohne Marketing. Grundlage ist die Tabelle
"Berechtigungen" in [`../../README.md`](../../README.md); wer dort etwas
aendert, aendert es hier mit.

Massgeblich ist immer, was in [`../../manifest.json`](../../manifest.json)
steht. Was da nicht drin ist, wird auch nicht begruendet - eine ungenutzte
Berechtigung ist der einfachste Weg in die Rueckfrage.

## Pflicht-Berechtigungen

| Berechtigung | Begruendung fuer das Partner Center |
| --- | --- |
| `storage` | Speichert die Einstellungen der Erweiterung (Automatik an/aus, Verhalten im Rich-Text-Editor, eigene Jira-Adressen) im Browserprofil, dazu die selbst angelegten Vorlagen im geraetelokalen Speicher (`chrome.storage.local`) - sie werden bewusst nicht synchronisiert. Es werden keine Inhalte von Seiten gespeichert und nichts an Server gesendet. |
| `contextMenus` | Legt zwei Eintraege an: "Markierten Text in Jira-Markup umwandeln" im Rechtsklick-Menue auf einer Jira-Seite und einen Haken-Eintrag am Symbol der Erweiterung, mit dem die Einfuege-Automatik umgeschaltet wird. |
| `scripting` | Registriert das Content-Script nachtraeglich auf den Jira-Adressen, die der Nutzer selbst freigegeben hat (Jira Server / Data Center). Ohne das waeren selbst gehostete Instanzen nur nach einem Neustart des Browsers erreichbar. Es wird ausschliesslich der mitgelieferte Code aus dem Paket registriert, nie nachgeladener. |
| `activeTab` | Liest die Adresse des aktiven Tabs, wenn der Nutzer das Popup oeffnet - nur um ihm anzubieten, genau diese Jira-Adresse freizugeben, und um die Seite nach der Freigabe neu zu laden. Es wird kein Seiteninhalt gelesen. |

## Host-Berechtigungen

| Muster | Art | Begruendung fuer das Partner Center |
| --- | --- | --- |
| `https://*.atlassian.net/*` | fest | Jira Cloud. Dort liegt der Editor, in dem die Erweiterung ihre Buttonleiste einbaut und Markdown in Jira-Markup umwandelt. Enger geht es nicht: die Instanz jedes Kunden hat ihre eigene Subdomain unter atlassian.net. |
| `*://*/*` | optional | **Nicht** beim Installieren erteilt. Jira Server / Data Center laeuft unter einer beliebigen Firmenadresse (`jira.firma.de`, `http://jira:8080/`), die erst der Nutzer kennt. Er traegt sie selbst ein - im Popup ueber "Diese Jira-Adresse freigeben" oder in den Einstellungen -, und die Erweiterung fordert daraufhin ueber `chrome.permissions.request()` genau eine Origin an: `*://<eingetragener-host>/*`. Der Browser zeigt dabei seinen eigenen Zustimmungsdialog fuer genau diesen Host. Ohne diesen Schritt ist die Erweiterung auf keiner Seite ausserhalb von `*.atlassian.net` aktiv. |

### Warum `*://*/*` nicht enger gefasst werden kann

Manifest V3 laesst zur Laufzeit nur Origins anfordern, die im Manifest bereits
als Muster stehen. Die Adresse einer selbst gehosteten Jira-Instanz ist zur
Bauzeit unbekannt, also gibt es kein engeres Muster, das sie abdeckt - jede
Einschraenkung wuerde einen Teil der Nutzer aussperren. Das breite Muster ist
darum eine **Obergrenze fuer das, was der Nutzer freigeben kann**, keine
Berechtigung, die die Erweiterung haette.

Zur Ueberpruefung durch das Review-Team:

- Deklaration: `optional_host_permissions` in `manifest.json` - nicht
  `host_permissions`. Beim Installieren wird davon nichts erteilt.
- Anforderung: `chrome.permissions.request({ origins: [pattern] })` in
  `popup/popup.js` und `options/options.js`. Beides sitzt hinter einem Klick.
- Erzeugung des Musters: `hostPattern()` in `src/settings.js` baut aus dem
  normalisierten Host genau ein `*://<host>/*`. Ein blankes `*` wird von
  `normalizeHost()` verworfen, ein Muster fuer alle Seiten kann also nicht
  entstehen.
- Nutzung: `chrome.scripting.registerContentScripts()` in `src/background.js`,
  ausschliesslich fuer die Hosts aus `extraHosts` in den Einstellungen.

## Was nicht im Manifest steht

- `clipboardRead` stand fruher als optionale Berechtigung im Manifest, wurde
  aber nie angefordert. Gelesen wird die Zwischenablage ueber
  `navigator.clipboard.readText()` - hinter einem Klick des Nutzers, was ohne
  zusaetzliche Berechtigung erlaubt ist. Die Zeile ist entfernt.
- `tabs` wird nicht gebraucht: fuer das Neuladen nach der Freigabe genuegt
  `activeTab`.
- `host_permissions` fuer Jira-Server-Adressen gibt es bewusst nicht - siehe
  oben, das ist die Rolle des optionalen Musters.

## Datennutzung im Partner Center

Die Fragen zur Datennutzung sind alle mit "nein" zu beantworten:

| Frage | Antwort |
| --- | --- |
| Werden personenbezogene Daten erhoben? | Nein |
| Werden Daten an Dritte weitergegeben? | Nein |
| Werden Daten verkauft? | Nein |
| Werden Daten fuer Werbung genutzt? | Nein |
| Wird Code aus dem Netz nachgeladen? | Nein - das Paket enthaelt kein `eval`, kein `new Function` und keine externen Skripte. |

Belege dafuer liegen im Repository: [`../../../PRIVACY.md`](../../../PRIVACY.md)
haelt die Aussage fest, `test/package.test.js` prueft bei jedem Lauf, dass im
Auslieferungscode nichts nachgeladen wird.
