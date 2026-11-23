#!/usr/bin/env node
// FALSO `claude` para testes. NÃO é o Claude Code: reproduz o formato DOCUMENTADO (fixtures doc-derived-*),
// registra argv/env para os testes e escreve o arquivo que a fixture "ok" anuncia.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, `${JSON.stringify({ args, envKeys: Object.keys(process.env).sort() })}\n`);
const out = (s) => new Promise((r) => process.stdout.write(s, r));
if (args[0] === '--version') { await out(`${process.env.FAKE_VERSION ?? '2.1.330'} (Claude Code)\n`); process.exit(0); }
if (args[0] === 'auth' && args[1] === 'status') {
  const auth = process.env.FAKE_AUTH ?? 'ok';
  await out(JSON.stringify(auth === 'none' ? { loggedIn: false } : { loggedIn: true, authMethod: 'claude.ai', loginExpiresAt: auth === 'expired' ? '2000-01-01T00:00:00.000Z' : '2999-01-01T00:00:00.000Z', email: 'pessoa@example.invalid' }) + '\n');
  process.exit(auth === 'none' ? 1 : 0);
}
if (args[0] !== '-p') { process.stderr.write('fake-claude: unexpected args\n'); process.exit(64); }
const scenario = process.env.FAKE_SCENARIO ?? 'ok';
if (scenario === 'hang') await new Promise(() => setInterval(() => {}, 1 << 30));
const lines = readFileSync(path.join(here, `doc-derived-${scenario}.jsonl`), 'utf8').replaceAll('__CWD__', process.cwd().replaceAll('\\', '/')).split('\n').filter(Boolean);
for (const l of lines) { const cut = Math.floor(l.length / 2); await out(l.slice(0, cut)); await out(`${l.slice(cut)}\n`); }
if (scenario === 'ok') writeFileSync('NOTA.md', 'escrito pelo falso claude\n');
process.exit(scenario === 'auth' || scenario === 'ratelimit' ? 1 : 0);
