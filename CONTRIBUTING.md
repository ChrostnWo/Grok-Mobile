# Contributing

Issues and pull requests are welcome. The plugin must keep working on laptop and phone.

## Report a bug

Include:

- Obsidian version
- phone or laptop, and iOS, Android, macOS, Windows, or Linux
- plugin version (1.4.0 or later)
- the command you ran
- what you expected and what happened

Do not paste your API key, `data.json`, or a private note.

## Pull requests

- Do not set `isDesktopOnly` to true
- Phone requests stay non-streaming
- Do not log or commit API keys
- Keep the plugin id `grok-mobile`

There is no separate build in the published tree. `main.js`, `manifest.json`, and `styles.css` are the release files.

## Docs

User pages live in `docs/`. Update the page and `CHANGELOG.md` when a command or setting changes.
