# OTRS-Flow: alle drei Schritte adressieren Dialoge, die es in Jira 9.12.2 so nicht gibt

**Labels:** bug, otrs, medium
**Schwere:** mittel - das Modul ist noch nicht verdrahtet (Issue 16); vor Sub-Task 4/5 muessen die Selektoren auf den echten DOM
**Nachgewiesen:** DOM-Geruest der Instanz jira.inxire.com 9.12.2 (Label-Dialog, Shifter, Feld-Modal, Link-Dialog), siehe `docs/mockup/mock-jira-912-issue-view.html`

## Befund je Schritt (`src/otrsflow.js`)

| Schritt | Code erwartet | Instanz 9.12.2 |
| --- | --- | --- |
| Label: Dialog | `#edit-labels-dialog` (ok), `#labels-textarea` (ok) | Legacy-JiraDialog `div#edit-labels-dialog.jira-dialog` |
| Label: bestaetigen | `#edit-labels-dialog .aui-dialog2-footer .aui-button-primary` | `.buttons-container.form-footer button#submit.aui-button` (kein `aui-button-primary`, kein `aui-dialog2-footer`) -> **Timeout** |
| Label: Fallback-Trigger | `#edit-labels`, `[data-fieldtype="labels"] .editable-field` | `#edit-labels` nur im Mehr-Menue; inline: `#wrap-labels .labels-wrap.editable-field` |
| Referenz: Schnellsuche | `#quick-search-dialog`, `#quick-search-input` | Shifter: `#shifter-dialog`, `input#shifter-dialog-field`, Treffer `li#kunden-referenz-35` in `#shifter-dialog-suggestions` -> **Timeout**, dann Fallback |
| Referenz: Dialog | `#customfield-dialog` + `input` + `.aui-dialog2-footer .aui-button-primary` | `div#modal-field-view.jira-dialog`, `input#customfield_10027.textfield.text.long-field`, `input.button[type="submit"]`, `a.cancel` |
| Referenz: Fallback inline | `[data-field-name="Kunden Referenz"] input`, `.customfield input` | Feld ist ohne Wert in der Ansicht **nicht vorhanden** - nur ueber den Shifter erreichbar |
| Web-Link: Dialog | `#link-issue-dialog` (ok) | Legacy-JiraDialog, Menue links `ul.dialog-menu > button#add-web-link-link[data-url]` |
| Web-Link: Reiter | `.aui-tabs .menu-item a[href="#web-link"]`, `#web-link.active-pane` | kein Reiter; Pane wird per AJAX nachgeladen: `input#web-link-url[name=url]`, `input#web-link-title[name=title]`, Kommentar-Wikifeld |
| Web-Link: bestaetigen | `.aui-dialog2-footer .aui-button-primary` | `.buttons-container input.aui-button[type="submit"][name="Link"]` |
| Web-Link: oeffnen | Schnellsuche "link" | Shifter "Link" -> `li#link-83`; oder Mehr-Menue `#opsbar-operations_more` -> `aui-item-link#link-issue` |

Weitere Beobachtungen: `.` fokussiert den Shifter auch, wenn kein Vorgang
bearbeitet wird; `pingJiraTrace()` sieht `window.JIRA` in der isolierten
Welt nie (Issue 16).

## Vorschlag

- Selektoren auf die Tabelle umstellen und den Nachbau
  (`docs/mockup`, Zustaende `labels`, `shifter`, `link`) als Fixture fuer
  `test/modules/otrs/browser/otrsflow.test.js` verwenden; das bisherige
  `mock-jira-otrs.html` ersetzen.
- Bestaetigen generisch: `form` des Dialogs per `requestSubmit()` statt
  Primaerbutton suchen.
- Vor Sub-Task 4 (Dialog) den Ablauf einmal in DBREFI-10549 fahren.
