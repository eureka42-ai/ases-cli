import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter } from '@aer/project-store';
import { KEYS, UiContext, renderForTest, type Ui } from '@aer/tui-shared';
import { Engine } from '../src/engine.ts';
import { AsesApp } from '../src/tui.tsx';

const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));
async function engine(): Promise<Engine> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aer-tui-'));
  dirs.push(dir);
  initProject(dir, adapter, 'tui');
  return Engine.start(dir, adapter);
}
const ESC_COLOR = /\u001b\[(3[0-9]|9[0-7]|38;)/;
const txt = (r: { lastFrame(): string }) => r.lastFrame().replace(/\u001b\[[0-9;]*m/g, '');
const ui = (over: Partial<Ui> = {}): Ui => ({ color: false, unicode: true, theme: 'teal', ...over });
const type = async (r: Awaited<ReturnType<typeof renderForTest>>, s: string) => {
  for (const ch of s) await r.press(ch);
};

describe('ases TUI (TAR-0017)', () => {
  it('typing a command updates the session log, the side pane and the header (event-driven)', async () => {
    const e = await engine();
    const exits: string[] = [];
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={(x) => exits.push(x)} /></UiContext.Provider>, 120, 24);
    expect(txt(r)).toContain('⌘ Eureka42 | ASES CLI ● LIVE  tui · seq 1 · monitores 0');
    await r.press('/phase new Fundação\r'); // colar com Enter: vira um comando
    await type(r, '/task new PHASE-01 Auditar');
    await r.press(KEYS.enter);
    const f = txt(r);
    expect(f).toContain('ases> /phase new Fundação');
    expect(f).toContain('criada PHASE-01');
    expect(f).toContain('criada TAR-0001');
    expect(f).toMatch(/PHASE-01 PLANNED Fundação/);
    expect(f).toMatch(/TAR-0001 PLANNED Auditar/);
    expect(f).toContain('seq 3');
    r.unmount();
    await e.stop();
  });

  it('history with ↑, backspace, Tab focus + Enter on a task, help, Ctrl+L, free text is not sent anywhere', async () => {
    const e = await engine();
    e.mutate((s) => s.createTask({ phaseId: s.createPhase('F'), title: 'Uma' }));
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, 120, 24);
    await type(r, '/status');
    await r.press(KEYS.enter);
    await r.press(KEYS.up);
    expect(txt(r)).toMatch(/ases> \/status█/);
    await r.press(KEYS.backspace);
    expect(txt(r)).toMatch(/ases> \/statu█/);
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('comando desconhecido: /statu');
    await type(r, 'olá agente');
    await r.press(KEYS.enter);
    expect(txt(r)).toContain('Chat com agentes ainda não implementado (PHASE-07)');
    expect(txt(r)).toMatch(/provedor\./); // segunda metade, quebrada para a linha seguinte dentro do painel
    await r.press(KEYS.tab);
    await r.press(KEYS.enter);
    expect(txt(r)).toMatch(/TAR-0001 — Uma/);
    expect(txt(r)).toContain('progresso: indeterminado');
    await r.press(KEYS.esc);
    await r.press('?');
    expect(txt(r)).toContain('ases — atalhos');
    await r.press(KEYS.esc);
    await r.press(KEYS.ctrlL);
    expect(txt(r)).not.toContain('TAR-0001 — Uma');
    r.unmount();
    await e.stop();
  });

  it('Ctrl+C warns first and exits on the second press (§6.4, AER-REQ-090)', async () => {
    const e = await engine();
    const exits: string[] = [];
    const r = await renderForTest(<UiContext.Provider value={ui()}><AsesApp engine={e} onExit={(x) => exits.push(x)} /></UiContext.Provider>, 100, 20);
    await r.press(KEYS.ctrlC);
    expect(txt(r)).toContain('Ctrl+C de novo em 2 s para sair: o engine será encerrado');
    expect(exits).toEqual([]);
    await r.press(KEYS.ctrlC);
    expect(exits).toEqual(['Ctrl+C']);
    r.unmount();
    await e.stop();
  });

  it.each([[40, 16], [80, 24], [120, 35]])('fits %ix%i, NO_COLOR has no color codes, ASCII has no glyphs', async (cols, rows) => {
    const e = await engine();
    e.mutate((s) => s.createTask({ phaseId: s.createPhase('Fase com nome razoavelmente longo sem acento'), title: 'Tarefa com titulo comprido o bastante para precisar de corte' }));
    for (const u of [ui(), ui({ color: true }), ui({ unicode: false })]) {
      const r = await renderForTest(<UiContext.Provider value={u}><AsesApp engine={e} onExit={() => {}} /></UiContext.Provider>, cols, rows);
      await type(r, '/tasks');
      await r.press(KEYS.enter);
      const plain = txt(r);
      for (const line of plain.split('\n')) expect([...line].length, `${cols}: ${line}`).toBeLessThanOrEqual(cols);
      expect(plain.split('\n').length).toBeLessThanOrEqual(rows);
      if (!u.color) expect(r.lastFrame()).not.toMatch(ESC_COLOR);
      if (!u.unicode) expect(plain).not.toMatch(/[\u00B7\u00D7\u2014\u2190-\u21FF\u2300-\u23FF\u2500-\u25FF]/); // sem glifos; acentos do português permanecem
      expect(plain.split('\n')[0]).toMatch(/LIVE/); // estado nunca some do cabeçalho
      r.unmount();
    }
    await e.stop();
  });
});
