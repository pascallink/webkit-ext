# Testprotokoll gegen die echte Instanz - DBREFI-10549 (Jira 9.12.2)

Durchlauf am 2026-09-11 in Edge 152 (Playwright-Harness mit der geladenen
Erweiterung, angemeldete Sitzung von Pascal). Rich-Text-Editor ist aktiv
(TinyMCE 6, `div.tox`); der Modus *Visuell*/*Text* ist eine Nutzereinstellung
fuer alle Felder und war zu Beginn *Visuell* - so wurde er auch hinterlassen.
Ergebnis je Zeile: **ok** / **Fehler** (+ Issue) / **offen**.

Hinterlassene Spuren im Ticket: ein Kommentar "PowerEdit-Test E (Rendering)"
(Rendering-Nachweis, absichtlich stehen gelassen) und die Beschreibung mit
`h2. Referenz` + `{code:java}` (Referenzinhalt fuer Issue 05).

## A. Kommentarfeld (Textmodus)

- [x] ok - *Kommentar* klicken: Leiste unter der Formatierungsleiste (im `.rte-container`), Schloss zu.
- [x] ok - `# Titel`, Liste, Tabelle -> *Umwandeln*: `h1. Titel`, `* a`, `||k||v||`.
- [x] ok - *Abbrechen* ohne Schloss zu oeffnen: Formular schliesst (Knoepfe liegen in der `.field-group`).
- [x] ok - danach reagiert die Seite (Issue 02 in 9.12.2 nicht reproduzierbar).
- [x] ok - *Hinzufuegen*: Kommentar erscheint, Seite reagiert, keine Nachfrage.
- [x] **Fehler 05** - Jira-Markup per Strg+V: `\{code:java\}` im Feld.
- [x] **Fehler 04** - `## Neu` + Liste mitten in `Satz eins. |Satz zwei.` per Strg+V: klebt.
- [x] **Fehler 19** - *Einfuegen*-Button: "Zwischenablage ist leer oder nicht lesbar." (HTTP-Instanz).
- [x] **Fehler 09** - Strg+V dann Strg+Z: Feld leer, auch das Getippte weg.
- [x] ok - `Escape` und Klick daneben: Feld bleibt offen (Schloss zu).
- [x] **Fehler 25** - Klick auf *Zuweisen* / *Bearbeiten* bei geschlossenem Schloss: Navigation zu `AssignIssue!default.jspa` / `EditIssue!default.jspa`, vorher `beforeunload`.
- [ ] offen - Zeile `-` allein per Strg+V (Issue 01, in den Fixtures reproduziert; in der Instanz nicht ausgeloest, weil es den Tab 25 s einfriert).
- [ ] offen - *Vorschau* waehrend eingefroren (Knopf im Kommentar nicht sauber adressiert).

## B. Kommentarfeld (Visuell)

- [x] ok - Leiste bleibt, "Ziel: Rich-Text-Editor (comment)", Schloss zu nach Klick in den Rahmen.
- [x] ok - Panel -> *Ins Ticket einfuegen* mit Ueberschrift, fett, Code, Link, Liste, Tabelle: kommt formatiert an; nach Umschalten auf *Text*: `h1. Ueberschrift`, `*fett* und {{code}} und [Link|https://example.org/]`, `* a`, `||k||v||`.
- [x] ok - Strg+V mit Markdown: "Formatiert eingefuegt.", als Wiki korrekt.
- [x] **Fehler 21** - *Code* -> Java: `<p><code class="language-java">` statt `<pre class="code panel">`; als Wiki `{{...}}`.
- [x] **Fehler 22** - *Panel* -> Warnung: `<div>` ohne Stil; als Wiki `*Warnung*`.
- [x] **Fehler 08** - das Panel landete vor dem eben eingefuegten Codeblock.
- [x] **Fehler 23** - *Vorher auf Markup-Modus umschalten* aktiv: Toast "Formatiert eingefuegt.", Modus bleibt *Visuell*.

## C. Beschreibung inline

- [x] ok (Text) - Leiste, Schloss zu nach Klick ins Feld; Klick auf Summary und `Escape`: Feld bleibt offen.
- [x] ok - Speichern (Haken): gespeichert, Codeblock gerendert, Sperre weg.
- [x] ok - Abbrechen ohne Schloss zu oeffnen: schliesst.
- [x] ok - Schloss offen, Klick daneben: Jira schliesst (und **speichert** - Jira-9-Verhalten).
- [x] **Fehler 20** (Visuell) - direkt nach dem Oeffnen: Schloss offen, Fokus im Rahmen, Klick daneben speichert den halb getippten Text.
- [x] ok (Visuell) - nach Klick in den Rahmen: Schloss zu, Klick daneben haelt.

## D. Dialog "Vorgang bearbeiten"

- [x] ok - Leisten an Beschreibung, Kommentar und `customfield_11004` (Textarea 5 Zeilen); Picker-Textareas (29 px) ohne Leiste.
- [x] ok - Klick in *Zusammenfassung* waehrend Beschreibung eingefroren: Fokus wechselt.
- [x] **Fehler 03** - Cursor in Beschreibung: `Escape` und *Abbrechen* blockiert; nach Schloss oeffnen geht es.
- [x] **Fehler 24** - Cursor in *Fix Version/s* (29-px-Textarea, kein Schloss): `Escape` und *Abbrechen* blockiert.
- [x] ok - *Aktualisieren*: speichert, Dialog zu.

## E. Rendering-Nachweise (Kommentar 103542, gerendertes HTML gelesen)

- [x] `[INFO]` -> `<span class="error">[INFO]</span>` (Issue 06).
- [x] `-oder-` -> `<del>oder</del>` (Issue 06).
- [x] `~30 ms bis ~50` und `x^2 und y^3` unveraendert - Jira braucht Wortgrenzen; `\~30 ms\~`, `x\^2\^`, `\[INFO\]`, `\-oder\-` rendern woertlich (Maskierung funktioniert).
- [x] `|a\|b|` und `|a&#124;b|` -> je **eine** Zelle `a|b` (Issue 07, Fix trivial).
- [x] `{{\{\{key\}\}}}` -> `{{<tt>key</tt>}}` (Issue 11, Maskierung hilft nicht).
- [x] `{code:java}` -> `div.code.panel > pre.code-java` (Wiki-Speicherung ueber Text- und Dialogpfad korrekt).

## F. Sonstiges

- [x] **Fehler 24** - Label-Dialog (`l`), Tippen im Feld: `Escape` blockiert, *Abbrechen* laedt die Seite neu.
- [x] **Fehler 15** - Loginseite: MD-Button vorhanden.
- [x] ok - Optionsseite: Einstellung *Vorher auf Markup-Modus umschalten* laesst sich setzen und wirkt im Jira-Tab ohne Reload (Toast-Weg wechselt nicht, siehe 23).
- [ ] offen - Kontextmenue auf einer Nicht-Jira-Seite (Issue 10).
- [ ] offen - Freigabe einer neuen Instanz ueber das Popup (nativer Berechtigungsdialog, nicht automatisierbar).

## Beobachtungen zur Instanz (fuer den Nachbau)

- Editor-Modus ist global je Nutzer; der Umschalter (`nav.editor-toggle-tabs
  li[data-mode] > button`) aendert ihn dauerhaft.
- Kommentarformular: `form.aui.top-label` (id vom hidden input `id`
  verdeckt), Knoepfe in `.save-options.wiki-button-bar` **innerhalb** der
  `.field-group.aui-field-wikiedit.comment-input`. Abbrechen/Absenden
  entfernen das Formular.
- Inline-Beschreibung: `#description-val.editable-field.active >
  form#description-form > .inline-edit-fields > .field-group` +
  `.save-options > button.submit / button.cancel`. Klick daneben speichert.
- Bearbeiten-Dialog: AUI-Dialog2 `#edit-issue-dialog`, Knoepfe in
  `.buttons-container.form-footer` ausserhalb der `.field-group`:
  `input#edit-issue-submit`, `button.aui-button-link.cancel` (ohne id).
- Rich-Text-Editor: `.rte-container > div.tox.tox-tinymce.jira-editor-container
  ... iframe#mce_N_ifr.tox-edit-area__iframe`, Body `#tinymce.mce-content-body`.
  Textarea traegt im visuellen Modus `richeditor-cover` und
  `data-rich-editor-active="true"`; im Textmodus steht `rich-editor#mce_N`
  im `.rte-container`. `.tox-tinymce` hat inline `visibility: hidden`, ist
  per Stylesheet aber sichtbar (Playwright-Klicks brauchen Koordinaten).
- Toolbar: echte Links mit `href` (`#edit-issue`, `#assign-issue`,
  Workflow `#action_id_N`), *Mehr* = `#opsbar-operations_more` mit
  `aui-item-link#link-issue`, `#edit-labels`.
- Label-Dialog `l`: Legacy `div#edit-labels-dialog.jira-dialog`,
  `textarea#labels-textarea`, `button#submit`, `a#cancel[href=/browse/KEY]`.
- Shifter `.`: `#shifter-dialog`, `input#shifter-dialog-field`,
  Treffer `li#kunden-referenz-35`, `li#link-83`; "Kunden Referenz" oeffnet
  `div#modal-field-view.jira-dialog` mit `input#customfield_10027`.
- Link-Dialog: `div#link-issue-dialog.jira-dialog`, Menue
  `button#add-web-link-link[data-url]`, Pane per AJAX mit
  `input#web-link-url`, `input#web-link-title`, Kommentar-Wikifeld,
  `input.aui-button[type=submit][name=Link]`.
