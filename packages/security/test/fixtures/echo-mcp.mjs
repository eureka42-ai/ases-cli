#!/usr/bin/env node
// Servidor MCP stdio mínimo para testes: initialize + tools/list. MODE=hang não responde; MODE=die sai logo.
const mode = process.env.MODE ?? 'ok';
if (mode === 'die') process.exit(3);
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (mode === 'hang') continue;
    if (m.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'echo', version: '1.0.0' } } }) + '\n');
    if (m.method === 'tools/list') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'echo' }, { name: 'sum' }] } }) + '\n');
  }
});
