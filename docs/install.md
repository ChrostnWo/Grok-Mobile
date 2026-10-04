# Install and update

This plugin is not in the community store yet. Install from the release.

## From the latest release

1. Open https://github.com/ChrostnWo/Grok-Mobile/releases/latest
2. Download `main.js`, `manifest.json`, and `styles.css`. Or download the release zip and unzip it.
3. Put the three files in:

   `YourVault/.obsidian/plugins/grok-mobile/`

   The folder name must be `grok-mobile`.
4. Fully quit Obsidian and open it again. On iOS, swipe the app away.
5. Settings → Community plugins → turn on **Grok**. If it was already on, turn it off and on.
6. Settings → Grok → confirm the model is **Grok 4.7**. Paste an xAI key from https://console.x.ai if you have not already.

## Update

Replace `main.js`, `manifest.json`, and `styles.css`. Leave `data.json` alone. That file holds your API key and settings.

Then quit Obsidian and open it again. On a phone, swipe the app away so the old script is not still in memory.

## BRAT

If you use the BRAT plugin, add `ChrostnWo/Grok-Mobile`. BRAT installs from the latest release assets. The folder it creates should still be `grok-mobile`.

## What not to commit

Do not commit `YourVault/.obsidian/plugins/grok-mobile/data.json`. That file contains the API key.
