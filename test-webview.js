const fs = require('fs');
const js = fs.readFileSync('D:/wardy-ext/out/extension.js', 'utf8');

const scriptMatch = js.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log('Could not find script section'); process.exit(1); }

const webviewJS = scriptMatch[1];
try {
  new Function(webviewJS);
  console.log('SUCCESS: Webview JS syntax is valid');
} catch(e) {
  console.log('ERROR: ' + e.message);
  const lines = webviewJS.split('\n');
  const lineMatch = e.stack.match(/:(\d+):/);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1]);
    console.log('Line ' + lineNum + ': ' + (lines[lineNum-1] || ''));
  }
}
