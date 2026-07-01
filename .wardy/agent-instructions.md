# Wardy — Agent Instructions

To let Wardy capture this conversation, run the save script at the end:

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

The script accepts:
- **stdin** (pipe JSON): `cat conv.json | node .wardy/save.js`
- **--file**: `node .wardy/save.js --file conv.json`
- **inline JSON**: `node .wardy/save.js '{"messages":[...]}'`

Wardy scans `.wardy/sessions/` in the workspace root and displays all saved sessions.
