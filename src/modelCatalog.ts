export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size: string;
  tags: string[];
}

export const CATALOG_MODELS: CatalogModel[] = [
  {
    id: 'hf.co/Jackrong/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF',
    name: 'Qwen3.5-9B Reasoning',
    description: 'Claude 4.6 Opus reasoning distilled into Qwen3.5-9B. Recommended for this plugin.',
    size: '~6 GB',
    tags: ['recommended', 'reasoning', 'coding', 'chat']
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen2.5 Coder 7B',
    description: "Alibaba's code-specialised model. Fast and accurate for everyday coding tasks.",
    size: '~4.7 GB',
    tags: ['coding', 'completion', 'fast']
  },
  {
    id: 'qwen2.5-coder:14b',
    name: 'Qwen2.5 Coder 14B',
    description: 'Larger variant of Qwen2.5 Coder. Better quality, needs more RAM.',
    size: '~9 GB',
    tags: ['coding', 'completion']
  },
  {
    id: 'deepseek-coder-v2:16b',
    name: 'DeepSeek Coder V2 16B',
    description: 'Strong MoE coding model. High quality output for complex tasks.',
    size: '~9 GB',
    tags: ['coding', 'completion']
  },
  {
    id: 'codellama:13b',
    name: 'Code Llama 13B',
    description: "Meta's code-focused Llama model. Excellent at fill-in-the-middle completions.",
    size: '~7.4 GB',
    tags: ['coding', 'completion', 'fim']
  },
  {
    id: 'phi4:14b',
    name: 'Phi-4 14B',
    description: "Microsoft's Phi-4. Strong at coding, math reasoning and problem solving.",
    size: '~8.9 GB',
    tags: ['coding', 'reasoning', 'math']
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    description: "Meta's general-purpose model. Good at reasoning, chat and code.",
    size: '~4.9 GB',
    tags: ['chat', 'reasoning', 'general']
  },
  {
    id: 'mistral:7b',
    name: 'Mistral 7B',
    description: 'Fast, lightweight general model. Great for quick answers.',
    size: '~4.1 GB',
    tags: ['chat', 'fast', 'general']
  },
  {
    id: 'starcoder2:15b',
    name: 'StarCoder2 15B',
    description: "BigCode's open model trained on 600+ programming languages.",
    size: '~9 GB',
    tags: ['coding', 'completion']
  }
];
