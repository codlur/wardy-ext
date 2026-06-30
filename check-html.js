const fs = require('fs');
const js = fs.readFileSync('D:/wardy-ext/out/extension.js', 'utf8');

// Find the getHtml function
const fnStart = js.indexOf('function getHtml');
const fnEnd = js.indexOf('\nfunction activate', fnStart);
const fnBody = js.substring(fnStart, fnEnd);

// Extract the return template literal
// Find the last occurrence of "return `" in the function
let searchFrom = fnBody.indexOf('return `');
if (searchFrom === -1) {
  console.log('Could not find return template literal');
  process.exit(1);
}

// Extract the script content from the return value
const scriptStart = fnBody.indexOf('<script>');
const scriptEnd = fnBody.indexOf('</script>');
if (scriptStart === -1 || scriptEnd === -1) {
  console.log('Could not find script tags');
  process.exit(1);
}

const rawScript = fnBody.substring(scriptStart + '<script>'.length, scriptEnd);
console.log('Script chunk length:', rawScript.length);

// Check for common issues
if (rawScript.includes('undefined')) {
  console.log('WARNING: Contains undefined');
}
if (rawScript.includes('[object Object]')) {
  console.log('WARNING: Contains [object Object]');
}
if (rawScript.includes('function renderActivity')) {
  console.log('renderActivity found');
}
if (rawScript.includes('function showSessionDetail')) {
  console.log('showSessionDetail found');
}
if (rawScript.includes('function showConversation')) {
  console.log('showConversation found');
}
if (rawScript.includes('function renderMessageContent')) {
  console.log('renderMessageContent found');
}
if (rawScript.includes('function formatTokens')) {
  console.log('formatTokens found');
}
if (rawScript.includes('function escapeHtml')) {
  console.log('escapeHtml found');
}
if (rawScript.includes('function esc')) {
  console.log('esc found');
}
if (rawScript.includes('let sessionSort')) {
  console.log('sessionSort found');
}
if (rawScript.includes('let sessions')) {
  console.log('sessions found');
}

// Check for HTML entities that shouldn't be in JS
const htmlEntities = rawScript.match(/&[a-z]+;/g);
if (htmlEntities) {
  console.log('HTML entities in JS:', [...new Set(htmlEntities)]);
}

// Check that key functions don't have &lt; or &gt; inside them
// (which would indicate HTML encoding of JS code)
if (rawScript.includes('&lt;')) {
  console.log('WARNING: Contains &lt; - JS might be HTML-encoded');
}
if (rawScript.includes('&gt;')) {
  console.log('WARNING: Contains &gt; - JS might be HTML-encoded');
}

console.log('\n--- First 200 chars of script ---');
console.log(rawScript.substring(0, 200));
