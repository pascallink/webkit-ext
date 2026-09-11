# Jira 9.12 - verifizierte Dialogstruktur

Quelle: DOM-Auszug und Screenshots aus der produktiven Instanz, angehaengt an
[Issue #17](https://github.com/pascallink/webkit-ext/issues/17)
(`jira-dialogs.html`). Ticketnummern und Tokens sind hier neutralisiert - die
Struktur ist unveraendert.

Grundlage fuer die Fixture in Sub-Task 2 und die Selektoren in Sub-Task 3 des
[Ausfuehrungsplans](issue-17-ausfuehrungsplan.md).

## Was der Auszug widerlegt

Der erste Entwurf ging von AUI-Dialog2 aus. Die Instanz benutzt die aeltere
`jira-dialog`-Familie:

| Annahme im ersten Entwurf | Wirklichkeit |
| --- | --- |
| `.aui-dialog2` | `.jira-dialog.jira-dialog-core.jira-dialog-open` - **kein** `aui-dialog2` |
| `#quick-search-dialog` / `#quick-search-input` | `#shifter-dialog` / `#shifter-dialog-field` (Platzhalter "Find Actions...") |
| `#customfield-dialog` | `#modal-field-view` - **beide** Custom-Field-Dialoge teilen sich diese id |
| `.aui-dialog2-footer .aui-button-primary` | je Dialog ein anderer Button, siehe unten |
| `.aui-tabs .menu-item a[href="#web-link"]` | `ul.dialog-menu > li > button#add-web-link-link` |
| `#weblink-url` / `#weblink-linktext` | `#web-link-url` / `#web-link-title` |
| Feldname reicht als Anker | zusaetzlich die id noetig: `customfield_10027` |

Zwei weitere Punkte, die den Ablauf betreffen:

* **Die Oberflaeche ist englisch**, nur der Feldname ist deutsch
  ("Edit Kunden Referenz for ABC-123"). Selektoren duerfen nicht an deutschen
  UI-Texten haengen.
* **`#web-link-url` ist mit `http://` vorbelegt** und beim Oeffnen markiert.
  Der Wert muss ersetzt werden, nicht angehaengt.

## 1. Shifter (Taste `.`)

Der Dialog hinter dem Punkt heisst Shifter, nicht Quick Search. Er ist kein
`jira-dialog`, sondern ein eigenes Element.

```html
<div class="shifter-dialog" id="shifter-dialog">
  <form class="aui ajs-dirty-warning-exempt">
    <div class="queryable-select" id="shifter-dialog-queryable-container" data-query="">
      <input role="combobox" class="text" id="shifter-dialog-field" type="text"
             placeholder="Find Actions..." aria-controls="shifter-dialog-suggestions"
             aria-activedescendant="summary-1">
    </div>
    <div id="shifter-dialog-suggestions" class="aui-list">
      <div class="aui-list-scroll">
        <div class="shifter-group-heading"><h5>Edit Fields</h5>
          <span class="shifter-group-context">ABC-123</span></div>
        <ul class="aui-list-section" role="listbox" id="edit-fields">
          <li class="aui-list-item aui-list-item-li-summary active" role="option" id="summary-1">
            <span class="aui-list-item-link">Summary</span></li>
          <li class="aui-list-item aui-list-item-li-release-notes" role="option" id="release-notes-2">
            <span class="aui-list-item-link">Release Notes</span></li>
        </ul>
        <div class="shifter-group-heading"><h5>Issue Actions</h5>
          <span class="shifter-group-context">ABC-123</span></div>
        <ul class="aui-list-section aui-last" role="listbox" id="issue-actions"></ul>
      </div>
    </div>
  </form>
  <div class="hint-container">Pressing period (<kbd>.</kbd>) opens this dialog box</div>
</div>
```

Wichtig fuer die Automation:

* Eingabe geht in `#shifter-dialog-field`, Treffer stehen in
  `#shifter-dialog-suggestions`.
* Zwei Gruppen: `ul#edit-fields` (Felder) und `ul#issue-actions` (Aktionen).
  Das Feld "Kunden Referenz" landet in `#edit-fields`, die Aktion "Link" in
  `#issue-actions`.
* Jeder Treffer traegt eine **aus dem Namen abgeleitete Klasse**:
  `li.aui-list-item-li-kunden-referenz`, `li.aui-list-item-li-link`. Das ist der
  belastbarste Anker - stabiler als die Position und stabiler als die id
  (`kunden-referenz-1`), deren Zaehler sich mit der Trefferliste verschiebt.
* `li.active` ist der Eintrag, den `Return` auswaehlt. Vor dem Bestaetigen
  pruefen, dass `active` auch der gemeinte Treffer ist - sonst gezielt klicken.

## 2. Labels (Taste `l`)

```html
<div id="edit-labels-dialog" role="dialog" aria-modal="true"
     class="jira-dialog jira-dialog-core box-shadow jira-dialog-open popup-width-medium jira-dialog-content-ready">
  <div class="jira-dialog-heading jira-dialog-core-heading">
    <h2 tabindex="-1" id="edit-labels-dialog-title">Labels: ABC-123</h2>
  </div>
  <div class="jira-dialog-content jira-dialog-core-content">
    <form class="aui edit-labels" id="edit-labels-form">
      <div class="form-body">
        <input name="id" type="hidden" value="10001">
        <div class="field-group aui-field-labelpicker">
          <label for="labels-textarea">Labels</label>
          <div class="jira-multi-select long-field" id="labels-multi-select">
            <textarea role="combobox" aria-autocomplete="list" id="labels-textarea"
                      class="text long-field" wrap="off"></textarea>
            <div class="aui-list" id="labels-suggestions"></div>
            <div class="representation"><ul class="items" role="listbox"></ul></div>
          </div>
          <select id="labels" class="multi-select hidden long-field edit-labels-inline multi-select-select"
                  multiple="multiple" name="labels"></select>
        </div>
        <div class="field-group">
          <input class="checkbox" id="send-notifications" name="sendNotification" type="checkbox" value="true">
          <label for="send-notifications">Send Notification</label>
        </div>
        <input name="atl_token" type="hidden" value="...">
      </div>
      <div class="buttons-container form-footer"><div class="buttons">
        <button class="aui-button" id="submit" name="edit-labels-submit" type="submit" value="Update">Update</button>
        <a class="aui-button aui-button-link cancel" id="cancel" href="/browse/ABC-123">Cancel</a>
      </div></div>
    </form>
  </div>
</div>
```

* Geschrieben wird in `#labels-textarea`, **nicht** in `select#labels` - das
  fuellt die Multi-Select-Mechanik selbst.
* Bestaetigt wird mit `#edit-labels-dialog #submit`.
* `#send-notifications` bleibt unberuehrt (Standard: nicht gesetzt).

## 3. Custom Field ueber den Shifter

Beide Custom-Field-Dialoge haben dieselbe id `#modal-field-view` und denselben
Titel-Knoten `h2#modal-field-view-title`. **Unterschieden wird ueber das Feld
im Rumpf, nicht ueber den Dialog.**

### 3a. "Kunden Referenz" - das Ziel (Klartextfeld)

```html
<div id="modal-field-view" role="dialog" aria-modal="true"
     class="jira-dialog jira-dialog-core box-shadow jira-dialog-open popup-width-medium jira-dialog-content-ready">
  <div class="jira-dialog-heading jira-dialog-core-heading">
    <h2 tabindex="-1" id="modal-field-view-title">Edit Kunden Referenz for ABC-123</h2>
  </div>
  <div class="jira-dialog-content jira-dialog-core-content"><div class="aui-dialog-content">
    <form action="" class="aui" method="post">
      <div class="form-body">
        <div class="field-group">
          <input class="textfield text long-field" id="customfield_10027"
                 name="customfield_10027" type="text" value="">
          <div class="description" id="customfield_10027-description">Referenz auf inxire Ticket System</div>
        </div>
      </div>
      <div class="buttons-container form-footer"><div class="buttons">
        <input class="button" type="submit" value="Submit">
        <a class="cancel" href="#">Cancel</a>
      </div></div>
    </form>
  </div></div>
</div>
```

### 3b. "Customer Jira Key" - Verwechslungsgefahr, nicht anfassen

```html
<h2 id="modal-field-view-title">Edit Customer Jira Key for ABC-123</h2>
...
<div class="jira-multi-select long-field" id="customfield_10900-multi-select">
  <textarea role="combobox" id="customfield_10900-textarea" class="text long-field"></textarea>
  <div class="aui-list" id="customfield_10900-suggestions"></div>
</div>
<select class="multi-select long-field hidden edit-labels-inline multi-select-select"
        id="customfield_10900" data-clone-to="customfield_10900-textarea"
        multiple="multiple" name="customfield_10900"></select>
<div class="description" id="customfield_10900-description">e.g. Cargo REG40-XXXX</div>
```

`customfield_10900` ist ein Label-Picker wie das Labels-Feld, `customfield_10027`
ein einfaches Textfeld. Ein Selektor wie `#modal-field-view input[type="text"]`
trifft beide Dialoge - deshalb muss die Automation zusaetzlich die id oder den
Titel pruefen.

## 4. Link -> Web Link

```html
<div id="link-issue-dialog" role="dialog" aria-modal="true"
     class="jira-dialog jira-dialog-core box-shadow jira-dialog-open popup-width-large jira-dialog-content-ready">
  <div class="jira-dialog-heading jira-dialog-core-heading">
    <h2 tabindex="-1" id="link-issue-dialog-title">Link</h2>
  </div>
  <div class="jira-dialog-content jira-dialog-core-content">
    <div class="aui-group">
      <div class="aui-item dialog-menu-group"><ul class="dialog-menu">
        <li><button id="add-jira-issue-link-link" class="dialog-menu-item"
                    data-url="/secure/LinkJiraIssue!default.jspa?id=10001">Jira Issue</button></li>
        <li><button id="add-confluence-page-link-link" class="dialog-menu-item"
                    data-url="/secure/LinkConfluencePage!default.jspa?id=10001">Confluence Page</button></li>
        <li><button id="add-web-link-link" class="dialog-menu-item selected"
                    data-url="/secure/AddWebLink!default.jspa?id=10001">Web Link</button></li>
      </ul></div>
      <div class="aui-item dialog-pane">
        <form id="web-issue-link" class="aui dnd-attachment-support">
          <input type="hidden" id="web-link-icon-url" name="iconUrl" value="">
          <input name="atl_token" type="hidden" value="...">
          <div class="form-body">
            <div class="field-group">
              <label for="web-link-url">URL<span class="aui-icon icon-required">required</span></label>
              <input type="text" class="text full-width-field" id="web-link-url" name="url" value="http://">
              <div id="web-link-url-description" class="description">Enter the URL of the page to link</div>
            </div>
            <div class="field-group">
              <label for="web-link-title">Link Text<span class="aui-icon icon-required">required</span></label>
              <input type="text" class="text full-width-field" id="web-link-title" name="title" value="">
            </div>
            <div class="field-group aui-field-wikiedit comment-input">
              <label for="comment">Comment</label>
              <textarea class="textarea long-field wiki-textfield" id="comment" name="comment"></textarea>
            </div>
          </div>
          <div class="buttons-container form-footer"><div class="buttons">
            <input class="aui-button" name="Link" type="submit" value="Link">
            <a class="aui-button aui-button-link cancel" href="/browse/ABC-123">Cancel</a>
          </div></div>
        </form>
      </div>
    </div>
  </div>
</div>
```

* Der Reiterwechsel ist ein Klick auf `button#add-web-link-link`; der aktive
  Eintrag traegt `.selected`. Ist er schon gesetzt, entfaellt der Klick.
* Der Rumpf wird per AJAX aus `data-url` nachgeladen - nach dem Klick auf
  `#web-issue-link` warten, nicht auf den Dialog.
* `#web-link-url` steht auf `http://`. Ersetzen, nicht ergaenzen.
* `#web-link-title` ist Pflichtfeld ("Link Text required").
* Das Kommentarfeld bleibt leer.

## Selektoren auf einen Blick

| Zweck | Selektor |
| --- | --- |
| Ein offener Dialog | `.jira-dialog.jira-dialog-open` |
| Shifter | `#shifter-dialog`, Eingabe `#shifter-dialog-field` |
| Shifter-Treffer | `#shifter-dialog-suggestions li.aui-list-item-li-<slug>` |
| Labels-Dialog | `#edit-labels-dialog`, Eingabe `#labels-textarea`, Bestaetigen `#submit` |
| Custom Field | `#modal-field-view`, Titel `#modal-field-view-title` |
| Kunden Referenz | `#modal-field-view input#customfield_10027` |
| Bestaetigen (Custom Field) | `#modal-field-view .buttons input[type="submit"]` |
| Link-Dialog | `#link-issue-dialog`, Reiter `#add-web-link-link` |
| Web-Link-Formular | `#web-issue-link`, `#web-link-url`, `#web-link-title` |
| Bestaetigen (Link) | `#web-issue-link input[name="Link"]` |

## Was der Auszug nicht hergibt

* **Kein Zwischenzustand.** Der Auszug zeigt die fertigen Dialoge, nicht die
  Ladephase. Wie lange Jira zwischen Tastendruck und fertigem Formular braucht,
  bleibt Annahme - `waitForElement` bleibt Pflicht.
* **Keine Fehlerpfade.** Pflichtfeldverletzung, Rechtemangel und
  Sitzungsablauf sind nicht abgebildet.
* **Feld-IDs sind instanzabhaengig.** `customfield_10027` gilt fuer diese
  Instanz. Der Ablauf muss ueber den Feldnamen im Shifter hineinfinden und die
  id nur als Fallback benutzen - einstellbar ueber die Optionsseite.
