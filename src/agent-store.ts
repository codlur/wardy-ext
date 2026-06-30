import * as fs from 'fs';
import * as path from 'path';
import { AgentSession } from './agent-types';

export class AgentStore {
  private sessionsPath: string;
  private summaryPath: string;
  private sessions: AgentSession[] = [];

  constructor(storagePath: string) {
    const agentsDir = path.join(storagePath, 'agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
    this.sessionsPath = path.join(agentsDir, 'sessions.json');
    this.summaryPath = path.join(agentsDir, 'summary.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.sessionsPath)) {
        const raw = fs.readFileSync(this.sessionsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.sessions = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      this.sessions = [];
    }
  }

  private save(): void {
    fs.writeFileSync(this.sessionsPath, JSON.stringify(this.sessions, null, 2), 'utf-8');
  }

  getAll(): AgentSession[] {
    return [...this.sessions];
  }

  getById(id: string): AgentSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  add(session: AgentSession): void {
    const idx = this.sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      this.sessions[idx] = session;
    } else {
      this.sessions.push(session);
    }
    this.save();
  }

  addBatch(sessions: AgentSession[]): void {
    for (const s of sessions) this.add(s);
  }

  getByAgent(name: string): AgentSession[] {
    return this.sessions.filter(s => s.agentName === name);
  }

  getSummary(): { agentName: string; totalSessions: number; totalPrompts: number; totalTokens: number; lastActive: string | null }[] {
    const map = new Map<string, { totalSessions: number; totalPrompts: number; totalTokens: number; lastActive: string | null }>();
    for (const s of this.sessions) {
      const existing = map.get(s.agentName) || { totalSessions: 0, totalPrompts: 0, totalTokens: 0, lastActive: null };
      existing.totalSessions++;
      existing.totalPrompts += s.promptCount;
      existing.totalTokens += s.totalTokens;
      if (!existing.lastActive || s.startTime > existing.lastActive) {
        existing.lastActive = s.startTime;
      }
      map.set(s.agentName, existing);
    }
    return Array.from(map.entries()).map(([agentName, data]) => ({ agentName, ...data }));
  }

  get getPath(): string {
    return this.sessionsPath;
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
