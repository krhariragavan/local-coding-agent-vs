import * as vscode from 'vscode';
import { OllamaClient, ChatMessage } from './ollamaClient';
import { CATALOG_MODELS } from './modelCatalog';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'localCodingAgent.chatView';

  private _view?: vscode.WebviewView;
  private history: ChatMessage[] = [];

  private readonly _onDownloadRequest = new vscode.EventEmitter<string>();
  public readonly onDownloadRequest = this._onDownloadRequest.event;

  private readonly _onUseModelRequest = new vscode.EventEmitter<string>();
  public readonly onUseModelRequest = this._onUseModelRequest.event;

  private readonly systemPrompt = `You are an expert AI coding assistant embedded in VS Code. Your role:
- Help write, debug, explain, and improve code
- Be concise and precise — avoid unnecessary filler text
- Always use fenced code blocks with a language tag when showing code
- When fixing code, show the complete corrected version
- When explaining, be structured and clear`;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: OllamaClient,
    private modelName: string
  ) {}

  // ── Called by extension after Ollama responds ──
  setInstalledModels(installed: string[], activeModel: string): void {
    this._view?.webview.postMessage({ type: 'updateModels', installed, activeModel });
  }

  setModel(name: string): void {
    this.modelName = name;
    const short = this.toShort(name);
    this._view?.webview.postMessage({ type: 'modelChanged', modelId: name, short });
  }

  notifyDownloadProgress(modelId: string, status: string, percent: number, downloaded: string, total: string): void {
    this._view?.webview.postMessage({ type: 'downloadProgress', modelId, status, percent, downloaded, total });
  }

  notifyDownloadDone(success: boolean): void {
    this._view?.webview.postMessage({ type: 'downloadDone', success });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.buildHtml();

    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string; text?: string; includeContext?: boolean; modelId?: string;
    }) => {
      switch (msg.type) {
        case 'sendMessage':
          await this.handleUserMessage(msg.text ?? '', msg.includeContext ?? false);
          break;
        case 'clearChat':
          this.history = [];
          this._view?.webview.postMessage({ type: 'clearMessages' });
          break;
        case 'downloadModel':
          if (msg.modelId) this._onDownloadRequest.fire(msg.modelId);
          break;
        case 'useModel':
          if (msg.modelId) this._onUseModelRequest.fire(msg.modelId);
          break;
      }
    });
  }

  async sendCodeAction(action: 'explain' | 'fix' | 'refactor', code: string, language: string): Promise<void> {
    const verbs: Record<string, string> = {
      explain: 'Please explain this',
      fix: 'Please identify and fix any bugs in this',
      refactor: 'Please refactor and improve this'
    };
    const text = `${verbs[action]} ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``;
    await vscode.commands.executeCommand('localCodingAgent.chatView.focus');
    setTimeout(() => this.handleUserMessage(text, false), 150);
  }

  dispose(): void {
    this._onDownloadRequest.dispose();
    this._onUseModelRequest.dispose();
  }

  private async handleUserMessage(userText: string, includeContext: boolean): Promise<void> {
    let fullText = userText;

    if (includeContext) {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const sel  = editor.document.getText(editor.selection);
        const lang = editor.document.languageId;
        const file = editor.document.fileName.replace(/\\/g, '/').split('/').pop() ?? '';
        fullText   = `${userText}\n\n\`\`\`${lang}\n// ${file}\n${sel}\n\`\`\``;
      }
    }

    this.history.push({ role: 'user', content: fullText });
    this._view?.webview.postMessage({ type: 'addMessage', role: 'user', content: userText });
    this._view?.webview.postMessage({ type: 'startAssistantMessage' });

    let fullResponse = '';
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: this.systemPrompt },
        ...this.history.slice(-20)
      ];
      for await (const chunk of this.client.chat(messages, this.modelName)) {
        fullResponse += chunk;
        this._view?.webview.postMessage({ type: 'appendChunk', content: chunk });
      }
      this.history.push({ role: 'assistant', content: fullResponse });
      this._view?.webview.postMessage({ type: 'finalizeMessage' });
    } catch (err) {
      this._view?.webview.postMessage({ type: 'error', content: String(err) });
    }
  }

  private toShort(id: string): string {
    const last = id.split('/').pop() ?? id;
    return last.length > 30 ? last.slice(0, 30) + '…' : last;
  }

  private buildHtml(): string {
    const nonce      = getNonce();
    const shortModel = this.toShort(this.modelName);
    const catalogJson = JSON.stringify(CATALOG_MODELS);

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Local Coding Agent</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      position: relative;
      background: var(--vscode-sideBar-background, #252526);
      color: var(--vscode-foreground, #ccc);
      font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.5;
    }

    /* ── Toolbar ── */
    #toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
      flex-shrink: 0;
      gap: 6px;
    }
    #model-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      background: none;
      border: 1px solid transparent;
      color: var(--vscode-foreground, #ccc);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      font-family: inherit;
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    #model-btn:hover { background: var(--vscode-toolbar-hoverBackground, #2a2d2e); border-color: var(--vscode-panel-border, #3c3c3c); }
    #model-btn.open { background: var(--vscode-list-hoverBackground, #2a2d2e); border-color: var(--vscode-focusBorder, #007fd4); }
    #status-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: #555; /* default: unknown */
    }
    #status-dot.ready     { background: #4ec94e; }
    #status-dot.offline   { background: #f44747; }
    #status-dot.missing   { background: #cca700; }
    #model-name-label {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
    }
    .chevron { font-size: 9px; flex-shrink: 0; color: var(--vscode-descriptionForeground, #888); }
    #clear-btn {
      background: none; border: 1px solid transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer; padding: 2px 8px; font-size: 11px; border-radius: 3px;
      font-family: inherit; flex-shrink: 0;
    }
    #clear-btn:hover { background: var(--vscode-toolbar-hoverBackground, #2a2d2e); border-color: var(--vscode-panel-border, #3c3c3c); }

    /* ── Model picker panel (collapses under toolbar) ── */
    #picker {
      flex-shrink: 0;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.18s ease;
      border-bottom: 1px solid transparent;
    }
    #picker.open {
      max-height: 270px;
      overflow-y: auto;
      border-bottom-color: var(--vscode-panel-border, #3c3c3c);
    }
    #picker-search-row {
      padding: 6px 8px;
      position: sticky;
      top: 0;
      background: var(--vscode-sideBar-background, #252526);
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      z-index: 5;
    }
    #picker-search {
      width: 100%;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: 3px;
      padding: 4px 8px;
      font-size: 12px; font-family: inherit;
      outline: none;
    }
    #picker-search:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    #picker-search::placeholder { color: var(--vscode-input-placeholderForeground, #666); }

    .section-label {
      padding: 5px 10px 3px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground, #888);
      background: var(--vscode-sideBar-background, #252526);
      position: sticky;
      top: 33px;
    }

    .picker-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      cursor: default;
    }
    .picker-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
    .item-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    }
    .item-dot.installed { background: #4ec94e; }
    .item-dot.available { background: #555; }
    .item-name { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-size { font-size: 11px; color: var(--vscode-descriptionForeground, #888); flex-shrink: 0; white-space: nowrap; }
    .active-badge { font-size: 11px; color: #4ec94e; flex-shrink: 0; white-space: nowrap; }
    .item-btn {
      font-size: 11px; padding: 2px 8px;
      border: none; border-radius: 3px; cursor: pointer;
      flex-shrink: 0; font-family: inherit;
    }
    .item-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .use-btn  { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
    .use-btn:hover:not(:disabled)  { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .get-btn  { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); }
    .get-btn:hover:not(:disabled)  { background: var(--vscode-button-hoverBackground, #1177bb); }
    .dl-pct-badge { font-size: 11px; color: #3794ff; flex-shrink: 0; white-space: nowrap; }

    #picker-empty {
      padding: 12px 10px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
      text-align: center;
      display: none;
    }

    /* ── Messages ── */
    #messages {
      flex: 1; overflow-y: auto; padding: 4px 0 8px;
    }
    .message { padding: 8px 12px; }
    .message + .message { border-top: 1px solid var(--vscode-panel-border, #2a2a2a); }
    .msg-header { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .role-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .message.user .role-dot      { background: #3794ff; }
    .message.assistant .role-dot { background: #4ec94e; }
    .msg-label { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground, #9d9d9d); text-transform: uppercase; letter-spacing: 0.04em; }
    .msg-body { word-break: break-word; }

    /* ── Code blocks ── */
    .code-wrap { margin: 6px 0; border-radius: 4px; overflow: hidden; border: 1px solid var(--vscode-panel-border, #3c3c3c); }
    .code-header { display: flex; justify-content: space-between; align-items: center; padding: 3px 10px; background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d); font-size: 11px; color: var(--vscode-descriptionForeground, #9d9d9d); }
    .copy-btn { background: none; border: none; color: var(--vscode-descriptionForeground, #9d9d9d); cursor: pointer; padding: 1px 6px; font-size: 11px; border-radius: 3px; }
    .copy-btn:hover { background: var(--vscode-toolbar-hoverBackground, #5a5d5e55); }
    pre.code-block { margin: 0; padding: 10px 12px; background: var(--vscode-editor-background, #1e1e1e); overflow-x: auto; font-family: var(--vscode-editor-font-family, 'Consolas', monospace); font-size: calc(var(--vscode-font-size, 13px) - 1px); line-height: 1.45; white-space: pre; }
    code.inline-code { background: var(--vscode-editor-background, #1e1e1e); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; }

    /* ── Streaming cursor ── */
    .cursor { display: inline-block; width: 2px; height: 1em; background: var(--vscode-foreground, #ccc); animation: blink 1s step-end infinite; vertical-align: text-bottom; margin-left: 1px; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    /* ── Input area ── */
    #input-area { border-top: 1px solid var(--vscode-panel-border, #3c3c3c); padding: 7px 10px; flex-shrink: 0; }
    #context-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; color: var(--vscode-descriptionForeground, #9d9d9d); user-select: none; }
    #context-row input { cursor: pointer; }
    #input-row { display: flex; gap: 6px; align-items: flex-end; }
    #input { flex: 1; background: var(--vscode-input-background, #3c3c3c); color: var(--vscode-input-foreground, #ccc); border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 4px; padding: 6px 8px; font-family: inherit; font-size: inherit; resize: none; min-height: 34px; max-height: 120px; outline: none; line-height: 1.5; }
    #input:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    #input::placeholder { color: var(--vscode-input-placeholderForeground, #666); }
    #send-btn { height: 34px; padding: 0 14px; background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; flex-shrink: 0; }
    #send-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }
    #send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .hint { font-size: 10px; color: var(--vscode-descriptionForeground, #666); margin-top: 4px; text-align: right; }

    /* ── Download overlay ── */
    #dl-overlay {
      position: absolute; inset: 0; z-index: 200;
      background: rgba(14, 14, 14, 0.85);
      backdrop-filter: blur(3px);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: 24px; text-align: center;
    }
    #dl-overlay.hidden { display: none; }
    #dl-icon { font-size: 30px; animation: bounce 1.2s ease-in-out infinite; }
    @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    #dl-title { font-size: 13px; font-weight: 600; }
    #dl-model { font-size: 11px; color: var(--vscode-descriptionForeground, #888); word-break: break-all; max-width: 100%; }
    #dl-bar-wrap { width: 100%; max-width: 280px; }
    #dl-bar { height: 5px; background: var(--vscode-progressBar-background, #333); border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
    #dl-fill { height: 100%; width: 0%; background: linear-gradient(90deg,#0e639c,#3794ff); border-radius: 3px; transition: width 0.25s ease; }
    #dl-stats { display: flex; justify-content: space-between; font-size: 11px; color: var(--vscode-descriptionForeground, #888); }
    #dl-status-text { font-size: 11px; color: var(--vscode-descriptionForeground, #777); font-style: italic; }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, #424242); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground, #686868); }
  </style>
</head>
<body>
  <!-- Download overlay -->
  <div id="dl-overlay" class="hidden">
    <div id="dl-icon">⬇</div>
    <div id="dl-title">Downloading model…</div>
    <div id="dl-model"></div>
    <div id="dl-bar-wrap">
      <div id="dl-bar"><div id="dl-fill"></div></div>
      <div id="dl-stats"><span id="dl-bytes"></span><span id="dl-pct">0%</span></div>
    </div>
    <div id="dl-status-text"></div>
  </div>

  <!-- Toolbar -->
  <div id="toolbar">
    <button id="model-btn" title="Select or download a model">
      <span id="status-dot"></span>
      <span id="model-name-label">${shortModel}</span>
      <span class="chevron">▾</span>
    </button>
    <button id="clear-btn">Clear</button>
  </div>

  <!-- Model picker (hidden until model-btn is clicked) -->
  <div id="picker">
    <div id="picker-search-row">
      <input id="picker-search" type="text" placeholder="Search models…" autocomplete="off" spellcheck="false">
    </div>
    <div id="picker-list"></div>
    <div id="picker-empty">No models match your search.</div>
  </div>

  <!-- Chat messages -->
  <div id="messages">
    <div class="message assistant">
      <div class="msg-header"><div class="role-dot"></div><span class="msg-label">Assistant</span></div>
      <div class="msg-body">Hi! I'm your local AI coding assistant.<br>
        Select code in the editor and tick <em>Include selection</em>, or just ask me anything.</div>
    </div>
  </div>

  <!-- Input -->
  <div id="input-area">
    <div id="context-row">
      <input type="checkbox" id="include-ctx">
      <label for="include-ctx">Include editor selection</label>
    </div>
    <div id="input-row">
      <textarea id="input" rows="1" placeholder="Ask about your code… (Ctrl+Enter to send)"></textarea>
      <button id="send-btn">Send</button>
    </div>
    <div class="hint">Ctrl+Enter to send</div>
  </div>

  <script nonce="${nonce}">
    const vscode      = acquireVsCodeApi();
    const CATALOG     = ${catalogJson};
    const $messages   = document.getElementById('messages');
    const $input      = document.getElementById('input');
    const $sendBtn    = document.getElementById('send-btn');
    const $clearBtn   = document.getElementById('clear-btn');
    const $includeCtx = document.getElementById('include-ctx');
    const $modelBtn   = document.getElementById('model-btn');
    const $picker     = document.getElementById('picker');
    const $pickerSrch = document.getElementById('picker-search');
    const $pickerList = document.getElementById('picker-list');
    const $pickerEmpty= document.getElementById('picker-empty');
    const $statusDot  = document.getElementById('status-dot');
    const $modelLabel = document.getElementById('model-name-label');

    let streaming      = false;
    let streamText     = '';
    let $streamEl      = null;
    let installed      = [];   // lowercase names from Ollama
    let activeModelId  = '${this.modelName}';
    let currentDl      = null; // model id being downloaded
    let dlPercent      = 0;

    // ── Picker open / close ──
    function openPicker() {
      $picker.classList.add('open');
      $modelBtn.classList.add('open');
      $pickerSrch.value = '';
      buildPickerList();
      $pickerSrch.focus();
    }
    function closePicker() {
      $picker.classList.remove('open');
      $modelBtn.classList.remove('open');
    }
    $modelBtn.addEventListener('click', () => $picker.classList.contains('open') ? closePicker() : openPicker());
    document.addEventListener('click', e => {
      if (!$picker.contains(e.target) && !$modelBtn.contains(e.target)) closePicker();
    });
    $pickerSrch.addEventListener('input', buildPickerList);

    // ── Build picker list ──
    function buildPickerList() {
      const q = $pickerSrch.value.toLowerCase().trim();
      const filtered = CATALOG.filter(m =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );

      const instList  = filtered.filter(m => isInstalled(m.id));
      const availList = filtered.filter(m => !isInstalled(m.id));
      const anyDl     = currentDl !== null;
      let html = '';

      if (instList.length) {
        html += '<div class="section-label">Installed</div>';
        instList.forEach(m => { html += buildItem(m, true, anyDl); });
      }
      if (availList.length) {
        html += '<div class="section-label">Available</div>';
        availList.forEach(m => { html += buildItem(m, false, anyDl); });
      }

      const empty = !instList.length && !availList.length;
      $pickerEmpty.style.display = empty ? 'block' : 'none';
      $pickerList.innerHTML = html;

      // Attach button listeners after render
      $pickerList.querySelectorAll('.use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          vscode.postMessage({ type: 'useModel', modelId: btn.dataset.id });
          closePicker();
        });
      });
      $pickerList.querySelectorAll('.get-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          vscode.postMessage({ type: 'downloadModel', modelId: btn.dataset.id });
          closePicker();
        });
      });
    }

    function buildItem(model, isInst, anyDl) {
      const isActive = model.id === activeModelId;
      const isThis   = currentDl === model.id;
      let action;
      if (isActive) {
        action = '<span class="active-badge">✓ Active</span>';
      } else if (isInst) {
        action = '<button class="item-btn use-btn" data-id="' + esc(model.id) + '">Use</button>';
      } else if (isThis) {
        action = '<span class="dl-pct-badge">' + dlPercent + '%</span>';
      } else {
        action = '<button class="item-btn get-btn"' + (anyDl ? ' disabled' : '') +
          ' data-id="' + esc(model.id) + '">↓ Get</button>';
      }
      return '<div class="picker-item">' +
        '<span class="item-dot ' + (isInst ? 'installed' : 'available') + '"></span>' +
        '<span class="item-name" title="' + esc(model.id) + '">' + esc(model.name) + '</span>' +
        '<span class="item-size">' + esc(model.size) + '</span>' +
        action + '</div>';
    }

    function isInstalled(id) {
      const base = id.split(':')[0].toLowerCase();
      return installed.some(n => n === id.toLowerCase() || n.startsWith(base));
    }

    function updateStatusDot() {
      $statusDot.className = '';
      if (installed.length === 0) {
        $statusDot.className = 'offline';
      } else if (isInstalled(activeModelId)) {
        $statusDot.className = 'ready';
      } else {
        $statusDot.className = 'missing';
      }
    }

    // ── Markdown renderer ──
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function renderMarkdown(raw) {
      let html = '', last = 0, m;
      const fenceRe = /\`\`\`(\w*)\n?([\s\S]*?)\`\`\`/g;
      while ((m = fenceRe.exec(raw)) !== null) {
        html += renderInline(raw.slice(last, m.index));
        const lang = m[1] || 'text';
        html += '<div class="code-wrap"><div class="code-header"><span>' + esc(lang) +
          '</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>' +
          '<pre class="code-block"><code>' + esc(m[2]) + '</code></pre></div>';
        last = m.index + m[0].length;
      }
      html += renderInline(raw.slice(last));
      return html;
    }

    function renderInline(text) {
      return esc(text)
        .replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    function copyCode(btn) {
      navigator.clipboard.writeText(btn.closest('.code-wrap').querySelector('pre').textContent).then(() => {
        const old = btn.textContent; btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = old), 1800);
      });
    }

    // ── Chat bubbles ──
    function addBubble(role, content, withCursor) {
      const el = document.createElement('div');
      el.className = 'message ' + role;
      el.innerHTML =
        '<div class="msg-header"><div class="role-dot"></div>' +
        '<span class="msg-label">' + (role === 'user' ? 'You' : 'Assistant') + '</span></div>' +
        '<div class="msg-body">' +
        (role === 'user' ? renderInline(content) : renderMarkdown(content)) +
        (withCursor ? '<span class="cursor"></span>' : '') + '</div>';
      $messages.appendChild(el);
      $messages.scrollTop = $messages.scrollHeight;
      return el;
    }

    // ── Send ──
    function sendMessage() {
      const text = $input.value.trim();
      if (!text || streaming) return;
      $input.value = ''; autoResize();
      streaming = true; streamText = ''; $streamEl = null;
      $sendBtn.disabled = true;
      vscode.postMessage({ type: 'sendMessage', text, includeContext: $includeCtx.checked });
    }
    function autoResize() {
      $input.style.height = 'auto';
      $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    }
    $input.addEventListener('input', autoResize);
    $input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
    });
    $sendBtn.addEventListener('click', sendMessage);
    $clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));

    // ── Messages from extension ──
    window.addEventListener('message', ({ data }) => {
      switch (data.type) {
        case 'addMessage':
          addBubble(data.role, data.content, false);
          break;
        case 'startAssistantMessage':
          streamText = ''; $streamEl = addBubble('assistant', '', true);
          break;
        case 'appendChunk':
          streamText += data.content;
          if ($streamEl) {
            $streamEl.querySelector('.msg-body').innerHTML = renderMarkdown(streamText) + '<span class="cursor"></span>';
            $messages.scrollTop = $messages.scrollHeight;
          }
          break;
        case 'finalizeMessage':
          if ($streamEl) $streamEl.querySelector('.msg-body').innerHTML = renderMarkdown(streamText);
          streaming = false; $sendBtn.disabled = false; $streamEl = null;
          break;
        case 'error':
          if ($streamEl) {
            $streamEl.querySelector('.msg-body').innerHTML =
              '<span style="color:var(--vscode-errorForeground,#f44747)">' + esc(data.content) + '</span>';
          } else {
            const el = document.createElement('div');
            el.style.cssText = 'padding:8px 12px;color:var(--vscode-errorForeground,#f44747);font-size:12px';
            el.textContent = data.content; $messages.appendChild(el);
          }
          streaming = false; $sendBtn.disabled = false; $streamEl = null;
          break;
        case 'clearMessages':
          $messages.innerHTML = '';
          addBubble('assistant', 'Conversation cleared. How can I help?', false);
          break;
        case 'setInput':
          $input.value = data.text; autoResize(); $input.focus();
          break;

        case 'updateModels':
          installed = data.installed || [];
          activeModelId = data.activeModel;
          updateStatusDot();
          if ($picker.classList.contains('open')) buildPickerList();
          break;

        case 'modelChanged':
          activeModelId = data.modelId;
          $modelLabel.textContent = data.short;
          $modelLabel.title = data.modelId;
          if ($picker.classList.contains('open')) buildPickerList();
          break;

        case 'downloadProgress':
          currentDl  = data.modelId;
          dlPercent  = data.percent;
          // Show overlay
          document.getElementById('dl-overlay').classList.remove('hidden');
          document.getElementById('dl-model').textContent = data.modelId;
          document.getElementById('dl-fill').style.width  = data.percent + '%';
          document.getElementById('dl-pct').textContent   = data.percent + '%';
          document.getElementById('dl-bytes').textContent =
            data.downloaded && data.total ? data.downloaded + ' / ' + data.total : '';
          document.getElementById('dl-status-text').textContent = data.status || '';
          $sendBtn.disabled = true; $input.disabled = true;
          if ($picker.classList.contains('open')) buildPickerList();
          break;

        case 'downloadDone':
          document.getElementById('dl-overlay').classList.add('hidden');
          currentDl = null; dlPercent = 0;
          $input.disabled = false;
          if (!streaming) $sendBtn.disabled = false;
          if ($picker.classList.contains('open')) buildPickerList();
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
