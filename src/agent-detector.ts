import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { AgentSession, KNOWN_AGENTS, AgentInfo, AgentName, ChatMessage, type Provider } from './agent-types';
import { AgentStore } from './agent-store';

const POLL_INTERVAL_MS = 10000;

export function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function toChatMessage(m: any): ChatMessage {
  const msg: ChatMessage = {
    role: String(m.role || 'user'),
    content: String(m.content || ''),
    timestamp: m.timestamp || m.created_at || undefined,
    tokens: m.tokens || (m.content ? estimateTokens(String(m.content)) : 0),
  };
  if (m.tool_calls) {
    msg.tool_calls = m.tool_calls.map((tc: any) => ({
      name: String(tc.name || tc.function?.name || ''),
      arguments: tc.arguments || tc.function?.arguments || {},
      content: tc.content || undefined,
    }));
  }
  if (m.is_thinking) msg.is_thinking = true;
  if (typeof m.thinking_duration === 'number') msg.thinking_duration = m.thinking_duration;
  if (m.tool_name) msg.tool_name = String(m.tool_name);
  if (m.tool_input) msg.tool_input = m.tool_input;
  return msg;
}

function extractTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser) {
    const text = firstUser.content.replace(/```[\s\S]*?```/g, '').trim();
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }
  return '';
}

type WatchCallback = (newSessions: AgentSession[], running: { name: string; pid: number }[]) => void;

export class AgentDetector {
  private watchers: fs.FSWatcher[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private knownFiles = new Set<string>();
  private fileMtimes = new Map<string, number>();
  private knownPids = new Map<number, string>();
  private callback: WatchCallback | null = null;
  private datDebounceTimer: NodeJS.Timeout | null = null;
  private watchedDatDirs = new Set<string>();

  private workspacePaths: string[] = [];

  constructor(private store: AgentStore) {}

  setWorkspacePaths(paths: string[]): void {
    this.workspacePaths = paths;
  }

  onUpdate(cb: WatchCallback): void {
    this.callback = cb;
  }

  startWatching(homeDir: string): void {
    this.knownFiles.clear();
    this.fileMtimes.clear();
    this.knownPids.clear();

    for (const agent of KNOWN_AGENTS) {
      for (const dp of agent.dataPaths) {
        const dir = path.join(homeDir, dp.path);
        if (!fs.existsSync(dir)) continue;

        const convDir = path.join(dir, 'conversations');
        if (fs.existsSync(convDir)) {
          for (const f of fs.readdirSync(convDir).filter(f => f.endsWith('.json'))) {
            const fp = path.join(convDir, f);
            this.knownFiles.add(fp);
            this.fileMtimes.set(fp, Date.now());
          }
          try {
            const w = fs.watch(convDir, (event, filename) => {
              if (!filename || !filename.endsWith('.json')) return;
              const fullPath = path.join(convDir, filename);
              if (event === 'change' && this.knownFiles.has(fullPath)) {
                setTimeout(() => this.handleFileUpdate(agent, fullPath), 300);
                return;
              }
              if (this.knownFiles.has(fullPath)) return;
              this.knownFiles.add(fullPath);
              this.fileMtimes.set(fullPath, Date.now());
              setTimeout(() => this.processNewFile(agent, fullPath), 500);
            });
            this.watchers.push(w);
          } catch { /* watch might fail on some fs */ }
        }

        // watch OpenCode Desktop .dat files for real-time session detection
        if (agent.name === 'OpenCode' && !this.watchedDatDirs.has(dir)) {
          this.watchedDatDirs.add(dir);
          try {
            const globalDat = path.join(dir, 'opencode.global.dat');
            if (fs.existsSync(globalDat)) {
              const w = fs.watch(dir, (event, filename) => {
                if (!filename || !filename.endsWith('.dat')) return;
                if (this.datDebounceTimer) clearTimeout(this.datDebounceTimer);
                this.datDebounceTimer = setTimeout(() => {
                  const sessions = this.parseAgentDir(agent, dir);
                  const existing = this.store.getAll();
                  const existingIds = new Set(existing.map(s => s.id));
                  const newSessions = sessions.filter(s => !existingIds.has(s.id));
                  if (newSessions.length > 0) {
                    this.store.addBatch(newSessions);
                    this.callback?.(newSessions, []);
                  }
                }, 1500);
              });
              this.watchers.push(w);
            }
          } catch { /* watch might fail */ }
        }
      }
    }

    // watch workspace .wardy/conversations/ directories
    for (const wp of this.workspacePaths) {
      const wc = path.join(wp, '.wardy', 'conversations');
      if (!fs.existsSync(wc)) continue;
      try {
        for (const f of fs.readdirSync(wc).filter(f => f.endsWith('.json'))) {
          const fp = path.join(wc, f);
          this.knownFiles.add(fp);
          this.fileMtimes.set(fp, Date.now());
        }
        const w = fs.watch(wc, (_event, filename) => {
          if (!filename || !filename.endsWith('.json')) return;
          const fullPath = path.join(wc, filename);
          if (!this.knownFiles.has(fullPath)) {
            this.knownFiles.add(fullPath);
            this.fileMtimes.set(fullPath, Date.now());
            setTimeout(() => {
              const newSessions: AgentSession[] = [];
              const updatedSessions: AgentSession[] = [];
              this.scanWardyDir(fullPath, newSessions, updatedSessions);
              if (newSessions.length > 0) this.store.addBatch(newSessions);
              this.callback?.([...newSessions, ...updatedSessions], []);
            }, 500);
          }
        });
        this.watchers.push(w);
      } catch {}
    }

    // watch workspace .wardy/sessions/ directories (complete session files from connector/save)
    for (const wp of this.workspacePaths) {
      const ws = path.join(wp, '.wardy', 'sessions');
      if (!fs.existsSync(ws)) continue;
      try {
        for (const f of fs.readdirSync(ws).filter(f => f.endsWith('.json'))) {
          const fp = path.join(ws, f);
          this.knownFiles.add(fp);
          this.fileMtimes.set(fp, Date.now());
          const session = this.parseWardySessionFile(fp);
          if (session) {
            const existing = this.store.getById(session.id);
            if (!existing) { this.store.add(session); }
          }
        }
        const w = fs.watch(ws, (_event, filename) => {
          if (!filename || !filename.endsWith('.json')) return;
          const fullPath = path.join(ws, filename);
          if (!this.knownFiles.has(fullPath)) {
            this.knownFiles.add(fullPath);
            this.fileMtimes.set(fullPath, Date.now());
            setTimeout(() => {
              const session = this.parseWardySessionFile(fullPath);
              if (session) {
                const existing = this.store.getById(session.id);
                if (!existing) {
                  this.store.add(session);
                  this.callback?.([session], []);
                }
              }
            }, 500);
          }
        });
        this.watchers.push(w);
      } catch {}
    }

    this.startPolling(homeDir);
    setTimeout(() => this.runFullScan(), 500);
  }

  stopWatching(): void {
    for (const w of this.watchers) {
      try { w.close(); } catch {}
    }
    this.watchers = [];
    this.watchedDatDirs.clear();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.datDebounceTimer) {
      clearTimeout(this.datDebounceTimer);
      this.datDebounceTimer = null;
    }
  }

  private scanWardyDir(fullPath: string, newSessions: AgentSession[], updatedSessions: AgentSession[]): void {
    if (fullPath.endsWith('.json') && !this.knownFiles.has(fullPath)) {
      this.knownFiles.add(fullPath);
      for (const agent of KNOWN_AGENTS) {
        const prefix = agent.name.replace(/\s+/g, '-');
        if (path.basename(fullPath).startsWith(prefix)) {
          const parsed = this.parseSingleConversation(agent, fullPath);
          if (parsed) { newSessions.push(parsed); }
          break;
        }
      }
    } else if (fullPath.endsWith('.json')) {
      try {
        const stat = fs.statSync(fullPath);
        const mtime = stat.mtimeMs;
        const lastMtime = this.fileMtimes.get(fullPath) || 0;
        if (mtime > lastMtime) {
          this.fileMtimes.set(fullPath, mtime);
          for (const agent of KNOWN_AGENTS) {
            const prefix = agent.name.replace(/\s+/g, '-');
            if (path.basename(fullPath).startsWith(prefix)) {
              const parsed = this.parseSingleConversation(agent, fullPath);
              if (parsed) {
                const existing = this.store.getById(parsed.id);
                if (existing) parsed.startTime = existing.startTime;
                updatedSessions.push(parsed);
              }
              break;
            }
          }
        }
      } catch {}
    }
  }

  private parseWardySessionFile(fp: string): AgentSession | null {
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.id || !data.agentName) return null;
      const agentName = String(data.agentName);
      const provider: Provider = data.provider ||
        (agentName === 'OpenCode' ? 'Anthropic' :
         agentName === 'Claude Code' ? 'Anthropic' :
         agentName === 'Cursor' ? 'OpenAI' :
         agentName === 'GitHub Copilot' ? 'GitHub' : 'Unknown') as Provider;
      return {
        id: String(data.id),
        agentName,
        provider,
        model: String(data.model || ''),
        projectPath: String(data.projectPath || ''),
        title: String(data.title || 'Untitled'),
        promptCount: Number(data.promptCount) || 0,
        totalTokens: Number(data.totalTokens) || 0,
        startTime: String(data.startTime || ''),
        endTime: data.endTime ? String(data.endTime) : null,
        durationMs: data.durationMs != null ? Number(data.durationMs) : null,
        source: 'imported' as const,
        metadata: data.metadata || {},
      };
    } catch { return null; }
  }

  private startPolling(homeDir: string): void {
    this.pollTimer = setInterval(() => {
      const newSessions: AgentSession[] = [];
      const updatedSessions: AgentSession[] = [];
      const endedAgents = new Set<string>();

      for (const agent of KNOWN_AGENTS) {
        for (const dp of agent.dataPaths) {
          const dir = path.join(homeDir, dp.path);
          if (!fs.existsSync(dir)) continue;
          const convDir = path.join(dir, 'conversations');
          if (fs.existsSync(convDir)) {
            try {
              for (const f of fs.readdirSync(convDir).filter(f => f.endsWith('.json'))) {
                const fullPath = path.join(convDir, f);
                if (!this.knownFiles.has(fullPath)) {
                  this.knownFiles.add(fullPath);
                  const parsed = this.parseSingleConversation(agent, fullPath);
                  if (parsed) newSessions.push(parsed);
                } else {
                  // check for file modifications
                  try {
                    const stat = fs.statSync(fullPath);
                    const mtime = stat.mtimeMs;
                    const lastMtime = this.fileMtimes.get(fullPath) || 0;
                    if (mtime > lastMtime) {
                      this.fileMtimes.set(fullPath, mtime);
                      const parsed = this.parseSingleConversation(agent, fullPath);
                      if (parsed) {
                        const existing = this.store.getById(parsed.id);
                        if (existing) parsed.startTime = existing.startTime;
                        updatedSessions.push(parsed);
                      }
                    }
                  } catch {}
                }
              }
            } catch {}
          }
        }
      }

      // scan workspace .wardy/conversations/ directories
      for (const wp of this.workspacePaths) {
        const wc = path.join(wp, '.wardy', 'conversations');
        if (!fs.existsSync(wc)) continue;
        try {
          for (const f of fs.readdirSync(wc).filter(f => f.endsWith('.json'))) {
            this.scanWardyDir(path.join(wc, f), newSessions, updatedSessions);
          }
        } catch {}
      }

      // scan workspace .wardy/sessions/ directories (complete session files)
      for (const wp of this.workspacePaths) {
        const ws = path.join(wp, '.wardy', 'sessions');
        if (!fs.existsSync(ws)) continue;
        try {
          for (const f of fs.readdirSync(ws).filter(f => f.endsWith('.json'))) {
            const fullPath = path.join(ws, f);
            if (!this.knownFiles.has(fullPath)) {
              this.knownFiles.add(fullPath);
              this.fileMtimes.set(fullPath, Date.now());
              const session = this.parseWardySessionFile(fullPath);
              if (session) {
                const existing = this.store.getById(session.id);
                if (!existing) {
                  newSessions.push(session);
                }
              }
            } else {
              try {
                const stat = fs.statSync(fullPath);
                const mtime = stat.mtimeMs;
                const lastMtime = this.fileMtimes.get(fullPath) || 0;
                if (mtime > lastMtime) {
                  this.fileMtimes.set(fullPath, mtime);
                  const session = this.parseWardySessionFile(fullPath);
                  if (session) {
                    const existing = this.store.getById(session.id);
                    if (existing) session.startTime = existing.startTime;
                    updatedSessions.push(session);
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      const running = this.detectRunningProcesses();
      const runningNames = new Set(running.map(p => p.name));
      const runningPids = new Set(running.map(p => p.pid));
      const newPids = running.filter(p => !this.knownPids.has(p.pid));
      for (const p of newPids) this.knownPids.set(p.pid, p.name);

      // detect processes that stopped running
      const stalePids: number[] = [];
      for (const [prevPid, prevName] of this.knownPids) {
        if (!runningPids.has(prevPid)) {
          endedAgents.add(prevName);
          stalePids.push(prevPid);
        }
      }
      for (const pid of stalePids) this.knownPids.delete(pid);

      // mark ended sessions as completed
      for (const agentName of endedAgents) {
        const all = this.store.getAll();
        for (const s of all) {
          if (s.agentName === agentName && s.endTime === null) {
            s.endTime = new Date().toISOString();
            if (s.startTime) {
              s.durationMs = new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
            }
            this.store.add(s);
          }
        }
      }

      if (newSessions.length > 0) this.store.addBatch(newSessions);
      for (const s of updatedSessions) this.store.add(s);

      const anyChanges = newSessions.length > 0 || updatedSessions.length > 0 || newPids.length > 0 || endedAgents.size > 0;
      if (anyChanges) {
        this.callback?.(newSessions, newPids);
      }
    }, POLL_INTERVAL_MS);
  }

  private stableConvId(agentName: string, filePath: string): string {
    const normalized = path.resolve(filePath).replace(/\\/g, '/');
    return `conv:${agentName}:${normalized}`;
  }

  private parseSingleConversation(agent: AgentInfo, filePath: string): AgentSession | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const conv = JSON.parse(raw);
      const now = new Date().toISOString();
      const messages: ChatMessage[] = Array.isArray(conv.messages)
        ? conv.messages.map((m: any) => ({
            role: String(m.role || 'user'),
            content: String(m.content || ''),
            timestamp: m.timestamp || m.created_at || undefined,
            tokens: m.tokens || (m.content ? estimateTokens(String(m.content)) : 0),
          }))
        : [];
      const info = conv.metadata || {};
      const title = extractTitle(messages) || path.basename(filePath, '.json');
      const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
      return {
        id: this.stableConvId(agent.name, filePath),
        agentName: agent.name,
        provider: agent.provider,
        model: (info.model || info.modelName || 'unknown').toString(),
        title,
        startTime: String(conv.created_at || info.created || info.createdAt || now),
        endTime: String(conv.updated_at || info.updated || info.updatedAt || ''),
        durationMs: null,
        promptCount: messages.length,
        totalTokens,
        projectPath: info.project || info.directory || '',
        source: 'detected',
        metadata: { file: path.basename(filePath), conversation: JSON.stringify(messages) },
      };
    } catch {
      return null;
    }
  }

  private mergeConversationIntoSession(agent: AgentInfo, messages: ChatMessage[], projectPath: string, model: string): AgentSession | null {
    if (messages.length === 0) return null;
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const allSessions = this.store.getAll();
    const np = normPath(projectPath);

    for (const s of allSessions) {
      if (s.agentName !== agent.name) continue;
      const sp = normPath(s.projectPath || '');
      // match by normalized project path, or if conv has a path and session doesn't, use it
      if (np && sp && (sp === np || sp.includes(np) || np.includes(sp))) {
        this.applyConversation(s, messages, totalTokens, model);
        return s;
      }
    }
    // if no project match, try matching by agent + recency (no project path needed)
    for (const s of allSessions) {
      if (s.agentName !== agent.name) continue;
      if (s.projectPath && projectPath) continue; // already tried above
      // if session has no messages and conv has them, merge
      if (!s.metadata?.conversation) {
        this.applyConversation(s, messages, totalTokens, model);
        return s;
      }
    }
    return null;
  }

  private applyConversation(s: AgentSession, messages: ChatMessage[], totalTokens: number, model: string): void {
    s.metadata = s.metadata || {};
    const existing = s.metadata.conversation ? JSON.parse(s.metadata.conversation as string) as ChatMessage[] : [];
    const merged = [...existing, ...messages];
    // deduplicate by content+role
    const seen = new Set<string>();
    const unique = merged.filter(m => {
      const key = m.role + ':' + m.content.slice(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    s.metadata.conversation = JSON.stringify(unique);
    s.promptCount = unique.length;
    s.totalTokens = (s.totalTokens || 0) + totalTokens;
    if (model && (s.model === 'unknown' || !s.model)) s.model = model;
    const title = extractTitle(unique);
    if (title && (!s.title || s.title === path.basename(s.projectPath || 'unknown'))) s.title = title;
    this.store.add(s);
  }

  private processNewFile(agent: AgentInfo, filePath: string): void {
    const parsed = this.parseSingleConversation(agent, filePath);
    if (!parsed) return;
    const messages = parsed.metadata?.conversation ? JSON.parse(parsed.metadata.conversation as string) as ChatMessage[] : [];
    if (messages.length === 0) return;
    const merged = this.mergeConversationIntoSession(agent, messages, parsed.projectPath, parsed.model);
    if (merged) {
      this.callback?.([], []);
    } else {
      this.store.add(parsed);
      this.callback?.([parsed], []);
    }
  }

  private handleFileUpdate(agent: AgentInfo, filePath: string): void {
    const existing = this.store.getById(this.stableConvId(agent.name, filePath));
    if (existing && existing.metadata?.conversation) {
      // if this conversation was already merged into a project session, update that too
      const parsed = this.parseSingleConversation(agent, filePath);
      if (parsed) {
        const messages = parsed.metadata?.conversation ? JSON.parse(parsed.metadata.conversation as string) as ChatMessage[] : [];
        if (messages.length > 0) {
          const merged = this.mergeConversationIntoSession(agent, messages, parsed.projectPath, parsed.model);
        }
      }
    }
    const session = this.parseSingleConversation(agent, filePath);
    if (session) {
      const existing = this.store.getById(session.id);
      if (existing) {
        session.startTime = existing.startTime;
      }
      this.store.add(session);
      this.callback?.([session], []);
    }
  }

  detectRunningProcesses(): { name: AgentName; pid: number }[] {
    try {
      const platform = os.platform();
      const found: { name: AgentName; pid: number }[] = [];

      for (const agent of KNOWN_AGENTS) {
        for (const pname of agent.processNames) {
          try {
            let pids: number[] = [];
            if (platform === 'win32') {
              const out = execSync(
                `tasklist /FI "IMAGENAME eq ${pname}" /FO CSV /NH`,
                { encoding: 'utf-8', timeout: 3000 }
              ).trim();
              if (out && !out.includes('INFO: No tasks')) {
                const lines = out.split(/\r?\n/).filter(l => l.trim());
                for (const line of lines) {
                  const parts = line.split('","');
                  if (parts.length >= 2) {
                    const pidStr = parts[1].replace(/"/g, '');
                    const pid = parseInt(pidStr, 10);
                    if (!isNaN(pid)) pids.push(pid);
                  }
                }
              }
            } else {
              const out = execSync(`pgrep -x "${pname}"`, { encoding: 'utf-8', timeout: 3000 }).trim();
              pids = out.split(/\r?\n/).map(Number).filter(n => !isNaN(n));
            }
            for (const pid of pids) {
              found.push({ name: agent.name, pid });
            }
          } catch {
            // process not found
          }
        }
      }
      return found;
    } catch {
      return [];
    }
  }

  scanAgentDataDirs(): AgentSession[] {
    try {
      const home = os.homedir();
      const sessions: AgentSession[] = [];
      const now = new Date().toISOString();

      for (const agent of KNOWN_AGENTS) {
        for (const dp of agent.dataPaths) {
          const dir = path.join(home, dp.path);
          if (fs.existsSync(dir)) {
            try {
              const parsed = this.parseAgentDir(agent, dir);
              sessions.push(...parsed);
            } catch {
              // skip unparseable
            }
          }
        }
      }

      return sessions;
    } catch {
      return [];
    }
  }

  private parseAgentDir(agent: AgentInfo, dirPath: string): AgentSession[] {
    const sessions: AgentSession[] = [];
    const now = new Date().toISOString();

    switch (agent.name) {
      case 'OpenCode': {
        const globalDatFile = path.join(dirPath, 'opencode.global.dat');
        if (fs.existsSync(globalDatFile)) {
          try {
            const raw = fs.readFileSync(globalDatFile, 'utf-8');
            const data = JSON.parse(raw);
            let layoutPage: any = {};
            try { layoutPage = JSON.parse(data['layout.page'] || '{}'); } catch {}
            let serverInfo: any = {};
            try { serverInfo = JSON.parse(data['server'] || '{}'); } catch {}

            const wsFiles = fs.readdirSync(dirPath)
              .filter(f => f.startsWith('opencode.workspace.') && f.endsWith('.dat'));
            const sessionModels = new Map<string, { agent: string; model: string }>();
            for (const wf of wsFiles) {
              try {
                const wraw = fs.readFileSync(path.join(dirPath, wf), 'utf-8');
                const wdata = JSON.parse(wraw);
                const modelKey = wdata['workspace:model-selection'];
                if (modelKey) {
                  const modelSelection = JSON.parse(modelKey);
                  if (modelSelection.session) {
                    for (const [sesId, sesInfo] of Object.entries(modelSelection.session)) {
                      const info = sesInfo as any;
                      sessionModels.set(sesId, {
                        agent: info.agent || '',
                        model: info.model?.modelID || '',
                      });
                    }
                  }
                }
              } catch {}
            }

            const addedSessions = new Set<string>();
            const lastProjectSession: Record<string, any> = layoutPage.lastProjectSession || {};
            for (const [, sesInfo] of Object.entries(lastProjectSession)) {
              const info = sesInfo as any;
              const sesId: string = info.id || '';
              if (!sesId || addedSessions.has(sesId)) continue;
              addedSessions.add(sesId);
              const at = info.at || 0;
              const startTime = at ? new Date(at).toISOString() : now;
              const projectPath: string = info.directory || '';
              const dirName = path.basename(projectPath || 'unknown');
              const sm = sessionModels.get(sesId);
              sessions.push({
                id: sesId,
                agentName: agent.name,
                provider: agent.provider,
                model: sm?.model || 'unknown',
                title: dirName,
                startTime,
                endTime: null,
                durationMs: null,
                promptCount: 0,
                totalTokens: 0,
                projectPath,
                source: 'detected',
                metadata: {
                  sessionId: sesId,
                  agent: sm?.agent || '',
                  sidecarUrl: serverInfo.currentSidecarUrl || '',
                },
              });
            }

            const lastSessions: Record<string, string> = layoutPage.lastSession || {};
            for (const [dir, sesId] of Object.entries(lastSessions)) {
              if (!sesId || addedSessions.has(sesId)) continue;
              addedSessions.add(sesId);
              const dirName = path.basename(dir || 'unknown');
              const sm = sessionModels.get(sesId);
              sessions.push({
                id: sesId,
                agentName: agent.name,
                provider: agent.provider,
                model: sm?.model || 'unknown',
                title: dirName,
                startTime: now,
                endTime: null,
                durationMs: null,
                promptCount: 0,
                totalTokens: 0,
                projectPath: dir,
                source: 'detected',
                metadata: {
                  sessionId: sesId,
                  agent: sm?.agent || '',
                  sidecarUrl: serverInfo.currentSidecarUrl || '',
                },
              });
            }
            break;
          } catch {}
        }

        // merge conversation files into .dat sessions instead of duplicating
        const convDir = path.join(dirPath, 'conversations');
        if (fs.existsSync(convDir)) {
          const files = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
          const allChatMessages: ChatMessage[] = [];
          let convModel = '';
          let convStartTime = now;
          let convProjectPath = '';

          for (const file of files.slice(0, 100)) {
            try {
              const fullConvPath = path.join(convDir, file);
              const raw = fs.readFileSync(fullConvPath, 'utf-8');
              const conv = JSON.parse(raw);
              const messages: ChatMessage[] = Array.isArray(conv.messages)
                ? conv.messages.map((m: any) => ({
                    role: String(m.role || 'user'),
                    content: String(m.content || ''),
                    timestamp: m.timestamp || m.created_at || undefined,
                    tokens: m.tokens || (m.content ? estimateTokens(String(m.content)) : 0),
                  }))
                : [];
              allChatMessages.push(...messages);
              const info = conv.metadata || {};
              if (!convModel) convModel = (info.model || info.modelName || 'unknown').toString();
              if (!convProjectPath) convProjectPath = info.project || info.directory || '';
              const ct = String(conv.created_at || info.created || info.createdAt || '');
              if (ct && ct < convStartTime) convStartTime = ct;
            } catch {}
          }

          if (allChatMessages.length > 0) {
            const totalTokens = allChatMessages.reduce((sum, m) => sum + (m.tokens || 0), 0);
            const firstTitle = extractTitle(allChatMessages);

            // try to merge into an existing .dat session by project path
            let merged = false;
            for (const s of sessions) {
              if (s.projectPath && convProjectPath && (s.projectPath === convProjectPath || s.projectPath.includes(convProjectPath) || convProjectPath.includes(s.projectPath))) {
                s.metadata.conversation = JSON.stringify(allChatMessages);
                s.promptCount = allChatMessages.length;
                s.totalTokens = totalTokens;
                s.model = convModel || s.model;
                if (!s.title || s.title === path.basename(s.projectPath || 'unknown')) {
                  s.title = firstTitle || s.title;
                }
                merged = true;
                break;
              }
            }

            if (!merged) {
              sessions.push({
                id: this.stableConvId(agent.name, dirPath),
                agentName: agent.name,
                provider: agent.provider,
                model: convModel || 'unknown',
                title: firstTitle || path.basename(convProjectPath || 'unknown'),
                startTime: convStartTime,
                endTime: null,
                durationMs: null,
                promptCount: allChatMessages.length,
                totalTokens,
                projectPath: convProjectPath,
                source: 'detected',
                metadata: { conversation: JSON.stringify(allChatMessages) },
              });
            }
          }
        }
        break;
      }

      case 'Cursor': {
        const chatFiles = ['composer.json', 'chat.json', 'conversations.json'];
        let found = false;
        for (const cf of chatFiles) {
          const fp = path.join(dirPath, cf);
          if (fs.existsSync(fp)) {
            found = true;
            try {
              const raw = fs.readFileSync(fp, 'utf-8');
              const data = JSON.parse(raw);
              const items = Array.isArray(data) ? data : data.conversations || data.chats || [];
              for (const item of items.slice(0, 50)) {
                if (!item || typeof item !== 'object') continue;
                const messages: ChatMessage[] = Array.isArray(item.messages) ? item.messages.map((m: any) => ({ role: String(m.role || 'user'), content: String(m.content || '') })) : [];
                const title = extractTitle(messages) || item.title || item.description || `Conversation ${new Date(item.createdAt || item.created || now).toLocaleDateString()}`;
                const itemStart = String(item.createdAt || item.created || item.startTime || now);
                const itemStableId = `cursor:${agent.name}:${cf}:${itemStart}:${title}`;
                sessions.push({
                  id: itemStableId,
                  agentName: agent.name,
                  provider: agent.provider,
                  model: String(item.model || item.modelName || 'unknown'),
                  title,
                  startTime: itemStart,
                  endTime: String(item.updatedAt || item.updated || item.endTime || ''),
                  durationMs: null,
                  promptCount: messages.length,
                  totalTokens: item.totalTokens || item.tokens || 0,
                  projectPath: String(item.project || item.projectPath || item.directory || item.cwd || ''),
                  source: 'detected',
                  metadata: { sourceFile: cf, conversation: JSON.stringify(messages) },
                });
              }
            } catch {
              // skip
            }
          }
        }
        if (!found) {
          const aiTrackDb = path.join(dirPath, 'ai-tracking', 'ai-code-tracking.db');
          sessions.push({
            id: `cursor-dir:${agent.name}:${dirPath}`,
            agentName: agent.name,
            provider: agent.provider,
            model: 'cursor',
            title: 'Cursor Session',
            startTime: now,
            endTime: null,
            durationMs: null,
            promptCount: 0,
            totalTokens: 0,
            projectPath: dirPath,
            source: 'detected',
            metadata: { note: 'Cursor data directory found', db: fs.existsSync(aiTrackDb) ? aiTrackDb : '' },
          });
        }
        break;
      }

      case 'Claude Code': {
        const historyPath = path.join(dirPath, 'history.jsonl');
        if (fs.existsSync(historyPath)) {
          try {
            const raw = fs.readFileSync(historyPath, 'utf-8');
            const lines = raw.split(/\r?\n/).filter(l => l.trim());
            for (const line of lines.slice(0, 100)) {
              try {
                const entry = JSON.parse(line);
                const title = entry.display ? (entry.display.length > 80 ? entry.display.slice(0, 77) + '...' : entry.display) : 'Claude Session';
                const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : now;
                const display = String(entry.display || '');
                const conv = display ? JSON.stringify([{ role: 'user', content: display }]) : '[]';
              const claudeSid = String(entry.sessionId || '');
              sessions.push({
                id: `claude-code:${claudeSid || timestamp}`,
                agentName: agent.name,
                provider: agent.provider,
                model: 'claude',
                title,
                startTime: timestamp,
                endTime: null,
                durationMs: null,
                promptCount: 1,
                totalTokens: 0,
                projectPath: String(entry.project || ''),
                source: 'detected',
                metadata: { sessionId: claudeSid, conversation: conv },
                });
              } catch {
                // skip bad lines
              }
            }
          } catch {
            // skip unreadable
          }
        }
        break;
      }

      case 'Codex CLI': {
        const indexPath = path.join(dirPath, 'session_index.jsonl');
        if (fs.existsSync(indexPath)) {
          try {
            const raw = fs.readFileSync(indexPath, 'utf-8');
            const lines = raw.split(/\r?\n/).filter(l => l.trim());
            for (const line of lines.slice(0, 100)) {
              try {
                const entry = JSON.parse(line);
                const title = entry.thread_name ? (entry.thread_name.length > 80 ? entry.thread_name.slice(0, 77) + '...' : entry.thread_name) : 'Codex Session';
                const timestamp = entry.updated_at || entry.created_at || now;
                const threadName = String(entry.thread_name || title);
              const codexId = String(entry.id || '');
              sessions.push({
                id: `codex-cli:${codexId || timestamp}`,
                agentName: agent.name,
                provider: agent.provider,
                model: 'codex',
                title,
                startTime: timestamp,
                endTime: null,
                durationMs: null,
                promptCount: 1,
                totalTokens: 0,
                projectPath: '',
                source: 'detected',
                metadata: {
                  codexId,
                    conversation: JSON.stringify([{ role: 'user', content: threadName }]),
                  },
                });
              } catch {
                // skip bad lines
              }
            }
          } catch {
            // skip unreadable
          }
        }
        break;
      }

      case 'Claude Dev': {
        const checkpointsDir = path.join(dirPath, 'checkpoints');
        if (fs.existsSync(checkpointsDir)) {
          try {
            const dirs = fs.readdirSync(checkpointsDir);
            for (const d of dirs.slice(0, 50)) {
              const stat = fs.statSync(path.join(checkpointsDir, d));
              sessions.push({
                id: `claude-dev:${d}`,
                agentName: agent.name,
                provider: agent.provider,
                model: 'claude',
                title: `Claude Dev Session ${d}`,
                startTime: stat.birthtime.toISOString(),
                endTime: stat.mtime.toISOString(),
                durationMs: null,
                promptCount: 0,
                totalTokens: 0,
                projectPath: '',
                source: 'detected',
                metadata: { checkpoint: d },
              });
            }
          } catch {
            // skip
          }
        }
        break;
      }

      default: {
        const label = path.basename(dirPath);
        sessions.push({
          id: `unknown:${agent.name}:${dirPath}`,
          agentName: agent.name,
          provider: agent.provider,
          model: 'unknown',
          title: `${agent.name} — ${label}`,
          startTime: now,
          endTime: null,
          durationMs: null,
          promptCount: 0,
          totalTokens: 0,
          projectPath: dirPath,
          source: 'detected',
          metadata: { note: 'Data directory found but format not yet supported' },
        });
        break;
      }
    }

    return sessions;
  }

  getConversationForSession(session: AgentSession): ChatMessage[] | null {
    try {
      const agent = KNOWN_AGENTS.find(a => a.name === session.agentName);
      if (!agent) return null;

      const projectPath = normPath(session.projectPath || '');
      let bestMatch: ChatMessage[] | null = null;
      let bestScore = 0;

      // scan home-dir agent conversations
      for (const dp of agent.dataPaths) {
        const dir = path.join(os.homedir(), dp.path);
        const convDir = path.join(dir, 'conversations');
        if (!fs.existsSync(convDir)) continue;

        const files = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
        files.sort((a, b) => {
          try { return fs.statSync(path.join(convDir, b)).mtimeMs - fs.statSync(path.join(convDir, a)).mtimeMs; } catch { return 0; }
        });

        for (const file of files) {
          try {
            const fp = path.join(convDir, file);
            const raw = fs.readFileSync(fp, 'utf-8');
            const conv = JSON.parse(raw);
            const messages: ChatMessage[] = Array.isArray(conv.messages)
              ? conv.messages.map((m: any) => toChatMessage(m))
              : [];
            if (messages.length === 0) continue;

            const info = conv.metadata || {};
            const convProject = normPath(info.project || info.directory || '');

            let score = 0;
            if (projectPath && convProject) {
              if (convProject === projectPath) score = 3;
              else if (convProject.includes(projectPath) || projectPath.includes(convProject)) score = 2;
              else if (path.basename(convProject) === path.basename(projectPath)) score = 1;
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = messages;
            } else if (score === 0 && !bestMatch) {
              bestMatch = messages; // newest fallback
            }

            if (score >= 2) break; // good enough match
          } catch {}
        }
      }

      // also scan workspace .wardy/conversations/ directories
      const prefix = agent.name.replace(/\s+/g, '-');
      for (const wp of this.workspacePaths) {
        const wc = path.join(wp, '.wardy', 'conversations');
        if (!fs.existsSync(wc)) continue;
        try {
          for (const f of fs.readdirSync(wc).filter(f => f.endsWith('.json') && f.startsWith(prefix))) {
            const fp = path.join(wc, f);
            const raw = fs.readFileSync(fp, 'utf-8');
            const conv = JSON.parse(raw);
            const messages: ChatMessage[] = Array.isArray(conv.messages)
              ? conv.messages.map((m: any) => toChatMessage(m))
              : [];
            if (messages.length > 0) {
              if (bestScore < 1) {
                bestMatch = messages;
                bestScore = 1;
              }
            }
          }
        } catch {}
      }

      return bestMatch;
    } catch {
      return null;
    }
  }

  runFullScan(): { processes: { name: string; pid: number }[]; sessions: AgentSession[] } {
    try {
    const processes = this.detectRunningProcesses();
    const scanned = this.scanAgentDataDirs();

    const existing = this.store.getAll();
    const existingIds = new Set(existing.map(s => s.id));

    const newSessions = scanned.filter(s => !existingIds.has(s.id));
    if (newSessions.length > 0) {
      this.store.addBatch(newSessions);
    }

    if (processes.length > 0) {
      for (const proc of processes) {
        const alreadyTracked = existing.some(
          s => s.agentName === proc.name && s.endTime === null
        );
        if (!alreadyTracked) {
          const session: AgentSession = {
            id: `running:${proc.name}`,
            agentName: proc.name,
            provider: KNOWN_AGENTS.find(a => a.name === proc.name)?.provider || 'Unknown',
            model: 'running',
            title: `${proc.name} — Running`,
            startTime: new Date().toISOString(),
            endTime: null,
            durationMs: null,
            promptCount: 0,
            totalTokens: 0,
            projectPath: '',
            source: 'detected',
            metadata: { pid: String(proc.pid), status: 'running' },
          };
          this.store.add(session);
        }
      }
    }

    const all = this.store.getAll();
    const runningNames = new Set(processes.map(p => p.name));
    for (const s of all) {
      if (s.endTime === null && !runningNames.has(s.agentName)) {
        s.endTime = new Date().toISOString();
        this.store.add(s);
      }
    }

    return { processes, sessions: newSessions };
    } catch {
      return { processes: [], sessions: [] };
    }
  }
}
