# Einreichung im Microsoft Edge Add-ons Store

Alles, was fuer die Einreichung von "PowerEdit for Jira" im
[Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)
gebraucht wird, liegt hier - fertig zum Uebernehmen. `docs/` faellt beim Packen
raus, nichts davon landet im ausgelieferten Paket.

| Datei | Inhalt |
| --- | --- |
| [`listing-de.md`](listing-de.md) | Name, Kurz- und Langbeschreibung, Kategorie, URLs - deutsch (Standardsprache) |
| [`listing-en.md`](listing-en.md) | dieselbe Listung auf Englisch |
| [`permissions.md`](permissions.md) | Begruendung je Berechtigung, dazu die Antworten zur Datennutzung |
| [`review-notes.md`](review-notes.md) | Testanleitung fuer die Pruefer (ohne Jira-Zugang testbar) |
| [`publishing.md`](publishing.md) | Wer reicht wann was ein, und was danach im Repo nachzuziehen ist |
| [`assets/`](assets/) | Logo 300x300, Promo-Tile, Screenshots 1280x800 |
| [`build-assets.js`](build-assets.js) | baut die Bilder aus `assets/logo.svg` und `docs/images/` neu |

## Bilder neu bauen

```bash
npm run store:assets --prefix jira-markdown-converter
```

Quellen sind `assets/logo.svg` und die Screenshots in `../images/`; Ziele sind
`assets/logo-300.png`, `assets/promo-tile-1400x560.png` und
`assets/screenshots/`. Kein Bildbearbeitungsprogramm noetig, jedes eingereichte
Bild ist damit reproduzierbar. Groessen und Anzahl prueft `test/package.test.js`
bei jedem Testlauf mit.

## Stand der Einreichung

Erledigt ist alles, was im Repository liegen kann. Offen ist, was nur im
Partner Center oder an einem echten Edge passieren kann.

### Erledigt

- [x] Einreichungs-ZIP: entsteht in
      [`release.yml`](../../../.github/workflows/release.yml) und enthaelt nur
      Laufzeitdateien (`manifest.json`, `src/`, `popup/`, `options/`, `icons/`).
- [x] `manifest.json`: `manifest_version: 3`, Version synchron mit
      `package.json`, `description` unter 132 Zeichen und ohne Umlaute,
      `homepage_url` auf das Repository.
- [x] `minimum_chrome_version: "102"` geprueft - entspricht Edge 102 (Mai 2022)
      und damit deutlich unter jeder von Microsoft unterstuetzten Version. Bleibt
      wie es ist.
- [x] Ungenutzte optionale Berechtigung `clipboardRead` entfernt.
- [x] Icons 16/32/48/128 vorhanden, Store-Logo 300x300 in
      [`assets/logo-300.png`](assets/logo-300.png).
- [x] Berechtigungsbegruendungen, inklusive der Begruendung fuer
      `optional_host_permissions: ["*://*/*"]` - siehe
      [`permissions.md`](permissions.md).
- [x] Geprueft, ob `*://*/*` enger gefasst werden kann: **nein**. MV3 laesst zur
      Laufzeit nur Origins anfordern, die im Manifest stehen, und die Adresse
      einer selbst gehosteten Jira-Instanz ist zur Bauzeit unbekannt. Das Muster
      ist eine Obergrenze fuer das, was der Nutzer freigeben kann, keine erteilte
      Berechtigung.
- [x] Beschreibungstexte deutsch und englisch.
- [x] Screenshots 1280x800 (fuenf Stueck) und Promo-Tile 1400x560.
- [x] Datenschutzerklaerung: [`PRIVACY.md`](../../../PRIVACY.md), erreichbar
      unter `https://github.com/pascallink/webkit-ext/blob/main/PRIVACY.md`.
- [x] Lizenz: [`LICENSE`](../../../LICENSE) (MIT).
- [x] Markenfrage: "PowerEdit" traegt den Namen, "for Jira" beschreibt nur den
      Einsatzzweck; der Hinweis auf die fehlende Verbindung zu Atlassian steht
      am Ende beider Beschreibungen.
- [x] Testanleitung fuer die Pruefer: [`review-notes.md`](review-notes.md).
- [x] Keine Remote-Code-Ausfuehrung: kein `eval`, kein `new Function`, keine
      externen Skripte oder Styles - `test/package.test.js` prueft das bei jedem
      Lauf.
- [x] Veroeffentlichungsprozess dokumentiert: [`publishing.md`](publishing.md).

### Offen - Handarbeit ausserhalb des Repos

- [ ] Verfuegbarkeit des Namens "PowerEdit for Jira" im Store pruefen.
- [ ] `default_locale` + `_locales/` **nur falls** die Oberflaeche selbst
      zweisprachig werden soll. Fuer die Listung reicht die zweite
      Listungssprache im Partner Center; die Oberflaeche ist bewusst deutsch.
      Nicht Teil dieser Einreichung.
- [ ] `npm run lint` und `npm test` unmittelbar vor der Einreichung gruen
      (CI-Lauf auf `main` genuegt).
- [ ] Manuell in Edge Stable gegen Jira Cloud **und** eine
      Jira-Server-Instanz testen.
- [ ] Screenshots gegensehen: die Quellbilder in `../images/` zeigen die
      Oberflaeche der Erweiterung, `schloss-zu.png` allerdings auf einer
      nachgebauten Jira-Seite aus `test/fixtures/`. Wer bei diesem Termin
      ohnehin an einer echten Instanz sitzt, nimmt es dort neu auf und laesst
      `store:assets` erneut laufen - der Rahmen baut sich von selbst.
- [ ] Im Partner Center einreichen: Paket, Listung, Berechtigungen,
      Datennutzung, Pruefer-Hinweise.
- [ ] Review bestehen.
- [ ] Nach der Freigabe: Store-Link in beide READMEs, Installationsabschnitt
      auf den Store als empfohlenen Weg umstellen (siehe
      [`publishing.md`](publishing.md), Schritt 7).
- [ ] Optional: Einreichung ueber die Edge Add-ons API automatisieren - geht
      erst, wenn das Produkt einmal von Hand eingereicht wurde und eine
      Produkt-ID hat.
