# Privacy

This plugin sends the text you choose to xAI at `https://api.x.ai` when you run a command, tap Send, or generate an image.

That text can be:

- a selection
- the open note
- a prompt you typed
- a short folder sample (up to 8 notes)
- a vault sample (the 12 newest notes)

It does not work without an xAI API key from https://console.x.ai. xAI bills API usage separately.

## What stays in the vault

The key is stored only in this vault's plugin settings: `.obsidian/plugins/grok-mobile/data.json`. Do not commit that file. Do not paste the key into a note.

Saved images are jpg files in the `Grok` folder (or the folder you set). Those files are normal vault files. Sync plugins will sync them if that folder is included.

## What this plugin does not do

- No Grok CLI
- No account with the plugin author
- No telemetry endpoint of its own
- Desktop only is off, so the same build runs on phone and laptop

xAI's own terms cover what happens after the request leaves the vault: https://x.ai
