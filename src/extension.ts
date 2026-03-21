import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { ModelManager } from './modelManager';
import { ChatViewProvider } from './chatViewProvider';
import { CompletionProvider } from './completionProvider';

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('localCodingAgent');
  const ollamaUrl    = cfg.get<string>('ollamaUrl', 'http://localhost:11434');
  const initialModel = cfg.get<string>(
    'modelName',
    'hf.co/Jackrong/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF'
  );
  const enableCompletions = cfg.get<boolean>('enableInlineCompletions', false);
  const completionTimeout = cfg.get<number>('completionTimeoutMs', 10000);

  const client       = new OllamaClient(ollamaUrl);
  const modelManager = new ModelManager(client, initialModel);
  const chatProvider = new ChatViewProvider(context.extensionUri, client, initialModel);

  // ── Register chat view ──
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // ── Wire ModelManager events → chat panel ──
  context.subscriptions.push(
    modelManager.onProgress(({ modelId, status, percent, downloaded, total }) => {
      chatProvider.notifyDownloadProgress(modelId, status, percent, downloaded, total);
    }),
    modelManager.onDone(({ success }) => {
      chatProvider.notifyDownloadDone(success);
      if (success) refreshInstalledModels();
    })
  );

  // ── Wire chat panel → ModelManager ──
  context.subscriptions.push(
    chatProvider.onDownloadRequest(modelId => {
      modelManager.downloadModel(modelId);
    }),
    chatProvider.onUseModelRequest(modelId => {
      modelManager.setActiveModel(modelId);
      chatProvider.setModel(modelId);
      vscode.workspace.getConfiguration('localCodingAgent')
        .update('modelName', modelId, vscode.ConfigurationTarget.Global);
    })
  );

  // ── Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('localCodingAgent.downloadModel', () =>
      modelManager.downloadModel(
        vscode.workspace.getConfiguration('localCodingAgent')
          .get<string>('modelName', initialModel)!
      )
    ),
    vscode.commands.registerCommand('localCodingAgent.openChat', () =>
      vscode.commands.executeCommand('localCodingAgent.chatView.focus')
    ),
    vscode.commands.registerCommand('localCodingAgent.openModels', () =>
      vscode.commands.executeCommand('localCodingAgent.chatView.focus')
    ),
    vscode.commands.registerCommand('localCodingAgent.explainCode',  () => runCodeAction('explain',  chatProvider)),
    vscode.commands.registerCommand('localCodingAgent.fixCode',      () => runCodeAction('fix',      chatProvider)),
    vscode.commands.registerCommand('localCodingAgent.refactorCode', () => runCodeAction('refactor', chatProvider))
  );

  // ── Inline completions (opt-in) ──
  if (enableCompletions) {
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        new CompletionProvider(client, initialModel, completionTimeout)
      )
    );
  }

  context.subscriptions.push(modelManager, chatProvider);

  // ── Quick non-blocking startup check (5 s timeout already in OllamaClient) ──
  refreshInstalledModels();

  function refreshInstalledModels(): void {
    client.listModels().then(models => {
      const installed = models.map(m => m.name.toLowerCase());
      modelManager.setStatus('$(check) Local AI Ready');
      chatProvider.setInstalledModels(installed, initialModel);
    }).catch(() => {
      modelManager.setStatus('$(warning) Ollama offline');
      chatProvider.setInstalledModels([], initialModel);
    });
  }
}

export function deactivate(): void { /* subscriptions auto-disposed */ }

function runCodeAction(action: 'explain' | 'fix' | 'refactor', chatProvider: ChatViewProvider): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage('Local Coding Agent: No active editor.'); return; }
  if (editor.selection.isEmpty) { vscode.window.showWarningMessage('Local Coding Agent: Select some code first.'); return; }
  chatProvider.sendCodeAction(action, editor.document.getText(editor.selection), editor.document.languageId);
}
