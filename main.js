const {
  Plugin,
  Notice,
  PluginSettingTab,
  Setting,
  Modal,
  MarkdownView,
  ItemView,
  Platform,
  requestUrl,
  MarkdownRenderer,
  normalizePath,
  setIcon,
} = require("obsidian");

const VIEW_TYPE = "grok-chat-view";

const DEFAULT_SETTINGS = {
  apiKey: "",
  apiBase: "https://api.x.ai/v1",
  model: "grok-4.7",
  customModel: "",
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt:
    "You are Grok, helping inside an Obsidian vault. Reply in clean Markdown. Be direct. Do not invent vault paths or links unless they appear in the note.",
  insertMode: "below",
  includeTitle: true,
  stream: true,
  chatUi: "auto",
  history: [],
  imageModel: "grok-imagine-image-2.0",
  imageAspect: "1:1",
  imageFolder: "Grok",
};

const MODELS = [
  ["grok-4.7", "Grok 4.7 (recommended)"],
  ["grok-4.6", "Grok 4.6"],
  ["grok-4.5", "Grok 4.5"],
  ["grok-4.20", "Grok 4.20"],
  ["grok-4", "Grok 4"],
  ["grok-3", "Grok 3"],
  ["custom", "Custom model id"],
];
const RETIRED_MODELS = {
  "grok-4-latest": "grok-4.7",
  "grok-3-mini": "grok-4.7",
  "grok-2": "grok-4.7",
};

function clip(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[…truncated for context…]";
}

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isPhone() {
  return !!(Platform && Platform.isPhone);
}

function isMobile() {
  return !!(Platform && Platform.isMobile);
}

function partText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (!part) return "";
      if (typeof part === "string") return part;
      return part.text || part.content || "";
    }).join("");
  }
  if (typeof value === "object") return value.text || value.content || "";
  return "";
}

function markdownView(app) {
  if (!app || !app.workspace) return null;
  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active && active.editor) return active;
  const leaves = app.workspace.getLeavesOfType("markdown") || [];
  for (let i = 0; i < leaves.length; i++) {
    const view = leaves[i] && leaves[i].view;
    if (view && view.editor) return view;
  }
  return null;
}

class GrokPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.abort = null;
    this.pendingOpts = null;
    this.registerView(VIEW_TYPE, (leaf) => new GrokChatView(leaf, this));
    this.addRibbonIcon("sparkles", "Grok Notes", () => {
      const meta = this.activeNoteMeta();
      this.openChat({
        seed: meta.selection || meta.body || "",
        label: meta.selection ? "selection" : (meta.body ? "note" : "chat"),
        title: meta.title || "",
      });
    });
    this.addCommand({ id: "grok-open-chat", name: "Open Grok chat", callback: () => this.openChat({ seed: "", label: "chat" }) });
    this.addCommand({ id: "grok-open-sidebar", name: "Open Grok sidebar", callback: () => this.activateView() });
    this.addCommand({
      id: "grok-ask-selection",
      name: "Ask Grok about selection",
      editorCallback: (editor) => {
        const sel = editor.getSelection();
        if (!sel.trim()) { new Notice("Select some text first."); return; }
        this.openChat({ seed: sel, label: "selection", presetPrompt: "Help with the selected text. Improve, explain, or answer depending on what it is." });
      },
    });
    this.addCommand({
      id: "grok-ask-note",
      name: "Ask Grok about this note",
      editorCallback: (editor, view) => {
        this.openChat({ seed: editor.getValue(), label: "note", title: view.file ? view.file.basename : "Untitled", presetPrompt: "Read this note and wait for my question." });
      },
    });
    this.addCommand({
      id: "grok-summarize-note",
      name: "Summarize this note",
      editorCallback: (editor, view) => {
        const body = editor.getValue();
        if (!body.trim()) { new Notice("This note is empty."); return; }
        const sizeHint = isPhone() ? "for a phone screen: 5-8 bullets, then a one-line takeaway" : "with a short heading, key bullets, and a one-line takeaway";
        this.openChat({
          seed: body,
          label: "note",
          title: view.file ? view.file.basename : "Untitled",
          presetPrompt: "Summarize this note " + sizeHint + ". Output only the summary.",
          autoSend: true,
          reasoningEffort: "low",
        });
      },
    });
    this.addCommand({
      id: "grok-continue-writing",
      name: "Continue writing from cursor",
      editorCallback: (editor, view) => {
        const before = editor.getRange({ line: 0, ch: 0 }, editor.getCursor());
        this.runQuick({ editor, view, userText: "Continue this note in the same voice and structure. Output only the next paragraphs, no preamble.\n\n" + this.noteBlock(view, before || editor.getValue()), forceInsert: "below" });
      },
    });
    this.addCommand({
      id: "grok-rewrite-selection",
      name: "Rewrite selection",
      editorCallback: (editor) => {
        const sel = editor.getSelection();
        if (!sel.trim()) { new Notice("Select some text first."); return; }
        this.runQuick({ editor, userText: "Rewrite the following so it is clearer and tighter. Keep meaning. Output only the rewrite.\n\n" + sel, forceInsert: "replace", selection: sel });
      },
    });
    this.addCommand({
      id: "grok-fix-grammar",
      name: "Fix grammar of selection",
      editorCallback: (editor) => {
        const sel = editor.getSelection();
        if (!sel.trim()) { new Notice("Select some text first."); return; }
        this.runQuick({ editor, userText: "Fix grammar, spelling, and punctuation. Keep the author's voice. Output only the corrected text.\n\n" + sel, forceInsert: "replace", selection: sel });
      },
    });
    this.addCommand({ id: "grok-test-key", name: "Test xAI API key", callback: () => this.testKey() });
    this.addCommand({ id: "grok-insert-history", name: "Insert Grok chat history into note", callback: () => this.insertHistory() });
    this.addCommand({ id: "grok-clear-history", name: "Clear Grok chat history", callback: () => this.clearHistory() });
    this.addCommand({ id: "grok-tag-note", name: "Tag this note", editorCallback: (editor, view) => this.tagNote(editor, view) });
    this.addCommand({ id: "grok-title-note", name: "Title this note", editorCallback: (editor, view) => this.suggestTitle(editor, view) });
    this.addCommand({ id: "grok-imagine-new", name: "Imagine something new", callback: () => this.openImagine("new") });
    this.addCommand({ id: "grok-imagine-note", name: "Imagine from this note", callback: () => this.openImagine("note") });
    this.addCommand({ id: "grok-imagine-folder", name: "Imagine from this folder", callback: () => this.openImagine("folder") });
    this.addCommand({ id: "grok-imagine-vault", name: "Imagine from this folder and subfolders", callback: () => this.openImagine("vault") });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const sel = editor.getSelection();
      if (!sel || !sel.trim()) return;
      menu.addItem((item) => { item.setTitle("Ask Grok about selection").setIcon("sparkles").onClick(() => { this.openChat({ seed: sel, label: "selection", presetPrompt: "Help with the selected text. Improve, explain, or answer depending on what it is." }); }); });
      menu.addItem((item) => { item.setTitle("Rewrite selection with Grok").setIcon("sparkles").onClick(() => { this.runQuick({ editor, userText: "Rewrite the following so it is clearer and tighter. Keep meaning. Output only the rewrite.\n\n" + sel, forceInsert: "replace", selection: sel }); }); });
    }));
    if (Platform && Platform.isDesktop) {
      const status = this.addStatusBarItem();
      status.setText("Grok Notes");
      status.addClass("mod-clickable");
      status.setAttr("aria-label", "Open Grok Notes");
      status.addEventListener("click", () => this.openChat({ seed: "", label: "chat" }));
      this.statusEl = status;
    }
    this.addSettingTab(new GrokSettingTab(this.app, this));
  }
  onunload() {
    if (this.abort) this.abort.abort();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    const known = MODELS.some(([id]) => id === this.settings.model);
    const retired = RETIRED_MODELS[this.settings.model];
    if (retired) {
      this.settings.model = retired;
      await this.saveSettings();
      new Notice("Grok model updated to " + retired + ". The old id is not in the picker.");
    } else if (!known) {
      this.settings.customModel = this.settings.model || "";
      this.settings.model = "custom";
      await this.saveSettings();
    }
  }
  async saveSettings() { await this.saveData(this.settings); }
  turns() { return Array.isArray(this.settings.history) ? this.settings.history : []; }
  async pushTurn(role, content) {
    const text = String(content || "").trim();
    if (!text) return;
    const turns = this.turns().concat([{ role: role, content: text.slice(0, 8000), at: todayStamp() }]).slice(-40);
    this.settings.history = turns;
    await this.saveSettings();
  }
  historyMarkdown() {
    const turns = this.turns();
    if (!turns.length) return "";
    const lines = ["## Grok chat", ""];
    turns.forEach((turn) => {
      lines.push("### " + (turn.role === "assistant" ? "Grok" : "You"));
      if (turn.at) lines.push("*" + turn.at + "*");
      lines.push("");
      lines.push(turn.content);
      lines.push("");
    });
    return lines.join("\n").trim() + "\n";
  }
  async insertHistory() {
    const md = this.historyMarkdown();
    if (!md) { new Notice("No Grok chat history yet."); return; }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view ? view.editor : null;
    this.insertText(editor, md, editor ? (this.settings.insertMode || "below") : "new-note");
    new Notice(editor ? "Chat history added to the note." : "Opened a note with the chat history.");
  }
  async suggestTitle(editor, view, host) {
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok Notes."); return; }
    if (!editor) { new Notice("Open a markdown note first."); return; }
    const body = editor.getValue();
    if (!body.trim()) { new Notice("This note is empty."); return; }
    if (host) setOut(host, "Suggesting a title…");
    const text = await this.complete([
      { role: "system", content: "Reply with one note title only. No quotes, no extension, no explanation. At most 8 words." },
      { role: "user", content: clip(body, this.contextLimit()) },
    ], { stream: false, reasoning_effort: "low", max_tokens: 40 });
    const title = cleanTitle(text);
    if (!title) { new Notice("Grok did not return a title."); return; }
    if (host && host.titleEl) host.titleEl.value = title;
    if (host) setOut(host, "Title: " + title + "\n\nTap Rename to apply it.");
    return title;
  }
  async applyTitle(title, view) {
    const file = view && view.file;
    const clean = cleanTitle(title);
    if (!file) { new Notice("Open a markdown note first."); return; }
    if (!clean) { new Notice("Type a title first."); return; }
    const parent = file.parent && file.parent.path && file.parent.path !== "/" ? file.parent.path + "/" : "";
    const path = parent + clean + ".md";
    if (path === file.path) { new Notice("That is already the title."); return; }
    if (this.app.vault.getAbstractFileByPath(path)) { new Notice("A note with that title already exists."); return; }
    await this.app.fileManager.renameFile(file, path);
    new Notice("Renamed note to " + clean);
  }
  async tagNote(editor, view, host) {
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok Notes."); return; }
    if (!editor) { new Notice("Open a markdown note first."); return; }
    const body = editor.getValue();
    if (!body.trim()) { new Notice("This note is empty."); return; }
    if (host) setOut(host, "Suggesting tags…");
    const title = view && view.file ? view.file.basename : "Untitled";
    const text = await this.complete([
      { role: "system", content: "Suggest Obsidian tags. Reply with 3 to 6 tags, one per line. Lowercase words with hyphens. No hash, no explanation." },
      { role: "user", content: "Title: " + title + "\n\n" + clip(body, this.contextLimit()) },
    ], { stream: false, reasoning_effort: "low", max_tokens: 200 });
    const tags = parseTags(text);
    if (!tags.length) { new Notice("Grok did not return tags."); if (host) setOut(host, text || "No tags."); return; }
    const added = applyTags(editor, tags);
    const line = "Tags: " + tags.map((tag) => "#" + tag).join(" ");
    if (host) setOut(host, line);
    if (host && host.tagEl) renderTagPills(host, tags);
    await this.pushTurn("user", "Tag " + title);
    await this.pushTurn("assistant", line);
    new Notice(added.length ? "Added tags: " + added.join(", ") : "Those tags were already on the note.");
  }
  async clearHistory() {
    this.settings.history = [];
    await this.saveSettings();
    const view = this.getChatView();
    if (view && view.histEl) renderHistory(view);
    new Notice("Grok chat history cleared.");
  }
  modelId() { return this.settings.model === "custom" ? (this.settings.customModel || "grok-4.7").trim() : this.settings.model; }
  contextLimit() { return isPhone() ? 24000 : 80000; }
  preferredUi() {
    const mode = this.settings.chatUi || "auto";
    if (mode === "modal" || mode === "sidebar") return mode;
    return isPhone() ? "modal" : "sidebar";
  }
  selectionOrEmpty() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return "";
    return view.editor.getSelection() || "";
  }
  activeNoteMeta() {
    const view = markdownView(this.app);
    if (!view || !view.editor) return { title: "", body: "", selection: "" };
    return { title: view.file ? view.file.basename : "Untitled", body: view.editor.getValue(), selection: view.editor.getSelection() || "" };
  }
  noteBlock(view, body) {
    const title = view && view.file ? view.file.basename : "Untitled";
    const head = this.settings.includeTitle ? "# " + title + "\n\n" : "";
    return head + clip(body || "", this.contextLimit());
  }
  async openChat(opts) {
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok Notes."); return; }
    const ui = this.preferredUi();
    if (ui === "sidebar") {
      this.pendingOpts = opts || {};
      await this.activateView();
      const view = this.getChatView();
      if (view) view.applyOpts(opts || {});
      return;
    }
    new GrokChatModal(this.app, this, opts || {}).open();
  }
  getChatView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf ? leaf.view : null;
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  async runQuick({ editor, view, userText, forceInsert, selection }) {
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok Notes."); return; }
    const notice = new Notice("Grok is thinking…", 0);
    try {
      const text = await this.complete([{ role: "system", content: this.settings.systemPrompt }, { role: "user", content: userText }], { reasoning_effort: "low" });
      notice.hide();
      if (!text) { new Notice("Grok returned an empty reply."); return; }
      this.insertText(editor, text, forceInsert || this.settings.insertMode, selection);
      await this.pushTurn("user", userText);
      await this.pushTurn("assistant", text);
      new Notice("Grok reply inserted.");
    } catch (err) {
      notice.hide();
      new Notice(err.message || String(err));
    }
  }
  insertText(editor, text, mode, selection) {
    const clean = text.trim() + "\n";
    if (!editor || mode === "copy") { this.createReplyNote(clean); new Notice("Opened a note with the reply."); return; }
    if (mode === "replace") {
      if (editor.getSelection() || selection) editor.replaceSelection(clean);
      else editor.replaceRange(clean, editor.getCursor());
      return;
    }
    if (mode === "new-note") { this.createReplyNote(clean); return; }
    const cursor = editor.getCursor("to");
    editor.replaceRange("\n\n" + clean, { line: cursor.line, ch: editor.getLine(cursor.line).length });
  }
  async createReplyNote(body) {
    const name = "Grok " + todayStamp().replace(/[:]/g, "-") + ".md";
    const file = await this.app.vault.create(name, "---\nsource: grok\ncreated: " + todayStamp() + "---\n\n" + body);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
  async testKey() {
    if (!this.settings.apiKey) { new Notice("No API key saved."); return; }
    const notice = new Notice("Testing xAI key…", 0);
    try {
      const text = await this.complete([{ role: "user", content: "Reply with exactly: ok" }], { max_tokens: 8, stream: false });
      notice.hide();
      new Notice(text && /ok/i.test(text) ? "API key works." : "Key accepted. Reply: " + clip(text, 80));
    } catch (err) {
      notice.hide();
      new Notice(err.message || String(err));
    }
  }
  async complete(messages, extra) {
    const settings = this.settings;
    const opts = extra || {};
    const maxOut = opts.max_tokens || Number(settings.maxTokens) || 2048;
    const effort = opts.reasoning_effort || "";
    const wantStream = opts.stream === false ? false : !!settings.stream;
    const useStream = wantStream && !isMobile();
    const body = {
      model: this.modelId(),
      messages,
      temperature: Number(settings.temperature) || 0.7,
      max_tokens: maxOut,
      max_completion_tokens: maxOut,
      stream: !!useStream,
    };
    if (effort) body.reasoning_effort = effort;
    if (this.abort) this.abort.abort();
    this.abort = new AbortController();
    const url = settings.apiBase.replace(/\/$/, "") + "/chat/completions";
    if (!useStream) return await this.completeOnce(url, body);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey }, body: JSON.stringify(body), signal: this.abort.signal });
      if (!res.ok) { const raw = await res.text(); throw new Error(this.errFromBody(res.status, raw)); }
      if (!res.body || !res.body.getReader) {
        const raw = await res.text();
        return this.textFromBody(raw);
      }
      return await this.readStream(res.body, opts.onToken);
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      return await this.completeOnce(url, { ...body, stream: false });
    }
  }
  async completeOnce(url, body) {
    const res = await requestUrl({ url, method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.settings.apiKey }, body: JSON.stringify({ ...body, stream: false }), throw: false });
    if (res.status < 200 || res.status >= 300) throw new Error(this.errFromBody(res.status, res.text));
    return this.textFromBody(res.text || JSON.stringify(res.json || {}));
  }
  textFromBody(raw) {
    let json = null;
    try { json = JSON.parse(raw); } catch (e) { json = null; }
    if (!json) return this.parseSse(raw).trim();
    const message = json.choices && json.choices[0] && json.choices[0].message;
    const text = partText(message && message.content).trim();
    if (text) return text;
    const reasoning = partText(message && message.reasoning_content).trim();
    if (reasoning && !text) throw new Error("Grok used the token budget on thinking and returned no summary. Raise Max tokens in Settings → Grok Notes, then try Summarize again.");
    return "";
  }
  parseSse(raw) {
    let out = "";
    String(raw || "").split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices && json.choices[0] && json.choices[0].delta;
        out += partText(delta && delta.content);
      } catch (e) {}
    });
    return out;
  }
  async readStream(stream, onToken) {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() || "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return out.trim();
        try {
          const json = JSON.parse(data);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          const piece = partText(delta && delta.content);
          if (piece) { out += piece; if (onToken) onToken(out); }
        } catch (e) {}
      }
    }
    return out.trim();
  }
  openImagine(source) {
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok Notes."); return; }
    new ImagineModal(this.app, this, source || "new").open();
  }
  async gatherImagineContext(source) {
    const folder = (this.settings.imageFolder || "Grok").replace(/^\/+|\/+$/g, "") || "Grok";
    if (source === "new") return "";
    if (source === "note") {
      const meta = this.activeNoteMeta();
      const body = meta.selection || meta.body || "";
      if (!body.trim()) return "";
      const title = meta.title ? "# " + meta.title + "\n\n" : "";
      return clip(title + body, 6000);
    }
    const active = this.app.workspace.getActiveFile();
    let files = [];
    if (source === "folder") {
      const parent = active ? active.parent : null;
      files = parent ? parent.children.filter((f) => f.extension === "md") : [];
      if (!files.length && active && active.extension === "md") files = [active];
    } else {
      const parent = active ? active.parent : null;
      files = parent ? notesInFolder(parent, folder, 12) : [];
      if (!files.length && active && active.extension === "md") files = [active];
    }
    files = files.slice(0, source === "folder" ? 8 : 12);
    const parts = [];
    for (const file of files) {
      const raw = await this.app.vault.cachedRead(file);
      parts.push("## " + file.basename + "\n" + clip(raw, 500));
    }
    return clip(parts.join("\n\n"), 7000);
  }
  async imagePromptFromContext(context, extra) {
    const ask = (extra || "").trim();
    const user = (ask ? "User direction: " + ask + "\n\n" : "") + "Source notes:\n\n" + context;
    return await this.complete([
      { role: "system", content: "Turn the notes into one image prompt for Grok Imagine. Concrete scene, subject, mood, and style. No title, no quotes, no explanation." },
      { role: "user", content: user },
    ], { stream: false, max_tokens: 400, reasoning_effort: "low" });
  }
  async generateImage(prompt) {
    const settings = this.settings;
    const body = {
      model: settings.imageModel || "grok-imagine-image-2.0",
      prompt: String(prompt || "").slice(0, 4000),
      n: 1,
      response_format: "b64_json",
    };
    if (settings.imageAspect) body.aspect_ratio = settings.imageAspect;
    const url = settings.apiBase.replace(/\/$/, "") + "/images/generations";
    let res = await requestUrl({ url, method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey }, body: JSON.stringify(body), throw: false });
    if ((res.status < 200 || res.status >= 300) && body.aspect_ratio) {
      delete body.aspect_ratio;
      res = await requestUrl({ url, method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey }, body: JSON.stringify(body), throw: false });
    }
    if (res.status < 200 || res.status >= 300) throw new Error(this.errFromBody(res.status, res.text));
    const json = res.json || {};
    const item = (json.data && json.data[0]) || {};
    const b64 = item.b64_json || "";
    if (!b64) throw new Error("Imagine returned no image. Check the image model id in Settings → Grok Notes.");
    return { b64, revised: item.revised_prompt || "" };
  }
  async saveImagineFile(b64) {
    const folder = normalizePath((this.settings.imageFolder || "Grok").replace(/^\/+|\/+$/g, "") || "Grok");
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    const path = normalizePath(folder + "/imagine-" + stamp + ".jpg");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await this.app.vault.createBinary(path, bytes.buffer);
  }
  embedImagine(file) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return false;
    const link = this.app.fileManager.generateMarkdownLink(file, view.file.path);
    const editor = view.editor;
    const cursor = editor.getCursor("to");
    editor.replaceRange("\n\n" + link + "\n", { line: cursor.line, ch: editor.getLine(cursor.line).length });
    return true;
  }
  errFromBody(status, raw) {
    let detail = raw || "";
    try { const j = JSON.parse(raw); detail = (j.error && (j.error.message || j.error)) || j.message || raw; } catch (e) {}
    if (status === 401) return "xAI rejected the API key (401). Check Settings → Grok Notes.";
    if (status === 429) return "xAI rate limit (429). Wait a moment and try again.";
    if (status === 400) return "Bad request (400): " + String(detail).slice(0, 220);
    return "xAI error " + status + ": " + String(detail).slice(0, 220);
  }
}



function notesInFolder(folder, skip, limit) {
  const out = [];
  const walk = (node) => {
    if (!node || out.length >= limit) return;
    (node.children || []).forEach((child) => {
      if (out.length >= limit) return;
      if (child.extension === "md" && child.path !== skip && !child.path.startsWith(skip + "/")) out.push(child);
      else if (child.children) walk(child);
    });
  };
  walk(folder);
  return out;
}
const QUICK_ACTIONS = [
  { id: "summarize", label: "Summarize", icon: "sparkles", needs: "note", prompt: "Summarize the context. Use a short heading, 5-8 bullets, then a one-line takeaway. Output only the summary." },
  { id: "rewrite", label: "Rewrite", icon: "files", needs: "selection", prompt: "Rewrite the context so it is clearer and tighter. Keep the meaning. Output only the rewrite." },
  { id: "grammar", label: "Grammar", icon: "check-circle", needs: "selection", prompt: "Fix grammar, spelling, and punctuation. Keep the author's voice. Output only the corrected text." },
  { id: "continue", label: "Continue", icon: "arrow-right", needs: "cursor", prompt: "Continue this note in the same voice and structure. Output only the next paragraphs, no preamble." },
];

function contextForChip(host, action) {
  const view = markdownView(host.app);
  const editor = view ? view.editor : null;
  const title = view && view.file ? view.file.basename : (host.opts && host.opts.title) || "";
  const saved = host.opts && host.opts.seed ? host.opts.seed : "";
  if (!editor) {
    if (!saved.trim()) return null;
    return { seed: saved, label: (host.opts && host.opts.label) || "context", title: title, reasoningEffort: "low" };
  }
  const sel = editor.getSelection() || "";
  if (action.needs === "cursor") {
    const before = editor.getRange({ line: 0, ch: 0 }, editor.getCursor());
    const seed = (before && before.trim()) ? before : (editor.getValue() || saved);
    if (!seed.trim()) return null;
    return { seed: seed, label: "note", title: title || "Untitled", reasoningEffort: "low" };
  }
  if (action.needs === "selection") {
    const seed = sel.trim() ? sel : saved;
    if (!seed.trim()) return null;
    return { seed: seed, label: sel.trim() ? "selection" : ((host.opts && host.opts.label) || "context"), title: title || "Untitled", reasoningEffort: "low" };
  }
  const seed = (editor.getValue() || "").trim() ? editor.getValue() : saved;
  if (!seed.trim()) return null;
  return { seed: seed, label: "note", title: title || "Untitled", reasoningEffort: "low" };
}

function runQuickChip(host, action) {
  if (host.busy) return;
  const ctx = contextForChip(host, action);
  if (!ctx) {
    new Notice(action.needs === "selection" ? "Select text, or tap Use this note first." : "Open a note first.");
    return;
  }
  applyChatOpts(host, Object.assign({}, ctx, { presetPrompt: action.prompt }));
  if (host.promptEl) host.promptEl.value = action.prompt;
  host.send();
}


const INSERT_MODES = [
  ["below", "Insert below cursor"],
  ["replace", "Replace selection"],
  ["copy", "Open a note with the reply"],
  ["new-note", "Create a new note"],
];
function insertLabel(mode) {
  const found = INSERT_MODES.find(([id]) => id === mode);
  return found ? found[1] : "Insert below cursor";
}
function chipButton(parent, label, icon) {
  const btn = parent.createEl("button", { cls: "gm-chip-btn", attr: { type: "button" } });
  const ico = btn.createSpan({ cls: "gm-ico" });
  setIcon(ico, icon);
  btn.createSpan({ text: label });
  return btn;
}
function mountChat(root, host) {
  root.empty();
  const wrap = root.createDiv({ cls: "gm-wrap" });
  if (host.close) wrap.createDiv({ cls: "gm-handle" });
  const head = wrap.createDiv({ cls: "gm-head" });
  const title = head.createDiv({ cls: "gm-title" });
  const logo = title.createSpan({ cls: "gm-logo" });
  setIcon(logo, "sparkles");
  title.createEl("h2", { text: "Grok Notes" });
  host.modelChip = head.createSpan({ cls: "gm-chip", text: host.plugin.modelId() });
  if (host.close) {
    const closeBtn = head.createEl("button", { cls: "gm-close", attr: { type: "button", "aria-label": "Close" } });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => host.close());
  }
  const coffee = wrap.createEl("a", { cls: "gm-coffee", attr: { href: "https://buymeacoffee.com/chrostn", target: "_blank", rel: "noopener" } });
  coffee.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 7h13a3 3 0 0 1 0 6h-1.1A6 6 0 0 1 5 16.9V18h10v-1.1A6 6 0 0 1 15.9 13H17a3 3 0 0 0 0-6H4V7zm1 2v3.2A4 4 0 0 0 14 13V9H5zm12 0h.2a1 1 0 0 1 0 2H17V9z"/></svg><span>Buy me a coffee</span>';
  coffee.addEventListener("click", (e) => { e.preventDefault(); window.open("https://buymeacoffee.com/chrostn", "_blank"); });
  const titleRow = wrap.createDiv({ cls: "gm-title-row" });
  host.titleEl = titleRow.createEl("input", { cls: "gm-title-input", attr: { type: "text", placeholder: "Note title" } });
  host.titleEl.value = (host.opts && host.opts.title) || "";
  host.titleBtn = titleRow.createEl("button", { text: "Title", cls: "gm-rename" });
  host.renameBtn = titleRow.createEl("button", { text: "Rename", cls: "gm-rename" });
  host.titleBtn.addEventListener("click", () => titleFromHost(host));
  host.renameBtn.addEventListener("click", () => renameFromHost(host));
  host.chipBtns = [host.titleBtn];
  const tagRow = wrap.createDiv({ cls: "gm-tag-row" });
  host.tagEl = tagRow.createDiv({ cls: "gm-tag-pills" });
  host.tagEl.createSpan({ cls: "gm-hint", text: "Tags from the note" });
  host.tagBtn = tagRow.createEl("button", { text: "Auto", cls: "gm-rename" });
  host.tagBtn.addEventListener("click", () => tagFromHost(host));
  host.chipBtns.push(host.tagBtn);
  const chips = wrap.createDiv({ cls: "gm-chips" });
  QUICK_ACTIONS.forEach((action) => {
    const btn = chipButton(chips, action.label, action.icon || "sparkles");
    btn.addEventListener("click", () => runQuickChip(host, action));
    host.chipBtns.push(btn);
  });
  const imagineBtn = chipButton(chips, "Imagine", "wand");
  imagineBtn.addEventListener("click", () => host.plugin.openImagine(host.opts && host.opts.seed ? "note" : "new"));
  host.chipBtns.push(imagineBtn);
  const noteChip = chipButton(chips, "Use note", "file");
  noteChip.addEventListener("click", () => host.grabNote());
  host.chipBtns.push(noteChip);
  host.hintEl = wrap.createDiv({ cls: "gm-hint" });
  host.histEl = wrap.createDiv({ cls: "gm-history" });
  wrap.createDiv({ cls: "gm-kicker gm-response-label", text: "Assistant response" });
  host.outEl = wrap.createDiv({ cls: "gm-out is-empty", text: "A reply will show here." });
  const actions = wrap.createDiv({ cls: "gm-actions" });
  const insertWrap = actions.createDiv({ cls: "gm-insert-wrap" });
  host.insertBtn = insertWrap.createEl("button", { text: "Insert", cls: "gm-insert" });
  host.modeEl = insertWrap.createEl("select", { cls: "gm-mode-select", attr: { "aria-label": "Insert mode" } });
  INSERT_MODES.forEach(([id, label]) => {
    const opt = host.modeEl.createEl("option", { text: label });
    opt.value = id;
  });
  host.modeEl.value = host.plugin.settings.insertMode || "below";
  host.modeEl.addEventListener("change", async () => {
    host.plugin.settings.insertMode = host.modeEl.value;
    await host.plugin.saveSettings();
  });
  host.replaceBtn = actions.createEl("button", { cls: "gm-ghost", text: "Replace" });
  const replaceIco = host.replaceBtn.createSpan({ cls: "gm-ico" });
  setIcon(replaceIco, "pencil");
  host.copyBtn = actions.createEl("button", { cls: "gm-ghost", text: "Copy" });
  const copyIco = host.copyBtn.createSpan({ cls: "gm-ico" });
  setIcon(copyIco, "copy");
  host.histBtn = actions.createEl("button", { cls: "gm-ghost gm-mini", text: "History" });
  host.clearBtn = actions.createEl("button", { cls: "gm-ghost gm-mini", text: "Clear" });
  host.insertBtn.disabled = true;
  host.replaceBtn.disabled = true;
  host.copyBtn.disabled = true;
  host.insertBtn.addEventListener("click", () => host.insert(host.modeEl ? host.modeEl.value : host.plugin.settings.insertMode));
  host.replaceBtn.addEventListener("click", () => host.insert("replace"));
  host.copyBtn.addEventListener("click", () => host.insert("copy"));
  host.histBtn.addEventListener("click", () => host.plugin.insertHistory());
  host.clearBtn.addEventListener("click", async () => { await host.plugin.clearHistory(); renderHistory(host); });
  const compose = wrap.createDiv({ cls: "gm-compose" });
  host.promptEl = compose.createEl("textarea", { cls: "gm-prompt", attr: { placeholder: "Ask Grok anything about this note...", rows: "1", enterkeyhint: "send" } });
  host.doneBtn = compose.createEl("button", { text: "Done", cls: "gm-done", attr: { type: "button" } });
  host.sendBtn = compose.createEl("button", { cls: "gm-send", attr: { type: "button", "aria-label": "Send" } });
  setIcon(host.sendBtn, "send");
  host.stopBtn = host.sendBtn;
  host.doneBtn.addEventListener("click", () => hideKeyboard(host));
  host.sendBtn.addEventListener("click", () => { hideKeyboard(host); host.busy ? host.stop() : host.send(); });
  host.promptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (isPhone() || e.metaKey || e.ctrlKey)) { e.preventDefault(); hideKeyboard(host); if (!isPhone()) host.send(); }
  });
  if (host.titleEl) host.titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); hideKeyboard(host); } });
  bindKeyboard(host, wrap);
}
function hideKeyboard(host) {
  [host.promptEl, host.titleEl, document.activeElement].forEach((el) => {
    if (!el || !el.blur) return;
    el.setAttribute("readonly", "readonly");
    el.blur();
    setTimeout(() => el.removeAttribute("readonly"), 80);
  });
  if (host.kbBar) host.kbBar.removeClass("is-open");
  if (host.sheetEl) host.sheetEl.style.transform = "";
  if (host.wrapEl) host.wrapEl.style.paddingBottom = "";
}
function keyboardCover() {
  const vv = window.visualViewport;
  const reported = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  if (reported > 80) return reported;
  return Math.round(window.innerHeight * 0.42);
}
function bindKeyboard(host, wrap) {
  host.wrapEl = wrap;
  if (!isPhone()) return;
  const bar = document.body.createDiv({ cls: "gm-kb-bar" });
  const done = bar.createEl("button", { text: "Done", cls: "gm-done", attr: { type: "button" } });
  done.addEventListener("touchend", (e) => { e.preventDefault(); hideKeyboard(host); });
  done.addEventListener("click", (e) => { e.preventDefault(); hideKeyboard(host); });
  host.kbBar = bar;
  const lift = () => {
    const focused = document.activeElement === host.promptEl || document.activeElement === host.titleEl;
    const covered = focused ? keyboardCover() : 0;
    if (host.sheetEl) host.sheetEl.style.transform = covered ? "translateY(-" + covered + "px)" : "";
    bar.toggleClass("is-open", !!covered);
    bar.style.bottom = covered ? covered + "px" : "";
    wrap.style.paddingBottom = covered ? "52px" : "";
  };
  host.liftKb = lift;
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", lift);
    vv.addEventListener("scroll", lift);
  }
  [host.promptEl, host.titleEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("focus", () => setTimeout(lift, 30));
    el.addEventListener("blur", () => setTimeout(lift, 30));
  });
  host.closeKb = () => { if (bar.parentElement) bar.remove(); if (host.sheetEl) host.sheetEl.style.transform = ""; };
}
function applyChatOpts(host, opts) {
  host.opts = opts || {};
  host.reply = "";
  if (host.promptEl && host.opts.presetPrompt) host.promptEl.value = host.opts.presetPrompt;
  if (host.modelChip) host.modelChip.setText(host.plugin.modelId());
  const label = host.opts.label || (host.opts.seed ? "context" : "chat");
  const title = host.opts.title || "";
  const n = host.opts.seed ? host.opts.seed.trim().length : 0;
  if (host.ctxChip) host.ctxChip.setText(n ? label + (title ? " · " + title : "") : "no context");
  if (host.titleEl && title && !host.titleEl.value) host.titleEl.value = title;
  if (host.hintEl) host.hintEl.setText(n ? "Context: " + n + " characters from the note/selection." : "No note context yet. Tap Use this note or select text first.");
  renderHistory(host);
  const last = host.plugin.turns().filter((t) => t.role === "assistant").slice(-1)[0];
  if (last && host.reply === "") host.reply = last.content;
  if (host.opts.autoSend) {
    host.opts.autoSend = false;
    setTimeout(() => host.send(), 50);
  }
}
async function sendChat(host) {
  const question = (host.promptEl.value || "").trim();
  hideKeyboard(host);
  if (!question) { new Notice("Type a prompt first."); return; }
  if (!host.plugin.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok Notes."); return; }
  if (host.busy) return;
  host.busy = true;
  host.sendBtn.disabled = false;
  host.sendBtn.addClass("is-busy");
  setIcon(host.sendBtn, "square");
  setChipsEnabled(host, false);
  setOut(host, "Thinking…");
  const messages = [{ role: "system", content: host.plugin.settings.systemPrompt }];
  host.plugin.turns().slice(-12).forEach((turn) => {
    if (turn.role === "user" || turn.role === "assistant") messages.push({ role: turn.role, content: turn.content });
  });
  if (host.opts && host.opts.seed && host.opts.seed.trim()) {
    messages.push({ role: "user", content: "Context from my Obsidian note" + (host.opts.title ? " (\"" + host.opts.title + "\")" : "") + ":\n\n" + clip(host.opts.seed, host.plugin.contextLimit()) });
    messages.push({ role: "assistant", content: "I have the note context. Ask your question." });
  }
  messages.push({ role: "user", content: question });
  try {
    const text = await host.plugin.complete(messages, { reasoning_effort: (host.opts && host.opts.reasoningEffort) || "", onToken: (partial) => { host.reply = partial; setOut(host, partial); } });
    host.reply = text;
    if (text) {
      await host.plugin.pushTurn("user", question);
      await host.plugin.pushTurn("assistant", text);
      renderHistory(host);
      await renderReply(host, text);
    } else setOut(host, "(empty reply)");
    const ok = !!text;
    host.insertBtn.disabled = !ok;
    if (host.replaceBtn) host.replaceBtn.disabled = !ok;
    if (host.copyBtn) host.copyBtn.disabled = !ok;
  } catch (err) {
    if (err && err.name === "AbortError") setOut(host, (host.reply || "") + "\n\n[stopped]");
    else setOut(host, err.message || String(err), "error");
  } finally {
    host.busy = false;
    host.sendBtn.disabled = false;
    host.sendBtn.removeClass("is-busy");
    setIcon(host.sendBtn, "send");
    setChipsEnabled(host, true);
  }
}
function stopChat(host) {
  if (host.plugin.abort) host.plugin.abort.abort();
  host.busy = false;
  if (host.sendBtn) host.sendBtn.disabled = false;
  if (host.stopBtn) host.stopBtn.disabled = true;
}
function renderHistory(host) {
  if (!host.histEl) return;
  const turns = host.plugin.turns();
  host.histEl.empty();
  if (!turns.length) {
    if (host.histBtn) host.histBtn.disabled = true;
    return;
  }
  if (host.histBtn) host.histBtn.disabled = false;
  turns.slice(-8).forEach((turn) => {
    const row = host.histEl.createDiv({ cls: "gm-turn" });
    row.createDiv({ cls: "gm-kicker", text: (turn.role === "assistant" ? "Grok" : "You") + (turn.at ? " · " + turn.at : "") });
    row.createDiv({ cls: "gm-turn-text", text: turn.content });
  });
  host.histEl.scrollTop = host.histEl.scrollHeight;
}
function setChipsEnabled(host, on) {
  (host.chipBtns || []).forEach((btn) => { btn.disabled = !on; });
}
function setOut(host, text, kind) {
  host.outEl.removeClass("is-empty");
  host.outEl.removeClass("is-error");
  host.outEl.removeClass("is-md");
  if (kind === "error") host.outEl.addClass("is-error");
  if (!text) host.outEl.addClass("is-empty");
  host.outEl.setText(text || "Reply will show here.");
  host.outEl.scrollTop = host.outEl.scrollHeight;
}
async function renderReply(host, text) {
  host.outEl.removeClass("is-empty");
  host.outEl.removeClass("is-error");
  host.outEl.addClass("is-md");
  host.outEl.empty();
  const view = host.app.workspace.getActiveViewOfType(MarkdownView);
  const sourcePath = view && view.file ? view.file.path : "";
  try {
    await MarkdownRenderer.render(host.app, text, host.outEl, sourcePath, host);
  } catch (err) {
    host.outEl.removeClass("is-md");
    host.outEl.setText(text);
  }
  host.outEl.scrollTop = 0;
}
function insertFromChat(host, mode) {
  if (!host.reply) return;
  const view = host.app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view ? view.editor : null;
  host.plugin.insertText(editor, host.reply, mode);
  if (typeof host.afterInsert === "function") host.afterInsert(mode);
}
function renderTagPills(host, tags) {
  if (!host.tagEl) return;
  host.tagEl.empty();
  if (!tags.length) { host.tagEl.createSpan({ cls: "gm-hint", text: "No tags yet" }); return; }
  tags.forEach((tag) => host.tagEl.createSpan({ cls: "gm-pill", text: "#" + tag }));
}
function cleanTitle(text) {
  return String(text || "").split("\n")[0].replace(/^[#*"'\s]+|[#*"'\s.]+$/g, "").replace(/[\\/:*?"<>|]/g, "").replace(/\.md$/i, "").trim().slice(0, 80);
}
async function titleFromHost(host) {
  if (host.busy) return;
  const view = markdownView(host.app);
  const editor = view ? view.editor : null;
  host.busy = true;
  setChipsEnabled(host, false);
  try { await host.plugin.suggestTitle(editor, view, host); }
  catch (err) { new Notice(err.message || String(err)); }
  finally { host.busy = false; setChipsEnabled(host, true); }
}
async function renameFromHost(host) {
  const view = markdownView(host.app);
  try { await host.plugin.applyTitle(host.titleEl ? host.titleEl.value : "", view); }
  catch (err) { new Notice(err.message || String(err)); }
}
function parseTags(text) {
  const out = [];
  String(text || "").split(/[\n,]/).forEach((part) => {
    const tag = part.replace(/^[-*\d.\s#]+/, "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_\/-]/g, "");
    if (tag && tag.length < 40 && out.indexOf(tag) === -1) out.push(tag);
  });
  return out.slice(0, 6);
}
function applyTags(editor, tags) {
  const raw = editor.getValue();
  const existing = [];
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const block = fm[1];
    const tagLine = block.match(/(?:^|\n)tags:\s*\[([^\]]*)\]/);
    const tagList = block.match(/(?:^|\n)tags:\s*\n((?:\s*-\s*[^\n]+\n?)*)/);
    if (tagLine) tagLine[1].split(",").forEach((item) => existing.push(item.trim().replace(/^['"]|['"]$/g, "")));
    if (tagList) tagList[1].split("\n").forEach((item) => { const t = item.replace(/^\s*-\s*/, "").trim(); if (t) existing.push(t); });
  }
  const have = existing.map((tag) => tag.toLowerCase());
  const added = tags.filter((tag) => have.indexOf(tag) === -1);
  if (!added.length) return added;
  if (fm) {
    const block = fm[1];
    let next = block;
    if (/\ntags:/.test("\n" + block)) {
      next = block.replace(/tags:\s*\n(?:\s*-\s*[^\n]+\n?)*/, "tags:\n" + existing.concat(added).map((tag) => "  - " + tag).join("\n") + "\n");
      if (next === block) next = block.replace(/tags:\s*\[[^\]]*\]/, "tags:\n" + existing.concat(added).map((tag) => "  - " + tag).join("\n"));
    } else {
      next = block.replace(/\s*$/, "") + "\ntags:\n" + added.map((tag) => "  - " + tag).join("\n");
    }
    editor.setValue("---\n" + next + "\n---" + raw.slice(fm[0].length));
    return added;
  }
  editor.setValue("---\ntags:\n" + added.map((tag) => "  - " + tag).join("\n") + "\n---\n\n" + raw);
  return added;
}
async function tagFromHost(host) {
  if (host.busy) return;
  const view = markdownView(host.app);
  const editor = view ? view.editor : null;
  host.busy = true;
  setChipsEnabled(host, false);
  try { await host.plugin.tagNote(editor, view, host); }
  catch (err) { new Notice(err.message || String(err)); if (host.outEl) setOut(host, err.message || String(err), "error"); }
  finally { host.busy = false; setChipsEnabled(host, true); }
}
function grabNote(host) {
  const meta = host.plugin.activeNoteMeta();
  if (!meta.body && !meta.selection) { new Notice("Open a markdown note first."); return; }
  applyChatOpts(host, { seed: meta.selection || meta.body, label: meta.selection ? "selection" : "note", title: meta.title, presetPrompt: host.promptEl.value });
  new Notice(meta.selection ? "Using selected text." : "Using this note.");
}
class GrokChatModal extends Modal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.opts = opts || {};
    this.busy = false;
    this.reply = "";
    this.afterInsert = () => this.close();
  }
  onOpen() {
    this.modalEl.addClass("gm-modal");
    this.modalEl.addClass("gm-sheet");
    mountChat(this.contentEl, this);
    this.sheetEl = this.modalEl;
    applyChatOpts(this, this.opts);
    if (!isPhone()) setTimeout(() => this.promptEl && this.promptEl.focus(), 30);
  }
  onClose() { stopChat(this); if (this.closeKb) this.closeKb(); this.contentEl.empty(); }
  send() { return sendChat(this); }
  stop() { stopChat(this); }
  insert(mode) { insertFromChat(this, mode); }
  grabNote() { grabNote(this); }
}
class GrokChatView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.opts = plugin.pendingOpts || {};
    this.busy = false;
    this.reply = "";
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Grok Notes"; }
  getIcon() { return "sparkles"; }
  async onOpen() {
    this.contentEl.addClass("gm-view");
    mountChat(this.contentEl, this);
    applyChatOpts(this, this.plugin.pendingOpts || this.opts || {});
  }
  async onClose() { stopChat(this); if (this.closeKb) this.closeKb(); }
  applyOpts(opts) { applyChatOpts(this, opts); if (!isPhone() && this.promptEl) this.promptEl.focus(); }
  send() { return sendChat(this); }
  stop() { stopChat(this); }
  insert(mode) { insertFromChat(this, mode); }
  grabNote() { grabNote(this); }
}
class GrokSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Grok Notes" });
    const coffee = containerEl.createEl("a", { cls: "gm-coffee", attr: { href: "https://buymeacoffee.com/chrostn" } });
    coffee.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 7h13a3 3 0 0 1 0 6h-1.1A6 6 0 0 1 5 16.9V18h10v-1.1A6 6 0 0 1 15.9 13H17a3 3 0 0 0 0-6H4V7zm1 2v3.2A4 4 0 0 0 14 13V9H5zm12 0h.2a1 1 0 0 1 0 2H17V9z"/></svg><span>Buy me a coffee</span>';
    coffee.addEventListener("click", (e) => { e.preventDefault(); window.open("https://buymeacoffee.com/chrostn", "_blank"); });
    containerEl.createEl("p", { text: "Works on laptop, tablet, and phone. Same vault settings sync. Get an API key at console.x.ai." });
    new Setting(containerEl).setName("xAI API key").setDesc("Bearer token from console.x.ai. Stored in this vault plugin data.").addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.setAttribute("autocomplete", "off");
      text.inputEl.style.fontSize = "16px";
      text.setPlaceholder("xai-…").setValue(this.plugin.settings.apiKey).onChange(async (value) => { this.plugin.settings.apiKey = value.trim(); await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Chat layout").setDesc("Auto = sidebar on laptop/tablet, sheet on phone.").addDropdown((drop) => {
      drop.addOption("auto", "Auto (recommended)");
      drop.addOption("sidebar", "Always sidebar / pane");
      drop.addOption("modal", "Always popup sheet");
      drop.setValue(this.plugin.settings.chatUi || "auto");
      drop.onChange(async (value) => { this.plugin.settings.chatUi = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("API base").setDesc("Leave default unless you proxy the xAI API.").addText((text) => {
      text.inputEl.style.fontSize = "16px";
      text.setPlaceholder("https://api.x.ai/v1").setValue(this.plugin.settings.apiBase).onChange(async (value) => { this.plugin.settings.apiBase = value.trim() || DEFAULT_SETTINGS.apiBase; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Model").setDesc("Default is grok-4.7. Prices are billed by xAI. Grok 4.7 Fast is not on the public API. If a name 400s, pick Custom and paste the id from docs.x.ai/developers/models.").addDropdown((drop) => {
      MODELS.forEach(([id, label]) => drop.addOption(id, label));
      drop.setValue(this.plugin.settings.model);
      drop.onChange(async (value) => { this.plugin.settings.model = value; await this.plugin.saveSettings(); this.display(); });
    });
    if (this.plugin.settings.model === "custom") {
      new Setting(containerEl).setName("Custom model id").addText((text) => {
        text.inputEl.style.fontSize = "16px";
        text.setPlaceholder("grok-4.7").setValue(this.plugin.settings.customModel).onChange(async (value) => { this.plugin.settings.customModel = value.trim(); await this.plugin.saveSettings(); });
      });
    }
    new Setting(containerEl).setName("Temperature").setDesc("0 = strict, 1 = looser.").addSlider((slider) => {
      slider.setLimits(0, 1, 0.1);
      slider.setValue(Number(this.plugin.settings.temperature));
      slider.setDynamicTooltip();
      slider.onChange(async (value) => { this.plugin.settings.temperature = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Max tokens").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.style.fontSize = "16px";
      text.setPlaceholder("2048").setValue(String(this.plugin.settings.maxTokens)).onChange(async (value) => {
        const n = parseInt(value, 10);
        this.plugin.settings.maxTokens = Number.isFinite(n) ? n : 2048;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName("Insert mode").setDesc("What quick commands do with the reply.").addDropdown((drop) => {
      drop.addOption("below", "Insert below cursor");
      drop.addOption("replace", "Replace selection");
      drop.addOption("copy", "Open a note with the reply");
      drop.addOption("new-note", "Create a new note");
      drop.setValue(this.plugin.settings.insertMode);
      drop.onChange(async (value) => { this.plugin.settings.insertMode = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Stream replies").setDesc("Show tokens as they arrive on laptop. Phone always waits for the full reply — mobile drops streams.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.stream);
      toggle.onChange(async (value) => { this.plugin.settings.stream = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Include note title in context").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.includeTitle);
      toggle.onChange(async (value) => { this.plugin.settings.includeTitle = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("System prompt").setDesc("Sent with every request.").addTextArea((area) => {
      area.inputEl.rows = 5;
      area.inputEl.style.width = "100%";
      area.inputEl.style.fontSize = "16px";
      area.setValue(this.plugin.settings.systemPrompt);
      area.onChange(async (value) => { this.plugin.settings.systemPrompt = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Imagine model").setDesc("Image calls use /images/generations and are billed per image. grok-imagine-image-2.0 is the current Imagine model.").addDropdown((drop) => {
      drop.addOption("grok-imagine-image-2.0", "Grok Imagine 2.0");
      drop.addOption("grok-imagine-image", "Grok Imagine");
      drop.addOption("grok-2-image", "Grok 2 Image");
      drop.setValue(this.plugin.settings.imageModel || "grok-imagine-image-2.0");
      drop.onChange(async (value) => { this.plugin.settings.imageModel = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Imagine aspect").setDesc("Used when the model accepts it. Phone notes often look better at 1:1 or 3:4.").addDropdown((drop) => {
      [["1:1", "1:1"], ["16:9", "16:9"], ["9:16", "9:16"], ["4:3", "4:3"], ["3:4", "3:4"]].forEach(([id, label]) => drop.addOption(id, label));
      drop.setValue(this.plugin.settings.imageAspect || "1:1");
      drop.onChange(async (value) => { this.plugin.settings.imageAspect = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Imagine folder").setDesc("Vault folder for saved jpg files.").addText((text) => {
      text.inputEl.style.fontSize = "16px";
      text.setPlaceholder("Grok").setValue(this.plugin.settings.imageFolder || "Grok").onChange(async (value) => { this.plugin.settings.imageFolder = value.trim() || "Grok"; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Test connection").setDesc("Sends a tiny ping to api.x.ai.").addButton((btn) => {
      btn.setButtonText("Test API key");
      btn.setCta();
      btn.onClick(() => this.plugin.testKey());
    });
  }
}
class ImagineModal extends Modal {
  constructor(app, plugin, source) {
    super(app);
    this.plugin = plugin;
    this.source = source || "new";
    this.b64 = "";
    this.file = null;
    this.busy = false;
  }
  onOpen() {
    this.modalEl.addClass("gm-modal");
    const root = this.contentEl;
    root.empty();
    const wrap = root.createDiv({ cls: "gm-wrap" });
    wrap.createEl("h2", { text: "Imagine" });
    wrap.createDiv({ cls: "gm-hint", text: "New prompt, this note, this folder, or this folder plus subfolders. Images are billed by xAI." });
    const sourceRow = wrap.createDiv({ cls: "gm-imagine-row" });
    this.sourceEl = sourceRow.createEl("select", { cls: "gm-imagine-select" });
    [["new", "Something new"], ["note", "This note"], ["folder", "This folder"], ["vault", "Folder and subfolders"]].forEach(([id, label]) => {
      const opt = this.sourceEl.createEl("option", { text: label });
      opt.value = id;
    });
    this.sourceEl.value = this.source;
    this.promptEl = wrap.createEl("textarea", { cls: "gm-prompt", attr: { placeholder: "A quiet desk at night, one lamp, notebook open…", rows: "4" } });
    this.statusEl = wrap.createDiv({ cls: "gm-hint", text: "Folder and subfolders reads only the open note\u2019s folder, up to 12 notes." });
    this.previewEl = wrap.createDiv({ cls: "gm-imagine-preview" });
    const actions = wrap.createDiv({ cls: "gm-actions" });
    this.draftBtn = actions.createEl("button", { text: "Draft from source" });
    this.goBtn = actions.createEl("button", { text: "Generate", cls: "mod-cta" });
    this.saveBtn = actions.createEl("button", { text: "Save to vault" });
    this.embedBtn = actions.createEl("button", { text: "Save and embed" });
    this.saveBtn.disabled = true;
    this.embedBtn.disabled = true;
    this.draftBtn.addEventListener("click", () => this.draft());
    this.goBtn.addEventListener("click", () => this.generate());
    this.saveBtn.addEventListener("click", () => this.save(false));
    this.embedBtn.addEventListener("click", () => this.save(true));
    if (this.source !== "new") this.draft();
  }
  setStatus(text) { if (this.statusEl) this.statusEl.setText(text); }
  async draft() {
    if (this.busy) return;
    const source = this.sourceEl.value;
    if (source === "new") { this.setStatus("Type a prompt, then Generate."); return; }
    this.busy = true;
    this.draftBtn.disabled = true;
    this.setStatus("Reading " + source + "…");
    try {
      const context = await this.plugin.gatherImagineContext(source);
      if (!context.trim()) { this.setStatus("Nothing to read. Open a note, or type a prompt."); return; }
      this.setStatus("Writing an image prompt…");
      const prompt = await this.plugin.imagePromptFromContext(context, this.promptEl.value);
      if (prompt) this.promptEl.value = prompt.trim();
      this.setStatus("Prompt ready. Generate spends one image.");
    } catch (err) {
      this.setStatus(err.message || String(err));
    } finally {
      this.busy = false;
      this.draftBtn.disabled = false;
    }
  }
  async generate() {
    if (this.busy) return;
    const prompt = (this.promptEl.value || "").trim();
    if (!prompt) { this.setStatus("Add a prompt first."); return; }
    this.busy = true;
    this.goBtn.disabled = true;
    this.setStatus("Generating…");
    try {
      const result = await this.plugin.generateImage(prompt);
      this.b64 = result.b64;
      this.file = null;
      this.previewEl.empty();
      this.previewEl.createEl("img", { attr: { src: "data:image/jpeg;base64," + this.b64, alt: "Imagine preview" } });
      this.saveBtn.disabled = false;
      this.embedBtn.disabled = false;
      this.setStatus(result.revised ? "Ready. Model note: " + result.revised.slice(0, 140) : "Ready. Save it into the vault.");
    } catch (err) {
      this.setStatus(err.message || String(err));
    } finally {
      this.busy = false;
      this.goBtn.disabled = false;
    }
  }
  async save(embed) {
    if (!this.b64) return;
    try {
      if (!this.file) this.file = await this.plugin.saveImagineFile(this.b64);
      let extra = "Saved " + this.file.path;
      if (embed) {
        const ok = this.plugin.embedImagine(this.file);
        extra = ok ? "Embedded in the open note." : "Saved. Open a note to embed it.";
      }
      this.setStatus(extra);
      new Notice(extra);
    } catch (err) {
      this.setStatus(err.message || String(err));
    }
  }
}
module.exports = GrokPlugin;
