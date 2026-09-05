# <Anzeigename> (`<ordner>`)

Chrome/Edge-Erweiterung (MV3): <ein Satz, was sie tut>. Commit-Scope: `<scope>`.

## Befehle

Vom Repo-Root, `<p>` = `<ordner>`. Kein Build - Laden per
`chrome://extensions` -> "Entpackte Erweiterung laden".

- Lint: `npm run lint --prefix <p>`
- Test: `npm test --prefix <p>`
- Einzeln: `npm run <suite> --prefix <p>`

## Tech-Stack-Vorgaben

- <Sprachstand und Modulmuster, z. B. ES5 + UMD-Globals - siehe Root-Regeln>
- <Was DOM-frei bleiben muss und warum: was laeuft in Node-Tests?>
- <Fremdsystem-Eigenheiten, die man beim Aendern kennen muss>
- <Absichtliche Abweichungen, die sonst wie ein Fehler aussehen>
- <Wo eine neue Datei registriert werden muss (manifest.json, Reihenfolge)>

## Struktur

| Pfad | Rolle |
| --- | --- |
| `manifest.json` | Permissions, Ladereihenfolge, Shortcuts. |
| `src/<einstieg>.js` | Haupteinstieg. |
| `src/...` | <Kernmodul>. |
| `popup/`, `options/`, `test/` | UI-Seiten bzw. Testrunner. |

<!--
Regeln fuer diese Datei:
* max. 40 Zeilen - was laenger wird, gehoert in README oder Code-Kommentar.
* Nur was beim Aendern des Codes noetig ist. Keine Changelogs, keine
  Tutorials, keine Feature-Beschreibung fuer Nutzer (-> README.md).
* Nichts wiederholen, was schon in der Root-CLAUDE.md steht.
* Deutsch ohne Umlaute (ue, ae, oe, ss).
-->
