import * as http from 'http';
import * as readline from 'readline';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
}

export class OllamaClient {
  private host: string;
  private port: number;

  constructor(baseUrl: string = 'http://localhost:11434') {
    const url = new URL(baseUrl);
    this.host = url.hostname;
    this.port = parseInt(url.port) || 11434;
  }

  async listModels(): Promise<OllamaModel[]> {
    const data = await this.get('/api/tags');
    return (data.models as OllamaModel[]) || [];
  }

  async *pullModel(modelName: string): AsyncGenerator<PullProgress> {
    for await (const chunk of this.streamPost('/api/pull', { name: modelName, stream: true })) {
      yield chunk as PullProgress;
    }
  }

  async *chat(messages: ChatMessage[], modelName: string): AsyncGenerator<string> {
    for await (const chunk of this.streamPost('/api/chat', {
      model: modelName,
      messages,
      stream: true
    })) {
      const content = (chunk as { message?: { content?: string } }).message?.content;
      if (content) {
        yield content;
      }
    }
  }

  async *generate(prompt: string, modelName: string): AsyncGenerator<string> {
    for await (const chunk of this.streamPost('/api/generate', {
      model: modelName,
      prompt,
      stream: true
    })) {
      const response = (chunk as { response?: string }).response;
      if (response) {
        yield response;
      }
    }
  }

  private get(path: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: this.host, port: this.port, path, method: 'GET' },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as Record<string, unknown>);
            } catch {
              reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
            }
          });
        }
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Ollama did not respond within ${timeoutMs / 1000}s`));
      });
      req.on('error', reject);
      req.end();
    });
  }

  private async *streamPost(path: string, body: object): AsyncGenerator<unknown> {
    const bodyStr = JSON.stringify(body);

    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
          }
        },
        resolve
      );
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });

    if (response.statusCode && response.statusCode >= 400) {
      let errBody = '';
      for await (const chunk of response) {
        errBody += (chunk as Buffer).toString();
      }
      throw new Error(`Ollama ${response.statusCode}: ${errBody.trim()}`);
    }

    const rl = readline.createInterface({ input: response, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.trim()) {
        try {
          yield JSON.parse(line);
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}
