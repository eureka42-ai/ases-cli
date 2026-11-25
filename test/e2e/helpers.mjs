import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BIN = {
  ases: path.join(repo, 'apps/ases-cli/bin/ases.js'),
  tar: path.join(repo, 'apps/ases-tar/bin/ases-tar.js'),
};

/** Os E2E usam os bins compilados (npm run build), como um usuário usaria. */
export function requireBuild() {
  for (const f of ['apps/ases-cli/dist/main.js', 'apps/ases-tar/dist/main.js']) {
    if (!existsSync(path.join(repo, f))) throw new Error(`${f} missing: run \`npm run build\` first`);
  }
}

export function tempProject(name = 'e2e proj ç') {
  const dir = mkdtempSync(path.join(os.tmpdir(), `${name} `));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

// config pessoal isolada: os e2e nunca escrevem na ~/.config/ases (ou %APPDATA%\\ases) de quem roda os testes
const configHome = mkdtempSync(path.join(os.tmpdir(), 'aer-e2e-config-'));
export const isolatedConfigEnv = { XDG_CONFIG_HOME: configHome, APPDATA: configHome };
const env = { ...process.env, NO_COLOR: undefined, FORCE_COLOR: undefined, ...isolatedConfigEnv };
export const runSync = (bin, args, cwd, extraEnv = {}, timeout = 15_000) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...env, ...extraEnv }, timeout, input: '' });

/** Processo real com captura de stdout/stderr e espera por texto. */
export function start(bin, args, cwd, extraEnv = {}) {
  const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8').on('data', (d) => (out.stdout += d));
  child.stderr.setEncoding('utf8').on('data', (d) => (out.stderr += d));
  const exited = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  return {
    child, out, exited,
    send: (line) => child.stdin.write(`${line}\n`),
    async waitFor(stream, test, timeoutMs = 10_000) {
      const t0 = Date.now();
      while (!(typeof test === 'function' ? test(out[stream]) : out[stream].includes(test))) {
        if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting on ${stream} for ${String(test)}\n--- stdout\n${out.stdout}\n--- stderr\n${out.stderr}`);
        await new Promise((r) => setTimeout(r, 25));
      }
    },
  };
}

export const jsonl = (text) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** PHASE-18: grava `chat.main = simulator` no CONFIG do projeto (o assistente de primeiro uso não abre; nenhuma IA real roda). */
export function useSimulatedMain(dir) {
  const file = path.join(dir, '.ases', 'CONFIG.json');
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, `${JSON.stringify({ ...cfg, chat: { ...(cfg.chat ?? {}), main: 'simulator' } }, null, 2)}\n`);
}
