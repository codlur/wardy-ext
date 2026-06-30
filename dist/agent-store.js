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
exports.AgentStore = void 0;
exports.generateId = generateId;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class AgentStore {
    sessionsPath;
    summaryPath;
    sessions = [];
    constructor(storagePath) {
        const agentsDir = path.join(storagePath, 'agents');
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
        }
        this.sessionsPath = path.join(agentsDir, 'sessions.json');
        this.summaryPath = path.join(agentsDir, 'summary.json');
        this.load();
    }
    load() {
        try {
            if (fs.existsSync(this.sessionsPath)) {
                const raw = fs.readFileSync(this.sessionsPath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.sessions = Array.isArray(parsed) ? parsed : [];
            }
        }
        catch {
            this.sessions = [];
        }
    }
    save() {
        fs.writeFileSync(this.sessionsPath, JSON.stringify(this.sessions, null, 2), 'utf-8');
    }
    getAll() {
        return [...this.sessions];
    }
    add(session) {
        const idx = this.sessions.findIndex(s => s.id === session.id);
        if (idx >= 0) {
            this.sessions[idx] = session;
        }
        else {
            this.sessions.push(session);
        }
        this.save();
    }
    addBatch(sessions) {
        for (const s of sessions)
            this.add(s);
    }
    getByAgent(name) {
        return this.sessions.filter(s => s.agentName === name);
    }
    getSummary() {
        const map = new Map();
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
    get getPath() {
        return this.sessionsPath;
    }
}
exports.AgentStore = AgentStore;
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
//# sourceMappingURL=agent-store.js.map