import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { ModelManager } from './modelManager';
import { ChatViewProvider } from './chatViewProvider';
import { ModelsViewProvider } from './modelsViewProvider';
import { CompletionProvider } from './completionProvider';

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('localCodingAgent');
  const ollamaUrl    = cfg.get<string>('ollamaUrl', 'http://localhost:11434');
  const initialModel = cfg.get<string>('modelName', 'qwen2.5-coder:7b')!;
  const enableCompletions = cfg.get<boolean>('enableInlineCompletions', false);
  const completionTimeout = cfg.get<number>('completionTimeoutMs', 10000);

  const client        = new OllamaClient(ollamaUrl);
  const modelManager  = new ModelManager(client, initialModel);
  const chatProvider  = new ChatViewProvider(context.extensionUri, client, initialModel);
  const modelsProvider = new ModelsViewProvider(context.extensionUri, client, initialModel);
  let activeModel     = initialModel;

  // ── Register views ──
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ModelsViewProvider.viewType, modelsProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // ── Wire ModelManager events → Models panel ──
  context.subscriptions.push(
    modelManager.onProgress(({ modelId, status, percent, downloaded, total }) => {
      modelsProvider.notifyDownloadProgress(modelId, status, percent, downloaded, total);
    }),
    modelManager.onDone(({ modelId, success }) => {
      modelsProvider.notifyDownloadDone(modelId, success);
      if (success) {
        activeModel = modelId;
        modelManager.setActiveModel(modelId);
        modelsProvider.setActiveModel(modelId);
        chatProvider.setModel(modelId);
        vscode.workspace.getConfiguration('localCodingAgent')
          .update('modelName', modelId, vscode.ConfigurationTarget.Global);
        refreshAll();
      }
    })
  );

  // ── Wire Models panel → ModelManager ──
  context.subscriptions.push(
    modelsProvider.onDownloadRequest(modelId => {
      modelManager.downloadModel(modelId);
    }),
    modelsProvider.onUseModelRequest(modelId => {
      switchToModel(modelId);
    }),
    modelsProvider.onCustomModelAdded(modelId => {
      const existing = vscode.workspace.getConfiguration('localCodingAgent')
        .get<string[]>('customModels', []);
      if (!existing.includes(modelId)) {
        const updated = [...existing, modelId];
        vscode.workspace.getConfiguration('localCodingAgent')
          .update('customModels', updated, vscode.ConfigurationTarget.Global);
        modelsProvider.setCustomModels(updated);
      }
    }),
    chatProvider.onSwitchModelRequest(modelId => {
      switchToModel(modelId);
    })
  );

  function switchToModel(modelId: string): void {
    activeModel = modelId;
    modelManager.setActiveModel(modelId);
    modelsProvider.setActiveModel(modelId);
    chatProvider.setModel(modelId);
    vscode.workspace.getConfiguration('localCodingAgent')
      .update('modelName', modelId, vscode.ConfigurationTarget.Global);
    refreshAll();
  }

  // ── Chat view ready → push current model state ──
  context.subscriptions.push(
    chatProvider.onViewReady(() => {
      chatProvider.setModel(activeModel);
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
      vscode.commands.executeCommand('localCodingAgent.modelsView.focus')
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

  context.subscriptions.push(modelManager, chatProvider, modelsProvider);

  // ── Load persisted custom models ──
  const savedCustomModels = vscode.workspace.getConfiguration('localCodingAgent')
    .get<string[]>('customModels', []);
  modelsProvider.setCustomModels(savedCustomModels);

  // ── Non-blocking startup: check Ollama, update both panels ──
  refreshAll();

  function refreshAll(): void {
    client.listModels().then(models => {
      const installed = models.map(m => m.name.toLowerCase());
      const modelReady = isInstalled(installed, activeModel);
      modelManager.setStatus(modelReady ? '$(check) Local AI Ready' : '$(warning) Model not downloaded');
      modelsProvider.pushInstalled(installed, activeModel);
      chatProvider.notifyStatus(true, modelReady);
      chatProvider.notifyInstalledModels(installed);
    }).catch(() => {
      modelManager.setStatus('$(warning) Ollama offline');
      modelsProvider.pushOffline();
      chatProvider.notifyStatus(false, false);
      chatProvider.notifyInstalledModels([]);
    });
  }
}

/** Loose match: checks if a model id is present in Ollama's installed list. */
function isInstalled(installed: string[], modelId: string): boolean {
  const target = modelId.toLowerCase();
  const base   = target.split(':')[0];
  return installed.some(n => n === target || n.startsWith(base));
}

export function deactivate(): void { /* subscriptions auto-disposed */ }

function runCodeAction(action: 'explain' | 'fix' | 'refactor', chatProvider: ChatViewProvider): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage('Local Coding Agent: No active editor.'); return; }
  if (editor.selection.isEmpty) { vscode.window.showWarningMessage('Local Coding Agent: Select some code first.'); return; }
  chatProvider.sendCodeAction(action, editor.document.getText(editor.selection), editor.document.languageId);
}
