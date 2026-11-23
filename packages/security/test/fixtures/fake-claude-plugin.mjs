#!/usr/bin/env node
// Falso `claude` para os comandos oficiais de plugin; registra o argv em FAKE_LOG.
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\n');
if (args[0] === 'plugin' && args[1] === 'list') {
  process.stdout.write(JSON.stringify(JSON.parse(process.env.FAKE_PLUGINS ?? '[]')));
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'install') {
  process.stdout.write(JSON.stringify({ ok: true, installed: args[2] }) + '\n');
  process.exit(0);
}
process.exit(2);
