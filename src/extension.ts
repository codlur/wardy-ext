import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentStore } from './agent-store';
import { AgentDetector, normPath } from './agent-detector';
import { AgentSession, KNOWN_AGENTS, SVG_GENERIC } from './agent-types';
import { AgentServer } from './agent-server';

let wardyProvider: WardyViewProvider | undefined;

interface ProjectInfo {
  path: string;
  name: string;
  agentNames: string[];
  sessionCount: number;
  totalPrompts: number;
  totalTokens: number;
  lastActive: string;
}

interface WardyViewData {
  agentSummary: any[];
  knownAgents: { name: string; provider: string; icon: string }[];
  sessions: any[];
  genericIcon: string;
  projects: ProjectInfo[];
  serverUrl: string;
}

function getHtml(iconUri: vscode.Uri, scriptUri: string, userName: string, storagePath: string, agentSummary: string, sessions: string, projects: string, serverUrl: string): string {
  let parsedSummary: any[] = [];
  try { parsedSummary = JSON.parse(agentSummary); } catch { parsedSummary = []; }
  let parsedSessions: any[] = [];
  try { parsedSessions = JSON.parse(sessions); } catch { parsedSessions = []; }
  let parsedProjects: ProjectInfo[] = [];
  try { parsedProjects = JSON.parse(projects); } catch { parsedProjects = []; }
  const wardyData: WardyViewData = {
    agentSummary: parsedSummary,
    knownAgents: KNOWN_AGENTS.map(a => ({ name: a.name, provider: a.provider, icon: a.icon })),
    sessions: parsedSessions,
    genericIcon: SVG_GENERIC,
    projects: parsedProjects,
    serverUrl,
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
:root {}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: transparent;
}
.center-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px 16px;
  text-align: center;
}
.page { display: none; }
.page.active { display: block; }
.page.active.center-page { display: flex; }
.logo {
  width: 64px; height: 64px; margin-bottom: 16px;
  border-radius: 12px;
}
h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
p {
  font-size: 13px; color: var(--vscode-descriptionForeground);
  line-height: 1.5; margin-bottom: 24px;
}
.center-page p { max-width: 280px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 20px; border: none; border-radius: 4px;
  font-size: 13px; font-weight: 500;
  font-family: var(--vscode-font-family);
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  cursor: pointer;
}
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
.btn-group { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 240px; }
.btn-link {
  background: none; border: none; padding: 4px 0;
  font-size: 12px; font-family: var(--vscode-font-family);
  color: var(--vscode-textLink-foreground); cursor: pointer;
}
.btn-link:hover { text-decoration: underline; }
.divider {
  width: 100%; max-width: 240px; text-align: center;
  border-bottom: 1px solid var(--vscode-dropdown-border);
  line-height: 0.1em; margin: 16px 0;
}
.divider span {
  background: var(--vscode-sideBar-background);
  padding: 0 8px; font-size: 11px; color: var(--vscode-descriptionForeground);
}
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.top-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--vscode-tab-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
  padding: 0;
}
.nav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  font-family: var(--vscode-font-family);
  font-size: 12px;
  color: var(--vscode-tab-inactiveForeground);
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.nav-tab:hover {
  color: var(--vscode-tab-activeForeground);
  background: var(--vscode-list-hoverBackground);
}
.nav-tab.active {
  color: var(--vscode-tab-activeForeground);
  border-bottom-color: var(--vscode-focusBorder);
  border-bottom-width: 3px;
  font-weight: 600;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}
.tab-pane { display: none; text-align: left; }
.tab-pane.active { display: block; width: 100%; }
#activity-content, #projects-content, #agents-content, #search-content, #integrate-content { padding: 16px; }
.tab-pane.active { display: block; width: 100%; }
.info-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  padding: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
}
.info-card label {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.info-card span {
  display: block;
  font-size: 13px;
  margin-top: 4px;
  word-break: break-all;
}
.settings-section {
  text-align: left;
  margin-bottom: 20px;
}
.settings-section p { max-width: none; }
.settings-section .info-card { text-align: left; }
.settings-section .info-card p { margin-bottom: 0; }
.settings-section .btn-group { margin: 0; }
.settings-section h2 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}
.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.badge-local {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}

.settings-layout {
  display: flex;
  height: 100vh;
}
.settings-sidebar {
  width: 120px;
  display: flex;
  flex-direction: column;
  background: var(--vscode-sideBar-background);
  border-right: 1px solid var(--vscode-tab-border);
  flex-shrink: 0;
}
.settings-sidebar-header {
  padding: 16px 12px 8px;
  font-size: 14px;
  font-weight: 600;
}
.settings-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}
.settings-nav-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  font-family: var(--vscode-font-family);
  font-size: 12px;
  color: var(--vscode-tab-inactiveForeground);
  text-align: left;
  cursor: pointer;
}
.settings-nav-item:hover {
  color: var(--vscode-tab-activeForeground);
}
.settings-nav-item.active {
  color: var(--vscode-tab-activeForeground);
  font-weight: 600;
}
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.settings-pane { display: none; }
.settings-pane.active { display: block; width: 100%; }
.agent-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
  width: 100%;
}
.agent-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.agent-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agent-card-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.agent-card-icon svg {
  width: 20px;
  height: 20px;
}
.session-meta svg,
#detail-meta svg {
  width: 16px;
  height: 16px;
  vertical-align: middle;
  margin-right: 2px;
}
svg {
  fill: var(--vscode-foreground);
}
.agent-card-name {
  font-size: 14px;
  font-weight: 600;
}

.agent-card-stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
}
.agent-stat {
  text-align: center;
}
.agent-stat-value {
  font-size: 16px;
  font-weight: 600;
}
.agent-stat-label {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
}
.agent-card-running {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--vscode-testing-iconPassed);
  font-weight: 500;
}
.agent-card-running::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vscode-testing-iconPassed);
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.agent-empty {
  text-align: center;
  padding: 32px 16px;
}
.agent-empty p {
  margin-bottom: 16px;
  max-width: none;
}
.agent-detail-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.agent-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-tab-border);
  flex-shrink: 0;
}
.agent-detail-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-detail-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--vscode-dropdown-border);
}
.agent-detail-sessions {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.sort-bar { display:flex;align-items:center;gap:6px;padding:8px 16px 6px;font-size:12px;flex-wrap:wrap;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-dropdown-border); }
.sort-label { color:var(--vscode-descriptionForeground);font-size:11px; }
.sort-btn { background:none;border:1px solid var(--vscode-dropdown-border);border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;color:var(--vscode-foreground);font-family:var(--vscode-font-family);transition:background 0.15s; }
.sort-btn:hover { background:var(--vscode-list-hoverBackground); }
.sort-btn.active { background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background); }
.filter-btn { background:none;border:1px solid var(--vscode-dropdown-border);border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;color:var(--vscode-descriptionForeground);font-family:var(--vscode-font-family);transition:background 0.15s; }
.filter-btn:hover { background:var(--vscode-list-hoverBackground); }
.filter-btn.active { background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background); }
.search-input { flex:1;min-width:80px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:4px;padding:5px 10px;font-size:12px;font-family:var(--vscode-font-family);outline:none;transition:border-color 0.15s; }
.search-input:focus { border-color:var(--vscode-focusBorder); }
.session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  width: 100%;
}
.session-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.session-item:hover {
  border-color: var(--vscode-focusBorder);
}
.session-item-empty { opacity: 0.55; }
.project-current { border-width: 2px; }
.session-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}
.session-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.session-empty {
  text-align: center;
  padding: 32px 16px;
}
.session-empty p {
  margin-bottom: 16px;
  max-width: none;
}
.detail-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-tab-border);
  flex-shrink: 0;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  border-bottom: 1px solid var(--vscode-dropdown-border);
  flex-shrink: 0;
}
.detail-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.detail-conversation {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.msg-time { font-weight:400;text-transform:none;letter-spacing:0;opacity:0.6;margin-left:8px;font-size:10px; }
.msg-tokens { font-weight:400;text-transform:none;letter-spacing:0;opacity:0.5;margin-left:4px;font-size:9px; }

.acc-msg {
  margin-bottom: 4px;
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  overflow: hidden;
}
.acc-msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  background: var(--vscode-editor-lineHighlightBackground);
}
.acc-msg-header:hover {
  background: var(--vscode-list-hoverBackground);
}
.acc-msg.assistant .acc-msg-header {
  border-left: 3px solid var(--vscode-testing-iconPassed);
}
.acc-msg.user .acc-msg-header {
  border-left: 3px solid var(--vscode-textLink-foreground);
}
.acc-msg.system .acc-msg-header {
  border-left: 3px solid var(--vscode-charts-yellow);
}
.acc-role {
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-foreground);
  white-space: nowrap;
}
.acc-preview {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-descriptionForeground);
  font-size: 10px;
  opacity: 0.8;
}
.acc-arrow {
  font-size: 9px;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}
.acc-msg-body {
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 10px;
  background: var(--vscode-editor-background);
  border-top: 1px solid var(--vscode-dropdown-border);
  white-space: pre-wrap;
  word-break: break-word;
}
.acc-msg-content p { margin:4px 0; }
.acc-msg-content p:first-child { margin-top:0; }
.acc-msg-content p:last-child { margin-bottom:0; }
.acc-thinking {
  padding: 4px 8px;
  margin-bottom: 6px;
  border-radius: 4px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  font-size: 11px;
  font-style: italic;
  color: var(--vscode-descriptionForeground);
}
.acc-tool-call {
  margin-bottom: 4px;
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  overflow: hidden;
}
.acc-tool-header {
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  background: var(--vscode-editor-inactiveSelectionBackground);
  display: flex;
  align-items: center;
  gap: 4px;
}
.acc-tool-header:hover {
  background: var(--vscode-list-hoverBackground);
}
.acc-tool-body {
  padding: 6px 8px;
  font-size: 11px;
}
.tc-args {
  margin: 0 0 4px 0;
  padding: 4px 6px;
  background: var(--vscode-textBlockQuote-background);
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 10px;
  white-space: pre-wrap;
  overflow-x: auto;
}
.tc-result {
  margin: 0;
  padding: 4px 6px;
  background: var(--vscode-textBlockQuote-background);
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 10px;
  white-space: pre-wrap;
  overflow-x: auto;
  border-left: 2px solid var(--vscode-testing-iconPassed);
}
.code-block { margin:8px 0;border:1px solid var(--vscode-dropdown-border);border-radius:4px;overflow:hidden; }
.code-block-header { display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--vscode-editor-inactiveSelectionBackground);font-size:10px; }
.code-lang { color:var(--vscode-descriptionForeground);text-transform:uppercase;font-size:9px;font-weight:600;letter-spacing:0.5px; }
.copy-btn { background:none;border:1px solid var(--vscode-dropdown-border);border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px;color:var(--vscode-foreground); }
.copy-btn:hover { background:var(--vscode-button-hoverBackground);color:var(--vscode-button-foreground); }
.export-group { display:inline-flex;align-items:stretch;gap:0; }
.export-group .btn { border-radius:4px 0 0 4px; }
.export-fmt {
  width:52px;border:1px solid var(--vscode-dropdown-border);border-left:none;
  border-radius:0 4px 4px 0;padding:0 2px;
  background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);
  font-size:10px;font-family:var(--vscode-font-family);cursor:pointer;outline:none;
  text-align:center;
}
.code-block pre { margin:0;padding:8px 12px;overflow-x:auto;background:var(--vscode-editor-background); }
.code-block code { font-size:11px;font-family:var(--vscode-editor-font-family);line-height:1.5;white-space:pre; }
.chat-msg-content p { margin:4px 0; }
.chat-msg-content p:first-child { margin-top:0; }
.chat-msg-content p:last-child { margin-bottom:0; }
</style>
</head>
<body>
  <div id="toast" style="display:none;position:fixed;top:8px;left:50%;transform:translateX(-50%);background:#007acc;color:#fff;padding:6px 16px;border-radius:4px;font-size:12px;z-index:999;white-space:nowrap;"></div>
  <div id="page-main" class="page active">
    <div class="main-layout">
      <div class="top-nav">
        <button class="nav-tab active" data-tab="activity">Activity</button>
        <button class="nav-tab" data-tab="projects">Projects</button>
        <button class="nav-tab" data-tab="agents">Agents</button>
        <button class="nav-tab" data-tab="integrate">Integrate</button>
        <button class="nav-tab" data-tab="search">Search</button>
        <button class="nav-tab" data-tab="learn">Learn</button>
      </div>
      <div class="tab-content">
        <div class="tab-pane active" id="tab-activity">
          <div class="sort-bar">
            <input class="search-input" id="search-activity" type="text" placeholder="Search sessions..." data-tab="activity">
            <button class="sort-btn active" data-sort="latest">Latest</button>
            <button class="sort-btn" data-sort="oldest">Oldest</button>
            <button class="filter-btn" title="Hide sessions without messages">Hide empty</button>
          </div>
          <div id="activity-content"></div>
        </div>
        <div class="tab-pane" id="tab-projects">
          <div class="sort-bar">
            <input class="search-input" id="search-projects" type="text" placeholder="Search projects..." data-tab="projects">
            <span class="sort-label">Sort:</span>
            <button class="sort-btn active" data-sort="latest">Latest</button>
            <button class="sort-btn" data-sort="oldest">Oldest</button>
          </div>
          <div id="projects-content"></div>
        </div>
        <div class="tab-pane" id="tab-agents">
          <div class="sort-bar">
            <input class="search-input" id="search-agents" type="text" placeholder="Search agents..." data-tab="agents">
            <span class="sort-label">Sort:</span>
            <button class="sort-btn active" data-sort="latest">Latest</button>
            <button class="sort-btn" data-sort="oldest">Oldest</button>
          </div>
          <div id="agents-content"></div>
        </div>
        <div class="tab-pane" id="tab-integrate">
          <div class="sort-bar">
            <input class="search-input" id="search-integrate" type="text" placeholder="Search integrations..." data-tab="integrate">
          </div>
          <div id="integrate-content"></div>
        </div>
        <div class="tab-pane" id="tab-search">
          <div class="sort-bar">
            <input class="search-input" id="search-global" type="text" placeholder="Search everything..." data-tab="search" autofocus>
          </div>
          <div id="search-content"></div>
        </div>
        <div class="tab-pane" id="tab-learn">
          <div id="learn-content" style="padding:16px"></div>
        </div>
      </div>
    </div>
  </div>

  <div id="page-session-detail" class="page">
    <div class="detail-layout">
      <div class="detail-header">
        <button class="btn btn-secondary" data-action="back-to-activity" style="font-size:11px;padding:6px 10px">← Back</button>
        <div id="detail-title" style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1"></div>
        <span class="export-group">
          <button class="btn btn-secondary" data-action="export-session" style="font-size:11px;padding:6px 10px" title="Export this session">⬇ Export</button>
          <select class="export-fmt" data-action="export-fmt">
            <option value="json">JSON</option>
            <option value="txt">TXT</option>
          </select>
        </span>
        <button class="btn btn-secondary" data-action="refresh-conversation" style="font-size:11px;padding:6px 10px" title="Re-scan agent data for this session">↻ Refresh</button>
      </div>
      <div id="detail-meta" class="detail-meta"></div>
      <div id="detail-conversation" class="detail-conversation"></div>
    </div>
  </div>

  <div id="page-agent-detail" class="page">
    <div class="agent-detail-layout">
      <div class="agent-detail-header">
        <button class="btn btn-secondary" data-action="back-to-agents" style="font-size:11px;padding:6px 10px">← Back</button>
        <div id="agent-detail-title" class="agent-detail-title"></div>
        <span class="export-group">
          <button class="btn btn-secondary" data-action="export-agent" style="font-size:11px;padding:6px 10px" title="Export all sessions for this agent">⬇ Export</button>
          <select class="export-fmt" data-action="export-fmt">
            <option value="json">JSON</option>
            <option value="txt">TXT</option>
          </select>
        </span>
      </div>
      <div id="agent-detail-stats" class="agent-detail-stats"></div>
      <div id="agent-detail-sessions" class="agent-detail-sessions"></div>
    </div>
  </div>

  <div id="page-project-detail" class="page">
    <div class="agent-detail-layout">
      <div class="agent-detail-header">
        <button class="btn btn-secondary" data-action="back-to-projects" style="font-size:11px;padding:6px 10px">← Back</button>
        <div id="project-detail-title" class="agent-detail-title"></div>
        <span class="export-group">
          <button class="btn btn-secondary" data-action="export-project" style="font-size:11px;padding:6px 10px" title="Export all sessions for this project">⬇ Export</button>
          <select class="export-fmt" data-action="export-fmt">
            <option value="json">JSON</option>
            <option value="txt">TXT</option>
          </select>
        </span>
      </div>
      <div id="project-detail-meta" class="detail-meta"></div>
      <div id="project-detail-stats" class="agent-detail-stats"></div>
      <div id="project-detail-sessions" class="agent-detail-sessions"></div>
    </div>
  </div>

  <div id="page-settings" class="page">
    <div class="settings-layout">
      <div class="settings-sidebar">
        <div class="settings-sidebar-header">Settings</div>
        <div class="settings-nav">
          <button class="settings-nav-item active" data-spane="general">General</button>
          <button class="settings-nav-item" data-spane="storage">Storage</button>
          <button class="settings-nav-item" data-spane="learn">Learn</button>
          <button class="settings-nav-item" data-spane="team">Team</button>
        </div>
        <div style="padding:12px">
          <button class="btn btn-secondary" style="width:100%;font-size:11px;padding:6px" data-action="show-main">← Back</button>
        </div>
      </div>
      <div class="settings-content">
        <div class="settings-pane active" id="spane-general">
          <div class="settings-section">
            <h2>General</h2>
            <div class="info-card">
              <label>User</label>
              <span>${userName}</span>
            </div>
            <div class="info-card">
              <label>Status</label>
              <span><span class="badge badge-local">Local</span></span>
            </div>
          </div>
        </div>

        <div class="settings-pane" id="spane-storage">
          <div class="settings-section">
            <h2>Storage</h2>
            <div class="info-card">
              <label>Data Location</label>
              <span id="storage-path" style="font-size:11px;word-break:break-all;margin-bottom:8px">${storagePath}</span>
              <p style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px">All your data is saved locally on this folder.</p>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" style="flex:1" data-action="changeStorage">Change</button>
                <button class="btn" style="flex:1" data-action="openStorage">Open Location</button>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-pane" id="spane-learn">
          <div class="settings-section">
            <h2>How Wardy Works</h2>
            <p style="text-align:left;max-width:none">Wardy automatically captures your AI coding sessions — no manual setup needed.</p>
            <div class="info-card">
              <label>Auto-Detection</label>
              <p style="margin-top:4px">Wardy watches agent data directories (like <code>~/.opencode/conversations/</code>) and imports sessions as they're created. This works for OpenCode, Claude Code, Cursor, and more.</p>
            </div>
            <div class="info-card">
              <label>Agent Hooks</label>
              <p style="margin-top:4px">For Claude Code and Qoder, Wardy can install post-conversation hooks that automatically save every session via the <strong>Integrate</strong> tab.</p>
            </div>
            <div class="info-card">
              <label>Context vs Tokens</label>
              <p style="margin-top:4px">The "Context" number shown is an estimate of total tokens (prompt + completion) for a session. This is approximated from message length and may differ from actual API usage.</p>
            </div>
            <div class="info-card">
              <label>Data Storage</label>
              <p style="margin-top:4px">All data is stored locally in the Wardy storage directory. You can change or open it in the <strong>Storage</strong> settings tab.</p>
            </div>
            <div class="info-card">
              <label>HTTP API</label>
              <p style="margin-top:4px">Wardy runs a local HTTP server on port 9876. Any agent or script can POST session data to <code>http://127.0.0.1:9876/api/save</code>.</p>
            </div>
          </div>
        </div>
        <div class="settings-pane" id="spane-team">
          <div class="settings-section">
            <h2>Team</h2>
            <p style="text-align:left;max-width:none">Team features are coming soon. Stay tuned!</p>
          </div>
        </div>
      </div>
    </div>
  </div>

<script id="wardy-data" type="application/json">${JSON.stringify(wardyData)}</script>
<script src="${scriptUri}"></script>
</body>
</html>`;
}

class WardyViewProvider implements vscode.WebviewViewProvider {
  private _webviewView: vscode.WebviewView | undefined;
  private _agentStore: AgentStore | undefined;
  _agentDetector: AgentDetector | undefined;
  private _server: AgentServer | undefined;
  private _autoSaveConfigured = new Set<string>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _globalStoragePath: string,
    private readonly _globalState: vscode.Memento,
  ) {
    try {
      const storagePath = vscode.workspace.getConfiguration('wardy').get<string>('storagePath') || this._globalStoragePath;
      this._agentStore = new AgentStore(storagePath);
      this._agentDetector = new AgentDetector(this._agentStore);
      this._agentDetector.setWorkspacePaths(
        vscode.workspace.workspaceFolders?.map(f => normPath(f.uri.fsPath)) || []
      );
      this._agentDetector.onUpdate((newSessions, running) => {
        this.postMessage({ command: 'realtimeUpdate', newSessions: newSessions.length, running: running.length });
        this.postMessage({ command: 'updateSessions', sessions: this.getAllSessionsJson() });
        this.postMessage({ command: 'updateAgents', summary: this.getAgentSummaryJson(), processes: running });
        this.postMessage({ command: 'updateProjects', projects: this.getProjectsJson() });
      });
      this._agentDetector.startWatching(os.homedir());

      const serverPort = vscode.workspace.getConfiguration('wardy').get<number>('serverPort') || 9876;
      this._server = new AgentServer(this._agentStore, (session) => {
        this.postMessage({ command: 'realtimeUpdate', newSessions: 1, running: 0 });
        this.postMessage({ command: 'updateSessions', sessions: this.getAllSessionsJson() });
        this.postMessage({ command: 'updateAgents', summary: this.getAgentSummaryJson(), processes: [] });
        this.postMessage({ command: 'updateProjects', projects: this.getProjectsJson() });
      }, serverPort);
      this._server.start();
    } catch {}
  }

  private reinitStorage(newPath: string): void {
    try {
      this._agentDetector?.stopWatching();
      this._agentStore = new AgentStore(newPath);
      this._agentDetector = new AgentDetector(this._agentStore);
      this._agentDetector.setWorkspacePaths(
        vscode.workspace.workspaceFolders?.map(f => normPath(f.uri.fsPath)) || []
      );
      this._agentDetector.onUpdate((newSessions, running) => {
        this.postMessage({ command: 'realtimeUpdate', newSessions: newSessions.length, running: running.length });
        this.postMessage({ command: 'updateSessions', sessions: this.getAllSessionsJson() });
        this.postMessage({ command: 'updateAgents', summary: this.getAgentSummaryJson(), processes: running });
        this.postMessage({ command: 'updateProjects', projects: this.getProjectsJson() });
      });
      this._agentDetector.startWatching(os.homedir());
      this.postMessage({ command: 'updateSessions', sessions: this.getAllSessionsJson() });
      this.postMessage({ command: 'updateAgents', summary: this.getAgentSummaryJson() });
      this.postMessage({ command: 'updateProjects', projects: this.getProjectsJson() });
    } catch (e) {
      vscode.window.showErrorMessage(`Wardy: failed to reinitialize storage at ${newPath}: ${e}`);
    }
  }

  dispose(): void {
    this._agentDetector?.stopWatching();
    this._server?.stop();
  }

  postMessage(message: any) {
    this._webviewView?.webview.postMessage(message);
  }

  private getAllSessionsJson(): string {
    try {
      if (!this._agentStore) return '[]';
      const all = this._agentStore.getAll();
      const serialized = all.map(s => ({
        id: s.id,
        agentName: s.agentName,
        provider: s.provider,
        model: s.model,
        title: s.title,
        startTime: s.startTime,
        endTime: s.endTime,
        promptCount: s.promptCount,
        totalTokens: s.totalTokens,
        projectPath: s.projectPath,
      }));
      return JSON.stringify(serialized);
    } catch {
      return '[]';
    }
  }

  private getProjectsJson(): string {
    try {
      if (!this._agentStore) return '[]';
      const all = this._agentStore.getAll();
      const wsFolderPaths = (vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || []);
      const wsn = wsFolderPaths.map(f => normPath(f));
      const map = new Map<string, { path: string; agents: Set<string>; sessions: number; prompts: number; tokens: number; lastActive: string }>();

      for (const s of all) {
        const rawP = s.projectPath || '';
        if (!rawP) continue;
        const np = normPath(rawP);
        let entry = map.get(np);
        if (!entry) {
          entry = { path: rawP, agents: new Set(), sessions: 0, prompts: 0, tokens: 0, lastActive: '' };
          map.set(np, entry);
        }
        entry.agents.add(s.agentName);
        entry.sessions++;
        entry.prompts += s.promptCount || 0;
        entry.tokens += s.totalTokens || 0;
        if (s.startTime && (!entry.lastActive || s.startTime > entry.lastActive)) {
          entry.lastActive = s.startTime;
        }
      }

      // Also include current workspace folders even if no sessions yet
      for (let i = 0; i < wsn.length; i++) {
        if (!map.has(wsn[i])) {
          map.set(wsn[i], { path: wsFolderPaths[i], agents: new Set(), sessions: 0, prompts: 0, tokens: 0, lastActive: '' });
        }
      }

      const projects: (ProjectInfo & { isCurrent: boolean })[] = [];
      const wsSet = new Set(wsn);
      for (const [np, entry] of map) {
        projects.push({
          path: entry.path,
          name: path.basename(entry.path) || entry.path,
          agentNames: Array.from(entry.agents),
          sessionCount: entry.sessions,
          totalPrompts: entry.prompts,
          totalTokens: entry.tokens,
          lastActive: entry.lastActive,
          isCurrent: wsSet.has(np),
        });
      }
      projects.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return b.lastActive.localeCompare(a.lastActive);
      });
      return JSON.stringify(projects);
    } catch {
      return '[]';
    }
  }

  private getAgentSummaryJson(): string {
    try {
      if (!this._agentStore || !this._agentDetector) return '[]';
      const summary = this._agentStore.getSummary();
      const running = this._agentDetector.detectRunningProcesses();
      const runningNames = new Set(running.map(r => r.name));
      for (const s of summary) {
        if (runningNames.has(s.agentName)) {
          (s as any).lastActive = 'running';
        }
      }
      return JSON.stringify(summary);
    } catch {
      return '[]';
    }
  }

  private async handleExport(message: any) {
    try {
      if (!this._agentStore) {
        vscode.window.showWarningMessage('Wardy store not available.');
        return;
      }
      const { sessionIds, agentName, projectPath, contextName } = message;
      let all = this._agentStore.getAll();

      let sessions: AgentSession[] = all;
      if (sessionIds && Array.isArray(sessionIds)) {
        sessions = all.filter(s => sessionIds.includes(s.id));
      } else if (agentName) {
        sessions = all.filter(s => s.agentName === agentName);
      } else if (projectPath) {
        const np = normPath(projectPath);
        sessions = all.filter(s => normPath(s.projectPath || '') === np);
      }

      if (sessions.length === 0) {
        vscode.window.showWarningMessage('No sessions to export.');
        return;
      }

      let format = message.format;
      if (!format) {
        const picked = await vscode.window.showQuickPick(
          ['JSON', 'Text (TXT)'],
          { placeHolder: `Export ${sessions.length} session(s) as...` }
        );
        if (!picked) return;
        format = picked === 'JSON' ? 'json' : 'txt';
      }

      const isJson = format === 'json';
      const ext = isJson ? '.json' : '.txt';
      const defaultName = (contextName || 'wardy-export').replace(/[^a-zA-Z0-9_-]/g, '_');

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Desktop', `${defaultName}${ext}`)),
        filters: isJson ? { 'JSON Files': ['json'] } : { 'Text Files': ['txt'] },
      });
      if (!uri) return;

      for (const s of sessions) {
        if (!s.metadata?.conversation && this._agentDetector) {
          const msgs = this._agentDetector.getConversationForSession(s);
          if (msgs && msgs.length > 0) {
            s.metadata = s.metadata || {};
            s.metadata.conversation = JSON.stringify(msgs);
          }
        }
      }

      const content = isJson ? this.exportAsJson(sessions) : this.exportAsText(sessions);
      fs.writeFileSync(uri.fsPath, content, 'utf-8');
      vscode.window.showInformationMessage(`Exported ${sessions.length} session(s) to ${uri.fsPath}`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Export failed: ${e.message || e}`);
    } finally {
      this.postMessage({ command: 'exportComplete' });
    }
  }

  private exportAsJson(sessions: AgentSession[]): string {
    const data = {
      exportedAt: new Date().toISOString(),
      format: 'wardy-sessions-export-v1',
      totalSessions: sessions.length,
      sessions: sessions.map(s => {
        const obj: any = {
          id: s.id,
          agentName: s.agentName,
          provider: s.provider,
          model: s.model,
          title: s.title,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMs: s.durationMs,
          promptCount: s.promptCount,
          totalTokens: s.totalTokens,
          projectPath: s.projectPath,
          source: s.source,
        };
        if (s.metadata?.conversation) {
          try {
            const msgs = JSON.parse(s.metadata.conversation as string);
            obj.conversation = msgs.map((m: any, i: number) => ({
              index: i + 1,
              role: m.role,
              timestamp: m.timestamp || null,
              tokens: m.tokens || 0,
              content: m.content || '',
              ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
              ...(m.is_thinking ? { is_thinking: true, thinking_duration: m.thinking_duration || null } : {}),
              ...(m.tool_name ? { tool_name: m.tool_name, tool_input: m.tool_input || null } : {}),
            }));
          } catch {}
        }
        if (s.metadata) {
          const rest = { ...s.metadata };
          delete rest.conversation;
          if (Object.keys(rest).length > 0) obj.metadata = rest;
        }
        return obj;
      }),
    };
    return JSON.stringify(data, null, 2);
  }

  private exportAsText(sessions: AgentSession[]): string {
    let text = '';
    text += '========================================\n';
    text += 'WARDY EXPORT - Session Report\n';
    text += '========================================\n\n';
    text += `Exported: ${new Date().toLocaleString()}\n`;
    text += `Total Sessions: ${sessions.length}\n\n`;

    for (const s of sessions) {
      text += '----------------------------------------\n';
      text += `Title: ${s.title || 'Untitled'}\n`;
      text += `Agent: ${s.agentName}\n`;
      text += `Provider: ${s.provider}\n`;
      text += `Model: ${s.model || 'N/A'}\n`;
      text += `Date: ${s.startTime ? new Date(s.startTime).toLocaleString() : 'N/A'}\n`;
      if (s.projectPath) text += `Project: ${s.projectPath}\n`;
      text += `Messages: ${s.promptCount}\n`;
      text += `Tokens: ${s.totalTokens?.toLocaleString() || 0}\n`;

      if (s.metadata?.conversation) {
        try {
          const messages = JSON.parse(s.metadata.conversation as string);
          text += '\nConversation:\n';
          for (const m of messages) {
            const role = m.role === 'user' ? 'USER' : m.role === 'assistant' ? 'ASSISTANT' : m.role === 'system' ? 'SYSTEM' : m.role.toUpperCase();
            const time = m.timestamp ? ` (${new Date(m.timestamp).toLocaleString()})` : '';
            const tokens = m.tokens ? ` [${m.tokens} tok]` : '';
            text += `\n──── ${role}${time}${tokens} ────\n`;

            if (m.is_thinking) {
              const dur = m.thinking_duration ? ` (${(m.thinking_duration / 1000).toFixed(1)}s)` : '';
              text += `🤔 Thinking${dur}\n`;
            }

            if (m.tool_calls && m.tool_calls.length > 0) {
              for (const tc of m.tool_calls) {
                text += `\n🔧 Tool: ${tc.name}\n`;
                if (tc.arguments) text += `  Arguments: ${JSON.stringify(tc.arguments, null, 2).replace(/\n/g, '\n  ')}\n`;
                if (tc.content) text += `  Result: ${tc.content}\n`;
              }
            }

            if (m.tool_name) {
              text += `\n[Tool: ${m.tool_name}]\n`;
              if (m.tool_input) text += `${JSON.stringify(m.tool_input, null, 2)}\n`;
            }

            if (m.content) {
              text += m.content + '\n';
            }
          }
        } catch {}
      }
      text += '\n';
    }

    return text;
  }

  private getAgentDataDir(name: string): string | null {
    const agent = KNOWN_AGENTS.find(a => a.name === name);
    if (!agent) return null;
    // Use first data path relative to home
    if (agent.dataPaths.length > 0) {
      return path.join(os.homedir(), agent.dataPaths[0].path);
    }
    return null;
  }

  private async handleEnableAutoSave(agentName: string): Promise<void> {
    const home = os.homedir();
    const endpoint = this._server?.getUrl() ? `${this._server.getUrl()}/api/save` : 'http://127.0.0.1:9876/api/save';

    // Verify the agent's conversation directory is being watched by the detector
    const agentDir = this.getAgentDataDir(agentName);
    let convDirWatched = false;
    if (agentDir) {
      const convDir = path.join(agentDir, 'conversations');
      convDirWatched = fs.existsSync(convDir);
    }

    let message = '';

    switch (agentName) {
      case 'Claude Code': {
        const dir = path.join(home, '.claude');
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        const settingsPath = path.join(dir, 'settings.json');
        let settings: any = {};
        if (fs.existsSync(settingsPath)) {
          try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
        }
        const hooks = settings.hooks || {};
        hooks.postConversation = hooks.postConversation || [];
        const hookCmd = `cat - | curl -X POST ${endpoint} -H "Content-Type: application/json" -d @-`;
        if (!hooks.postConversation.includes(hookCmd)) {
          hooks.postConversation.push(hookCmd);
        }
        settings.hooks = hooks;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        message = 'Claude Code auto-save enabled. postConversation hook added.';
        break;
      }
      case 'Qoder': {
        const dir = path.join(home, '.qoder');
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        const settingsPath = path.join(dir, 'settings.json');
        let settings: any = {};
        if (fs.existsSync(settingsPath)) {
          try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
        }
        const hooks = settings.hooks || {};
        hooks.SessionEnd = hooks.SessionEnd || [];
        const hookCmd = `cat - | curl -X POST ${endpoint} -H "Content-Type: application/json" -d @-`;
        if (!hooks.SessionEnd.includes(hookCmd)) {
          hooks.SessionEnd.push(hookCmd);
        }
        settings.hooks = hooks;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        message = 'Qoder auto-save enabled. SessionEnd hook added.';
        break;
      }
      default: {
        // For agents without hooks, auto-detection via file watcher is already active
        if (convDirWatched) {
          message = `Wardy is already auto-detecting ${agentName} conversations from ${agentDir}/conversations/. No agent setup needed.`;
        } else {
          message = `Wardy does not have a hook integration for ${agentName}. However, sessions are still captured automatically via process monitoring.`;
        }
        break;
      }
    }

    this._autoSaveConfigured.add(agentName);
    vscode.window.showInformationMessage(message);
    this.postMessage({ command: 'autoSaveStatus', agentName, enabled: true });
  }

  private getIntegrationInfoJson(): string {
    try {
      const serverUrl = this._server?.getUrl() || '';
      const running = this._agentDetector?.detectRunningProcesses() || [];
      const runningNames = running.map(r => r.name);
      const uniqueRunning = [...new Set(runningNames)];

      const agents = KNOWN_AGENTS.map(a => {
        const dir = this.getAgentDataDir(a.name);
        const hasDir = dir ? fs.existsSync(dir) : false;
        const isRunning = uniqueRunning.includes(a.name);
        const hasData = !!(a.dataPaths.length > 0);
        return {
          name: a.name,
          provider: a.provider,
          hasDataDir: hasDir,
          isRunning,
          hasData,
          dataDir: dir || '',
          autoSaveConfigured: this._autoSaveConfigured.has(a.name),
        };
      });

      return JSON.stringify({ serverUrl, agents });
    } catch {
      return '{}';
    }
  }

  private buildAgentPrompt(): string {
    const endpoint = this._server?.getUrl() || 'http://127.0.0.1:9876';
    return `This conversation is automatically saved by Wardy via file detection. No manual save step is needed.

If automatic detection fails as a fallback, you can manually save by running this after your last message:

curl -X POST ${endpoint}/api/save -H "Content-Type: application/json" -d @- << 'WARDY_EOF'
{
  "agent": "YOUR_AGENT_NAME",
  "model": "YOUR_MODEL",
  "project": "$PWD",
  "messages": CONVERSATION_JSON
}
WARDY_EOF`;
  }

  private async handleSearchMessages(query: string): Promise<void> {
    try {
      if (!this._agentStore) {
        this.postMessage({ command: 'searchResults', results: '[]' });
        return;
      }
      const all = this._agentStore.getAll();
      const q = query.toLowerCase();
      const results: Array<{
        sessionId: string;
        title: string;
        agentName: string;
        startTime: string;
        snippets: string[];
      }> = [];

      for (const session of all) {
        let convStr = session.metadata?.conversation;
        if (!convStr && this._agentDetector) {
          try {
            const msgs = this._agentDetector.getConversationForSession(session);
            if (msgs && msgs.length > 0) {
              convStr = JSON.stringify(msgs);
              session.metadata = session.metadata || {};
              session.metadata.conversation = convStr;
              this._agentStore.add(session);
            }
          } catch {}
        }
        if (!convStr) continue;

        try {
          const messages = JSON.parse(convStr);
          if (!Array.isArray(messages)) continue;
          const snippets: string[] = [];
          for (const m of messages) {
            const content = m.content || '';
            if (content.toLowerCase().includes(q)) {
              const idx = content.toLowerCase().indexOf(q);
              const start = Math.max(0, idx - 60);
              const end = Math.min(content.length, idx + q.length + 60);
              let snippet = content.slice(start, end);
              if (start > 0) snippet = '...' + snippet;
              if (end < content.length) snippet = snippet + '...';
              snippets.push(snippet);
              if (snippets.length >= 3) break;
            }
          }
          if (snippets.length > 0) {
            results.push({
              sessionId: session.id,
              title: session.title || 'Untitled',
              agentName: session.agentName,
              startTime: session.startTime,
              snippets,
            });
          }
        } catch {}
      }

      this.postMessage({ command: 'searchResults', results: JSON.stringify(results) });
    } catch {
      this.postMessage({ command: 'searchResults', results: '[]' });
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'src'),
        this._extensionUri,
      ],
    };

    const iconUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'wardy-icon.png'),
    );

    let userName = 'User';
    let storagePath = this._globalStoragePath;
    let agentSummary = '[]';
    let sessions = '[]';
    let projects = '[]';
    let serverUrl = '';
    try {
      userName = os.userInfo().username;
      storagePath = vscode.workspace.getConfiguration('wardy').get<string>('storagePath') || this._globalStoragePath;
      agentSummary = this.getAgentSummaryJson();
      sessions = this.getAllSessionsJson();
      projects = this.getProjectsJson();
      serverUrl = this._server?.getUrl() || '';
    } catch {} 

    const scriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview.js'));
    webviewView.webview.html = getHtml(iconUri, scriptUri.toString(), userName, storagePath, agentSummary, sessions, projects, serverUrl);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'openStorage': {
          const p = vscode.workspace.getConfiguration('wardy').get<string>('storagePath');
          vscode.env.openExternal(vscode.Uri.file(p || this._globalStoragePath));
          break;
        }
        case 'changeStorage': {
          vscode.window.showOpenDialog({ canSelectFolders: true }).then(uri => {
            if (uri && uri[0]) {
              const newPath = uri[0].fsPath;
              vscode.workspace.getConfiguration('wardy').update('storagePath', newPath, vscode.ConfigurationTarget.Global);
              this.reinitStorage(newPath);
              this.postMessage({ command: 'updateStoragePath', path: newPath });
              vscode.window.showInformationMessage(`Wardy storage path changed to ${newPath}`);
            }
          });
          break;
        }
        case 'scanAgents': {
          try {
            if (!this._agentDetector) {
              this.postMessage({ command: 'updateAgents', summary: '[]' });
              break;
            }
            const result = this._agentDetector.runFullScan();
            const summary = this.getAgentSummaryJson();
            const sessions = this.getAllSessionsJson();
            const projects = this.getProjectsJson();
            this.postMessage({ command: 'updateAgents', summary, processes: result.processes });
            this.postMessage({ command: 'updateSessions', sessions });
            this.postMessage({ command: 'updateProjects', projects });
            vscode.window.showInformationMessage(`Wardy: scanned agents — found ${result.sessions.length} new sessions, ${result.processes.length} running`);
          } catch {
            this.postMessage({ command: 'updateAgents', summary: '[]' });
          }
          break;
        }
        case 'exportSessions':
          this.handleExport(message);
          break;
        case 'getIntegrationInfo':
          this.postMessage({ command: 'integrationInfo', info: this.getIntegrationInfoJson() });
          break;
        case 'copyAgentPrompt':
          this.postMessage({ command: 'agentPrompt', prompt: this.buildAgentPrompt() });
          break;
        case 'enableAutoSave':
          if (message.agentName) {
            this.handleEnableAutoSave(message.agentName);
          }
          break;
        case 'searchMessages':
          if (message.query) {
            this.handleSearchMessages(message.query);
          }
          break;
        default: {
          if (typeof message.command === 'string') {
            if (message.command.startsWith('getConversation:') || message.command.startsWith('refreshConversation:')) {
              const forceRefresh = message.command.startsWith('refreshConversation:');
              const sessionId = message.command.slice(message.command.indexOf(':') + 1);
              try {
                if (!this._agentStore) break;
                const all = this._agentStore.getAll();
                const session = all.find(s => s.id === sessionId);
                if (session && session.metadata?.conversation && !forceRefresh) {
                  this.postMessage({ command: 'showConversation', messages: session.metadata.conversation, modelName: session.model });
                } else if (session && this._agentDetector) {
                  const msgs = this._agentDetector.getConversationForSession(session);
                  if (msgs && msgs.length > 0) {
                    session.metadata = session.metadata || {};
                    session.metadata.conversation = JSON.stringify(msgs);
                    this._agentStore?.add(session);
                    this.postMessage({ command: 'showConversation', messages: session.metadata.conversation, modelName: session.model });
                  } else {
                    this.postMessage({ command: 'showConversation', messages: '[]' });
                  }
                } else {
                  this.postMessage({ command: 'showConversation', messages: '[]' });
                }
                if (forceRefresh) {
                  this.postMessage({ command: 'updateSessions', sessions: this.getAllSessionsJson() });
                }
              } catch {
                this.postMessage({ command: 'showConversation', messages: '[]' });
              }
            }
          }
          break;
        }
      }
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  try {
    wardyProvider = new WardyViewProvider(context.extensionUri, context.globalStorageUri.fsPath, context.globalState);
    const provider = wardyProvider;

    // update workspace paths when folders change
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        provider._agentDetector?.setWorkspacePaths(
          (vscode.workspace.workspaceFolders || []).map(f => normPath(f.uri.fsPath))
        );
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('wardy.settings', () => {
        provider.postMessage({ command: 'showSettings' });
      }),
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'wardy.sidebar',
        provider,
      ),
    );
  } catch (e) {
    console.error('Wardy activation failed:', e);
  }
}

export function deactivate() {
  try { wardyProvider?.dispose(); } catch {}
}
