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

class GrokPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.abort = null;
    this.pendingOpts = null;
    this.registerView(VIEW_TYPE, (leaf) => new GrokChatView(leaf, this));
    this.addRibbonIcon("sparkles", "Grok", () => {
      this.openChat({
        seed: this.selectionOrEmpty(),
        label: this.selectionOrEmpty() ? "selection" : "chat",
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
        const sizeHint = isPhone() ? "for a phone screen: 5-8 bullets, then one-line takeaway" : "with a short heading, key bullets, and a one-line takeaway";
        this.runQuick({ editor, view, userText: "Summarize this note " + sizeHint + ".\n\n" + this.noteBlock(view, editor.getValue()) });
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
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const sel = editor.getSelection();
      if (!sel || !sel.trim()) return;
      menu.addItem((item) => { item.setTitle("Ask Grok about selection").setIcon("sparkles").onClick(() => { this.openChat({ seed: sel, label: "selection", presetPrompt: "Help with the selected text. Improve, explain, or answer depending on what it is." }); }); });
      menu.addItem((item) => { item.setTitle("Rewrite selection with Grok").setIcon("sparkles").onClick(() => { this.runQuick({ editor, userText: "Rewrite the following so it is clearer and tighter. Keep meaning. Output only the rewrite.\n\n" + sel, forceInsert: "replace", selection: sel }); }); });
    }));
    if (Platform && Platform.isDesktop) {
      const status = this.addStatusBarItem();
      status.setText("Grok");
      status.addClass("mod-clickable");
      status.setAttr("aria-label", "Open Grok");
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
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return { title: "", body: "", selection: "" };
    return { title: view.file ? view.file.basename : "Untitled", body: view.editor.getValue(), selection: view.editor.getSelection() || "" };
  }
  noteBlock(view, body) {
    const title = view && view.file ? view.file.basename : "Untitled";
    const head = this.settings.includeTitle ? "# " + title + "\n\n" : "";
    return head + clip(body || "", this.contextLimit());
  }
  async openChat(opts) {
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok."); return; }
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
    if (!this.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok."); return; }
    const notice = new Notice("Grok is thinking…", 0);
    try {
      const text = await this.complete([{ role: "system", content: this.settings.systemPrompt }, { role: "user", content: userText }]);
      notice.hide();
      if (!text) { new Notice("Grok returned an empty reply."); return; }
      this.insertText(editor, text, forceInsert || this.settings.insertMode, selection);
      new Notice("Grok reply inserted.");
    } catch (err) {
      notice.hide();
      new Notice(err.message || String(err));
    }
  }
  insertText(editor, text, mode, selection) {
    if (!editor) { this.copyText(text); new Notice("No editor open — copied reply."); return; }
    const clean = text.trim() + "\n";
    if (mode === "copy") { this.copyText(clean); new Notice("Copied Grok reply."); return; }
    if (mode === "replace") {
      if (editor.getSelection() || selection) editor.replaceSelection(clean);
      else editor.replaceRange(clean, editor.getCursor());
      return;
    }
    if (mode === "new-note") { this.createReplyNote(clean); return; }
    const cursor = editor.getCursor("to");
    editor.replaceRange("\n\n" + clean, { line: cursor.line, ch: editor.getLine(cursor.line).length });
  }
  copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(() => {}); return; }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
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
    const useStream = extra && extra.stream === false ? false : settings.stream;
    const body = { model: this.modelId(), messages, temperature: Number(settings.temperature) || 0.7, max_tokens: (extra && extra.max_tokens) || Number(settings.maxTokens) || 2048, stream: !!useStream };
    if (this.abort) this.abort.abort();
    this.abort = new AbortController();
    const url = settings.apiBase.replace(/\/$/, "") + "/chat/completions";
    if (!useStream) {
      const res = await requestUrl({ url, method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey }, body: JSON.stringify({ ...body, stream: false }), throw: false });
      if (res.status < 200 || res.status >= 300) throw new Error(this.errFromBody(res.status, res.text));
      const json = res.json;
      const text = json && json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : "";
      return (text || "").trim();
    }
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey }, body: JSON.stringify(body), signal: this.abort.signal });
    if (!res.ok) { const raw = await res.text(); throw new Error(this.errFromBody(res.status, raw)); }
    if (!res.body || !res.body.getReader) {
      const json = await res.json();
      const text = json && json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : "";
      return (text || "").trim();
    }
    return await this.readStream(res.body, extra && extra.onToken);
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
          const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
          if (delta) { out += delta; if (onToken) onToken(out); }
        } catch (e) {}
      }
    }
    return out.trim();
  }
  errFromBody(status, raw) {
    let detail = raw || "";
    try { const j = JSON.parse(raw); detail = (j.error && (j.error.message || j.error)) || j.message || raw; } catch (e) {}
    if (status === 401) return "xAI rejected the API key (401). Check Settings → Grok.";
    if (status === 429) return "xAI rate limit (429). Wait a moment and try again.";
    if (status === 400) return "Bad request (400): " + String(detail).slice(0, 220);
    return "xAI error " + status + ": " + String(detail).slice(0, 220);
  }
}

function mountChat(root, host) {
  root.empty();
  const wrap = root.createDiv({ cls: "gm-wrap" });
  const head = wrap.createDiv({ cls: "gm-head" });
  head.createEl("h2", { text: "Grok" });
  head.createSpan({ cls: "gm-kicker", text: isPhone() ? "phone" : Platform && Platform.isMobile ? "tablet" : "laptop" });
  const meta = wrap.createDiv({ cls: "gm-meta" });
  host.modelChip = meta.createSpan({ cls: "gm-chip", text: host.plugin.modelId() });
  host.ctxChip = meta.createSpan({ cls: "gm-chip", text: "no context" });
  host.promptEl = wrap.createEl("textarea", { cls: "gm-prompt", attr: { placeholder: "Ask Grok…  Ctrl/Cmd+Enter to send", rows: "4" } });
  host.hintEl = wrap.createDiv({ cls: "gm-hint" });
  host.outEl = wrap.createDiv({ cls: "gm-out is-empty", text: "Reply will show here." });
  const actions = wrap.createDiv({ cls: "gm-actions" });
  host.sendBtn = actions.createEl("button", { text: "Send", cls: "mod-cta gm-wide" });
  host.stopBtn = actions.createEl("button", { text: "Stop" });
  host.insertBtn = actions.createEl("button", { text: "Insert" });
  host.copyBtn = actions.createEl("button", { text: "Copy" });
  host.replaceBtn = actions.createEl("button", { text: "Replace sel." });
  host.noteBtn = actions.createEl("button", { text: "Use this note" });
  host.stopBtn.disabled = true;
  host.insertBtn.disabled = true;
  host.copyBtn.disabled = true;
  host.replaceBtn.disabled = true;
  host.sendBtn.addEventListener("click", () => host.send());
  host.stopBtn.addEventListener("click", () => host.stop());
  host.insertBtn.addEventListener("click", () => host.insert("below"));
  host.copyBtn.addEventListener("click", () => host.insert("copy"));
  host.replaceBtn.addEventListener("click", () => host.insert("replace"));
  host.noteBtn.addEventListener("click", () => host.grabNote());
  host.promptEl.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); host.send(); }
  });
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
  if (host.hintEl) host.hintEl.setText(n ? "Context: " + n + " characters from the note/selection." : "No note context yet. Tap Use this note or select text first.");
}
async function sendChat(host) {
  const question = (host.promptEl.value || "").trim();
  if (!question) { new Notice("Type a prompt first."); return; }
  if (!host.plugin.settings.apiKey) { new Notice("Add your xAI API key in Settings → Grok."); return; }
  if (host.busy) return;
  host.busy = true;
  host.sendBtn.disabled = true;
  host.stopBtn.disabled = false;
  setOut(host, "Thinking…");
  const messages = [{ role: "system", content: host.plugin.settings.systemPrompt }];
  if (host.opts && host.opts.seed && host.opts.seed.trim()) {
    messages.push({ role: "user", content: "Context from my Obsidian note" + (host.opts.title ? " (\"" + host.opts.title + "\")" : "") + ":\n\n" + clip(host.opts.seed, host.plugin.contextLimit()) });
    messages.push({ role: "assistant", content: "I have the note context. Ask your question." });
  }
  messages.push({ role: "user", content: question });
  try {
    const text = await host.plugin.complete(messages, { onToken: (partial) => { host.reply = partial; setOut(host, partial); } });
    host.reply = text;
    setOut(host, text || "(empty reply)");
    const ok = !!text;
    host.insertBtn.disabled = !ok;
    host.copyBtn.disabled = !ok;
    host.replaceBtn.disabled = !ok;
  } catch (err) {
    if (err && err.name === "AbortError") setOut(host, (host.reply || "") + "\n\n[stopped]");
    else setOut(host, err.message || String(err), "error");
  } finally {
    host.busy = false;
    host.sendBtn.disabled = false;
    host.stopBtn.disabled = true;
  }
}
function stopChat(host) {
  if (host.plugin.abort) host.plugin.abort.abort();
  host.busy = false;
  if (host.sendBtn) host.sendBtn.disabled = false;
  if (host.stopBtn) host.stopBtn.disabled = true;
}
function setOut(host, text, kind) {
  host.outEl.removeClass("is-empty");
  host.outEl.removeClass("is-error");
  if (kind === "error") host.outEl.addClass("is-error");
  if (!text) host.outEl.addClass("is-empty");
  host.outEl.setText(text || "Reply will show here.");
  host.outEl.scrollTop = host.outEl.scrollHeight;
}
function insertFromChat(host, mode) {
  if (!host.reply) return;
  const view = host.app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view ? view.editor : null;
  host.plugin.insertText(editor, host.reply, mode);
  if (typeof host.afterInsert === "function") host.afterInsert(mode);
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
    mountChat(this.contentEl, this);
    applyChatOpts(this, this.opts);
    setTimeout(() => this.promptEl.focus(), 30);
  }
  onClose() { stopChat(this); this.contentEl.empty(); }
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
  getDisplayText() { return "Grok"; }
  getIcon() { return "sparkles"; }
  async onOpen() {
    this.contentEl.addClass("gm-view");
    mountChat(this.contentEl, this);
    applyChatOpts(this, this.plugin.pendingOpts || this.opts || {});
  }
  async onClose() { stopChat(this); }
  applyOpts(opts) { applyChatOpts(this, opts); if (this.promptEl) this.promptEl.focus(); }
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
    containerEl.createEl("h2", { text: "Grok" });
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
      drop.addOption("copy", "Copy only");
      drop.addOption("new-note", "Create a new note");
      drop.setValue(this.plugin.settings.insertMode);
      drop.onChange(async (value) => { this.plugin.settings.insertMode = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Stream replies").setDesc("Show tokens as they arrive. Turn off if a device drops streams.").addToggle((toggle) => {
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
    new Setting(containerEl).setName("Test connection").setDesc("Sends a tiny ping to api.x.ai.").addButton((btn) => {
      btn.setButtonText("Test API key");
      btn.setCta();
      btn.onClick(() => this.plugin.testKey());
    });
  }
}
module.exports = GrokPlugin;
