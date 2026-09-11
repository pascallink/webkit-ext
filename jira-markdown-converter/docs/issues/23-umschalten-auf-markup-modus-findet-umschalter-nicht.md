# "Vorher auf den Markup-Modus umschalten" findet den Umschalter von Jira 9.12 nicht

**Labels:** bug, editors, medium
**Schwere:** mittel - die Einstellung ist wirkungslos, der Rueckfall (formatiert einfuegen) verdeckt es
**Nachgewiesen:** Instanz jira.inxire.com 9.12.2: Einstellung aktiv, Einfuegen aus dem Panel -> Toast "Formatiert eingefuegt.", Modus bleibt *Visuell*

## Beschreibung

Der echte Umschalter in 9.12.2:

```html
<nav class="aui-navgroup aui-navgroup-horizontal editor-toggle-tabs">
  <ul class="aui-nav">
    <li class="aui-nav-selected" data-mode="wysiwyg"><button class="aui-button" type="button" aria-pressed="true">Visual</button></li>
    <li data-mode="source"><button class="aui-button" type="button" aria-pressed="false">Text</button></li>
  </ul>
</nav>
```

`MODE_TOGGLE_SELECTOR` in `src/editors.js` enthaelt `[data-mode="source"]`
und trifft damit das `<li>`. `toggle.click()` auf dem `<li>` erreicht den
Handler am `<button>` nicht. Die Beschriftungs-Suche
(`MODE_TOGGLE_TEXT`) wuerde ausserdem als erstes den Button *Visual*
finden (Regex enthaelt `visual`) - also den falschen.

`switchToMarkup()` wartet dann 2 s vergeblich, liefert `false`, und
`deliver()` faellt auf formatiertes Einfuegen zurueck.

## Vorschlag

- Selektor `.editor-toggle-tabs li[data-mode="source"] button` an den
  Anfang von `MODE_TOGGLE_SELECTOR`; die uebrigen (geratenen) Selektoren
  `.rte-toggle`, `button.rte-button-source`, `a.switch-to-source`,
  `[data-editor-mode]` streichen oder als Rueckfall belassen.
- Beschriftungs-Regex ohne `visual`/`wysiwyg` - gesucht ist der Weg in den
  Textmodus, nicht irgendein Modus-Knopf.
- Wichtig fuer den Nutzer: der Umschalter aendert die **Nutzereinstellung**
  fuer alle Felder dauerhaft. README-Hinweis, oder nach dem Einfuegen
  zurueckschalten.
- Test: Nachbau (`docs/mockup`) mit demselben `nav.editor-toggle-tabs`.
