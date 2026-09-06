# Veroeffentlichungsprozess

Wer reicht was wohin ein - und in welcher Reihenfolge. Der Ablauf haengt an
der Versionierung des Repos ([`.github/CI.md`](../../../.github/CI.md)); der
Store bekommt nur, was dort schon durchgelaufen ist.

## Wer

| Rolle | Wer | Was |
| --- | --- | --- |
| Entwickler-Konto | `pascallink` | Microsoft-Partner-Center-Konto, das die Erweiterung besitzt. Ein zweites Konto braucht es nicht. |
| Einreichung | derselbe | Paket hochladen, Listung pflegen, Review beantworten. |
| Freigabe des Releases | derselbe | Tag und GitHub-Release, aus dem das ZIP faellt. |

## Reihenfolge

1. **Minor-Version setzen.** Der Store nimmt jede Einreichung nur mit einer
   hoeheren Version an. Version in `manifest.json` **und** `package.json` auf
   `x.y.0` heben - beide zusammen, sonst schlaegt `npm test` fehl. Der
   Patch-Bump nach jedem Merge auf `main` laeuft automatisch und ist fuer
   Store-Einreichungen nicht gedacht.
2. **`CHANGELOG.md` schreiben.** Der Abschnitt der neuen Version ist zugleich
   der Text fuer "Versionshinweise" im Partner Center.
3. **Gruen sein.** `npm run lint --prefix jira-markdown-converter` und
   `npm test --prefix jira-markdown-converter` muessen durchlaufen, dazu die
   CI auf `main`.
4. **Release anlegen.** Tag `x.y.0`, Release veroeffentlichen -
   [`release.yml`](../../../.github/workflows/release.yml) haengt
   `jira-markdown-converter-x.y.0.zip` und `jira-markdown-converter.zip` an.
   Das ZIP enthaelt nur Laufzeitdateien und ist genau das, was eingereicht
   wird; es wird nichts von Hand nachgepackt.
5. **Bild-Artefakte pruefen.** Haben sich Oberflaeche oder Logo geaendert:
   `npm run store:assets --prefix jira-markdown-converter` neu laufen lassen
   und die Ergebnisse aus `docs/store/assets/` committen.
6. **Im Partner Center einreichen.** Paket hochladen, Texte aus
   [`listing-de.md`](listing-de.md) und [`listing-en.md`](listing-en.md),
   Berechtigungsbegruendungen aus [`permissions.md`](permissions.md),
   Pruefer-Hinweise aus [`review-notes.md`](review-notes.md).
7. **Nach der Freigabe.** Store-Link in
   [`../../README.md`](../../README.md) und in der
   [Root-README](../../../README.md) eintragen; die Installation ueber den
   Store wird dort der empfohlene Weg, das entpackte Laden die Alternative
   fuer die Entwicklung.

Manuell in Edge (aktuelle Stable) gegen Jira Cloud **und** eine
Jira-Server-Instanz testen gehoert vor Schritt 4, nicht danach: die
Integrationstests laufen gegen nachgebaute Seiten, nicht gegen echtes Jira.

## Was sich zwischen Einreichungen aendern darf

| Aenderung | Neue Einreichung noetig |
| --- | --- |
| Code, Manifest, Version | ja |
| Beschreibungstexte, Screenshots, Logo | ja - Listung ist Teil der Einreichung |
| Support-URL, Datenschutz-URL | ja |
| Inhalt hinter der Datenschutz-URL | nein, solange die Aussage dieselbe bleibt |

## Automatisierung (offen)

Die [Edge Add-ons API](https://learn.microsoft.com/microsoft-edge/extensions-chromium/publish/api/using-addons-api)
kann das Hochladen und Veroeffentlichen uebernehmen: ein Schritt in
`release.yml`, direkt hinter dem Bauen des ZIPs, der das Paket an den
Produkt-Endpunkt schiebt und die Veroeffentlichung anstoesst.

Voraussetzungen, die dafuer erst geschaffen werden muessen:

- Ein Produkt im Partner Center - die Produkt-ID entsteht erst mit der ersten
  Einreichung von Hand. Die API kann kein neues Produkt anlegen.
- API-Zugangsdaten (Client-ID, API-Key) als Repository-Secrets.
- Die Listung selbst bleibt Handarbeit: die API schiebt Pakete, keine Texte
  und keine Bilder.

Bis dahin gilt Schritt 6 oben: von Hand einreichen.
