import * as http from 'http';
import * as os from 'os';
import { AgentStore, generateId } from './agent-store';
import { AgentSession, Provider, ChatMessage } from './agent-types';

const DEFAULT_PORT = 9876;

function extractTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (first) {
    const text = first.content.replace(/```[\s\S]*?```/g, '').trim();
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }
  return '';
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

export class AgentServer {
  private server: http.Server | null = null;
  private port: number;
  private url: string = '';

  constructor(
    private store: AgentStore,
    private onSessionReceived?: (session: AgentSession) => void,
    port?: number,
  ) {
    this.port = port || DEFAULT_PORT;
  }

  start(): void {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', port: this.port }));
        return;
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/api/save') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const session = this.buildSession(data);
            if (!session) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid session data: no messages' }));
              return;
            }
            this.store.add(session);
            this.onSessionReceived?.(session);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', id: session.id }));
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid JSON: ${e.message}` }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      this.url = `http://127.0.0.1:${this.port}`;
      console.log(`[Wardy] HTTP server listening at ${this.url}`);
      console.log(`[Wardy] POST ${this.url}/api/save — send session data`);
      console.log(`[Wardy] GET  ${this.url}/api/health — health check`);
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Wardy] Port ${this.port} is in use. Try a different port in settings.`);
      } else {
        console.error(`[Wardy] Server error:`, err.message);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.url = '';
    }
  }

  getUrl(): string {
    return this.url;
  }

  private buildSession(data: any): AgentSession | null {
    const messages: ChatMessage[] = this.normalizeMessages(data);
    if (messages.length === 0) return null;

    const agentName = String(data.agent || data.agentName || 'Unknown');
    const provider: Provider = data.provider || (
      agentName === 'OpenCode' ? 'Anthropic' :
      agentName === 'Claude Code' ? 'Anthropic' :
      agentName === 'Cursor' ? 'OpenAI' :
      agentName === 'GitHub Copilot' ? 'GitHub' : 'Unknown'
    ) as Provider;
    const projectPath = data.project || data.projectPath || '';
    const startTime = data.timestamp || data.startTime || messages[0].timestamp || new Date().toISOString();
    const endTime = data.endTime || messages[messages.length - 1].timestamp || new Date().toISOString();
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);

    return {
      id: data.id || generateId(),
      agentName,
      provider,
      model: String(data.model || data.modelName || ''),
      title: data.title || extractTitle(messages) || 'Untitled',
      startTime,
      endTime,
      durationMs: data.durationMs != null ? Number(data.durationMs) : null,
      promptCount: messages.length,
      totalTokens,
      projectPath,
      source: 'imported',
      metadata: {
        conversation: JSON.stringify(messages),
        source: 'http-api',
      },
    };
  }

  private normalizeMessages(data: any): ChatMessage[] {
    const raw = Array.isArray(data) ? data : (data.messages || []);
    return raw
      .map((m: any) => ({
        role: String(m.role || 'user'),
        content: String(m.content || ''),
        timestamp: m.timestamp || m.created_at || undefined,
        tokens: m.tokens || (m.content ? Math.max(1, Math.round(String(m.content).length / 4)) : 0),
      }))
      .filter((m: ChatMessage) => m.content);
  }
}
