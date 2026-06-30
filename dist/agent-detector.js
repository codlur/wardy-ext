"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentDetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const agent_types_1 = require("./agent-types");
const agent_store_1 = require("./agent-store");
const POLL_INTERVAL_MS = 10000;
function estimateTokens(text) {
    return Math.max(1, Math.round(text.length / 4));
}
function extractTitle(messages) {
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser) {
        const text = firstUser.content.replace(/```[\s\S]*?```/g, '').trim();
        return text.length > 80 ? text.slice(0, 77) + '...' : text;
    }
    return '';
}
class AgentDetector {
    store;
    watchers = [];
    pollTimer = null;
    knownFiles = new Set();
    knownPids = new Set();
    callback = null;
    constructor(store) {
        this.store = store;
    }
    onUpdate(cb) {
        this.callback = cb;
    }
    startWatching(homeDir) {
        this.knownFiles.clear();
        this.knownPids.clear();
        for (const agent of agent_types_1.KNOWN_AGENTS) {
            for (const dp of agent.dataPaths) {
                const dir = path.join(homeDir, dp.path);
                if (!fs.existsSync(dir))
                    continue;
                const convDir = path.join(dir, 'conversations');
                if (fs.existsSync(convDir)) {
                    for (const f of fs.readdirSync(convDir).filter(f => f.endsWith('.json'))) {
                        this.knownFiles.add(path.join(convDir, f));
                    }
                    try {
                        const w = fs.watch(convDir, (event, filename) => {
                            if (!filename || !filename.endsWith('.json'))
                                return;
                            const fullPath = path.join(convDir, filename);
                            if (this.knownFiles.has(fullPath))
                                return;
                            this.knownFiles.add(fullPath);
                            setTimeout(() => this.processNewFile(agent, fullPath), 500);
                        });
                        this.watchers.push(w);
                    }
                    catch { /* watch might fail on some fs */ }
                }
            }
        }
        this.startPolling(homeDir);
    }
    stopWatching() {
        for (const w of this.watchers) {
            try {
                w.close();
            }
            catch { }
        }
        this.watchers = [];
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    startPolling(homeDir) {
        this.pollTimer = setInterval(() => {
            const newSessions = [];
            for (const agent of agent_types_1.KNOWN_AGENTS) {
                for (const dp of agent.dataPaths) {
                    const dir = path.join(homeDir, dp.path);
                    if (!fs.existsSync(dir))
                        continue;
                    const convDir = path.join(dir, 'conversations');
                    if (!fs.existsSync(convDir))
                        continue;
                    try {
                        for (const f of fs.readdirSync(convDir).filter(f => f.endsWith('.json'))) {
                            const fullPath = path.join(convDir, f);
                            if (this.knownFiles.has(fullPath))
                                continue;
                            this.knownFiles.add(fullPath);
                            const parsed = this.parseSingleConversation(agent, fullPath);
                            if (parsed)
                                newSessions.push(parsed);
                        }
                    }
                    catch { }
                }
            }
            const running = this.detectRunningProcesses();
            const newPids = running.filter(p => !this.knownPids.has(p.pid));
            for (const p of newPids)
                this.knownPids.add(p.pid);
            if (newSessions.length > 0 || newPids.length > 0) {
                if (newSessions.length > 0)
                    this.store.addBatch(newSessions);
                this.callback?.(newSessions, newPids);
            }
        }, POLL_INTERVAL_MS);
    }
    parseSingleConversation(agent, filePath) {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const conv = JSON.parse(raw);
            const now = new Date().toISOString();
            const messages = Array.isArray(conv.messages)
                ? conv.messages.map((m) => ({
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
                id: (0, agent_store_1.generateId)(),
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
        }
        catch {
            return null;
        }
    }
    processNewFile(agent, filePath) {
        const session = this.parseSingleConversation(agent, filePath);
        if (session) {
            this.store.add(session);
            this.callback?.([session], []);
        }
    }
    detectRunningProcesses() {
        try {
            const platform = os.platform();
            const found = [];
            for (const agent of agent_types_1.KNOWN_AGENTS) {
                for (const pname of agent.processNames) {
                    try {
                        let pids = [];
                        if (platform === 'win32') {
                            const out = (0, child_process_1.execSync)(`tasklist /FI "IMAGENAME eq ${pname}" /FO CSV /NH`, { encoding: 'utf-8', timeout: 3000 }).trim();
                            if (out && !out.includes('INFO: No tasks')) {
                                const lines = out.split(/\r?\n/).filter(l => l.trim());
                                for (const line of lines) {
                                    const parts = line.split('","');
                                    if (parts.length >= 2) {
                                        const pidStr = parts[1].replace(/"/g, '');
                                        const pid = parseInt(pidStr, 10);
                                        if (!isNaN(pid))
                                            pids.push(pid);
                                    }
                                }
                            }
                        }
                        else {
                            const out = (0, child_process_1.execSync)(`pgrep -x "${pname}"`, { encoding: 'utf-8', timeout: 3000 }).trim();
                            pids = out.split(/\r?\n/).map(Number).filter(n => !isNaN(n));
                        }
                        for (const pid of pids) {
                            found.push({ name: agent.name, pid });
                        }
                    }
                    catch {
                        // process not found
                    }
                }
            }
            return found;
        }
        catch {
            return [];
        }
    }
    scanAgentDataDirs() {
        try {
            const home = os.homedir();
            const sessions = [];
            const now = new Date().toISOString();
            for (const agent of agent_types_1.KNOWN_AGENTS) {
                for (const dp of agent.dataPaths) {
                    const dir = path.join(home, dp.path);
                    if (fs.existsSync(dir)) {
                        try {
                            const parsed = this.parseAgentDir(agent, dir);
                            sessions.push(...parsed);
                        }
                        catch {
                            // skip unparseable
                        }
                    }
                }
            }
            return sessions;
        }
        catch {
            return [];
        }
    }
    parseAgentDir(agent, dirPath) {
        const sessions = [];
        const now = new Date().toISOString();
        switch (agent.name) {
            case 'OpenCode': {
                const globalDatFile = path.join(dirPath, 'opencode.global.dat');
                if (fs.existsSync(globalDatFile)) {
                    try {
                        const raw = fs.readFileSync(globalDatFile, 'utf-8');
                        const data = JSON.parse(raw);
                        let layoutPage = {};
                        try {
                            layoutPage = JSON.parse(data['layout.page'] || '{}');
                        }
                        catch { }
                        let serverInfo = {};
                        try {
                            serverInfo = JSON.parse(data['server'] || '{}');
                        }
                        catch { }
                        const wsFiles = fs.readdirSync(dirPath)
                            .filter(f => f.startsWith('opencode.workspace.') && f.endsWith('.dat'));
                        const sessionModels = new Map();
                        for (const wf of wsFiles) {
                            try {
                                const wraw = fs.readFileSync(path.join(dirPath, wf), 'utf-8');
                                const wdata = JSON.parse(wraw);
                                const modelKey = wdata['workspace:model-selection'];
                                if (modelKey) {
                                    const modelSelection = JSON.parse(modelKey);
                                    if (modelSelection.session) {
                                        for (const [sesId, sesInfo] of Object.entries(modelSelection.session)) {
                                            const info = sesInfo;
                                            sessionModels.set(sesId, {
                                                agent: info.agent || '',
                                                model: info.model?.modelID || '',
                                            });
                                        }
                                    }
                                }
                            }
                            catch { }
                        }
                        const addedSessions = new Set();
                        const lastProjectSession = layoutPage.lastProjectSession || {};
                        for (const [, sesInfo] of Object.entries(lastProjectSession)) {
                            const info = sesInfo;
                            const sesId = info.id || '';
                            if (!sesId || addedSessions.has(sesId))
                                continue;
                            addedSessions.add(sesId);
                            const at = info.at || 0;
                            const startTime = at ? new Date(at).toISOString() : now;
                            const projectPath = info.directory || '';
                            const dirName = path.basename(projectPath || 'unknown');
                            const sm = sessionModels.get(sesId);
                            sessions.push({
                                id: (0, agent_store_1.generateId)(),
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
                        const lastSessions = layoutPage.lastSession || {};
                        for (const [dir, sesId] of Object.entries(lastSessions)) {
                            if (!sesId || addedSessions.has(sesId))
                                continue;
                            addedSessions.add(sesId);
                            const dirName = path.basename(dir || 'unknown');
                            const sm = sessionModels.get(sesId);
                            sessions.push({
                                id: (0, agent_store_1.generateId)(),
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
                    }
                    catch { }
                }
                const convDir = path.join(dirPath, 'conversations');
                if (fs.existsSync(convDir)) {
                    const files = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
                    for (const file of files.slice(0, 50)) {
                        try {
                            const raw = fs.readFileSync(path.join(convDir, file), 'utf-8');
                            const conv = JSON.parse(raw);
                            const messages = Array.isArray(conv.messages)
                                ? conv.messages.map((m) => ({
                                    role: String(m.role || 'user'),
                                    content: String(m.content || ''),
                                    timestamp: m.timestamp || m.created_at || undefined,
                                    tokens: m.tokens || (m.content ? estimateTokens(String(m.content)) : 0),
                                }))
                                : [];
                            const info = conv.metadata || {};
                            const title = extractTitle(messages) || file.replace('.json', '');
                            const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
                            sessions.push({
                                id: (0, agent_store_1.generateId)(),
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
                                metadata: { file, conversation: JSON.stringify(messages) },
                            });
                        }
                        catch {
                            // skip corrupt files
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
                                if (!item || typeof item !== 'object')
                                    continue;
                                const messages = Array.isArray(item.messages) ? item.messages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') })) : [];
                                const title = extractTitle(messages) || item.title || item.description || `Conversation ${new Date(item.createdAt || item.created || now).toLocaleDateString()}`;
                                sessions.push({
                                    id: (0, agent_store_1.generateId)(),
                                    agentName: agent.name,
                                    provider: agent.provider,
                                    model: String(item.model || item.modelName || 'unknown'),
                                    title,
                                    startTime: String(item.createdAt || item.created || item.startTime || now),
                                    endTime: String(item.updatedAt || item.updated || item.endTime || ''),
                                    durationMs: null,
                                    promptCount: messages.length,
                                    totalTokens: item.totalTokens || item.tokens || 0,
                                    projectPath: String(item.project || item.projectPath || item.directory || item.cwd || ''),
                                    source: 'detected',
                                    metadata: { sourceFile: cf, conversation: JSON.stringify(messages) },
                                });
                            }
                        }
                        catch {
                            // skip
                        }
                    }
                }
                if (!found) {
                    const aiTrackDb = path.join(dirPath, 'ai-tracking', 'ai-code-tracking.db');
                    sessions.push({
                        id: (0, agent_store_1.generateId)(),
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
                                sessions.push({
                                    id: (0, agent_store_1.generateId)(),
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
                                    metadata: { sessionId: String(entry.sessionId || ''), conversation: conv },
                                });
                            }
                            catch {
                                // skip bad lines
                            }
                        }
                    }
                    catch {
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
                                sessions.push({
                                    id: (0, agent_store_1.generateId)(),
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
                                        codexId: String(entry.id || ''),
                                        conversation: JSON.stringify([{ role: 'user', content: threadName }]),
                                    },
                                });
                            }
                            catch {
                                // skip bad lines
                            }
                        }
                    }
                    catch {
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
                                id: (0, agent_store_1.generateId)(),
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
                    }
                    catch {
                        // skip
                    }
                }
                break;
            }
            default: {
                const label = path.basename(dirPath);
                sessions.push({
                    id: (0, agent_store_1.generateId)(),
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
    runFullScan() {
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
                    const alreadyTracked = existing.some(s => s.agentName === proc.name && s.endTime === null);
                    if (!alreadyTracked) {
                        const session = {
                            id: (0, agent_store_1.generateId)(),
                            agentName: proc.name,
                            provider: agent_types_1.KNOWN_AGENTS.find(a => a.name === proc.name)?.provider || 'Unknown',
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
        }
        catch {
            return { processes: [], sessions: [] };
        }
    }
}
exports.AgentDetector = AgentDetector;
//# sourceMappingURL=agent-detector.js.map