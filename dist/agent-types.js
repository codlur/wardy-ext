"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_AGENTS = exports.SVG_GENERIC = void 0;
function loadSvg(slug) {
    try {
        const icon = require('thesvg/' + slug);
        return (icon.variants?.mono || icon.svg);
    }
    catch {
        return '';
    }
}
const SVG_CLAUDE = loadSvg('claude');
const SVG_CURSOR = loadSvg('cursor');
const SVG_OPENCODE = loadSvg('opencode');
const SVG_GITHUB_COPILOT = loadSvg('github-copilot');
const SVG_ANTHROPIC = loadSvg('anthropic');
const SVG_CODEX = loadSvg('codex');
const SVG_VSCODE = '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Visual Studio Code</title><path d="M23.15 2.587L18.21.21a1.493 1.493 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.94a1.5 1.5 0 0 0-.85-1.353zm-5.146 14.717l-6.252-5.148a.5.5 0 0 1 0-.76l6.252-5.148a.5.5 0 0 1 .824.38v9.296a.5.5 0 0 1-.824.38z"/></svg>';
const SVG_AIDER = '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Aider</title><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
const SVG_QODER = '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Qoder</title><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
exports.SVG_GENERIC = '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>AI</title><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
exports.KNOWN_AGENTS = [
    {
        name: 'Claude Code',
        provider: 'Anthropic',
        icon: SVG_CLAUDE,
        dataPaths: [
            { label: 'Claude CLI data', path: '.claude' },
        ],
        processNames: ['claude', 'claude.exe'],
    },
    {
        name: 'OpenCode',
        provider: 'Anthropic',
        icon: SVG_OPENCODE,
        dataPaths: [
            { label: 'OpenCode data', path: '.opencode' },
            { label: 'OpenCode VS Code storage', path: 'AppData/Roaming/Code/User/globalStorage/opencode.opencode' },
            { label: 'OpenCode Desktop (Windows)', path: 'AppData/Roaming/ai.opencode.desktop' },
        ],
        processNames: ['opencode', 'opencode.exe'],
    },
    {
        name: 'Codex CLI',
        provider: 'OpenAI',
        icon: SVG_CODEX,
        dataPaths: [
            { label: 'Codex data', path: '.codex' },
        ],
        processNames: ['codex', 'codex.exe'],
    },
    {
        name: 'Cursor',
        provider: 'OpenAI',
        icon: SVG_CURSOR,
        dataPaths: [
            { label: 'Cursor data', path: '.cursor' },
        ],
        processNames: ['cursor', 'cursor.exe'],
    },
    {
        name: 'Claude Dev',
        provider: 'Anthropic',
        icon: SVG_ANTHROPIC,
        dataPaths: [
            { label: 'Claude Dev VS Code storage', path: 'AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev' },
        ],
        processNames: [],
    },
    {
        name: 'GitHub Copilot',
        provider: 'GitHub',
        icon: SVG_GITHUB_COPILOT,
        dataPaths: [],
        processNames: [],
    },
    {
        name: 'Qoder',
        provider: 'Unknown',
        icon: SVG_QODER,
        dataPaths: [],
        processNames: [],
    },
    {
        name: 'VS Code',
        provider: 'GitHub',
        icon: SVG_VSCODE,
        dataPaths: [],
        processNames: ['code', 'code.exe'],
    },
    {
        name: 'Aider',
        provider: 'Unknown',
        icon: SVG_AIDER,
        dataPaths: [
            { label: 'Aider data', path: '.aider' },
        ],
        processNames: ['aider', 'aider.exe'],
    },
];
//# sourceMappingURL=agent-types.js.map