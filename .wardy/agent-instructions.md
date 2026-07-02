# Wardy — Agent Auto-Save Instructions

Wardy records every AI coding session automatically. Give these instructions to your AI agent so it saves conversations without you asking each time.

## Method 1: HTTP API (recommended, works with any agent)

At the end of every conversation, POST the session data to Wardy's local HTTP server:

```bash
curl -X POST http://127.0.0.1:9876/api/save \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "OpenCode",
    "model": "claude-sonnet-4-20250514",
    "project": "/path/to/your/project",
    "messages": [
      {"role": "user", "content": "...", "timestamp": "2025-01-01T00:00:00Z"},
      {"role": "assistant", "content": "...", "timestamp": "2025-01-01T00:00:05Z"}
    ]
  }'
```

The port may differ — check the Wardy sidebar Integrate tab for your exact endpoint URL.

## Method 2: Save script

Alternatively, save to `.wardy/sessions/` in the project root:

```bash
node .wardy/save.js << 'EOF'
{
  "agent": "OpenCode",
  "model": "claude-sonnet-4-20250514",
  "project": "/path/to/your/project",
  "messages": [
    {"role": "user", "content": "...", "timestamp": "2025-01-01T00:00:00Z"},
    {"role": "assistant", "content": "...", "timestamp": "2025-01-01T00:00:05Z"}
  ]
}
EOF
```

## Method 3: Auto-Detection (zero setup)

Wardy automatically detects and captures sessions from agents that store conversation files locally:
- **OpenCode**: watches `~/.opencode/conversations/`
- **Claude Code**: watches `~/.claude/conversations/`
- **Cursor**: watches `~/.cursor/`

No additional setup needed — just use your agent normally and Wardy picks it up.
