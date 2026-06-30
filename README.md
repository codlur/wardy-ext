# Wardy — agentic interaction data Collector

Wardy automatically detects, tracks, and indexes every interaction you have with AI coding agents — prompts, responses, file changes, terminal commands, Git commits, approvals, and agent actions — in one unified, searchable timeline. No manual logging. No context switching. Just complete, auditable history of your AI-assisted development.

Think of it as **Git for AI activity**: every prompt, every decision, every change captured automatically so you can review, replay, analyze, and share your entire AI coding workflow.

🌐 [wardy.run](https://wardy.run) · 🐦 [@wardy_ai](https://x.com/wardy_ai)

---

## What Wardy Collects

| Data | Details |
|---|---|
| **AI Prompts & Responses** | Every prompt sent to an AI agent and every response received, with full conversation history |
| **Agent Activity** | Which agent (Claude Code, OpenCode, Cursor, Codex CLI, GitHub Copilot, Aider, etc.) made which change |
| **File Changes** | Every file modified by an AI agent, linked to the prompt that triggered the change |
| **Terminal & Tool Commands** | Shell commands, tool executions, Git operations, and package installs during AI sessions |
| **Approvals & Rejections** | Every manual intervention, approval, or rejection during AI-assisted development |
| **Session Metadata** | Model used, tokens consumed, duration, project path, and timestamps for every session |
| **Process Activity** | Real-time detection of running AI agents (start, stop, active sessions) |

---

## Why Wardy

**For Developers**
- Never wonder "what did the AI change and why?" — every action is logged and linked to its prompt
- Search across all your AI conversations, files, and commands in one place
- Replay coding sessions step-by-step to understand how a solution evolved
- Keep a private, local-first record under your control

**For Teams**
- Generate **AI Activity Reports** as PDF, Excel, or Word for audits, stand-ups, and retrospectives
- Send automated daily summaries to **Slack** — keep everyone aligned without leaving the editor
- Track which agents and models your team relies on, and how much they're used
- Export compliance-ready audit trails of all AI-assisted changes

**For AI Workflow Analysis**
- Collect structured data on prompt volume, token usage, session duration, and agent preferences
- Identify patterns in how your team interacts with AI — which prompts yield results, which agents are most productive, where context is lost
- Build a quantitative foundation for optimizing your AI development pipeline

---

## Supported Agents

Wardy auto-detects and tracks sessions from:

| Agent | Provider | Detection Method |
|---|---|---|
| **Claude Code** | Anthropic | Process detection + conversation files |
| **OpenCode** | Anthropic | Process detection + `.dat` files + conversation files |
| **Cursor** | OpenAI | Process detection + composer/chat JSON files |
| **Codex CLI** | OpenAI | Process detection + session index files |
| **GitHub Copilot** | GitHub | Process detection |
| **Claude Dev** | Anthropic | Checkpoint directory scanning |
| **Aider** | — | Process detection + data directory scanning |
| **Qoder** | — | Data directory scanning |
| **VS Code** | — | Process detection (terminal/command tracking) |
| Any other CLI agent | — | Process detection (generic fallback) |

---

## How It Works

1. **Install** Wardy in VS Code — it activates automatically in your sidebar
2. **Use your AI agents normally** — Wardy watches for running agents and new conversation files in real time
3. **Review your timeline** — every session, prompt, and change appears instantly in the Wardy sidebar
4. **Search, filter, and analyze** — find any interaction across projects, agents, or timeframes
5. **Export and share** — generate reports or send summaries to Slack

---

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/) or [open-vsx.org](https://open-vsx.org/).

Visual Studio Code 1.90.0+ required. Works out of the box with zero configuration.

---

## Privacy & Data Control

- **Local-first**: All data stays on your machine in your extension storage directory
- **No telemetry**: Wardy does not phone home, track usage, or send data to any external server
- **You own your history**: Export, delete, or archive your AI activity data at any time
- **Optional cloud sync**: Login to Wardy Cloud for cross-device sync (coming soon)

---

## License

MIT
