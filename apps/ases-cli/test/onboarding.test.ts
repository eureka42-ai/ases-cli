import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter } from '@aer/project-store';
import { handleLine } from '../src/commands.ts';
import { Engine } from '../src/engine.ts';
import { githubCreateArgs } from '../src/onboarding.ts';

const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

describe('/iniciar-projeto: ASES-500 → requisitos → ASES-300 → GitHub (PHASE-23)', () => {
  it('guides the whole methodology in the chat and can be resumed', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'aer iniciar ç '));
    dirs.push(root);
    initProject(root, adapter, 'novo');
    const e = await Engine.start(root, adapter, { simulators: 1 });
    const say = async (line: string) => String(await handleLine(e, line));
    try {
      const first = await say('/iniciar-projeto');
      expect(first).toMatch(/Git iniciado/); // pasta nova sem Git
      expect(first).toMatch(/G0: PASS/);
      expect(first).toMatch(/Pergunta A\.1 \(1\/\d+\)/);
      expect(await say('Agendamento de consultas para clínicas')).toMatch(/Pergunta A\.2/);
      expect(e.store.listDecisions().at(-1)).toMatchObject({ questionId: 'A.1', state: 'CONFIRMED' });
      expect(await say('/proposta talvez login por e-mail')).toMatch(/Pergunta A\.3/);
      expect(e.store.listDecisions().at(-1)).toMatchObject({ questionId: 'A.2', state: 'PROPOSED' });
      // retomar: sair e chamar de novo continua na próxima pergunta em aberto
      expect(await say('/sair-entrevista')).toMatch(/continue com \/iniciar-projeto/);
      expect(await say('olá')).not.toMatch(/Pergunta/); // texto livre volta a ir para a principal
      expect(await say('/iniciar-projeto')).toMatch(/Pergunta A\.3/);
      // o resto da entrevista: N/A em tudo (teste)
      let out = '';
      for (let i = 0; i < 400 && !/Requisitos do seu sistema/.test(out); i++) out = await say('/na não se aplica a este teste');
      expect(out).toMatch(/Requisitos do seu sistema/);
      expect(out).toMatch(/seu nome/);
      expect(await say('Prof. Teste')).toMatch(/um por linha/);
      expect(await say('Agendar consulta :: paciente escolhe horário livre e recebe confirmação')).toMatch(/REQ-301 criado e aprovado/);
      expect(e.store.getRequirement('REQ-301')).toMatchObject({ approvedBy: 'Prof. Teste', acceptance: 'paciente escolhe horário livre e recebe confirmação' });
      expect(await say('sem critério')).toMatch(/formato/);
      out = await say('/pronto');
      expect(out).toMatch(/ASES-300/);
      expect(out).toMatch(/REQ-001 \(1\/300\)/);
      expect(await say('')).toMatch(/REQ-002 \(2\/300\)/); // Enter = se aplica
      expect(await say('/na fora do escopo do teste')).toMatch(/REQ-003 \(3\/300\)/);
      expect(e.store.getRequirement('REQ-002')!.status).toBe('N/A');
      out = await say('/aplicar-resto');
      expect(out).toMatch(/G1: (PASS|FAIL)/);
      expect(out).toMatch(/Criar o repositório no GitHub/);
      expect(out).toMatch(/privado/);
      expect(await say('/github nao')).toMatch(/projeto iniciado/i);
      expect(await say('olá')).not.toMatch(/REQ-0/); // modo guiado terminou
    } finally {
      await e.stop();
    }
  }, 120_000);

  it('the GitHub repo is private by default and created from this folder with the official gh', () => {
    expect(githubCreateArgs('meu-sistema', false)).toEqual(['repo', 'create', 'meu-sistema', '--private', '--source', '.', '--remote', 'origin', '--push']);
    expect(githubCreateArgs('meu-sistema', true)).toContain('--public');
    expect(() => githubCreateArgs('nome; rm -rf', false)).toThrow(/nome de repositório inválido/);
  });
});
