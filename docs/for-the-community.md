# For the Obsidian community

Grok Notes is a vault writing plugin. The repo is Grok-Notes. The plugin id stays grok-mobile. It is not a coding agent.

## Fit

- You write in Obsidian on a laptop and a phone
- You want summarize, rewrite, grammar, and continue on the note you already have open
- You want Imagine jpgs saved into the vault
- You already have an xAI API key and do not want a CLI login

## Not the same as a CLI agent plugin

Some plugins embed Grok Build, Claude Code, or Codex. Those need a local CLI and are desktop-only. This plugin does not. It calls `https://api.x.ai` and runs with `isDesktopOnly: false`.

## Listing facts

- Id: `grok-mobile`
- Name: Grok Notes
- Author: Chrostn
- Min app: 1.5.0
- Funding: https://buymeacoffee.com/chrostn
- License: MIT

## Install for reviewers

Release assets are `main.js`, `manifest.json`, and `styles.css`. Folder: `.obsidian/plugins/grok-mobile/`. No build step for a manual install.
