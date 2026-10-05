# Imagine

Imagine generates a jpg with xAI and can save it into the vault. Added in 1.4.0.

Open it from the command palette, or the **Imagine** chip on the sheet.

## Sources

- **Imagine something new** — you write the prompt
- **Imagine from this note** — the open note
- **Imagine from this folder** — up to 8 notes in the current folder
- **Imagine from vault sample** — the 12 newest notes, not every file

Draft from a source asks the chat model for one image prompt. You can edit that prompt before generating.

## Generate and save

Generate calls `grok-imagine-image-2.0` and bills one image.

- **Save** writes a jpg into the `Grok` folder in the vault
- **Save and embed** writes the jpg and drops the image link into the open note

Settings → Grok Notes → Imagine model, aspect, and folder.

The image request goes to `https://api.x.ai`, same as chat. It needs the same xAI API key.
