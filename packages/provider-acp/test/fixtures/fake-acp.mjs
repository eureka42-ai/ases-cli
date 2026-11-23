#!/usr/bin/env node
// Falso servidor ACP v1 para testes (formato do handshake real observado em kimi 1.50.0 / opencode 1.19.6; prompt derivado da documentação).
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const log = (x) => process.env.FAKE_LOG && appendFileSync(process.env.FAKE_LOG, JSON.stringify(x) + '\n');
const out = (m) => new Promise((r) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n', r));
if (args[0] === '--version') { await out0(`fake-acp, version ${process.env.FAKE_VERSION ?? '1.50.0'}\n`); process.exit(0); }
async function out0(s) { await new Promise((r) => process.stdout.write(s, r)); }
log({ args, envKeys: Object.keys(process.env), cwd: process.cwd() });
const scenario = process.env.FAKE_SCENARIO ?? 'ok';
let cwd = process.cwd();
let buf = '';
const waiting = new Map();
let nextId = 100;
const ask = (method, params) => new Promise((res) => { const id = nextId++; waiting.set(id, res); out({ id, method, params }); });
const update = (sessionId, u) => out({ method: 'session/update', params: { sessionId, update: u } });
process.stdin.on('data', async (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    log({ recv: m });
    if (!m.method && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); continue; }
    if (m.method === 'initialize') await out({ id: m.id, result: { protocolVersion: scenario === 'v2' ? 2 : 1, agentCapabilities: {}, agentInfo: { name: 'Fake ACP', version: '1.50.0' }, authMethods: [{ id: 'login', name: 'Login' }] } });
    else if (m.method === 'session/new') {
      cwd = m.params.cwd;
      if (scenario === 'auth') await out({ id: m.id, error: { code: -32000, message: 'Authentication required' } });
      else if (scenario === 'noresult') process.exit(0);
      else { await out({ id: m.id, result: { sessionId: 'sess-1' } }); await update('sess-1', { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'yolo' }] }); }
    } else if (m.method === 'session/prompt') {
      const sid = m.params.sessionId;
      if (scenario === 'garbage') { await new Promise((r) => process.stdout.write('{not json\n', r)); }
      await update(sid, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'pensando sk-abcdefghijklmnopqrstuv' } });
      await update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Vou ' } });
      await update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'criar o arquivo.' } });
      const target = scenario === 'escape' ? '/etc/aer-fake-escape.txt' : path.join(cwd, 'NOTA.md');
      const kind = scenario === 'shell' ? 'execute' : 'edit';
      await update(sid, { sessionUpdate: 'tool_call', toolCallId: 't1', title: kind === 'execute' ? 'rm -rf /' : 'Write NOTA.md', kind, status: 'pending', locations: kind === 'execute' ? [] : [{ path: target }], rawInput: { content: 'segredo sk-abcdefghijklmnopqrstuv' } });
      const r = await ask('session/request_permission', { sessionId: sid, toolCall: { toolCallId: 't1' }, options: [{ optionId: 'a1', name: 'Allow', kind: 'allow_once' }, { optionId: 'a2', name: 'Always', kind: 'allow_always' }, { optionId: 'r1', name: 'Reject', kind: 'reject_once' }] });
      const granted = r.result?.outcome?.optionId === 'a1';
      if (granted && kind === 'edit' && scenario !== 'escape') writeFileSync(target, '# nota\n');
      await update(sid, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: granted ? 'completed' : 'failed' });
      if (scenario === 'fsread') { const fr = await ask('fs/read_text_file', { sessionId: sid, path: path.join(cwd, 'x') }); log({ fsReply: fr }); }
      await update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: granted ? 'Pronto.' : 'Não tive permissão.' } });
      if (scenario === 'hang') await new Promise(() => {});
      await out({ id: m.id, result: { stopReason: scenario === 'refusal' ? 'refusal' : 'end_turn' } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
