/**
 * Wardy Save — saves AI agent session data into this project.
 *
 * Use this script to let your AI agent directly store conversation
 * data that Wardy can read. Works with any agent that can run a
 * shell command (OpenCode, Claude Code, Cursor, etc.).
 *
 * Usage:
 *   cat conversation.json | node .wardy/save.js
 *   node .wardy/save.js --file conversation.json
 *   echo '{"messages":[...],"agent":"OpenCode","project":"..."}' | node .wardy/save.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function parseInput() {
  const args = process.argv.slice(2);

  // --file <path>
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return JSON.parse(fs.readFileSync(args[fileIdx + 1], 'utf-8'));
  }

  // direct JSON argument
  if (args.length > 0 && !args[0].startsWith('--')) {
    try { return JSON.parse(args.join(' ')); } catch {}
  }

  // stdin (piped)
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON from stdin: ' + e.message)); }
    });
    process.stdin.on('error', reject);
  });
}

function normalizeMessages(raw) {
  const messages = Array.isArray(raw) ? raw : (raw.messages || []);
  return messages.map(m => ({
    role: String(m.role || 'user'),
    content: String(m.content || ''),
    timestamp: m.timestamp || m.created_at || new Date().toISOString(),
    tokens: m.tokens || Math.max(1, Math.round(String(m.content || '').length / 4)),
  })).filter(m => m.content);
}

function generateId(data) {
  const ts = data.timestamp || data.created_at || new Date().toISOString();
  const seed = ts + '-' + (data.agent || data.agentName || 'unknown') + '-' + (data.project || data.projectPath || '') + '-' + crypto.randomBytes(4).toString('hex');
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

async function main() {
  try {
    const data = await parseInput();
    const messages = normalizeMessages(data);

    if (messages.length === 0) {
      console.error('wardy-save: no messages provided');
      process.exit(1);
    }

    const id = data.id || generateId(data);
    const agentName = data.agent || data.agentName || 'Unknown';
    const model = data.model || '';
    const projectPath = data.project || data.projectPath || process.cwd();
    const startTime = data.timestamp || data.startTime || messages[0].timestamp || new Date().toISOString();
    const endTime = data.endTime || messages[messages.length - 1].timestamp || new Date().toISOString();

    const session = {
      id,
      agentName,
      model,
      projectPath,
      title: data.title || extractTitle(messages),
      promptCount: messages.length,
      totalTokens: messages.reduce((s, m) => s + (m.tokens || 0), 0),
      startTime,
      endTime,
      durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
      metadata: {
        conversation: JSON.stringify(messages),
        source: 'wardy-save',
      },
    };

    const filePath = path.join(SESSIONS_DIR, id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2) + '\n');
    console.log(`wardy-save: saved session ${id} (${messages.length} messages)`);
  } catch (e) {
    console.error('wardy-save error:', e.message);
    process.exit(1);
  }
}

function extractTitle(messages) {
  const first = messages.find(m => m.role === 'user');
  if (first) {
    const text = first.content.replace(/```[\s\S]*?```/g, '').trim();
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }
  return '';
}

main();
