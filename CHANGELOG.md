# Changelog

## 1.4.0

Imagine from a new prompt, the open note, the current folder, or a 12-note vault sample. Folder sample uses up to 8 notes. Draft from source asks the chat model for one image prompt you can edit. Generate calls `grok-imagine-image-2.0`. Save writes a jpg into the `Grok` folder. Save and embed drops the image link into the open note.

## 1.3.1

Summarize works on phone. The sheet keeps the open note even when the editor is not active. Quick actions use a short think (`reasoning_effort: low`) so Grok 4.7 does not spend the token budget before the summary. Phone waits for the full reply instead of a stream that mobile drops.

## 1.3.0

Quick-action chips on the sheet and sidebar: Summarize, Rewrite, Fix grammar, Continue. Finished replies render as Markdown. Insert still writes Markdown.

## 1.2.0

Model list refresh. Default `grok-4.7`. Picker matches public API ids. Retired ids migrate.

## 1.1.0

Sidebar on desktop, sheet on phone. Note and selection commands. Insert, replace, copy, new note.
