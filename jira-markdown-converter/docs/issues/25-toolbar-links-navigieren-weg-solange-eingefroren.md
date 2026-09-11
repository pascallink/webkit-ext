# Solange ein Feld eingefroren ist, navigieren Toolbar-Links weg vom Vorgang - Entwurf verloren

**Labels:** bug, editlock, critical
**Schwere:** kritisch - ein Klick auf *Bearbeiten*, *Zuweisen*, einen Workflow-Knopf oder *Abbrechen* im Label-Dialog verlaesst die Seite mitsamt dem offenen Kommentar
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2, Edge 152: Kommentar offen (Schloss zu), Klick auf *Zuweisen* -> `http://jira.inxire.com/secure/AssignIssue!default.jspa?id=48410`; Klick auf *Bearbeiten* -> `/secure/EditIssue!default.jspa?id=48410`, vorher der `beforeunload`-Dialog der Erweiterung

## Beschreibung

Jiras Werkzeugleiste besteht aus echten Links:

```html
<a id="edit-issue"   class="aui-button toolbar-trigger issueaction-edit-issue"   href="/secure/EditIssue!default.jspa?id=48410">
<a id="assign-issue" class="aui-button toolbar-trigger issueaction-assign-issue" href="/secure/AssignIssue!default.jspa?id=48410">
<a id="action_id_21" class="aui-button toolbar-trigger issueaction-workflow-transition" href="/secure/WorkflowUIDispatcher.jspa?...">
<a id="cancel" class="aui-button aui-button-link cancel" href="/browse/DBREFI-10549">      (Label-Dialog)
```

Jiras Klick-Handler oeffnet den Dialog und ruft `preventDefault()` auf.
`EditLock.guard()` stoppt das `click`-Ereignis am Fenster, **bevor** Jiras
Handler laeuft - `stopImmediatePropagation()` verhindert aber keine
Default-Aktion. Der Browser folgt dem `href`: volle Navigation zur
Legacy-Seite, der Kommentar ist weg. Die Erweiterung fragt zwar per
`beforeunload` "Seite verlassen?", aber wer "Verlassen" klickt, verliert
den Text; wer "Bleiben" klickt, versteht nicht, warum der Knopf nicht ging.

Die README beschreibt das Einfrieren als "die Seite reagiert daneben auch
sonst nicht auf Klicks" - tatsaechlich reagiert sie schlimmer als ohne
Erweiterung.

## Reproduktion

1. DBREFI-10549, *Kommentar*, Text tippen (Schloss zu).
2. *Bearbeiten* oder *Zuweisen* klicken.
3. `beforeunload`-Dialog, danach die Legacy-Seite `EditIssue!default.jspa`.

## Vorschlag

- In `guard()` fuer `click` auf Elementen mit `href` (und fuer `submit`)
  zusaetzlich `event.preventDefault()` aufrufen, wenn das Ereignis gestoppt
  wird - dann bleibt die Seite wenigstens stehen.
- Besser: `click` gar nicht mehr stoppen. Jira beendet die Inline-Bearbeitung
  ueber `mousedown`/`focusout` in der Erfassungsphase - das zeigen die
  Fixtures und die Instanz. Gestoppt werden muessen `pointerdown`,
  `mousedown`, `focusout`/`blur`; `click`, `dblclick` und `submit` duerfen
  durch. Dann oeffnen Dialoge normal, Links werden von Jira abgefangen, und
  das Feld bleibt trotzdem offen.
- Test in der Ebene `ext` gegen den Nachbau (`?state=comment`): Klick auf
  `#assign-issue` bei geschlossenem Schloss darf die URL nicht aendern
  (der Nachbau navigiert bei durchgereichtem `href` nach `?left=...`).
