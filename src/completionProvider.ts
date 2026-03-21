import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
  constructor(
    private readonly client: OllamaClient,
    private readonly modelName: string,
    private readonly timeoutMs: number = 10000
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null> {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    if (!linePrefix.trim()) return null;

    // Build FIM-style prompt
    const prefixStart = Math.max(0, position.line - 25);
    const prefix = document.getText(
      new vscode.Range(prefixStart, 0, position.line, position.character)
    );
    const suffixEnd = Math.min(document.lineCount - 1, position.line + 8);
    const suffix = document.getText(
      new vscode.Range(position, new vscode.Position(suffixEnd, 0))
    );

    // Qwen / most models support FIM with these tokens
    const prompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;

    let cancelled = false;
    const cancelDisposable = token.onCancellationRequested(() => (cancelled = true));
    const timeoutHandle = setTimeout(() => (cancelled = true), this.timeoutMs);

    try {
      let completion = '';
      for await (const chunk of this.client.generate(prompt, this.modelName)) {
        if (cancelled) break;
        completion += chunk;
        // Stop at a natural double-newline or reasonable length
        if (completion.includes('\n\n') || completion.length > 400) break;
      }

      if (completion.trim() && !cancelled) {
        return [new vscode.InlineCompletionItem(completion)];
      }
    } catch {
      // Silently fail — completions are best-effort
    } finally {
      clearTimeout(timeoutHandle);
      cancelDisposable.dispose();
    }

    return null;
  }
}
