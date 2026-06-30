var vscode = acquireVsCodeApi();
let agentSummary = [];
let sessions = [];
let projects = [];
let GENERIC_ICON = '';
const KNOWN_AGENTS = [];
(function() {
  try {
    const el = document.getElementById('wardy-data');
    if (el) {
      const data = JSON.parse(el.textContent || '{}');
      if (Array.isArray(data.agentSummary)) agentSummary = data.agentSummary;
      if (Array.isArray(data.sessions)) sessions = data.sessions;
      if (Array.isArray(data.projects)) projects = data.projects;
      if (Array.isArray(data.knownAgents)) {
        KNOWN_AGENTS.length = 0;
        KNOWN_AGENTS.push(...data.knownAgents);
      }
      if (data.genericIcon) GENERIC_ICON = data.genericIcon;
    }
  } catch {}
})();

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
}

function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.nav-tab[data-tab="' + name + '"]');
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById('tab-' + name);
  if (pane) pane.classList.add('active');
  if (name === 'activity') renderActivity();
  if (name === 'projects') renderProjects();
  if (name === 'agents') renderAgents();
}

function postMsg(command) {
  vscode.postMessage({ command });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'show-auth') showPage('page-auth');
  else if (action === 'show-main') showPage('page-main');
  else if (action === 'back-to-activity') { showPage('page-main'); switchTab('activity'); }
  else if (action === 'login' || action === 'createAccount' || action === 'skip' || action === 'changeStorage' || action === 'openStorage' || action === 'scanAgents') postMsg(action);
  else if (action === 'view-session') { postMsg('getConversation:' + btn.dataset.sessionId); }
  else if (action === 'back-to-agents') { showPage('page-main'); switchTab('agents'); }
  else if (action === 'back-to-projects') { showPage('page-main'); switchTab('projects'); }
});

document.addEventListener('click', e => {
  const item = e.target.closest('.session-item');
  if (item) {
    const id = item.dataset.sessionId;
    const session = sessions.find(s => s.id === id);
    if (session) showSessionDetail(session);
  }
});

document.addEventListener('click', e => {
  const card = e.target.closest('.agent-card');
  if (card) {
    const name = card.dataset.agentName;
    if (name) showAgentDetail(name);
  }
});

document.addEventListener('click', e => {
  const item = e.target.closest('.project-card');
  if (item) {
    const path = item.dataset.projectPath;
    if (path) showProjectDetail(path);
  }
});

document.addEventListener('click', e => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sessionSort = btn.dataset.sort;
  renderActivity();
});

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelectorAll('.settings-nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
    const pane = document.getElementById('spane-' + btn.dataset.spane);
    if (pane) pane.classList.add('active');
  });
});

window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.command === 'showSettings') {
    showPage('page-settings');
  } else if (msg.command === 'updateStoragePath') {
    const el = document.getElementById('storage-path');
    if (el) el.textContent = msg.path;
  } else if (msg.command === 'goToMain') {
    showPage('page-main');
  } else if (msg.command === 'updateAgents') {
    if (msg.summary) agentSummary = JSON.parse(msg.summary);
    renderAgents();
  } else if (msg.command === 'updateSessions') {
    if (msg.sessions) sessions = JSON.parse(msg.sessions);
    renderActivity();
  } else if (msg.command === 'updateSessionTokens') {
    if (msg.id && msg.totalTokens !== undefined) {
      const s = sessions.find(x => x.id === msg.id);
      if (s) s.totalTokens = msg.totalTokens;
    }
  } else if (msg.command === 'updateProjects') {
    if (msg.projects) projects = JSON.parse(msg.projects);
    renderProjects();
  } else if (msg.command === 'realtimeUpdate') {
    const toast = document.getElementById('toast');
    if (toast && msg.newSessions > 0) {
      toast.textContent = '+ ' + msg.newSessions + ' new session' + (msg.newSessions > 1 ? 's' : '') + ' detected';
      toast.style.display = 'block';
      setTimeout(function() { toast.style.display = 'none'; }, 3000);
    }
  } else if (msg.command === 'showConversation') {
    if (msg.messages) showConversation(JSON.parse(msg.messages));
  }
});

let sessionSort = 'latest';

function renderActivity() {
  const el = document.getElementById('activity-content');
  if (!el) return;
  if (!sessions || sessions.length === 0) {
    el.innerHTML = '<div class="session-empty"><p>No activity yet. Start using AI agents to see your activity here.</p><div class="btn-group" style="margin:0 auto"><button class="btn" data-action="scanAgents">Scan for Agents</button></div></div>';
    return;
  }
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.startTime || '';
    const tb = b.startTime || '';
    return sessionSort === 'latest' ? tb.localeCompare(ta) : ta.localeCompare(tb);
  });
  let html = '<div class="session-list">';
  for (const s of sorted) {
    const info = KNOWN_AGENTS.find(k => k.name === s.agentName) || { icon: GENERIC_ICON };
    const time = s.startTime ? formatDate(s.startTime) + ' ' + formatTime(s.startTime) : '';
    html += '<div class="session-item" data-session-id="' + s.id + '">';
    html += '<div class="session-title">' + esc(s.title || 'Untitled') + '</div>';
    html += '<div class="session-meta">';
    html += '<span>' + info.icon + ' ' + esc(s.agentName) + '</span>';
    html += '<span>' + time + '</span>';
    if (s.totalTokens) html += '<span>' + formatTokens(s.totalTokens) + ' tokens</span>';
    if (s.projectPath) html += '<span>' + esc(s.projectPath) + '</span>';
    html += '</div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatTokens(n) {
  if (!n || n === 0) return '';
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function renderCodeBlock(code, lang) {
  const langAttr = lang ? ' data-lang="' + escapeHtml(lang) + '"' : '';
  return '<div class="code-block"' + langAttr + '>' +
    '<div class="code-block-header">' +
    '<span class="code-lang">' + (lang || 'code') + '</span>' +
    '<button class="copy-btn" data-code="' + escapeHtml(code) + '">Copy</button>' +
    '</div>' +
    '<pre><code>' + escapeHtml(code) + '</code></pre>' +
    '</div>';
}

function renderMessageContent(text) {
  const blocks = [];
  let remaining = text;
  let lastIdx = 0;
  var regex = /```(\w*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      blocks.push({ type: 'text', value: text.slice(lastIdx, match.index) });
    }
    blocks.push({ type: 'code', lang: match[1], value: match[2] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    blocks.push({ type: 'text', value: text.slice(lastIdx) });
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'text', value: text });
  }
  return blocks.map(function(b) {
    if (b.type === 'code') return renderCodeBlock(b.value, b.lang);
    return '<p>' + escapeHtml(b.value).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

function showSessionDetail(session) {
  document.getElementById('detail-title').textContent = session.title || 'Untitled';
  const info = KNOWN_AGENTS.find(k => k.name === session.agentName) || { icon: GENERIC_ICON };
  const tokenStr = session.totalTokens ? formatTokens(session.totalTokens) + ' tokens' : '';
  document.getElementById('detail-meta').innerHTML =
    '<span>' + info.icon + ' ' + esc(session.agentName) + '</span>' +
    '<span>' + session.model + '</span>' +
    '<span>' + session.promptCount + ' messages' + (tokenStr ? ', ' + tokenStr : '') + '</span>' +
    (session.projectPath ? '<span>' + esc(session.projectPath) + '</span>' : '');
  document.getElementById('detail-conversation').innerHTML = '<div style="text-align:center;padding:32px;color:var(--vscode-descriptionForeground)">Loading conversation...</div>';
  showPage('page-session-detail');
  postMsg('getConversation:' + session.id);
}

function showConversation(messages) {
  const el = document.getElementById('detail-conversation');
  if (!messages || messages.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--vscode-descriptionForeground)">No messages in this session.</div>';
    return;
  }
  let html = '';
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var role = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : m.role;
    var timeStr = m.timestamp ? ' <span class="msg-time">' + formatTime(m.timestamp) + '</span>' : '';
    var tokenStr = m.tokens ? ' <span class="msg-tokens">' + formatTokens(m.tokens) + ' tok</span>' : '';
    html += '<div class="chat-msg ' + m.role + '">';
    html += '<div class="chat-msg-header">' + role + timeStr + tokenStr + '</div>';
    html += '<div class="chat-msg-content">' + renderMessageContent(m.content) + '</div>';
    html += '</div>';
  }
  el.innerHTML = html;

  el.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(btn.dataset.code).then(function() {
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = orig; }, 1500);
      });
    });
  });
}

function renderAgents() {
  const el = document.getElementById('agents-content');
  if (!el) return;
  if (!agentSummary || agentSummary.length === 0) {
    el.innerHTML = '<div class="agent-empty"><p>No agents detected yet. Scan for AI coding agent data on your machine.</p><div class="btn-group" style="margin:0 auto"><button class="btn" data-action="scanAgents">Scan for Agents</button></div></div>';
    return;
  }
  let html = '<div class="agent-grid">';
  for (const a of agentSummary) {
    const info = KNOWN_AGENTS.find(k => k.name === a.agentName) || { name: a.agentName, provider: a.provider || 'Unknown', icon: GENERIC_ICON };
    const running = a.lastActive === 'running';
    html += '<div class="agent-card" data-agent-name="' + esc(a.agentName) + '">';
    html += '<div class="agent-card-header">';
    html += '<div class="agent-card-icon">' + info.icon + '</div>';
    html += '<span class="agent-card-name">' + a.agentName + '</span>';
    if (running) html += '<span class="agent-card-running">Running</span>';
    html += '</div>';
    html += '<div class="agent-card-stats">';
    html += '<div class="agent-stat"><div class="agent-stat-value">' + a.totalSessions + '</div><div class="agent-stat-label">Sessions</div></div>';
    html += '<div class="agent-stat"><div class="agent-stat-value">' + a.totalPrompts + '</div><div class="agent-stat-label">Prompts</div></div>';
    html += '<div class="agent-stat"><div class="agent-stat-value">' + (a.totalTokens > 0 ? formatNum(a.totalTokens) : '-') + '</div><div class="agent-stat-label">Tokens</div></div>';
    html += '<div class="agent-stat"><div class="agent-stat-value" style="font-size:11px;font-weight:400">' + (a.lastActive && a.lastActive !== 'running' ? formatDate(a.lastActive) : '-') + '</div><div class="agent-stat-label">Last Active</div></div>';
    html += '</div></div>';
  }
  html += '</div>';
  html += '<div style="text-align:center;margin-top:16px"><button class="btn btn-secondary" data-action="scanAgents" style="width:100%">Rescan</button></div>';
  el.innerHTML = html;
}

function showAgentDetail(agentName) {
  const agent = agentSummary.find(a => a.agentName === agentName);
  if (!agent) return;
  const info = KNOWN_AGENTS.find(k => k.name === agentName) || { icon: GENERIC_ICON };
  const agentSessions = sessions.filter(s => s.agentName === agentName);
  const totalTokens = agentSessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  const totalPrompts = agentSessions.reduce((sum, s) => sum + (s.promptCount || 0), 0);

  document.getElementById('agent-detail-title').innerHTML =
    '<span class="agent-card-icon" style="display:inline-flex;width:24px;height:24px;vertical-align:middle">' + info.icon + '</span> ' +
    esc(agentName);
  document.getElementById('agent-detail-stats').innerHTML =
    '<div class="agent-stat"><div class="agent-stat-value">' + agentSessions.length + '</div><div class="agent-stat-label">Sessions</div></div>' +
    '<div class="agent-stat"><div class="agent-stat-value">' + totalPrompts + '</div><div class="agent-stat-label">Prompts</div></div>' +
    '<div class="agent-stat"><div class="agent-stat-value">' + (totalTokens > 0 ? formatNum(totalTokens) : '-') + '</div><div class="agent-stat-label">Tokens</div></div>';

  renderAgentSessions(agentSessions);
  showPage('page-agent-detail');
}

function renderAgentSessions(agentSessions) {
  const el = document.getElementById('agent-detail-sessions');
  if (!el) return;
  if (!agentSessions || agentSessions.length === 0) {
    el.innerHTML = '<div class="session-empty"><p>No sessions for this agent.</p></div>';
    return;
  }
  const sorted = [...agentSessions].sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
  let html = '<div class="session-list">';
  for (const s of sorted) {
    const time = s.startTime ? formatDate(s.startTime) + ' ' + formatTime(s.startTime) : '';
    html += '<div class="session-item" data-session-id="' + s.id + '">';
    html += '<div class="session-title">' + esc(s.title || 'Untitled') + '</div>';
    html += '<div class="session-meta">';
    html += '<span>' + time + '</span>';
    if (s.totalTokens) html += '<span>' + formatTokens(s.totalTokens) + ' tokens</span>';
    if (s.model) html += '<span>' + esc(s.model) + '</span>';
    if (s.projectPath) html += '<span>' + esc(s.projectPath) + '</span>';
    html += '</div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderProjects() {
  const el = document.getElementById('tab-projects');
  if (!el) return;
  if (!projects || projects.length === 0) {
    el.innerHTML = '<div class="session-empty"><p>No projects yet. Start using AI agents to see project activity here.</p></div>';
    return;
  }
  let html = '<div class="agent-grid">';
  for (const p of projects) {
    const agents = p.agentNames || [];
    const agentsStr = agents.length > 0 ? agents.join(', ') : '—';
    const lastActive = p.lastActive ? formatDate(p.lastActive) + ' ' + formatTime(p.lastActive) : '—';
    html += '<div class="project-card" data-project-path="' + esc(p.path) + '" style="cursor:pointer;background:var(--vscode-editor-background);border:1px solid var(--vscode-dropdown-border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;transition:border-color 0.15s">';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex-shrink:0"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg>';
    html += '<span style="font-size:14px;font-weight:600">' + esc(p.name) + '</span>';
    html += '</div>';
    html += '<div class="project-meta" style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:var(--vscode-descriptionForeground)">';
    html += '<span>' + esc(p.path) + '</span>';
    html += '</div>';
    html += '<div class="agent-card-stats">';
    html += '<div class="agent-stat"><div class="agent-stat-value">' + p.sessionCount + '</div><div class="agent-stat-label">Sessions</div></div>';
    html += '<div class="agent-stat"><div class="agent-stat-value">' + p.totalPrompts + '</div><div class="agent-stat-label">Prompts</div></div>';
    html += '<div class="agent-stat"><div class="agent-stat-value">' + (p.totalTokens > 0 ? formatNum(p.totalTokens) : '-') + '</div><div class="agent-stat-label">Tokens</div></div>';
    html += '<div class="agent-stat"><div class="agent-stat-value" style="font-size:11px;font-weight:400">' + (p.lastActive ? formatDate(p.lastActive) : '-') + '</div><div class="agent-stat-label">Last Active</div></div>';
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground)">Agents: ' + esc(agentsStr) + '</div>';
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function showProjectDetail(projectPath) {
  const project = projects.find(p => p.path === projectPath);
  if (!project) return;
  const projSessions = sessions.filter(s => s.projectPath === projectPath);
  const totalTokens = projSessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  const totalPrompts = projSessions.reduce((sum, s) => sum + (s.promptCount || 0), 0);

  document.getElementById('project-detail-title').textContent = esc(project.name);
  document.getElementById('project-detail-meta').innerHTML = '<span>' + esc(project.path) + '</span>';
  document.getElementById('project-detail-stats').innerHTML =
    '<div class="agent-stat"><div class="agent-stat-value">' + projSessions.length + '</div><div class="agent-stat-label">Sessions</div></div>' +
    '<div class="agent-stat"><div class="agent-stat-value">' + totalPrompts + '</div><div class="agent-stat-label">Prompts</div></div>' +
    '<div class="agent-stat"><div class="agent-stat-value">' + (totalTokens > 0 ? formatNum(totalTokens) : '-') + '</div><div class="agent-stat-label">Tokens</div></div>';

  // Group sessions by agent
  const byAgent = {};
  for (const s of projSessions) {
    if (!byAgent[s.agentName]) byAgent[s.agentName] = [];
    byAgent[s.agentName].push(s);
  }

  const el = document.getElementById('project-detail-sessions');
  if (!el) return;
  if (projSessions.length === 0) {
    el.innerHTML = '<div class="session-empty"><p>No sessions for this project.</p></div>';
    showPage('page-project-detail');
    return;
  }

  let html = '';
  for (const [agent, agentSessions] of Object.entries(byAgent)) {
    const info = KNOWN_AGENTS.find(k => k.name === agent) || { icon: GENERIC_ICON };
    const sorted = agentSessions.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
    html += '<div style="margin-bottom:16px">';
    html += '<div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;margin-bottom:8px;padding:4px 0"><span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;flex-shrink:0">' + info.icon + '</span> ' + esc(agent) + ' <span style="font-weight:400;font-size:11px;color:var(--vscode-descriptionForeground)">(' + sorted.length + ' sessions)</span></div>';
    html += '<div class="session-list">';
    for (const s of sorted) {
      const time = s.startTime ? formatDate(s.startTime) + ' ' + formatTime(s.startTime) : '';
      html += '<div class="session-item" data-session-id="' + s.id + '">';
      html += '<div class="session-title">' + esc(s.title || 'Untitled') + '</div>';
      html += '<div class="session-meta">';
      html += '<span>' + time + '</span>';
      if (s.totalTokens) html += '<span>' + formatTokens(s.totalTokens) + ' tokens</span>';
      if (s.model) html += '<span>' + esc(s.model) + '</span>';
      html += '</div></div>';
    }
    html += '</div></div>';
  }
  el.innerHTML = html;
  showPage('page-project-detail');
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

setTimeout(() => { renderAgents(); renderActivity(); }, 100);
