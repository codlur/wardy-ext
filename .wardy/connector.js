/**
 * Wardy Connector — reads AI agent data and saves complete sessions
 * to .wardy/sessions/ so Wardy can display them.
 *
 * Usage:
 *   node .wardy/connector          # one-shot sync
 *   node .wardy/connector --watch  # keep running and sync every 5s
 *
 * Supports: OpenCode, Claude Code, Cursor
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const POLL_MS = 5000;

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const HOME = os.homedir();
const AGENTS = [
  {
    name: 'OpenCode',
    datDir: path.join(HOME, '.opencode'),
    convDir: path.join(HOME, '.opencode', 'conversations'),
  },
  {
    name: 'Claude Code',
    datDir: null,
    convDir: path.join(HOME, '.claude', 'conversations'),
  },
  {
    name: 'Cursor',
    datDir: null,
    convDir: path.join(HOME, '.cursor'),
  },
];

function normPath(p) {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

function parseMessages(raw, conv) {
  const msgs = Array.isArray(conv.messages)
    ? conv.messages.map(m => ({
        role: String(m.role || 'user'),
        content: String(m.content || ''),
        timestamp: m.timestamp || m.created_at || undefined,
        tokens: m.tokens || Math.max(1, Math.round(String(m.content || '').length / 4)),
      }))
    : [];
  return msgs.filter(m => m.content);
}

function extractTitle(messages) {
  const first = messages.find(m => m.role === 'user');
  if (first) {
    const text = first.content.replace(/```[\s\S]*?```/g, '').trim();
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }
  return '';
}

function parseDatFile(fp) {
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    const sessions = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        sessions.push(obj);
      } catch {}
    }
    return sessions;
  } catch { return []; }
}

function findMatchingConversation(projectPath, convDir) {
  if (!fs.existsSync(convDir)) return null;
  const pn = normPath(projectPath);
  let bestMatch = null;
  let bestScore = 0;

  const files = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
  files.sort((a, b) => {
    try { return fs.statSync(path.join(convDir, b)).mtimeMs - fs.statSync(path.join(convDir, a)).mtimeMs; } catch { return 0; }
  });

  for (const file of files) {
    try {
      const conv = JSON.parse(fs.readFileSync(path.join(convDir, file), 'utf-8'));
      const info = conv.metadata || {};
      const convProject = normPath(info.project || info.directory || '');
      let score = 0;
      if (pn && convProject) {
        if (convProject === pn) score = 3;
        else if (convProject.includes(pn) || pn.includes(convProject)) score = 2;
        else if (path.basename(convProject) === path.basename(pn)) score = 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = conv;
      }
      if (score >= 2) break;
    } catch {}
  }
  return bestMatch;
}

function writeSession(id, session) {
  const fp = path.join(SESSIONS_DIR, id + '.json');
  fs.writeFileSync(fp, JSON.stringify(session, null, 2) + '\n');
}

function syncOpenCode() {
  const agent = AGENTS[0];
  const datFiles = ['opencode.global.dat', 'opencode.projects.dat', 'sessions.dat'];
  const seen = new Set();

  for (const df of datFiles) {
    const fp = path.join(agent.datDir, df);
    if (!fs.existsSync(fp)) continue;
    const entries = parseDatFile(fp);
    for (const entry of entries) {
      const id = entry.id || crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex').slice(0, 16);
      if (seen.has(id)) continue;
      seen.add(id);

      const projectPath = entry.project || entry.projectPath || entry.directory || '';
      if (!projectPath) continue;

      // try to find matching conversation
      const conv = findMatchingConversation(projectPath, agent.convDir);
      const messages = conv ? parseMessages(entry, conv) : [];
      const startTime = entry.timestamp || entry.startTime || (messages.length ? messages[0].timestamp : undefined) || new Date().toISOString();
      const endTime = entry.endTime || (messages.length ? messages[messages.length - 1].timestamp : undefined) || new Date().toISOString();

      const session = {
        id,
        agentName: 'OpenCode',
        model: entry.model || entry.provider || '',
        projectPath,
        title: entry.title || extractTitle(messages) || 'Untitled',
        promptCount: messages.length || entry.promptCount || entry.messageCount || entry.messages?.length || 0,
        totalTokens: messages.reduce((s, m) => s + (m.tokens || 0), 0),
        startTime,
        endTime,
        durationMs: entry.durationMs || (new Date(endTime).getTime() - new Date(startTime).getTime()),
        metadata: {
          conversation: JSON.stringify(messages),
          source: 'connector-opencode-dat',
        },
      };

      writeSession(id, session);
      console.log(`  ✓ OpenCode session: ${session.title.slice(0, 60)} (${id.slice(0, 8)})`);
    }
  }
}

function syncAgentConversations(agent) {
  if (!fs.existsSync(agent.convDir)) return;
  const files = fs.readdirSync(agent.convDir).filter(f => f.endsWith('.json'));
  files.sort((a, b) => {
    try { return fs.statSync(path.join(agent.convDir, b)).mtimeMs - fs.statSync(path.join(agent.convDir, a)).mtimeMs; } catch { return 0; }
  });

  const existing = new Set();
  if (fs.existsSync(SESSIONS_DIR)) {
    for (const f of fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))) {
      existing.add(f);
    }
  }

  for (const file of files) {
    try {
      const fp = path.join(agent.convDir, file);
      const raw = fs.readFileSync(fp, 'utf-8');
      const conv = JSON.parse(raw);
      const messages = parseMessages(null, conv);
      if (messages.length === 0) continue;

      const info = conv.metadata || {};
      const projectPath = info.project || info.directory || '';
      const id = file.replace(/\.json$/, '');
      const destFile = id + '.json';

      // skip if already have a session file for this conversation
      if (existing.has(destFile)) continue;

      const startTime = messages[0].timestamp || new Date().toISOString();
      const endTime = messages[messages.length - 1].timestamp || new Date().toISOString();

      const session = {
        id,
        agentName: agent.name,
        model: info.model || '',
        projectPath: projectPath || '',
        title: extractTitle(messages) || conv.summary || file.replace(/\.json$/, '').slice(0, 40),
        promptCount: messages.length,
        totalTokens: messages.reduce((s, m) => s + (m.tokens || 0), 0),
        startTime,
        endTime,
        durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
        metadata: {
          conversation: JSON.stringify(messages),
          source: 'connector-conversation',
        },
      };

      writeSession(id, session);
      console.log(`  ✓ ${agent.name} session: ${session.title.slice(0, 60)} (${id.slice(0, 8)})`);
      existing.add(destFile);
    } catch {}
  }
}

function syncAll() {
  console.log(`\n[Wardy Connector] ${new Date().toLocaleTimeString()}`);
  syncOpenCode();
  for (const agent of AGENTS.slice(1)) {
    syncAgentConversations(agent);
  }
  // also sync conversations for OpenCode (sessions without .dat entries)
  syncAgentConversations(AGENTS[0]);
}

// ---- main ----
const isWatch = process.argv.includes('--watch');
console.log(`Wardy Connector — saving sessions to ${SESSIONS_DIR}`);
syncAll();
if (isWatch) {
  console.log(`\nWatching for changes (every ${POLL_MS / 1000}s)...`);
  setInterval(syncAll, POLL_MS);
  process.on('SIGINT', () => { console.log('\nStopped.'); process.exit(); });
  process.on('SIGTERM', () => { console.log('\nStopped.'); process.exit(); });
} else {
  console.log('\nDone. Run with --watch to keep syncing.');
}
