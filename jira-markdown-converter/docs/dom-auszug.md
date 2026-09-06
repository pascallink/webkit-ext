# DOM-Auszug aus einer echten Jira-Instanz

Die Fixtures unter `test/fixtures/` sind Nachbauten. Fuer Features, die gegen
die Oberflaeche von Jira Server / Data Center arbeiten (Dialoge, Modale,
Inline-Bearbeitung), ist ein Auszug aus der echten Instanz der Unterschied
zwischen geratenen und belegten Selektoren.

**Nicht die Seite speichern.** Ein `Strg+S` liefert das Ausgangs-HTML, nicht das
DOM, das Jira per AJAX nachgeladen hat - genau die Dialoge fehlen dann. Und ein
vollstaendiger Auszug enthaelt Ticketinhalte, Namen und den `atl_token`.

Der Schnipsel unten zieht darum nur das **Geruest**: Tag, `id`, Klassen sowie
`data-*`, `aria-*` und eine Handvoll Struktur-Attribute. Kein Text, keine
Werte, keine Tokens, keine externen URLs.

## Welche Zustaende gebraucht werden

Jeweils **waehrend der Dialog offen ist** ausfuehren:

| # | Zustand | Aufruf im Schnipsel |
| --- | --- | --- |
| 1 | Vorgangsansicht, nichts offen | `'#issue-content, .issue-header, #details-module'` |
| 2 | Label-Dialog offen (Taste `l`) | `'.aui-dialog2, .jira-dialog'` |
| 3 | Quick-Search-Dialog offen (Taste `.`) | `'.aui-dialog2, .jira-dialog, #quick-search'` |
| 4 | Feld "Kunden Referenz" in Bearbeitung | `'.aui-dialog2, [data-field-name], .customfield'` |
| 5 | Link-Dialog offen, Reiter "Web Link" aktiv | `'.aui-dialog2, .jira-dialog'` |

Zusaetzlich hilfreich, aus der Konsole:

```js
copy(JSON.stringify({
  version: (window.JIRA && JIRA.version) || document.querySelector('meta[name="ajs-version-number"]')?.content,
  build:   document.querySelector('meta[name="ajs-build-number"]')?.content,
  locale:  document.documentElement.lang,
  hasJIRA: typeof window.JIRA,
  api:     window.JIRA ? Object.keys(JIRA).slice(0, 40) : []
}, null, 2));
```

## Der Schnipsel

In den DevTools (F12) unter **Console** einfuegen, `SELECTOR` in der ersten
Zeile auf den Zustand aus der Tabelle setzen, Enter. Das Ergebnis liegt danach
in der Zwischenablage.

```js
copy((function () {
  var SELECTOR = '.aui-dialog2, .jira-dialog';   // <- hier anpassen
  var KEEP = ['name', 'type', 'role', 'placeholder', 'href', 'title'];
  var SKIP = { SCRIPT: 1, STYLE: 1, SVG: 1, PATH: 1, NOSCRIPT: 1 };
  var MAX = 60, LIMIT = 4000, out = [];

  function head(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var cls = (typeof el.className === 'string' ? el.className : '').trim();
    if (cls) s += '.' + cls.split(/\s+/).join('.');
    return s;
  }

  function attrs(el) {
    var list = el.attributes || [], keep = [], i, a, n, v;
    for (i = 0; i < list.length; i++) {
      a = list[i]; n = a.name;
      if (!(KEEP.indexOf(n) !== -1 || n.indexOf('data-') === 0 || n.indexOf('aria-') === 0)) continue;
      if (/token|nonce|secret|user|mail/i.test(n)) continue;
      v = String(a.value || '');
      if (n === 'href' && v.charAt(0) !== '#') v = '...';
      if (v.length > MAX) v = v.slice(0, MAX) + '...';
      keep.push(n + '="' + v + '"');
    }
    return keep.length ? ' [' + keep.join(' ') + ']' : '';
  }

  function walk(el, depth) {
    if (SKIP[el.tagName] || out.length >= LIMIT) return;
    out.push(new Array(depth + 1).join('  ') + head(el) + attrs(el));
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
  }

  var roots = document.querySelectorAll(SELECTOR);
  if (!roots.length) return 'nichts gefunden fuer: ' + SELECTOR;
  for (var r = 0; r < roots.length; r++) { walk(roots[r], 0); out.push(''); }
  return out.join('\n');
})());
```

Ergebnis (gekuerztes Beispiel):

```
div#edit-labels-dialog.aui-dialog2.aui-layer [role="dialog" data-aui-modal="true"]
  form.aui
    textarea#labels-textarea.text.long-field [name="labels" placeholder="Label eingeben"]
  a.aui-button.aui-button-primary [href="..."]
```

## Was damit passiert

* Der Auszug geht in die Sitzung, in der die Fixture gebaut wird - **nicht** ins
  Repository. `test/fixtures/` bleibt ein Nachbau; nur seine Selektoren stammen
  aus dem Auszug.
* Grund: das Repo ist oeffentlich, und ein Auszug verraet interne Feld-IDs,
  Workflow-Namen und den Zuschnitt der Instanz.
* Vor dem Weitergeben trotzdem kurz durchsehen: `aria-label` und `title` koennen
  Text aus dem Ticket enthalten.
