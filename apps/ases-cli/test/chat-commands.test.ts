import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter, updatePrefs } from '@aer/project-store';
import { CHAT_ALIASES, resolveTaskRef } from '../src/chat-commands.ts';
import { decidePlanMode } from '../src/chat-session.ts';
import { handleLine } from '../src/commands.ts';
import { Engine } from '../src/engine.ts';

const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
let engine: Engine;
let root: string;
const say = async (line: string) => String(await handleLine(engine, line));

beforeAll(async () => {
  // config global isolada: a do usuário nunca entra nos testes
  const home = mkdtempSync(path.join(os.tmpdir(), 'aer-chat-home-'));
  dirs.push(home);
  process.env.XDG_CONFIG_HOME = home;
  process.env.APPDATA = home;
  root = mkdtempSync(path.join(os.tmpdir(), 'aer chat cmd ç '));
  dirs.push(root);
  g(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.invalid'], ['commit.gpgsign', 'false']]) g(root, 'config', k!, v!);
  initProject(root, adapter, 'chat');
  writeFileSync(path.join(root, '.gitignore'), '.ases/db/\n.ases/worktrees/\n.ases/evidence/\n.ases/handoffs/\n.ases/reviews/\n');
  const cfg = JSON.parse(readFileSync(path.join(root, '.ases', 'CONFIG.json'), 'utf8'));
  writeFileSync(path.join(root, '.ases', 'CONFIG.json'), JSON.stringify({ ...cfg, chat: { main: 'simulator', crossReview: false } }, null, 2));
  writeFileSync(path.join(root, 'README.md'), '# chat\n');
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '-m', 'base');
  engine = await Engine.start(root, adapter, { simulators: 3 });
}, 60_000);
afterAll(async () => {
  await engine?.stop();
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
});

describe('chat engine and simple commands (PHASE-18, TAR-0086)', () => {
  it('short task numbers resolve: 12 == TAR-0012', () => {
    expect(resolveTaskRef('12')).toBe('TAR-0012');
    expect(resolveTaskRef('TAR-0012')).toBe('TAR-0012');
    expect(() => resolveTaskRef('doze')).toThrow(/INVALID_INPUT|tarefa/);
  });

  it('hybrid runs small consented plans and asks otherwise', () => {
    const plan = (n: number, provider = 'codex') => ({ tasks: Array.from({ length: n }, () => ({ provider })) });
    expect(decidePlanMode('manual', plan(1), new Set(['codex']))).toBe('ask');
    expect(decidePlanMode('auto', plan(5), new Set())).toBe('run');
    expect(decidePlanMode('hybrid', plan(3), new Set(['codex']))).toBe('run');
    expect(decidePlanMode('hybrid', plan(4), new Set(['codex']))).toBe('ask');
    expect(decidePlanMode('hybrid', plan(1), new Set())).toBe('ask');
    expect(decidePlanMode('hybrid', plan(2, 'simulator-2'), new Set())).toBe('run');
  });

  it('plain text goes to the main and the reply is printed', async () => {
    expect(await say('olá')).toContain('simulator> SIMULATED: entendi — olá');
  });

  it('every Portuguese command has its English alias', async () => {
    expect(CHAT_ALIASES).toMatchObject({ '/help': '/ajuda', '/model': '/modelo', '/agent': '/ia', '/agents': '/ias', '/plan': '/plano', '/diff': '/ver', '/accept': '/aceitar', '/redo': '/refazer', '/assign': '/trocar', '/undo': '/desfazer', '/stop': '/parar', '/new': '/nova', '/settings': '/config', '/about': '/sobre', '/exit': '/sair', '/update': '/atualizar' });
    for (const [en, pt] of [['/help', '/ajuda'], ['/about', '/sobre'], ['/model', '/modelo'], ['/agent', '/ia'], ['/settings', '/config']]) expect(await say(en!)).toBe(await say(pt!));
  });

  it('/ia shows and switches the main; /ias lists ready IAs', async () => {
    expect(await say('/ia')).toMatch(/principal: simulator/);
    expect(await say('/ia simulator-2')).toMatch(/principal agora: simulator-2/);
    expect(await say('/ia nao-existe')).toMatch(/IA desconhecida/);
    expect(await say('/ia simulator')).toMatch(/principal agora: simulator/);
    const ias = await say('/ias');
    expect(ias).toMatch(/simulator-3\s+READY/);
    expect(ias).toMatch(/principal/);
  });

  it('/desfazer restores the last main edit and refuses after user edits', async () => {
    expect(await say('edite o readme')).toMatch(/editei SIMULATED\/CHAT\.md/);
    expect(existsSync(path.join(root, 'SIMULATED', 'CHAT.md'))).toBe(true);
    expect(await say('/desfazer')).toMatch(/desfeito: SIMULATED\/CHAT\.md/);
    expect(existsSync(path.join(root, 'SIMULATED', 'CHAT.md'))).toBe(false);
    await say('edite o readme');
    writeFileSync(path.join(root, 'SIMULATED', 'CHAT.md'), 'o usuário mexeu\n');
    expect(await say('/desfazer')).toMatch(/não desfiz.*SIMULATED\/CHAT\.md/);
    rmSync(path.join(root, 'SIMULATED'), { recursive: true, force: true });
  });

  it('/plano, /plano executar, /cancel without TAR discards the plan', async () => {
    const proposed = await say('divida em tarefas o cadastro');
    expect(proposed).toMatch(/Plano PLN-\d{4} \(3 tarefas\)/);
    expect(proposed).toMatch(/1\. Parte 1 → simulator-2/);
    expect(await say('/plano')).toMatch(/Parte 3 → .* depois de 1/);
    expect(await say('/plano editar 1 provider=simulator-3')).toMatch(/1\. Parte 1 → simulator-3/);
    expect(await say('/cancel')).toMatch(/plano .* descartado/);
    expect(await say('/plano')).toMatch(/nenhum plano pendente/);
    await say('divida em tarefas o cadastro');
    const out = await say('/plano executar');
    expect(out).toMatch(/TAR-\d{4} simulator-\d? ?\S* REVIEW/);
    expect(out).toMatch(/simulator> SIMULATED: resumo — 3 tarefas/);
    expect(await say('/tarefas')).toMatch(/REVIEW/);
    expect(await say('/ver 1')).toMatch(/TAR-0001 ATT-0001/);
  }, 120_000);

  it('/aceitar merges REVIEW tasks of the conversation into the current branch', async () => {
    const out = await say('/aceitar');
    expect(out).toMatch(/TAR-0001: integrada/);
    expect(g(root, 'log', '--oneline')).toMatch(/TAR-0001/);
  }, 60_000);

  it('/auto toggles the mode and the next plan runs without asking', async () => {
    expect(await say('/auto')).toMatch(/modo automático ligado/);
    const out = await say('divida em tarefas o relatório');
    expect(out).toMatch(/resumo — 3 tarefas/);
    expect(await say('/auto')).toMatch(/modo automático desligado/);
  }, 120_000);

  it('/config shows effective values and consentir records an approval', async () => {
    expect(await say('/config')).toMatch(/principal: simulator \(\.ases\/CONFIG\.json\)/);
    expect(await say('/config consentir claude')).toMatch(/claude autorizada nesta sessão/);
    expect(engine.store.eventsSince(0, 100_000).some((e) => e.eventType === 'ApprovalGranted' && e.payload.scope === 'provider-session' && e.payload.providerId === 'claude')).toBe(true);
    expect(await say('/config revogar claude')).toMatch(/claude revogada/);
    expect(await say('/config limite simulator-2 2')).toMatch(/confirme com --sim/);
    expect(await say('/config limite simulator-2 2 --sim')).toMatch(/simulator-2: 2 sessões/);
    expect(await say('/config teste node -e process.exit(0)')).toMatch(/comando de teste: node -e process\.exit\(0\)/);
  });

  it('/sobre prints the literal about text', async () => {
    expect(await say('/sobre')).toBe('⌘ Eureka42 · ASES Engineering Runtime (AER) 1.8.0\nO Eureka42 é uma iniciativa dos Professores Raul el Greco, Giuseppe Favato e Elzo Brito.\nASES-300/500: metodologia dos Profs. Raul el Greco e Giuseppe Favato. ESAA: governança de agentes do Prof. Elzo Brito.\nJuntos: a metodologia diz o que construir e com que critério; o ESAA garante que cada IA mexa só no que deve e aprenda com os erros.\neureka42.org · Licença CC BY-NC-ND 4.0');
  });

  it('/verificar rebuilds the state from the history; /metricas summarizes each AI (PHASE-26, ESAA)', async () => {
    expect(await say('/verificar')).toMatch(/^Verificação: OK · \d+ eventos · \d+ itens conferidos com o histórico/);
    expect(await say('/verificar')).toMatch(/cadeia de integridade íntegra até o evento \d+ \([0-9a-f]{12}…\)/);
    expect(await say('/verificar fixar')).toMatch(/ponto fixado no evento \d+/);
    expect(await say('/verificar')).toMatch(/ponto fixado em .* confere/);
    expect(await say('/metricas')).toMatch(/nenhuma tarefa executada|Métricas por IA/);
  });

  it('/problema reports, /problemas lists, /problema resolver closes it (PHASE-27, ESAA issues)', async () => {
    expect(await say('/problemas')).toMatch(/nenhum problema/);
    expect(await say('/problema Login falha :: senha certa dá erro 500 :: entrar com admin/admin')).toMatch(/ISS-0001 registrado/);
    expect(await say('/problema sem sintoma')).toMatch(/uso:/);
    expect(await say('/problemas')).toContain('ISS-0001 OPEN · Login falha\n    sintoma: senha certa dá erro 500\n    reproduzir: entrar com admin/admin');
    expect(await say('/problema resolver ISS-0001 corrigido na validação')).toMatch(/ISS-0001 resolvido/);
    expect(engine.store.listIssues()[0]).toMatchObject({ state: 'RESOLVED', resolution: 'corrigido na validação' });
    expect(await say('/problema corrigir ISS-0001')).toMatch(/já está resolvido/);
    await say('/problema Busca lenta :: demora 10 s');
    const out = await say('/problema corrigir ISS-0002');
    expect(out).toMatch(/Plano PLN-\d+ \(3 tarefas\)/); // a principal recebeu o problema e propôs a correção ("divida em tarefas")
    expect(engine.store.listChatMessages(engine.store.currentConversation()!.id).some((m) => m.role === 'user' && m.text.startsWith('Corrija o problema ISS-0002: Busca lenta.\nSintoma: demora 10 s'))).toBe(true);
    expect(out).toMatch(/Depois de conferir: \/problema resolver ISS-0002/);
    await say('/cancel');
  });

  it('/exportar-esaa writes the history as the ESAA activity.jsonl (PHASE-27)', async () => {
    const out = await say('/exportar-esaa');
    expect(out).toMatch(/\d+ eventos em \.ases\/esaa\/\.roadmap\/activity\.jsonl/);
    expect(out).toMatch(/esaa --root \.ases\/esaa project/);
    const { existsSync } = await import('node:fs');
    expect(existsSync(path.join(engine.projectRoot, '.ases', 'esaa', '.roadmap', 'activity.jsonl'))).toBe(true);
  });

  it('/licao records an approved lesson; /licoes lists; /licao arquivar removes it from the prompts (PHASE-25, ESAA)', async () => {
    expect(await say('/licoes')).toMatch(/nenhuma lição/);
    expect(await say('/licao Sempre rode os testes antes de entregar')).toMatch(/LES-0001 aprovada/);
    expect(engine.store.activeLessons().map((l) => l.text)).toEqual(['Sempre rode os testes antes de entregar']);
    expect(await say('/licoes')).toMatch(/LES-0001 ACTIVE · Sempre rode os testes/);
    expect(await say('/licao arquivar LES-0001')).toMatch(/LES-0001 arquivada/);
    expect(engine.store.activeLessons()).toEqual([]);
    expect(await say('/licao arquivar LES-0099')).toMatch(/erro/);
  });

  it('a proposed lesson shows in /licoes with how to approve it (PHASE-26)', async () => {
    const id = engine.mutate((s) => s.addLesson({ text: 'Sugerida pela IA', source: 'CNV-0001' }));
    expect(await say('/licoes')).toContain(`${id} PROPOSED · Sugerida pela IA (sugerida em CNV-0001; /licao aprovar ${id})`);
    expect(await say(`/licao aprovar ${id}`)).toMatch(/aprovada: entra nas próximas tarefas/);
    engine.mutate((s) => s.setLessonState(id, 'ARCHIVED', 'teste'));
  });

  it('/ajuda avançado still lists /phase, /task, /run, /gate', async () => {
    const adv = await say('/ajuda avançado');
    for (const c of ['/phase new', '/task new', '/run', '/gate']) expect(adv).toContain(c);
    const basic = await say('/ajuda');
    for (const c of ['/ia', '/plano', '/aceitar', '/desfazer', '/sobre']) expect(basic).toContain(c);
  });

  it('old technical commands keep working (/phase new, /task new, /run)', async () => {
    expect(await say('/phase new Manual')).toMatch(/criada PHASE-\d{2}/);
    const ph = engine.store.listPhases().at(-1)!.id;
    expect(await say(`/task new ${ph} manual --provider simulator`)).toMatch(/criada TAR-\d{4}/);
    expect(await say(`/tasks ${ph}`)).toMatch(/manual/); // com argumento, /tasks é o técnico
  });

  it('/nova starts a new conversation', async () => {
    const before = engine.store.currentConversation()!.id;
    expect(await say('/nova')).toMatch(/nova conversa CNV-\d{4}/);
    expect(engine.store.currentConversation()!.id).not.toBe(before);
  });

  it('a real provider without consent is never asked to work', async () => {
    mkdirSync(path.join(root, 'x'), { recursive: true });
    expect(await say('/ia claude')).toMatch(/principal agora: claude/);
    expect(await say('olá')).toMatch(/CONSENT_REQUIRED|autorize/);
    await say('/ia simulator');
  });

  it('/config atualizacao: automática por padrão, dá para só avisar ou desligar (PHASE-28)', async () => {
    expect(await say('/config')).toMatch(/atualização: auto/);
    expect(await say('/config atualizacao avisar')).toMatch(/só avisa/);
    expect(updatePrefs().mode).toBe('avisar');
    expect(await say('/config atualizacao off')).toMatch(/não consulta o npm/);
    expect(await say('/config atualizacao talvez')).toMatch(/auto\|avisar\|off/);
    expect(await say('/config atualizacao auto')).toMatch(/instala sozinha/);
  });
});
