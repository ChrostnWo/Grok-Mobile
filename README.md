# Grok for Obsidian (laptop + phone)

Repo: https://github.com/ChrostnWo/Grok-Mobile

Talk to Grok from a note on laptop, tablet, and phone. Sidebar on desktop, sheet on mobile. No Grok CLI.

## Privacy and network use

This plugin sends the text you choose (selection, note, or prompt) to **xAI** at `https://api.x.ai` when you run a command or tap Send. It does not work without an xAI API key from https://console.x.ai . xAI bills API usage separately. The key is stored only in this vault's plugin settings (`data.json`). Do not commit that file.

## Install from this repo

1. Click **Code → Download ZIP** on GitHub.
2. Unzip. You need `manifest.json`, `main.js`, and `styles.css`.
3. Put them in:

   `YourVault/.obsidian/plugins/grok-mobile/`

   The folder name must be `grok-mobile`.

4. Obsidian → Settings → Community plugins → Restricted mode **off** → enable **Grok**.
5. Settings → Grok → paste an xAI key from https://console.x.ai

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

## Layout

Settings → Chat layout: Auto, always sidebar, or always popup sheet.

## Models

Default is `grok-4`. If you get a 400, set **Custom model id** to the exact name from https://docs.x.ai/docs/models
