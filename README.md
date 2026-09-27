# Grok for Obsidian (laptop + phone)

Repo: https://github.com/ChrostnWo/Grok-Mobile

One plugin. Works in the **desktop app** and **iOS / Android**. No Grok CLI, no Node APIs.

- **Laptop / tablet:** right sidebar chat, status bar, right-click on selected text
- **Phone:** full-width sheet, 44px buttons, 16px inputs so iOS does not zoom
- **Both:** same API key, same commands, same vault settings if you sync `.obsidian`

## Install from this repo

1. Click **Code → Download ZIP** on GitHub.
2. Unzip. You need `manifest.json`, `main.js`, and `styles.css`.
3. Put them in:

   `YourVault/.obsidian/plugins/grok-mobile/`

   The folder name must be `grok-mobile`.

4. Obsidian → Settings → Community plugins → Restricted mode **off** → enable **Grok**.
5. Settings → Grok → paste an xAI key from https://console.x.ai

Do not commit `data.json`. That file holds your API key.

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

Hotkey idea: bind **Open Grok chat** to `Ctrl/Cmd + Shift + G`.

## Layout

Settings → Chat layout:

- **Auto** — sidebar on laptop/tablet, popup sheet on a phone
- **Always sidebar**
- **Always popup sheet**

## Models

Default is `grok-4`. If you get a 400, set **Custom model id** to the exact name from https://docs.x.ai/docs/models
