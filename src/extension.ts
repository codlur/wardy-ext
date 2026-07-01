import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentStore } from './agent-store';
import { AgentDetector, normPath } from './agent-detector';
import { AgentSession, KNOWN_AGENTS, SVG_GENERIC } from './agent-types';

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
}

function getHtml(iconUri: vscode.Uri, scriptUri: string, userName: string, storagePath: string, onboarded: boolean, statusText: string, agentSummary: string, sessions: string, projects: string): string {
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
.badge-cloud {
  background: var(--vscode-textLink-foreground);
  color: #fff;
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
.chat-msg {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
}
.chat-msg-header {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}
.chat-msg-content {
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-dropdown-border);
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-msg.user .chat-msg-content {
  border-left: 3px solid var(--vscode-textLink-foreground);
}
.chat-msg.assistant .chat-msg-content {
  border-left: 3px solid var(--vscode-testing-iconPassed);
}
.chat-msg.system .chat-msg-content {
  border-left: 3px solid var(--vscode-charts-yellow);
  opacity: 0.8;
  font-style: italic;
}
.msg-time { font-weight:400;text-transform:none;letter-spacing:0;opacity:0.7;margin-left:8px; }
.msg-tokens { font-weight:400;text-transform:none;letter-spacing:0;opacity:0.6;margin-left:6px;font-size:9px; }
.code-block { margin:8px 0;border:1px solid var(--vscode-dropdown-border);border-radius:4px;overflow:hidden; }
.code-block-header { display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--vscode-editor-inactiveSelectionBackground);font-size:10px; }
.code-lang { color:var(--vscode-descriptionForeground);text-transform:uppercase;font-size:9px;font-weight:600;letter-spacing:0.5px; }
.copy-btn { background:none;border:1px solid var(--vscode-dropdown-border);border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px;color:var(--vscode-foreground); }
.copy-btn:hover { background:var(--vscode-button-hoverBackground);color:var(--vscode-button-foreground); }
.code-block pre { margin:0;padding:8px 12px;overflow-x:auto;background:var(--vscode-editor-background); }
.code-block code { font-size:11px;font-family:var(--vscode-editor-font-family);line-height:1.5;white-space:pre; }
.chat-msg-content p { margin:4px 0; }
.chat-msg-content p:first-child { margin-top:0; }
.chat-msg-content p:last-child { margin-bottom:0; }
</style>
</head>
<body>
  <div id="toast" style="display:none;position:fixed;top:8px;left:50%;transform:translateX(-50%);background:#007acc;color:#fff;padding:6px 16px;border-radius:4px;font-size:12px;z-index:999;white-space:nowrap;"></div>
  <div id="page-welcome" class="page center-page${!onboarded ? ' active' : ''}">
    <img class="logo" src="${iconUri}" alt="Wardy">
    <h1>Welcome to Wardy</h1>
    <p>The activity manager for your AI coding agents. Track, review, and manage your AI-assisted development activity.</p>
    <button class="btn" data-action="show-auth">
      <span>→</span> Get Started
    </button>
  </div>

  <div id="page-auth" class="page center-page">
    <img class="logo" src="${iconUri}" alt="Wardy">
    <h1>Get Started</h1>
    <p>Sync your activity across devices with Wardy Cloud, or keep everything local.</p>
    <div class="btn-group">
      <button class="btn" data-action="login">Log In</button>
      <button class="btn" data-action="createAccount">Create Account</button>
      <div class="divider"><span>or</span></div>
      <button class="btn btn-secondary" data-action="skip">Skip — Use Local Data</button>
    </div>
  </div>

  <div id="page-main" class="page${onboarded ? ' active' : ''}">
    <div class="main-layout">
      <div class="top-nav">
        <button class="nav-tab active" data-tab="activity">Activity</button>
        <button class="nav-tab" data-tab="projects">Projects</button>
        <button class="nav-tab" data-tab="agents">Agents</button>
        <button class="nav-tab" data-tab="integrate">Integrate</button>
        <button class="nav-tab" data-tab="search">Search</button>
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
          <div id="integrate-content">
            <p>Integrate Wardy with your tools and workflows.</p>
          </div>
        </div>
        <div class="tab-pane" id="tab-search">
          <div class="sort-bar">
            <input class="search-input" id="search-global" type="text" placeholder="Search everything..." data-tab="search" autofocus>
          </div>
          <div id="search-content"></div>
        </div>
      </div>
    </div>
  </div>

  <div id="page-session-detail" class="page">
    <div class="detail-layout">
      <div class="detail-header">
        <button class="btn btn-secondary" data-action="back-to-activity" style="font-size:11px;padding:6px 10px">← Back</button>
        <div id="detail-title" style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1"></div>
        <button class="btn btn-secondary" data-action="export-session" style="font-size:11px;padding:6px 10px" title="Export this session">⬇ Export</button>
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
        <button class="btn btn-secondary" data-action="export-agent" style="font-size:11px;padding:6px 10px" title="Export all sessions for this agent">⬇ Export Sessions</button>
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
        <button class="btn btn-secondary" data-action="export-project" style="font-size:11px;padding:6px 10px" title="Export all sessions for this project">⬇ Export Sessions</button>
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
          <button class="settings-nav-item" data-spane="account">Account</button>
          <button class="settings-nav-item" data-spane="storage">Storage</button>
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
              <span><span class="badge badge-local">${statusText}</span></span>
            </div>
          </div>
        </div>
        <div class="settings-pane" id="spane-account">
          <div class="settings-section">
            <h2>Account</h2>
            <p style="text-align:left;max-width:none">Manage your Wardy Cloud account to sync data across devices.</p>
            <div style="display:flex;gap:8px">
              <button class="btn" style="flex:1" data-action="login">Log In</button>
              <button class="btn btn-secondary" style="flex:1" data-action="createAccount">Create Account</button>
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
    } catch {}
  }

  dispose(): void {
    this._agentDetector?.stopWatching();
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

      const format = await vscode.window.showQuickPick(
        ['JSON', 'Text (TXT)'],
        { placeHolder: `Export ${sessions.length} session(s) as...` }
      );
      if (!format) return;

      const isJson = format === 'JSON';
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
    }
  }

  private exportAsJson(sessions: AgentSession[]): string {
    const data = {
      exportedAt: new Date().toISOString(),
      format: 'wardy-sessions-export-v1',
      totalSessions: sessions.length,
      sessions: sessions.map(s => ({
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
        metadata: s.metadata || {},
      })),
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
            const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : m.role;
            const time = m.timestamp ? ` (${new Date(m.timestamp).toLocaleTimeString()})` : '';
            text += `\n[${role}${time}]\n`;
            const content = String(m.content || '');
            text += content + '\n';
          }
        } catch {}
      }
      text += '\n';
    }

    return text;
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
    let onboarded = false;
    let statusText = 'Local';
    let agentSummary = '[]';
    let sessions = '[]';
    let projects = '[]';
    try {
      userName = os.userInfo().username;
      storagePath = vscode.workspace.getConfiguration('wardy').get<string>('storagePath') || this._globalStoragePath;
      onboarded = this._globalState.get<boolean>('wardy.onboarded', false);
      statusText = this._globalState.get<string>('wardy.status', 'Local');
      agentSummary = this.getAgentSummaryJson();
      sessions = this.getAllSessionsJson();
      projects = this.getProjectsJson();
    } catch {} 

    const scriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview.js'));
    webviewView.webview.html = getHtml(iconUri, scriptUri.toString(), userName, storagePath, onboarded, statusText, agentSummary, sessions, projects);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'login':
          vscode.commands.executeCommand('wardy.login');
          this.postMessage({ command: 'goToMain' });
          break;
        case 'createAccount':
          vscode.commands.executeCommand('wardy.createAccount');
          this.postMessage({ command: 'goToMain' });
          break;
        case 'skip':
          vscode.commands.executeCommand('wardy.skip');
          this.postMessage({ command: 'goToMain' });
          break;
        case 'openStorage': {
          const p = vscode.workspace.getConfiguration('wardy').get<string>('storagePath');
          vscode.env.openExternal(vscode.Uri.file(p || this._globalStoragePath));
          break;
        }
        case 'changeStorage': {
          vscode.window.showOpenDialog({ canSelectFolders: true }).then(uri => {
            if (uri && uri[0]) {
              vscode.workspace.getConfiguration('wardy').update('storagePath', uri[0].fsPath, vscode.ConfigurationTarget.Global);
              this.postMessage({ command: 'updateStoragePath', path: uri[0].fsPath });
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
                  this.postMessage({ command: 'showConversation', messages: session.metadata.conversation });
                } else if (session && this._agentDetector) {
                  const msgs = this._agentDetector.getConversationForSession(session);
                  if (msgs && msgs.length > 0) {
                    session.metadata = session.metadata || {};
                    session.metadata.conversation = JSON.stringify(msgs);
                    this._agentStore?.add(session);
                    this.postMessage({ command: 'showConversation', messages: session.metadata.conversation });
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
    context.subscriptions.push(
      vscode.commands.registerCommand('wardy.login', () => {
        context.globalState.update('wardy.onboarded', true);
        context.globalState.update('wardy.status', 'Cloud');
        vscode.window.showInformationMessage('Wardy Cloud login — coming soon!');
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('wardy.createAccount', () => {
        context.globalState.update('wardy.onboarded', true);
        context.globalState.update('wardy.status', 'Cloud');
        vscode.window.showInformationMessage('Create a Wardy Cloud account — coming soon!');
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('wardy.skip', () => {
        context.globalState.update('wardy.onboarded', true);
        context.globalState.update('wardy.status', 'Local');
      }),
    );

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
