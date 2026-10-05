# FAQ

## Does this need the Grok CLI?

No. It uses the xAI API. A desktop-only CLI plugin is a different install.

## Does it work on iOS and Android?

Yes. Auto layout uses a sheet on the phone and a sidebar on a laptop. Install the same three files. Quit the app fully after an update.

## Is it in the community plugin browser?

Not yet. Install from the latest release, or with BRAT from `ChrostnWo/Grok-Notes`.

## Where is my key stored?

In the vault, at `.obsidian/plugins/grok-mobile/data.json`. It is not in the repo.

## What gets sent to xAI?

Only the text you choose: selection, note, prompt, folder sample, or the 12 newest notes for a vault sample. See [Privacy](privacy.md).

## Can I change the image folder?

Settings → Grok Notes → Imagine folder. The default is `Grok`.

## Why is the folder still grok-mobile?

The public name is Grok Notes. The plugin id is `grok-mobile`, and Obsidian only loads a plugin from a folder with that id. Renaming the folder or the id hides the plugin and drops the saved API key. Install and update into `.obsidian/plugins/grok-mobile/`.
