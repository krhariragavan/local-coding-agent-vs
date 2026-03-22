export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size: string;
  tags: string[];
}

export const CATALOG_MODELS: CatalogModel[] = [
  // ── Qwen 2.5 Coder series ──────────────────────────────────────────────
  {
    id: 'qwen2.5-coder:3b',
    name: 'Qwen2.5 Coder 3B',
    description: 'Tiny but capable coder. Runs on almost any machine. Great for quick completions.',
    size: '~2 GB',
    tags: ['coding', 'completion', 'fast', 'lightweight']
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen2.5 Coder 7B',
    description: "Alibaba's code-specialised model. Best balance of speed and quality for everyday coding.",
    size: '~4.7 GB',
    tags: ['coding', 'completion', 'fast', 'recommended']
  },
  {
    id: 'qwen2.5-coder:14b',
    name: 'Qwen2.5 Coder 14B',
    description: 'Larger Qwen2.5 Coder. Noticeably better at complex refactors and multi-file tasks.',
    size: '~9 GB',
    tags: ['coding', 'completion']
  },
  {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen2.5 Coder 32B',
    description: 'Top of the Qwen Coder line. Near GPT-4-level coding quality, runs fully local.',
    size: '~20 GB',
    tags: ['coding', 'completion', 'large']
  },

  // ── DeepSeek series ────────────────────────────────────────────────────
  {
    id: 'deepseek-r1:7b',
    name: 'DeepSeek R1 7B',
    description: 'Lightweight reasoning model. Thinks step-by-step — great for debugging and algorithms.',
    size: '~4.7 GB',
    tags: ['reasoning', 'coding', 'fast']
  },
  {
    id: 'deepseek-r1:14b',
    name: 'DeepSeek R1 14B',
    description: 'Stronger reasoning variant. Excellent at complex coding problems and code review.',
    size: '~9 GB',
    tags: ['reasoning', 'coding']
  },
  {
    id: 'deepseek-coder-v2:16b',
    name: 'DeepSeek Coder V2 16B',
    description: 'MoE coding model with very high accuracy. Strong at code generation and completion.',
    size: '~9 GB',
    tags: ['coding', 'completion']
  },

  // ── Microsoft Phi series ───────────────────────────────────────────────
  {
    id: 'phi4-mini:3.8b',
    name: 'Phi-4 Mini 3.8B',
    description: "Microsoft's compact Phi-4. Surprisingly strong at coding and reasoning for its size.",
    size: '~2.5 GB',
    tags: ['coding', 'reasoning', 'lightweight', 'fast']
  },
  {
    id: 'phi4:14b',
    name: 'Phi-4 14B',
    description: "Microsoft's Phi-4. Excellent at coding, math reasoning and structured problem solving.",
    size: '~8.9 GB',
    tags: ['coding', 'reasoning', 'math']
  },

  // ── Google Gemma series ────────────────────────────────────────────────
  {
    id: 'gemma3:4b',
    name: 'Gemma 3 4B',
    description: "Google's efficient Gemma 3. Good general coding assistant, very fast on CPU.",
    size: '~3.3 GB',
    tags: ['coding', 'chat', 'fast', 'lightweight']
  },
  {
    id: 'gemma3:12b',
    name: 'Gemma 3 12B',
    description: 'Larger Gemma 3. Better instruction following and code quality than the 4B.',
    size: '~8 GB',
    tags: ['coding', 'chat']
  },
  {
    id: 'codegemma:7b',
    name: 'CodeGemma 7B',
    description: "Google's code-specialised Gemma. Fine-tuned on code with fill-in-the-middle support.",
    size: '~5 GB',
    tags: ['coding', 'completion', 'fim']
  },

  // ── Meta Llama series ──────────────────────────────────────────────────
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    description: "Meta's tiny Llama 3.2. Excellent for chat and light coding on low-end hardware.",
    size: '~2 GB',
    tags: ['chat', 'coding', 'fast', 'lightweight']
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    description: "Meta's solid general-purpose model. Good at reasoning, chat and everyday code tasks.",
    size: '~4.9 GB',
    tags: ['chat', 'reasoning', 'general']
  },

  // ── Meta Code Llama ───────────────────────────────────────────────────
  {
    id: 'codellama:7b',
    name: 'Code Llama 7B',
    description: "Meta's lightweight code model. Fast completions with fill-in-the-middle support.",
    size: '~3.8 GB',
    tags: ['coding', 'completion', 'fim', 'fast']
  },
  {
    id: 'codellama:13b',
    name: 'Code Llama 13B',
    description: "Meta's mid-size code model. Better quality completions and longer context handling.",
    size: '~7.4 GB',
    tags: ['coding', 'completion', 'fim']
  },

  // ── Mistral ───────────────────────────────────────────────────────────
  {
    id: 'mistral:7b',
    name: 'Mistral 7B',
    description: 'Fast, lightweight general model. Great for quick questions and light coding tasks.',
    size: '~4.1 GB',
    tags: ['chat', 'fast', 'general']
  },

  // ── IBM Granite ───────────────────────────────────────────────────────
  {
    id: 'granite3.1-dense:8b',
    name: 'Granite 3.1 8B',
    description: "IBM's open-source code model. Strong at enterprise coding patterns and documentation.",
    size: '~4.9 GB',
    tags: ['coding', 'completion']
  },

  // ── StarCoder ─────────────────────────────────────────────────────────
  {
    id: 'starcoder2:7b',
    name: 'StarCoder2 7B',
    description: "BigCode's open model trained on 600+ languages. Great fill-in-the-middle support.",
    size: '~4.2 GB',
    tags: ['coding', 'completion', 'fim']
  },
  {
    id: 'starcoder2:15b',
    name: 'StarCoder2 15B',
    description: 'Larger StarCoder2. Higher quality completions across all programming languages.',
    size: '~9 GB',
    tags: ['coding', 'completion', 'fim']
  },
];
