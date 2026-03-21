import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';

export interface DownloadProgressEvent {
  modelId: string;
  status: string;
  percent: number;
  downloaded: string;
  total: string;
}

export interface DownloadDoneEvent {
  modelId: string;
  success: boolean;
}

export class ModelManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private downloading = false;

  private readonly _onProgress = new vscode.EventEmitter<DownloadProgressEvent>();
  public readonly onProgress = this._onProgress.event;

  private readonly _onDone = new vscode.EventEmitter<DownloadDoneEvent>();
  public readonly onDone = this._onDone.event;

  constructor(
    private readonly client: OllamaClient,
    private modelName: string
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'localCodingAgent.openModels';
    this.statusBarItem.tooltip = 'Local Coding Agent — click to manage models';
    this.statusBarItem.show();
    this.setStatus('$(sync~spin) Initialising...');
  }

  async ensureModelAvailable(): Promise<boolean> {
    try {
      await this.client.listModels();
    } catch {
      this.setStatus('$(error) Ollama offline');
      const choice = await vscode.window.showErrorMessage(
        'Local Coding Agent: Ollama is not running. Start Ollama first.',
        'How to install Ollama'
      );
      if (choice === 'How to install Ollama') {
        vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai'));
      }
      return false;
    }

    if (await this.isModelAvailable()) {
      this.setStatus('$(check) Local AI Ready');
      return true;
    }

    const choice = await vscode.window.showInformationMessage(
      `Model "${this.shortName(this.modelName)}" is not downloaded yet. Pull it now? (may be several GB)`,
      'Download',
      'Open Models Panel'
    );
    if (choice === 'Open Models Panel') {
      vscode.commands.executeCommand('localCodingAgent.modelsView.focus');
      return false;
    }
    if (choice !== 'Download') {
      this.setStatus('$(warning) Model missing');
      return false;
    }
    return this.downloadModel(this.modelName);
  }

  /** Download any model by id. Fires onProgress / onDone events. */
  async downloadModel(targetModel: string): Promise<boolean> {
    if (this.downloading) {
      vscode.window.showWarningMessage('A model is already downloading. Please wait.');
      return false;
    }
    this.downloading = true;

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pulling: ${this.shortName(targetModel)}`,
        cancellable: false
      },
      async (progress) => {
        try {
          this.setStatus(`$(sync~spin) Downloading...`);
          let lastPct = 0;

          for await (const chunk of this.client.pullModel(targetModel)) {
            if (chunk.total && chunk.completed) {
              const pct = Math.round((chunk.completed / chunk.total) * 100);
              const dl = this.fmt(chunk.completed);
              const tot = this.fmt(chunk.total);

              this._onProgress.fire({
                modelId: targetModel,
                status: chunk.status ?? '',
                percent: pct,
                downloaded: dl,
                total: tot
              });

              if (pct > lastPct) {
                progress.report({ message: `${pct}%  (${dl} / ${tot})`, increment: pct - lastPct });
                lastPct = pct;
              }
            } else if (chunk.status) {
              this._onProgress.fire({
                modelId: targetModel,
                status: chunk.status,
                percent: lastPct,
                downloaded: '',
                total: ''
              });
              progress.report({ message: chunk.status });
            }
          }

          this.setStatus('$(check) Local AI Ready');
          this._onDone.fire({ modelId: targetModel, success: true });
          vscode.window.showInformationMessage(`Model "${this.shortName(targetModel)}" downloaded!`);
          return true;
        } catch (err) {
          this.setStatus('$(error) Download failed');
          this._onDone.fire({ modelId: targetModel, success: false });
          vscode.window.showErrorMessage(`Failed to pull model: ${err}`);
          return false;
        } finally {
          this.downloading = false;
        }
      }
    );
  }

  async isModelAvailable(name?: string): Promise<boolean> {
    try {
      const models = await this.client.listModels();
      const target = (name ?? this.modelName).toLowerCase();
      const base = target.split(':')[0];
      return models.some(
        (m) =>
          m.name.toLowerCase() === target ||
          m.name.toLowerCase().startsWith(base)
      );
    } catch {
      return false;
    }
  }

  setActiveModel(name: string): void {
    this.modelName = name;
  }

  isDownloading(): boolean {
    return this.downloading;
  }

  setStatus(text: string): void {
    this.statusBarItem.text = text;
  }

  shortName(id: string): string {
    const parts = id.split('/');
    const last = parts[parts.length - 1];
    return last.length > 32 ? last.slice(0, 32) + '…' : last;
  }

  private fmt(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  dispose(): void {
    this._onProgress.dispose();
    this._onDone.dispose();
    this.statusBarItem.dispose();
  }
}
