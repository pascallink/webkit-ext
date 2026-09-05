# Store listing - English

Second listing language in the [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge).
The German listing in [`listing-de.md`](listing-de.md) is the default; this one
is the translation. Both must be updated together.

## Basics

| Field | Value |
| --- | --- |
| Name | `PowerEdit for Jira` |
| Category | Productivity |
| Website | `https://github.com/pascallink/webkit-ext` |
| Support contact | `https://github.com/pascallink/webkit-ext/issues` |
| Privacy policy | `https://github.com/pascallink/webkit-ext/blob/main/PRIVACY.md` |

## Short description (max. 132 characters)

```
Converts Markdown into Jira markup as you paste - plus code blocks, panel templates and a field that stays open.
```

## Detailed description (max. 10,000 characters)

```
PowerEdit for Jira adds what is missing when you write longer descriptions and
comments in Jira: Markdown support, ready-made formatting templates, and code
blocks that actually arrive as code blocks.

Text written in Azure DevOps, GitHub or any editor turns into clean Jira wiki
markup on paste: "# Title" becomes "h1. Title", "**bold**" becomes "*bold*", a
Markdown table becomes a Jira table. Headings, lists (nested too), task lists,
quotes, links, images, rules and code blocks are covered.

WHAT IT ADDS

- A button bar right at the field: auto-convert on/off, convert, paste, code,
  panel, editor, and the lock for the edit mode.
- An input area with preview: Markdown on the left, the resulting Jira markup
  on the right - then insert it into the ticket, replace the field, or copy it.
- A "Insert code" dialog: pick a language, type the code, drop a finished
  {code} block at the cursor. Code never passes through the Markdown parser.
- A "Panel from template" menu: four coloured Jira panels (info, note, warning,
  default) at the press of a button, placeholder text selected afterwards.
- Auto-convert on paste: text that looks like Markdown is converted while it is
  pasted. Ctrl+Z undoes it, and the automation can be switched off anywhere.
- Freeze editing: the description field stays open while you edit it, so a
  stray click next to it no longer discards your work. Click the lock to
  release it.
- A converter in the toolbar popup: paste Markdown, take Jira markup out - no
  Jira page needed.
- A context menu entry and the shortcut Ctrl+Shift+M (macOS: Cmd+Shift+M) for
  the current selection in the editor.

JIRA CLOUD, SERVER AND DATA CENTER

On *.atlassian.net the extension works right away. Self-hosted instances (Jira
Server / Data Center) are granted by the user, once: open the Jira page, click
the icon, choose "grant this Jira address" - or enter the address in the
options. Only then does the extension ask for access to that exact address.
Without that grant, nothing happens on other sites.

All three editor flavours are covered: the plain text field of Jira Server 9.x
(wiki style renderer), the rich text editor (jira.rte.enabled) and the Jira
Cloud editor. In rich text editors the Markdown either arrives as real
formatting, or the extension switches to markup mode first - your choice.

PRIVACY

No data is collected, stored or sent to any server. Conversion happens entirely
in the browser. The only thing stored is your own settings, inside your browser
profile. No telemetry, no ads, no remotely loaded code.

SOURCE CODE

The full source is public:
https://github.com/pascallink/webkit-ext

This extension is an independent project and is not affiliated with Atlassian.
"Jira" is a trademark of Atlassian and is used here descriptively only.
```

## Search terms

`Jira`, `Markdown`, `wiki markup`, `Azure DevOps`, `converter`, `code block`,
`panel`, `productivity`
