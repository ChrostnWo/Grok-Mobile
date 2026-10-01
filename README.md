# Grok for Obsidian (laptop + phone)

Repo: https://github.com/ChrostnWo/Grok-Mobile

Talk to Grok from a note on laptop, tablet, and phone. Sidebar on desktop, sheet on mobile. No Grok CLI.

Current release: **1.3.0**

## Support

If this plugin is useful, you can [buy me a coffee](https://buymeacoffee.com/chrostn).

## Privacy and network use

This plugin sends the text you choose (selection, note, or prompt) to **xAI** at `https://api.x.ai` when you run a command or tap Send. It does not work without an xAI API key from https://console.x.ai . xAI bills API usage separately. The key is stored only in this vault's plugin settings (`data.json`). Do not commit that file.

## Install or update

This plugin is not in the community store yet. Install from the release.

1. Open the latest release: https://github.com/ChrostnWo/Grok-Mobile/releases/latest
2. Download `main.js`, `manifest.json`, and `styles.css` (or the release zip, then unzip).
3. Put them in:

   `YourVault/.obsidian/plugins/grok-mobile/`

   The folder name must be `grok-mobile`. Replace the three files if you already installed 1.1.0. Leave `data.json` alone — that file holds your API key.
4. Fully quit Obsidian and open it again (on iOS, swipe the app away). If the plugin was already enabled, turn it off and on under Settings → Community plugins.
5. Settings → Grok → confirm the model is **Grok 4.7**. Paste an xAI key from https://console.x.ai if you have not already.

## Use it

Ribbon sparkles icon, or command palette:

- Open Grok chat
- Open Grok sidebar
- Ask Grok about selection
- Ask Grok about this note
- Summarize this note
- Continue writing from cursor
- Rewrite selection
- Fix grammar of selection
- Test xAI API key

On a laptop, select text → right click → **Ask Grok about selection**.


## Quick actions

On the phone sheet and the desktop sidebar, four chips sit above the reply:

- Summarize — current selection, or the open note
- Rewrite — selection, or the context already loaded
- Fix grammar — selection, or the context already loaded
- Continue — text before the cursor

A chip fills the prompt and sends. Insert, Replace, and Copy still use the raw Markdown, not the rendered HTML.

## Rendered replies

Finished replies render as Markdown (headings, lists, code). While tokens are arriving, the reply stays plain text. Insert and Replace write the Markdown source into the note.

## Layout

Settings → Chat layout: Auto, always sidebar, or always popup sheet.

## Models

Default is `grok-4.7` (public xAI API, chat completions). Settings → Grok → Model:

| Picker | API id | Notes |
| --- | --- | --- |
| Grok 4.7 (recommended) | `grok-4.7` | Current flagship. 500k context. About $2 / $6 per 1M input / output tokens. |
| Grok 4.6 | `grok-4.6` | Previous flagship, still on the public API. |
| Grok 4.5 | `grok-4.5` | Earlier 4.5 release. |
| Grok 4.20 | `grok-4.20` | Longer-context 4.20 line. |
| Grok 4 | `grok-4` | Original Grok 4. Kept so older setups still work. |
| Grok 3 | `grok-3` | Older model. |
| Custom model id | whatever you paste | Use this if xAI ships a new id before this list is updated. |

Removed from the picker: `grok-4-latest`, `grok-3-mini`, and `grok-2`. If your vault was on one of those, 1.2.0 switches it to `grok-4.7` once. A saved id that is not in the list is kept as a custom id.

Grok 4.7 Fast is not on the public API (Cursor and Grok Build only). Do not put that name in Custom.

Ids and prices: https://docs.x.ai/developers/models

## Releases

- **1.3.0** — Quick-action chips on the sheet and sidebar. Finished replies render as Markdown. Insert still writes Markdown.
- **1.2.0** — Model list refresh. Default `grok-4.7`. Picker matches public API ids. Retired ids migrate. README and manifest description updated.
- **1.1.0** — Sidebar on desktop, sheet on phone. Note and selection commands. Insert, replace, copy, new note.
