import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { KEYS, UiContext, renderForTest, type Ui } from '@aer/tui-shared';
import { StartScreen, startOptions } from '../src/start-screen.tsx';

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
    expect(o.map((x) => x.label)).toEqual([`Esta pasta (${t('Projetos', 'app')})`, `Mesa (${t('Desktop')})`, 'Escolher uma pasta…', `Recente: ${t('Projetos', 'site')}`]);
    // na home, "esta pasta" não aparece (a home não deve virar projeto)
    expect(startOptions({ cwd: home, home, desktop: j('Desktop'), recent: [] }).map((x) => x.label)).toEqual([`Mesa (${t('Desktop')})`, 'Escolher uma pasta…']);
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
