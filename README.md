# Local Coding Agent — Setup Guide

A VS Code plugin that runs an AI coding assistant entirely on your machine using Ollama.

---

## What you need

- Windows 10/11 (64-bit)
- [Node.js](https://nodejs.org) v18 or later
- [Git](https://git-scm.com) (optional, only needed to clone)
- [VS Code](https://code.visualstudio.com) v1.85 or later
- [Ollama](https://ollama.com) (runs the AI model locally)
- ~6 GB free disk space (for the model)
- 8 GB RAM minimum — 16 GB recommended

---

## Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version and run the installer
3. Keep all defaults and click through
4. Open a terminal and verify:
   ```
   node --version
   npm --version
   ```
   Both should print a version number.

---

## Step 2 — Install Ollama

1. Go to https://ollama.com
2. Click **Download for Windows** and run the installer
3. Ollama runs silently in the background — you will see its icon in the system tray
4. Verify it is running by opening a terminal and typing:
   ```
   ollama list
   ```
   You should see an empty table (no models yet). That is fine.

---

## Step 3 — Get the plugin files

**Option A — you already have the folder open in VS Code**
Skip this step. The files are already there.

**Option B — clone or copy manually**
Copy the `LocalCodingAgent` folder to any location on your PC, then open it in VS Code:
```
File → Open Folder → select the LocalCodingAgent folder
```

---

## Step 4 — Install plugin dependencies

Open the **integrated terminal** in VS Code (`Ctrl + `` ` ``), then run:

```
npm install
```

This downloads the TypeScript compiler used to build the plugin. It takes about 10 seconds.

---

## Step 5 — Compile the plugin

Still in the terminal, run:

```
npm run compile
```

You should see no errors. An `out/` folder is created — that is the compiled plugin.

---

## Step 6 — Launch the plugin in VS Code

Press **F5**.

A new VS Code window opens — this is the **Extension Development Host**. The plugin is live inside that window.

You will see a **chip icon** appear in the left activity bar. Click it to open the chat panel.

> You only need to press F5 during development. Once packaged (see Step 9), it installs like any normal extension.

---

## Step 7 — Download the AI model

On first launch the plugin checks if the model is available.

**Option A — let the plugin do it**
A notification pops up asking if you want to download the model. Click **Download**. A progress bar shows the download (roughly 5–6 GB). Wait for it to finish.

**Option B — download it yourself via terminal**
```
ollama pull hf.co/Jackrong/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF
```
Run this in any terminal (not necessarily VS Code). You can also watch progress there.

Either way, you only need to download once. The model stays on your machine.

---

## Step 8 — Start using it

Once the model is downloaded:

| What you want to do | How |
|---|---|
| Open the chat | Click the chip icon in the activity bar |
| Ask about your code | Type in the chat box and press **Ctrl+Enter** or click **Send** |
| Include selected code | Tick **Include editor selection** before sending |
| Explain selected code | Select code → right-click → **Local Coding Agent: Explain Code** |
| Fix selected code | Select code → right-click → **Local Coding Agent: Fix Code** |
| Refactor selected code | Select code → right-click → **Local Coding Agent: Refactor Code** |
| Re-download the model | Open the Command Palette (`Ctrl+Shift+P`) → **Local Coding Agent: Download / Pull Model** |

The status bar at the bottom-right shows the current model state (`Local AI Ready`, `Downloading…`, etc).

---

## Step 9 — (Optional) Install as a permanent extension

If you want the plugin available in every VS Code window without pressing F5:

1. Install the VS Code extension packager:
   ```
   npm install -g @vscode/vsce
   ```
2. Inside the `LocalCodingAgent` folder, run:
   ```
   vsce package
   ```
   This creates a `.vsix` file (e.g. `local-coding-agent-0.1.0.vsix`).

3. Install it in VS Code:
   ```
   code --install-extension local-coding-agent-0.1.0.vsix
   ```
   Or go to `Extensions → … → Install from VSIX` and pick the file.

---

## Troubleshooting

**"Ollama is not running"**
Open the Start Menu, search for **Ollama**, and launch it. The tray icon should appear. Then reload VS Code (`Ctrl+Shift+P` → `Developer: Reload Window`).

**"Model not found" or download fails**
Try pulling the model manually in a terminal:
```
ollama pull hf.co/Jackrong/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF
```
If it fails, Ollama may need to be updated. Re-download from https://ollama.com.

**Responses are very slow**
The model is large (9B parameters). On CPU it may take 30–60 seconds per response. A GPU (NVIDIA with 8 GB+ VRAM) speeds this up significantly. Ollama uses the GPU automatically if available.

**Inline completions feel slow or intrusive**
They are disabled by default. If you enabled them and want to turn them off:
Go to `File → Preferences → Settings` → search **Local Coding Agent** → uncheck **Enable Inline Completions**.

**F5 shows an error about missing files**
Make sure you ran `npm run compile` first and that the `out/` folder exists.

---

## Settings reference

Go to `File → Preferences → Settings` and search **Local Coding Agent**.

| Setting | Default | Description |
|---|---|---|
| `ollamaUrl` | `http://localhost:11434` | Address of the Ollama server |
| `modelName` | `hf.co/Jackrong/...` | Model to use — change to any Ollama model name |
| `enableInlineCompletions` | `false` | Ghost-text completions while you type |
| `completionTimeoutMs` | `10000` | How long to wait for a completion (ms) |
