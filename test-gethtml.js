const fs = require('fs');

// Mock vscode module
const mockVscode = {
  Uri: { file: (p) => p, joinPath: (...args) => args.join('/') },
  WebviewView: function() {},
  Memento: function() {},
  workspace: { getConfiguration: () => ({ get: () => null }) },
  env: { openExternal: () => {} },
  window: { showOpenDialog: () => Promise.resolve([{ fsPath: '/tmp' }]), showInformationMessage: () => {} },
  commands: { executeCommand: () => {} },
};

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent) {
  if (request === 'vscode') return request;
  if (request.startsWith('./')) return require('path').resolve('D:/wardy-ext/out', request);
  return origResolve.call(this, request, parent);
};

// Need to mock the require cache for vscode
require.cache['vscode'] = { exports: mockVscode };

try {
  const ext = require('./out/extension');
  console.log('Extension loaded successfully');
  console.log('activate:', typeof ext.activate);
  console.log('deactivate:', typeof ext.deactivate);
} catch(e) {
  console.log('Error loading extension:', e.message);
  console.log(e.stack);
}
