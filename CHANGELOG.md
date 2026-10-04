# Changelog

## 1.4.6

Chat history is kept in the vault plugin data and shown in the sidebar and sheet. Add history to note inserts the thread as Markdown. Clear history removes it. The last 12 turns are sent with the next message.

## 1.4.5

Quick actions are a fixed 3 by 2 box: Summarize, Rewrite, Grammar, Continue, Imagine, Use note. The cells shrink to the sidebar width instead of scrolling off.

## 1.4.4

Quick actions are a fixed 3 by 2 box that cannot overflow the sidebar. Cells are Summarize, Rewrite, Grammar, Continue, Imagine, and Use note.

## 1.4.4

Plugin description is under 250 characters, which the community review requires.

## 1.4.3

Summarize, Rewrite, Grammar, Continue, and Imagine sit in a 3-column grid so they fit the sidebar. The last row has two buttons.

## 1.4.2

Insert mode is on the sidebar and the phone sheet. Choose insert below, replace selection, open a note, or create a new note, then tap that button. The choice is saved with the other vault settings.

## 1.4.1

Review cleanup. Copy no longer touches the system clipboard; it opens a note with the reply. Imagine no longer lists every vault file. Folder and subfolders reads only the open note's folder, up to 12 notes. Release assets are `main.js`, `manifest.json`, and `styles.css` only, with GitHub artifact attestations.

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
