import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chatConfig, initProject, loadPlatformAdapter } from '@aer/project-store';
import { KEYS, UiContext, renderForTest, type Ui } from '@aer/tui-shared';
import { filterMenu } from '../src/chat-commands.ts';
import { Engine } from '../src/engine.ts';
import { AsesApp } from '../src/tui.tsx';
import { Wizard, suggestTestCommand } from '../src/wizard.tsx';

const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const txt = (r: { lastFrame(): string }) => r.lastFrame().replace(/\u001b\[[0-9;]*m/g, '');
const ui = (over: Partial<Ui> = {}): Ui => ({ color: false, unicode: true, theme: 'green', ...over });
type R = Awaited<ReturnType<typeof renderForTest>>;
const type = async (r: R, s: string) => {
  for (const ch of s) await r.press(ch);
};
async function until(r: R, test: (s: string) => boolean, ms = 30_000): Promise<string> {
  const t0 = Date.now();
  while (!test(txt(r))) {
    if (Date.now() - t0 > ms) throw new Error(`timeout; frame:\n${txt(r)}`);
    await new Promise((x) => setTimeout(x, 50));
  }
  return txt(r);
}

async function project(chat: Record<string, unknown> | null): Promise<{ root: string; e: Engine }> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aer tui chat ç '));
  dirs.push(root);
  g(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.invalid'], ['commit.gpgsign', 'false']]) g(root, 'config', k!, v!);
  initProject(root, adapter, 'tui-chat');
  if (chat) {
    const cfg = JSON.parse(readFileSync(path.join(root, '.ases', 'CONFIG.json'), 'utf8'));
    writeFileSync(path.join(root, '.ases', 'CONFIG.json'), JSON.stringify({ ...cfg, chat }, null, 2));
  }
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '-m', 'base');
  return { root, e: await Engine.start(root, adapter, { simulators: 3 }) };
}

beforeAll(() => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'aer-tui-home-'));
  dirs.push(home);
  process.env.XDG_CONFIG_HOME = home;
  process.env.APPDATA = home;
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

describe('ases chat TUI (PHASE-18, TAR-0087)', () => {
  it('shows the green banner at 80 cols and the compact logo at 50', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    const wide = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 80, 30);
    const f = await until(wide, (s) => s.includes('principal: simulator'));
    expect(f).toContain('███████╗██╗   ██╗');
    expect(f).toContain('eureka42.org');
    expect(f).toMatch(/LIVE/);
    wide.unmount();
    const narrow = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 50, 16);
    expect(txt(narrow)).not.toContain('███');
    expect(txt(narrow)).toContain('⌘ Eureka42 | ASES CLI');
    narrow.unmount();
    await e.stop();
  });

  it('typing / opens the menu and /a filters to /ajuda /aceitar /auto', async () => {
    expect(filterMenu('/a').map((m) => m.cmd)).toEqual(['/ajuda', '/auto', '/aceitar', '/atualizar']);
    const { e } = await project({ main: 'simulator', crossReview: false });
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 100, 30);
    await type(r, '/');
    expect(txt(r)).toContain('/desfazer');
    await type(r, 'a');
    const f = txt(r);
    for (const c of ['/ajuda', '/aceitar', '/auto']) expect(f).toContain(c);
    expect(f).not.toContain('/desfazer');
    await r.press(KEYS.down);
    await r.press(KEYS.tab); // completa com o item selecionado
    expect(txt(r)).toMatch(/> \/auto ?█/);
    r.unmount();
    await e.stop();
  });

  it('a split request shows the plan box; Enter runs it; progress lines appear', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 120, 40);
    await type(r, 'divida em tarefas o cadastro');
    await r.press(KEYS.enter);
    await until(r, (s) => /Plano PLN-0001 \(3 tarefas\)/.test(s));
    expect(txt(r)).toMatch(/\[Enter\] executar  \[Ctrl\+E\] editar  \[Ctrl\+N\] descartar/);
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('resumo — 3 tarefas'), 90_000);
    expect(txt(r)).toMatch(/TAR-000\d simulator-\d +(RUNNING|REVIEW)/);
    r.unmount();
    await e.stop();
  }, 120_000);

  it('Ctrl+N discards the plan; Ctrl+E edits item 1; typing n/e starts a normal message (review I2)', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 120, 40);
    await type(r, 'divida em tarefas o cadastro');
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('Plano PLN-0001'));
    await type(r, 'não gostei');
    expect(txt(r)).toMatch(/> não gostei█/); // n e e começam mensagens normais
    for (let i = 0; i < 10; i++) await r.press(KEYS.backspace);
    expect(e.store.getPlan('PLN-0001')!.state).toBe('PENDING');
    await r.press('\u0005'); // Ctrl+E
    expect(txt(r)).toMatch(/> \/plano editar 1 provider=█/);
    await type(r, 'simulator-3');
    await r.press(KEYS.enter);
    await until(r, (s) => /1\. Parte 1 → simulator-3/.test(s));
    await r.press('\u000e'); // Ctrl+N
    await until(r, (s) => /plano PLN-0002 descartado/.test(s));
    expect(e.store.getPlan('PLN-0002')!.state).toBe('CANCELLED');
    r.unmount();
    await e.stop();
  }, 60_000);

  it('consent dialog appears for a real provider and nothing runs before s', async () => {
    const { e } = await project({ main: 'claude', crossReview: false });
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 120, 30);
    await type(r, 'olá');
    await r.press(KEYS.enter);
    await until(r, (s) => /Autorizar o uso da sua conta claude\?/.test(s));
    expect(e.store.eventsSince(0, 10_000).some((x) => x.eventType === 'ProviderDetected')).toBe(false);
    await r.press('n');
    await until(r, (s) => s.includes('não autorizado'));
    expect(e.store.listChatMessages(e.store.currentConversation()!.id).map((m) => m.role)).toEqual(['user']);
    r.unmount();
    await e.stop();
  });

  it('message typed during a running turn shows "na fila"', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    // principal que não termina: o 1º turno com certeza ainda roda quando a 2ª mensagem chega (determinístico)
    const { chatSession } = await import('../src/chat-commands.ts');
    const c = await chatSession(e).conversation();
    e.mutate((s) => s.setMainProvider(c.id, 'simulator:hang'));
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 120, 30);
    await type(r, 'primeira');
    await r.press(KEYS.enter);
    await type(r, 'segunda');
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('na fila: segunda');
    expect(txt(r)).toMatch(/✻ \S+… \(simulator:hang · \d+ s · Esc para interromper\)/); // palavra criativa + tempo (PHASE-19)
    r.unmount();
    await e.stop(); // o stop interrompe o turno pendurado
  }, 60_000);

  it('your message starts with >, the reply with ●, a blank line between; Esc interrupts a thinking main (PHASE-19)', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 80, 40);
    await type(r, 'olá');
    await r.press(KEYS.enter);
    const f = await until(r, (s) => s.includes('● SIMULATED: entendi — olá'));
    const lines = f.split('\n').map((l) => l.trim());
    const you = lines.indexOf('> olá');
    const ia = lines.indexOf('● SIMULATED: entendi — olá');
    expect(you).toBeGreaterThanOrEqual(0);
    expect(ia).toBe(you + 2);
    expect(lines[you + 1]).toBe('');
    // Esc com a principal pensando interrompe o turno
    const { chatSession } = await import('../src/chat-commands.ts');
    const c = await chatSession(e).conversation();
    e.mutate((s) => s.setMainProvider(c.id, 'simulator:hang'));
    await type(r, 'demora');
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('Esc para interromper'));
    await r.press(KEYS.esc);
    await until(r, (s) => s.includes('interrompido pelo usuário') && !s.includes('Esc para interromper'), 15_000);
    r.unmount();
    await e.stop();
  }, 60_000);

  it('an edit by the main shows live activity and what changed in green/red (PHASE-19)', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 100, 40);
    await type(r, 'edite o readme');
    await r.press(KEYS.enter);
    const f = await until(r, (s) => s.includes('Editou SIMULATED/CHAT.md (+'));
    expect(f).toContain('● Editando SIMULATED/CHAT.md'); // atividade ao vivo
    expect(f).toMatch(/\+# editado pela principal SIMULADA/); // linha adicionada
    expect(f).toContain('/desfazer volta estas mudanças');
    r.unmount();
    await e.stop();
  });

  it('wizard offers the hybrid mode and lets you type your own test command (PHASE-19)', async () => {
    const { root, e } = await project(null);
    let done = false;
    const r = await renderForTest(<UiContext.Provider value={ui()}><Wizard engine={e} onDone={() => { done = true; }} /></UiContext.Provider>, 100, 30);
    await until(r, (s) => s.includes('Qual será a principal?'));
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('sem perguntar de novo'));
    await r.press(KEYS.down);
    await r.press(KEYS.enter); // perguntar a cada sessão
    await until(r, (s) => s.includes('Modo de execução'));
    expect(txt(r)).toMatch(/híbrido/);
    await r.press(KEYS.down);
    await r.press(KEYS.down);
    await r.press(KEYS.enter); // híbrido
    await until(r, (s) => s.includes('Tarefas em paralelo por IA'));
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('Comando de teste'));
    expect(txt(r)).toMatch(/digitar outro comando/);
    for (let i = 0; i < 5 && !/› digitar outro comando/.test(txt(r)); i++) await r.press(KEYS.down);
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('Digite o comando'));
    await type(r, 'make check');
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('Salvar para'));
    await r.press(KEYS.enter);
    for (let i = 0; i < 100 && !done; i++) await new Promise((x) => setTimeout(x, 50));
    expect(chatConfig(root)).toMatchObject({ mode: 'hybrid', testCommand: ['make', 'check'] });
    const { consentAllGranted } = await import('@aer/project-store');
    expect(consentAllGranted()).toBe(false);
    r.unmount();
    await e.stop();
  });

  it('wizard lists IAs, saves main/mode/limit/test to the chosen config', async () => {
    const { root, e } = await project(null);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    expect(suggestTestCommand(root)).toEqual(['npm', 'test']);
    let done = false;
    const r = await renderForTest(<UiContext.Provider value={ui()}><Wizard engine={e} onDone={() => { done = true; }} /></UiContext.Provider>, 100, 30);
    await until(r, (s) => s.includes('Qual será a principal?') && s.includes('simulator-3'));
    // escolhe simulator-2 (a lista começa na primeira IA pronta)
    for (let i = 0; i < 12 && !/› simulator-2/.test(txt(r)); i++) await r.press(KEYS.down);
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('sem perguntar de novo'));
    await r.press(KEYS.enter); // autorização única: sim
    await until(r, (s) => s.includes('Modo de execução'));
    await r.press(KEYS.down); // automático
    await r.press(KEYS.enter);
    await until(r, (s) => s.includes('Tarefas em paralelo por IA'));
    await r.press(KEYS.enter); // 1
    await until(r, (s) => s.includes('Comando de teste'));
    await r.press(KEYS.enter); // aceita npm test
    await until(r, (s) => s.includes('Salvar para'));
    await r.press(KEYS.enter); // este projeto
    for (let i = 0; i < 100 && !done; i++) await new Promise((x) => setTimeout(x, 50));
    expect(done).toBe(true);
    const c = chatConfig(root);
    expect(c).toMatchObject({ main: 'simulator-2', mode: 'auto', testCommand: ['npm', 'test'] });
    const { consentAllGranted } = await import('@aer/project-store');
    expect(consentAllGranted()).toBe(true); // ficou na config pessoal, não no projeto
    expect(JSON.parse(readFileSync(path.join(root, '.ases', 'CONFIG.json'), 'utf8')).aiConsentAll).toBeUndefined();
    expect(c.sources.main).toBe('.ases/CONFIG.json');
    r.unmount();
    await e.stop();
  });
});
