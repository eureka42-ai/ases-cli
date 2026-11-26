import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { KEYS, UiContext, renderForTest, type Ui } from '@aer/tui-shared';
import { StartScreen, invalidProjectName, startOptions, whereOptions } from '../src/start-screen.tsx';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const ui: Ui = { color: false, unicode: true, theme: 'green' };
const txt = (r: { lastFrame(): string }) => r.lastFrame().replace(/\u001b\[[0-9;]*m/g, '');
const type = async (r: Awaited<ReturnType<typeof renderForTest>>, s: string) => {
  for (const ch of s) await r.press(ch);
};

describe('start screen: where do we work? (PHASE-19)', () => {
  it('offers this folder, the Desktop, choosing a folder and the recent projects', () => {
    const home = path.resolve('/Users/u'); // no Windows vira D:\Users\u
    const j = (...p: string[]) => path.join(home, ...p);
    const t = (...p: string[]) => `~${path.sep}${p.join(path.sep)}`;
    const o = startOptions({ cwd: j('Projetos', 'app'), home, desktop: j('Desktop'), recent: [j('Projetos', 'site'), j('Projetos', 'app')] });
    expect(o.map((x) => x.label)).toEqual([`Esta pasta (${t('Projetos', 'app')})`, `Mesa (${t('Desktop')})`, `Novo projeto… (em ${t('Projetos Eureka42')})`, 'Escolher uma pasta…', `Recente: ${t('Projetos', 'site')}`]);
    // na home, "esta pasta" não aparece (a home não deve virar projeto)
    expect(startOptions({ cwd: home, home, desktop: j('Desktop'), recent: [] }).map((x) => x.label)).toEqual([`Mesa (${t('Desktop')})`, `Novo projeto… (em ${t('Projetos Eureka42')})`, 'Escolher uma pasta…']);
  });

  it('Enter on Mesa chooses the Desktop; typing a folder chooses it (~ is expanded)', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'aer start '));
    dirs.push(home);
    mkdirSync(path.join(home, 'Desktop'));
    mkdirSync(path.join(home, 'Projetos', 'novo'), { recursive: true });
    let chosen: string | undefined;
    const r = await renderForTest(<UiContext.Provider value={ui}><StartScreen cwd={home} home={home} desktop={path.join(home, 'Desktop')} recent={[]} onChoose={(p) => { chosen = p; }} /></UiContext.Provider>, 100, 30);
    expect(txt(r)).toContain('Onde vamos trabalhar?');
    expect(txt(r)).not.toContain('███'); // o logo grande vem depois da escolha da pasta
    await r.press(KEYS.enter);
    expect(chosen).toBe(path.join(home, 'Desktop'));
    r.unmount();
    chosen = undefined;
    const r2 = await renderForTest(<UiContext.Provider value={ui}><StartScreen cwd={home} home={home} desktop={path.join(home, 'Desktop')} recent={[]} onChoose={(p) => { chosen = p; }} /></UiContext.Provider>, 100, 30);
    await r2.press(KEYS.down);
    await r2.press(KEYS.down);
    await r2.press(KEYS.enter);
    expect(txt(r2)).toContain('Digite o caminho da pasta');
    await type(r2, '~/Projetos/nao-existe');
    await r2.press(KEYS.enter);
    expect(txt(r2)).toContain('pasta não encontrada');
    expect(chosen).toBeUndefined();
    for (let i = 0; i < 30; i++) await r2.press(KEYS.backspace);
    await type(r2, '~/Projetos/novo');
    await r2.press(KEYS.enter);
    expect(chosen).toBe(path.join(home, 'Projetos', 'novo'));
    r2.unmount();
  });
});

describe('start screen: new project by name', () => {
  it('rejects names that are not a single safe folder name', () => {
    for (const bad of ['', '  ', '.', '..', 'a/b', 'a\\b', 'x:y', 'what?', 'fim.', 'a'.repeat(81)]) expect(invalidProjectName(bad), bad).toBeTypeOf('string');
    for (const ok of ['meu-app', 'Projeto Novo 2', 'loja_online', 'ação']) expect(invalidProjectName(ok), ok).toBeUndefined();
  });

  it('Novo projeto… asks for a name and creates ~/Projetos/<name> (reopens it if it exists)', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'aer new '));
    dirs.push(home);
    let chosen: string | undefined;
    const r = await renderForTest(<UiContext.Provider value={ui}><StartScreen cwd={home} home={home} desktop={path.join(home, 'Desktop')} recent={[]} onChoose={(p) => { chosen = p; }} /></UiContext.Provider>, 100, 30);
    await r.press(KEYS.down);
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('Nome do projeto');
    await type(r, 'a/b');
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('use só letras');
    expect(chosen).toBeUndefined();
    for (let i = 0; i < 5; i++) await r.press(KEYS.backspace);
    await type(r, 'Meu App');
    await r.press(KEYS.enter);
    expect(chosen).toBe(path.join(home, 'Projetos Eureka42', 'Meu App'));
    expect(existsSync(path.join(home, 'Projetos Eureka42', 'Meu App'))).toBe(true);
    r.unmount();
  });
});

describe('start screen: other machines (1.4.0)', () => {
  const mk = () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'aer sync '));
    dirs.push(home);
    return home;
  };

  it('"where to keep" offers local first, then only what this machine has', () => {
    expect(whereOptions(undefined).map((w) => w.label)).toEqual(['Só nesta máquina']);
    expect(whereOptions({ github: true, cloud: 'gdrive:' }).map((w) => w.targets)).toEqual([[], ['github'], ['cloud'], ['github', 'cloud']]);
    expect(whereOptions({ github: false, cloud: 'mega:' }).map((w) => w.label)).toEqual(['Só nesta máquina', 'Nuvem (mega:Projetos Eureka42)']);
    const home = path.resolve('/Users/u');
    expect(startOptions({ cwd: home, home, desktop: path.join(home, 'Desktop'), recent: [], sync: { github: true, cloud: 'gdrive:' } }).map((o) => o.label)).toContain('Abrir de outra máquina… (GitHub · gdrive:)');
    expect(startOptions({ cwd: home, home, desktop: path.join(home, 'Desktop'), recent: [], sync: { github: false } }).some((o) => o.label.startsWith('Abrir de outra'))).toBe(false);
  });

  it('new project: Enter keeps it only on this machine; choosing GitHub returns the target', async () => {
    const home = mk();
    const got: [string, string[] | undefined][] = [];
    const el = <UiContext.Provider value={ui}><StartScreen cwd={home} home={home} desktop={path.join(home, 'Desktop')} recent={[]} sync={{ github: true, cloud: 'gdrive:' }} onChoose={(p, t) => { got.push([p, t]); }} /></UiContext.Provider>;
    const r = await renderForTest(el, 100, 30);
    await r.press(KEYS.down);
    await r.press(KEYS.enter);
    await type(r, 'local');
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('Onde guardar local?');
    await r.press(KEYS.enter);
    expect(got.at(-1)).toEqual([path.join(home, 'Projetos Eureka42', 'local'), []]);
    r.unmount();
    const r2 = await renderForTest(el, 100, 30);
    await r2.press(KEYS.down);
    await r2.press(KEYS.enter);
    await type(r2, 'nogit');
    await r2.press(KEYS.enter);
    await r2.press(KEYS.down);
    await r2.press(KEYS.enter);
    expect(got.at(-1)).toEqual([path.join(home, 'Projetos Eureka42', 'nogit'), ['github']]);
    r2.unmount();
  });

  it('open from another machine: lists remote projects and opens the downloaded folder', async () => {
    const home = mk();
    let chosen: string | undefined;
    const pulled: string[] = [];
    const r = await renderForTest(<UiContext.Provider value={ui}><StartScreen cwd={home} home={home} desktop={path.join(home, 'Desktop')} recent={[]} sync={{ github: true, cloud: 'gdrive:' }}
      listRemote={() => ({ projects: [{ source: 'cloud', name: 'loja', ref: 'gdrive:Projetos/loja' }, { source: 'github', name: 'site', ref: 'eu/site' }], errors: [] })}
      pull={(p) => { pulled.push(p.ref); return path.join(home, 'Projetos Eureka42', p.name); }}
      onChoose={(p) => { chosen = p; }} /></UiContext.Provider>, 100, 30);
    await r.press(KEYS.down);
    await r.press(KEYS.down);
    await r.press(KEYS.enter);
    await new Promise((res) => setTimeout(res, 120));
    expect(txt(r)).toContain('Qual projeto abrir?');
    expect(txt(r)).toContain('site  (GitHub eu/site)');
    await r.press(KEYS.down);
    await r.press(KEYS.enter);
    await new Promise((res) => setTimeout(res, 120));
    expect(pulled).toEqual(['eu/site']);
    expect(chosen).toBe(path.join(home, 'Projetos Eureka42', 'site'));
    r.unmount();
  });
});

describe('start screen: connect a cloud (1.4.0)', () => {
  it('Conectar uma nuvem… logs in through the browser and then shows it as connected', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'aer conn '));
    dirs.push(home);
    const asked: string[] = [];
    const r = await renderForTest(<UiContext.Provider value={ui}><StartScreen cwd={home} home={home} desktop={path.join(home, 'Desktop')} recent={[]} sync={{ github: false, rcloneInstalled: true }}
      connect={async (id) => { asked.push(id); return { remote: 'gdrive:', label: 'Google Drive' }; }} onChoose={() => {}} /></UiContext.Provider>, 100, 30);
    expect(txt(r)).toContain('nenhuma nuvem conectada');
    await r.press(KEYS.down);
    await r.press(KEYS.down);
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('Qual nuvem conectar?');
    await r.press(KEYS.enter); // Google Drive
    await new Promise((res) => setTimeout(res, 100));
    expect(asked).toEqual(['google']);
    expect(txt(r)).toContain('nuvem conectada: Google Drive');
    expect(txt(r)).toContain('Abrir de outra máquina… (Google Drive)');
    r.unmount();
  });
});

describe('clean screen when ases opens (PHASE-20)', () => {
  it('clearScreen clears only real terminals', async () => {
    const { clearScreen } = await import('../src/start-screen.tsx');
    let out = '';
    clearScreen({ isTTY: true, write: (s: string) => { out += s; return true; } });
    expect(out).toBe('\u001b[2J\u001b[3J\u001b[H');
    out = '';
    clearScreen({ isTTY: false, write: (s: string) => { out += s; return true; } });
    expect(out).toBe('');
  });
});
