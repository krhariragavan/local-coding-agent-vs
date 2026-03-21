import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { CATALOG_MODELS } from './modelCatalog';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class ModelsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'localCodingAgent.modelsView';

  private _view?: vscode.WebviewView;
  private activeModel: string;

  private readonly _onDownloadRequest = new vscode.EventEmitter<string>();
  public readonly onDownloadRequest = this._onDownloadRequest.event;

  private readonly _onUseModelRequest = new vscode.EventEmitter<string>();
  public readonly onUseModelRequest = this._onUseModelRequest.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: OllamaClient,
    initialModel: string
  ) {
    this.activeModel = initialModel;
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

    webviewView.webview.onDidReceiveMessage((msg: { type: string; modelId?: string }) => {
      switch (msg.type) {
        case 'ready':
          this.refreshInstalled();
          break;
        case 'downloadModel':
          if (msg.modelId) this._onDownloadRequest.fire(msg.modelId);
          break;
        case 'useModel':
          if (msg.modelId) this._onUseModelRequest.fire(msg.modelId);
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.refreshInstalled();
    });
  }

  async refreshInstalled(): Promise<void> {
    try {
      const models = await this.client.listModels();
      const installed = models.map((m) => m.name.toLowerCase());
      this._view?.webview.postMessage({
        type: 'updateInstalled',
        installed,
        activeModel: this.activeModel
      });
    } catch {
      this._view?.webview.postMessage({ type: 'ollamaOffline' });
    }
  }

  notifyDownloadProgress(modelId: string, status: string, percent: number, downloaded: string, total: string): void {
    this._view?.webview.postMessage({ type: 'downloadProgress', modelId, status, percent, downloaded, total });
  }

  notifyDownloadDone(modelId: string, success: boolean): void {
    this._view?.webview.postMessage({ type: 'downloadDone', modelId, success });
    if (success) this.refreshInstalled();
  }

  setActiveModel(modelId: string): void {
    this.activeModel = modelId;
    this._view?.webview.postMessage({ type: 'setActive', modelId });
  }

  dispose(): void {
    this._onDownloadRequest.dispose();
    this._onUseModelRequest.dispose();
  }

  private buildHtml(): string {
    const nonce = getNonce();
    const catalogJson = JSON.stringify(CATALOG_MODELS);

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Models</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--vscode-sideBar-background, #252526);
      color: var(--vscode-foreground, #ccc);
      font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.5;
      overflow-x: hidden;
    }

    /* ── Search bar ── */
    #search-wrap {
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
      position: sticky;
      top: 0;
      background: var(--vscode-sideBar-background, #252526);
      z-index: 10;
    }
    #search {
      width: 100%;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: 4px;
      padding: 5px 28px 5px 8px;
      font-size: inherit;
      font-family: inherit;
      outline: none;
    }
    #search:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    #search::placeholder { color: var(--vscode-input-placeholderForeground, #666); }
    #search-wrap { position: relative; }
    #search-clear {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 14px;
      padding: 0 2px;
      display: none;
    }

    /* ── Offline banner ── */
    #offline-banner {
      display: none;
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-errorForeground, #f48771);
      padding: 8px 12px;
      font-size: 12px;
      border-bottom: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    }

    /* ── Model list ── */
    #model-list { padding: 6px 0; }

    .model-card {
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      transition: background 0.1s;
    }
    .model-card:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
    .model-card.hidden { display: none; }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 3px;
    }
    .model-name {
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .installed-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #4ec94e;
      flex-shrink: 0;
      display: none;
    }
    .model-card.installed .installed-dot { display: inline-block; }
    .model-size {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .model-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #9a9a9a);
      margin-bottom: 6px;
      line-height: 1.4;
    }
    .model-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }
    .tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #ccc);
      text-transform: lowercase;
    }
    .tag.recommended {
      background: #1a3a1a;
      color: #4ec94e;
      border: 1px solid #2a5a2a;
    }

    /* ── Action row ── */
    .card-actions { display: flex; align-items: center; gap: 8px; }

    .btn {
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 3px;
      border: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }
    .btn-secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

    .active-badge {
      font-size: 11px;
      color: #4ec94e;
      display: flex;
      align-items: center;
      gap: 3px;
    }

    /* ── Per-card download progress ── */
    .card-progress { display: none; margin-top: 6px; }
    .card-progress.visible { display: block; }
    .prog-bar-wrap {
      height: 4px;
      background: var(--vscode-progressBar-background, #333);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 4px;
    }
    .prog-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #0e639c, #3794ff);
      border-radius: 2px;
      transition: width 0.25s ease;
    }
    .prog-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      display: flex;
      justify-content: space-between;
    }

    /* ── Empty state ── */
    #empty {
      display: none;
      padding: 24px 16px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #888);
      font-size: 12px;
    }

    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, #424242); border-radius: 3px; }
  </style>
</head>
<body>
  <div id="offline-banner">Ollama is not running — start Ollama to manage models.</div>

  <div id="search-wrap">
    <input id="search" type="text" placeholder="Search models…" autocomplete="off" spellcheck="false">
    <button id="search-clear" title="Clear">✕</button>
  </div>

  <div id="model-list"></div>
  <div id="empty">No models match your search.</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const CATALOG = ${catalogJson};

    const $list    = document.getElementById('model-list');
    const $search  = document.getElementById('search');
    const $clear   = document.getElementById('search-clear');
    const $empty   = document.getElementById('empty');
    const $offline = document.getElementById('offline-banner');

    let installed   = [];   // lowercase model names from Ollama
    let activeModel = '';
    let downloading = null; // modelId currently downloading

    // ── Build DOM for all cards once ──
    function buildCards() {
      $list.innerHTML = '';
      CATALOG.forEach(model => {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.dataset.id = model.id;
        card.dataset.search = (model.name + ' ' + model.tags.join(' ') + ' ' + model.description).toLowerCase();

        const tagsHtml = model.tags.map(t =>
          '<span class="tag' + (t === 'recommended' ? ' recommended' : '') + '">' + t + '</span>'
        ).join('');

        card.innerHTML =
          '<div class="card-top">' +
            '<div class="model-name"><div class="installed-dot"></div>' + esc(model.name) + '</div>' +
            '<span class="model-size">' + esc(model.size) + '</span>' +
          '</div>' +
          '<div class="model-desc">' + esc(model.description) + '</div>' +
          '<div class="model-tags">' + tagsHtml + '</div>' +
          '<div class="card-actions"></div>' +
          '<div class="card-progress">' +
            '<div class="prog-bar-wrap"><div class="prog-bar-fill"></div></div>' +
            '<div class="prog-text"><span class="prog-status"></span><span class="prog-pct"></span></div>' +
          '</div>';

        $list.appendChild(card);
      });
    }

    // ── Refresh action buttons on every state change ──
    function refreshCards() {
      CATALOG.forEach(model => {
        const card = $list.querySelector('[data-id="' + CSS.escape(model.id) + '"]');
        if (!card) return;

        const isInstalled = isModelInstalled(model.id);
        const isActive    = model.id === activeModel;
        const isThis      = downloading === model.id;
        const anyDl       = downloading !== null;

        card.classList.toggle('installed', isInstalled);

        const actions = card.querySelector('.card-actions');
        actions.innerHTML = '';

        if (isActive && isInstalled) {
          actions.innerHTML = '<span class="active-badge">✓ Active</span>';
        } else if (isInstalled) {
          const useBtn = btn('Use', 'btn btn-primary', anyDl);
          useBtn.addEventListener('click', () => vscode.postMessage({ type: 'useModel', modelId: model.id }));
          actions.appendChild(useBtn);
        } else if (isThis) {
          const dlBtn = btn('Downloading…', 'btn btn-secondary', true);
          actions.appendChild(dlBtn);
        } else {
          const dlBtn = btn('Download', 'btn btn-primary', anyDl);
          dlBtn.addEventListener('click', () => vscode.postMessage({ type: 'downloadModel', modelId: model.id }));
          actions.appendChild(dlBtn);
        }
      });
    }

    function btn(label, cls, disabled) {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.disabled = disabled;
      return b;
    }

    // ── Is a catalog model id installed? (loose match) ──
    function isModelInstalled(id) {
      const base = id.split(':')[0].toLowerCase();
      return installed.some(n => n === id.toLowerCase() || n.startsWith(base));
    }

    // ── Search filtering ──
    function applySearch(query) {
      const q = query.trim().toLowerCase();
      let visible = 0;
      $list.querySelectorAll('.model-card').forEach(card => {
        const match = !q || card.dataset.search.includes(q);
        card.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      $empty.style.display = visible === 0 ? 'block' : 'none';
      $clear.style.display = q ? 'inline' : 'none';
    }

    $search.addEventListener('input', () => applySearch($search.value));
    $clear.addEventListener('click', () => { $search.value = ''; applySearch(''); $search.focus(); });

    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Messages from extension ──
    window.addEventListener('message', ({ data }) => {
      switch (data.type) {
        case 'updateInstalled':
          installed   = data.installed;
          activeModel = data.activeModel;
          $offline.style.display = 'none';
          refreshCards();
          break;

        case 'setActive':
          activeModel = data.modelId;
          refreshCards();
          break;

        case 'ollamaOffline':
          $offline.style.display = 'block';
          break;

        case 'downloadProgress': {
          downloading = data.modelId;
          refreshCards();
          const card = $list.querySelector('[data-id="' + CSS.escape(data.modelId) + '"]');
          if (card) {
            const prog = card.querySelector('.card-progress');
            prog.classList.add('visible');
            card.querySelector('.prog-bar-fill').style.width = data.percent + '%';
            card.querySelector('.prog-status').textContent = data.downloaded && data.total
              ? data.downloaded + ' / ' + data.total
              : data.status;
            card.querySelector('.prog-pct').textContent = data.percent + '%';
          }
          break;
        }

        case 'downloadDone': {
          const card = $list.querySelector('[data-id="' + CSS.escape(data.modelId) + '"]');
          if (card) {
            card.querySelector('.card-progress').classList.remove('visible');
          }
          downloading = null;
          refreshCards();
          break;
        }
      }
    });

    // ── Init ──
    buildCards();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
