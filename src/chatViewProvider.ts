import * as vscode from 'vscode';
import { OllamaClient, ChatMessage } from './ollamaClient';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'localCodingAgent.chatView';

  private _view?: vscode.WebviewView;
  private history: ChatMessage[] = [];

  private readonly _onViewReady = new vscode.EventEmitter<void>();
  public readonly onViewReady = this._onViewReady.event;

  private readonly _onSwitchModelRequest = new vscode.EventEmitter<string>();
  public readonly onSwitchModelRequest = this._onSwitchModelRequest.event;

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

  setModel(name: string): void {
    this.modelName = name;
    const short = this.toShort(name);
    this._view?.webview.postMessage({ type: 'modelChanged', modelId: name, short });
  }

  /** Push the list of installed model names so the chat toolbar dropdown stays in sync. */
  notifyInstalledModels(models: string[]): void {
    this._view?.webview.postMessage({ type: 'installedModels', models });
  }

  /** Update the status dot: green = model ready, yellow = online but model missing, red = offline. */
  notifyStatus(ollamaOnline: boolean, modelReady: boolean): void {
    const dotState = !ollamaOnline ? 'offline' : modelReady ? 'ready' : 'missing';
    this._view?.webview.postMessage({ type: 'statusUpdate', dotState });
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

    this._onViewReady.fire();

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
        case 'switchModel':
          if (msg.modelId) this._onSwitchModelRequest.fire(msg.modelId);
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
    this._onViewReady.dispose();
    this._onSwitchModelRequest.dispose();
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
      const msg = String(err);
      const friendly = (msg.includes('not found') || msg.includes('404'))
        ? 'Model not found in Ollama. Open the **Models** panel and download a model first.'
        : `Error: ${msg}`;
      this._view?.webview.postMessage({ type: 'error', content: friendly });
    }
  }

  private toShort(id: string): string {
    const last = id.split('/').pop() ?? id;
    return last.length > 30 ? last.slice(0, 30) + '…' : last;
  }

  private buildHtml(): string {
    const nonce      = getNonce();
    const shortModel = this.toShort(this.modelName);

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
    #active-model {
      display: flex;
      align-items: center;
      gap: 5px;
      flex: 1;
      min-width: 0;
    }
    #status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #555;
    }
    #status-dot.ready   { background: #4ec94e; }
    #status-dot.missing { background: #cca700; }
    #status-dot.offline { background: #f44747; }
    #model-select {
      font-size: 12px;
      background: transparent;
      color: var(--vscode-descriptionForeground, #9d9d9d);
      border: none;
      outline: none;
      cursor: pointer;
      flex: 1;
      min-width: 0;
      font-family: inherit;
      max-width: 200px;
    }
    #model-select:focus { outline: none; }
    #model-select option {
      background: var(--vscode-dropdown-background, #252526);
      color: var(--vscode-foreground, #ccc);
    }
    #clear-btn {
      background: none;
      border: 1px solid transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      padding: 2px 8px;
      font-size: 11px;
      border-radius: 3px;
      font-family: inherit;
      flex-shrink: 0;
    }
    #clear-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, #2a2d2e);
      border-color: var(--vscode-panel-border, #3c3c3c);
    }

    /* ── Messages ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0 8px;
    }
    .message { padding: 8px 12px; }
    .message + .message { border-top: 1px solid var(--vscode-panel-border, #2a2a2a); }
    .msg-header { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .role-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .message.user .role-dot      { background: #3794ff; }
    .message.assistant .role-dot { background: #4ec94e; }
    .msg-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground, #9d9d9d);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
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

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, #424242); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground, #686868); }
  </style>
</head>
<body>
  <!-- Toolbar -->
  <div id="toolbar">
    <div id="active-model">
      <span id="status-dot"></span>
      <select id="model-select" title="Switch active model">
        <option value="${this.modelName}">${shortModel}</option>
      </select>
    </div>
    <button id="clear-btn">Clear</button>
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
    const vscode       = acquireVsCodeApi();
    const $messages    = document.getElementById('messages');
    const $input       = document.getElementById('input');
    const $sendBtn     = document.getElementById('send-btn');
    const $includeCtx  = document.getElementById('include-ctx');
    const $statusDot   = document.getElementById('status-dot');
    const $modelSelect = document.getElementById('model-select');

    let currentModelId = $modelSelect.value;

    $modelSelect.addEventListener('change', () => {
      const selected = $modelSelect.value;
      if (selected && selected !== currentModelId) {
        currentModelId = selected;
        vscode.postMessage({ type: 'switchModel', modelId: selected });
      }
    });

    let streaming   = false;
    let streamText  = '';
    let $streamEl   = null;

    // ── Auto-resize textarea ──
    $input.addEventListener('input', () => {
      $input.style.height = 'auto';
      $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    });

    // ── Send on Ctrl+Enter ──
    $input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
      }
    });

    $sendBtn.addEventListener('click', send);
    document.getElementById('clear-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'clearChat' });
    });

    function send() {
      const text = $input.value.trim();
      if (!text || streaming) return;
      $input.value = '';
      $input.style.height = 'auto';
      vscode.postMessage({ type: 'sendMessage', text, includeContext: $includeCtx.checked });
    }

    // ── Markdown rendering (code blocks + inline code) ──
    function renderMarkdown(text) {
      const div = document.createElement('div');
      div.className = 'msg-body';

      const fenced = /\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/g;
      let last = 0;
      let m;
      while ((m = fenced.exec(text)) !== null) {
        if (m.index > last) {
          div.appendChild(renderInline(text.slice(last, m.index)));
        }
        const lang = m[1] || 'text';
        const code = m[2];
        const wrap = document.createElement('div');
        wrap.className = 'code-wrap';
        wrap.innerHTML =
          '<div class="code-header">' +
            '<span>' + esc(lang) + '</span>' +
            '<button class="copy-btn">Copy</button>' +
          '</div>' +
          '<pre class="code-block"><code>' + esc(code) + '</code></pre>';
        wrap.querySelector('.copy-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(code).catch(() => {});
        });
        div.appendChild(wrap);
        last = fenced.lastIndex;
      }
      if (last < text.length) {
        div.appendChild(renderInline(text.slice(last)));
      }
      return div;
    }

    function renderInline(text) {
      const span = document.createElement('span');
      span.innerHTML = text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>')
        .replace(/\\n/g, '<br>');
      return span;
    }

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      const header = document.createElement('div');
      header.className = 'msg-header';
      header.innerHTML = '<div class="role-dot"></div><span class="msg-label">' +
        (role === 'user' ? 'You' : 'Assistant') + '</span>';
      div.appendChild(header);
      div.appendChild(renderMarkdown(content));
      $messages.appendChild(div);
      $messages.scrollTop = $messages.scrollHeight;
      return div;
    }

    // ── Messages from extension host ──
    window.addEventListener('message', ({ data }) => {
      switch (data.type) {

        case 'modelChanged':
          currentModelId = data.modelId;
          $modelSelect.value = data.modelId;
          if (!$modelSelect.value) {
            // model not yet in list, add it
            const opt = document.createElement('option');
            opt.value = data.modelId;
            opt.textContent = data.short;
            $modelSelect.appendChild(opt);
            $modelSelect.value = data.modelId;
          }
          break;

        case 'installedModels': {
          const prev = $modelSelect.value;
          $modelSelect.innerHTML = '';
          if (data.models.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No models installed';
            $modelSelect.appendChild(opt);
          } else {
            data.models.forEach(id => {
              const opt = document.createElement('option');
              opt.value = id;
              opt.textContent = id.split('/').pop().replace(/-GGUF$/i, '').slice(0, 36);
              $modelSelect.appendChild(opt);
            });
          }
          $modelSelect.value = prev || currentModelId;
          if (!$modelSelect.value && data.models.length) {
            $modelSelect.value = data.models[0];
          }
          break;
        }

        case 'statusUpdate':
          $statusDot.className = data.dotState;
          break;

        case 'addMessage':
          streaming = true;
          $sendBtn.disabled = true;
          addMessage(data.role, data.content);
          break;

        case 'startAssistantMessage': {
          const div = document.createElement('div');
          div.className = 'message assistant';
          const header = document.createElement('div');
          header.className = 'msg-header';
          header.innerHTML = '<div class="role-dot"></div><span class="msg-label">Assistant</span>';
          div.appendChild(header);
          $streamEl = document.createElement('div');
          $streamEl.className = 'msg-body';
          $streamEl.innerHTML = '<span class="cursor"></span>';
          div.appendChild($streamEl);
          $messages.appendChild(div);
          $messages.scrollTop = $messages.scrollHeight;
          streamText = '';
          break;
        }

        case 'appendChunk':
          streamText += data.content;
          if ($streamEl) {
            const rendered = renderMarkdown(streamText);
            $streamEl.innerHTML = '';
            while (rendered.firstChild) $streamEl.appendChild(rendered.firstChild);
            const cursor = document.createElement('span');
            cursor.className = 'cursor';
            $streamEl.appendChild(cursor);
            $messages.scrollTop = $messages.scrollHeight;
          }
          break;

        case 'finalizeMessage':
          if ($streamEl) {
            const rendered = renderMarkdown(streamText);
            $streamEl.innerHTML = '';
            while (rendered.firstChild) $streamEl.appendChild(rendered.firstChild);
            $streamEl = null;
          }
          streaming = false;
          $sendBtn.disabled = false;
          streamText = '';
          break;

        case 'error':
          if ($streamEl) {
            $streamEl.textContent = 'Error: ' + data.content;
            $streamEl = null;
          }
          streaming = false;
          $sendBtn.disabled = false;
          break;

        case 'clearMessages':
          $messages.innerHTML = '';
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
