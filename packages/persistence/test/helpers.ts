import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { ProjectStore } from '../src/index.ts';

export const PROJECT = { id: 'prj_test000001', name: 'teste' };

/** Diretório temporário com espaço e acento, removido ao fim do arquivo de teste. */
const opened: ProjectStore[] = [];

/** Diretório temporário com espaço e acento; ao fim fecha os bancos abertos (Windows não apaga arquivo aberto) e remove. */
export function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aer db ç '));
  afterAll(() => {
    for (const s of opened.splice(0)) {
      try {
        s.close();
      } catch {
        // já fechado pelo próprio teste
      }
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return dir;
}

export function openStore(file: string): ProjectStore {
  const s = ProjectStore.open(file, PROJECT, { actor: 'test' });
  opened.push(s);
  return s;
}
