# Troubleshooting

## The command is missing

The folder must be `YourVault/.obsidian/plugins/grok-mobile/` and it must contain `main.js`, `manifest.json`, and `styles.css`. Quit Obsidian fully and open it again. On iOS, swipe the app away.

## Summarize on a phone does nothing, or loses the note

Update to 1.3.1 or later. The sheet keeps the open note even when the editor is not active. Phone uses a non-streaming request.

## The reply never finishes on a phone

Phone does not stream. Wait for the full reply. A stream that mobile drops was the pre-1.3.1 behavior.

## A retired model id stopped working

`grok-4-latest`, `grok-3-mini`, and `grok-2` were removed from the picker. 1.2.0 migrates those to `grok-4.7` once. Set the model again under Settings → Grok if a custom id is stale.

## Do not paste Grok 4.7 Fast

Grok 4.7 Fast is not on the public API. It is Cursor and Grok Build only. A custom id with that name will fail.

## Imagine fails or bills unexpectedly

Generate calls `grok-imagine-image-2.0` and bills one image. Draft-from-source also calls the chat model once to write the prompt. Check the key, the Imagine model setting, and the xAI console usage page.

## Key test fails

Settings → Grok → paste a key from https://console.x.ai, then run **Test xAI API key**. A key in a note does not count. The plugin reads `data.json` only.
