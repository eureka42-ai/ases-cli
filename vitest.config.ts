import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// config pessoal isolada para TODOS os testes (e os processos que eles abrem): nada escreve na ~/.config/ases
// nem no %APPDATA%\ases de quem roda a suíte (projetos recentes, autorização das IAs); AER_LANG: a interface em
// português, qualquer que seja o idioma da máquina (1.4.0)
const configHome = mkdtempSync(path.join(os.tmpdir(), 'aer-test-config-'));

export default defineConfig({
  // "source" aponta os pacotes do workspace para src/*.ts (sem build na PHASE-01)
  // (testes rodam no ambiente SSR do vite, que usa ssr.resolve, não resolve.conditions)
  ssr: { resolve: { conditions: ['source'] } },
  test: { env: { XDG_CONFIG_HOME: configHome, APPDATA: configHome, AER_LANG: 'pt' }, include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}', 'test/**/*.test.mjs'], testTimeout: 20000 },
});
