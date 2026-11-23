import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { ProjectStore } from '../src/index.ts';

export const PROJECT = { id: 'prj_test000001', name: 'teste' };

/** Diretório temporário com espaço e acento, removido ao fim do arquivo de teste. */
export function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aer db ç '));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export const openStore = (file: string): ProjectStore => ProjectStore.open(file, PROJECT, { actor: 'test' });
