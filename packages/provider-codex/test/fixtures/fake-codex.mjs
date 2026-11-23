#!/usr/bin/env node
// FALSO `codex` para testes. NÃO é o Codex CLI: reproduz o formato DOCUMENTADO (fixtures doc-derived-*).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, `${JSON.stringify({ args, envKeys: Object.keys(process.env).sort() })}\n`);
const out = (s) => new Promise((r) => process.stdout.write(s, r));
if (args[0] === '--version') { await out(`codex-cli ${process.env.FAKE_VERSION ?? '0.170.0'}\n`); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') {
  // como o codex 0.170.0 real (verificado): o status vai para o stderr
  const err = (s) => new Promise((r) => process.stderr.write(s, r));
  if (process.env.FAKE_AUTH === 'none') { await err('Not logged in\n'); process.exit(1); }
  await err('Logged in using ChatGPT\n'); process.exit(0);
}
if (args[0] !== 'exec') { process.stderr.write('fake-codex: unexpected args\n'); process.exit(64); }
const cwd = args[args.indexOf('-C') + 1];
const scenario = process.env.FAKE_SCENARIO ?? 'ok';
if (scenario === 'hang') await new Promise(() => setInterval(() => {}, 1 << 30));
const lines = readFileSync(path.join(here, `doc-derived-${scenario}.jsonl`), 'utf8').replaceAll('__CWD__', cwd.replaceAll('\\', '/')).split('\n').filter(Boolean);
for (const l of lines) await out(`${l}\n`);
if (scenario === 'ok') writeFileSync(path.join(cwd, 'NOTA.md'), 'escrito pelo falso codex\n');
process.exit(scenario === 'ok' || scenario === 'noresult' ? 0 : 1);
