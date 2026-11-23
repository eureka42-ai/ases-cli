import { describe, expect, it } from 'vitest';
import { ProjectStore, type Snapshot, type TaskRow } from '@aer/persistence';
import type { EventEnvelope } from '@aer/contracts';
import { KEYS, UiContext, renderForTest, type Ui } from '@aer/tui-shared';
import { TarApp, type MonitorLike } from '../src/tui.tsx';
import type { LinkStatus } from '../src/monitor.ts';

const ESC_COLOR = /\u001b\[(3[0-9]|9[0-7]|38;)/;
type H = Parameters<MonitorLike['subscribe']>[0];

function fixture() {
  const store = ProjectStore.open(':memory:', { id: 'prj_tui000001', name: 'demo' });
  const p = store.createPhase('Fundação');
  store.createTask({ phaseId: p, title: 'Auditar ambiente', reqs: ['AER-REQ-001'] });
  store.createTask({ phaseId: p, title: 'Monorepo com um título bem comprido para testar o corte da linha na largura', priority: 90 });
  store.transitionTask('TAR-0001', 'READY', 1, 'aprovada');
  return store;
}

function fakeMonitor(store: ProjectStore) {
  let h: H | undefined;
  const calls: string[] = [];
  const m: MonitorLike = {
    subscribe: (x) => {
      h = x;
    },
    getTask: async (id) => store.getTask(id) ?? null,
    reconnect: () => calls.push('reconnect'),
    stop: () => calls.push('stop'),
  };
  return {
    m, calls,
    snapshot: () => h!.onSnapshot(store.snapshot(), store.eventsSince(0)),
    status: (s: LinkStatus, d = '') => h!.onStatus(s, d),
    event: (e: EventEnvelope) => h!.onEvent(e),
  };
}

const ui = (over: Partial<Ui> = {}): Ui => ({ color: false, unicode: true, theme: 'teal', ...over });
const app = (f: ReturnType<typeof fakeMonitor>, u = ui(), filter = {}) => (
  <UiContext.Provider value={u}><TarApp monitor={f.m} projectName="demo" filter={filter} /></UiContext.Provider>
);
const tick = () => new Promise((r) => setTimeout(r, 30));
const txt = (r: { lastFrame(): string }) => r.lastFrame().replace(/\u001b\[[0-9;]*m/g, '');

describe('ases-tar TUI (TAR-0018, TAR-0019)', () => {
  it('shows status, phases, tasks and live events; updates on events without refetching', async () => {
    const store = fixture();
    const f = fakeMonitor(store);
    const r = await renderForTest(app(f), 120, 20);
    expect(txt(r)).toContain('◌ RECONNECTING');
    f.snapshot();
    f.status('LIVE', 'desde seq 5');
    await tick();
    const frame = txt(r);
    expect(frame).toContain('⌘ Eureka42 | ASES-TAR ● LIVE  demo · seq 5');
    expect(frame).toMatch(/PHASE-01 PLANNED 0\/2 · Fundação/);
    expect(frame).toMatch(/› TAR-0001 READY\s+Auditar ambiente/);
    expect(frame).toMatch(/#0005 \d\d:\d\d:\d\d TaskUpdated\s+TAR-0001 PLANNED → READY/);
    store.transitionTask('TAR-0001', 'RESERVED', 2);
    f.event(store.eventsSince(5)[0]!);
    await tick();
    expect(txt(r)).toMatch(/TAR-0001 RESERVED/);
    expect(txt(r)).toContain('seq 6');
    f.status('OFFLINE', 'ENGINE_NOT_RUNNING');
    await tick();
    expect(txt(r)).toContain('○ OFFLINE');
    r.unmount();
  });

  it('keyboard: ↓ selects, Enter opens detail (task.get), Esc returns, ? help, r reconnects, q quits', async () => {
    const store = fixture();
    const f = fakeMonitor(store);
    const r = await renderForTest(app(f), 100, 20);
    f.snapshot();
    f.status('LIVE');
    await tick();
    await r.press(KEYS.down);
    expect(txt(r)).toMatch(/› TAR-0002/);
    await r.press(KEYS.enter);
    await tick();
    const detail = txt(r);
    expect(detail).toContain('TAR-0002 — Monorepo');
    expect(detail).toContain('prioridade 90'); // veio de task.get, não do evento
    expect(detail).toContain('progresso: indeterminado');
    await r.press(KEYS.esc);
    expect(txt(r)).toContain('Fases e tarefas');
    await r.press('?');
    expect(txt(r)).toMatch(/r\s+relê do engine \(nunca reinicia execução\)/);
    await r.press(KEYS.esc);
    await r.press('r');
    expect(f.calls).toContain('reconnect');
    await r.press('q');
    expect(f.calls).toContain('stop');
    r.unmount();
  });

  it('narrow terminals show one pane and Tab switches (AER-REQ-088)', async () => {
    const store = fixture();
    const f = fakeMonitor(store);
    const r = await renderForTest(app(f), 80, 24);
    f.snapshot();
    f.status('LIVE');
    await tick();
    expect(txt(r)).toContain('Fases e tarefas');
    expect(txt(r)).not.toContain('Eventos ao vivo');
    await r.press(KEYS.tab);
    expect(txt(r)).toContain('Eventos ao vivo');
    r.unmount();
  });

  it.each([[40, 16], [50, 16], [80, 24], [120, 35]])('fits %ix%i without overflow, in color and NO_COLOR (AER-REQ-244, AER-REQ-245)', async (cols, rows) => {
    for (const color of [false, true]) {
      const store = fixture();
      const f = fakeMonitor(store);
      const r = await renderForTest(app(f, ui({ color })), cols, rows);
      f.snapshot();
      f.status('LIVE');
      await tick();
      const frame = r.lastFrame();
      const plain = frame.replace(/\u001b\[[0-9;]*m/g, '');
      const lines = plain.split('\n');
      for (const line of lines) expect([...line].length, `${cols}: ${line}`).toBeLessThanOrEqual(cols);
      expect(lines.length).toBeLessThanOrEqual(rows);
      if (!color) expect(frame).not.toMatch(ESC_COLOR);
      expect(plain).toMatch(cols >= 50 ? /Eureka42 \| ASES-TAR/ : /⌘ E42/);
      expect(lines[0]).toMatch(/LIVE/); // marca e estado na mesma linha, sem corte do badge
      r.unmount();
    }
  });

  it('ASCII at 40 columns keeps brand and status on one line', async () => {
    const store = fixture();
    const f = fakeMonitor(store);
    const r = await renderForTest(app(f, ui({ unicode: false })), 40, 12);
    f.snapshot();
    f.status('LIVE');
    await tick();
    expect(txt(r).split('\n')[0]).toMatch(/^\[E42\] ASES-TAR \* LIVE/);
    r.unmount();
  });

  it('ASCII terminal: no Unicode glyphs or round borders', async () => {
    const store = fixture();
    const f = fakeMonitor(store);
    const r = await renderForTest(app(f, ui({ unicode: false })), 100, 20);
    f.snapshot();
    f.status('LIVE');
    await tick();
    expect(txt(r)).toContain('[E42] Eureka42 | ASES-TAR * LIVE');
    // sem glifos (⌘ ● › → · — × setas, bordas, blocos); acentos do português e o '…' de corte do Ink ficam
    expect(txt(r)).not.toMatch(/[\u00B7\u00D7\u2014\u2190-\u21FF\u2300-\u23FF\u2500-\u25FF]/);
    r.unmount();
  });

  it('--task filter limits tasks and events', async () => {
    const store = fixture();
    const f = fakeMonitor(store);
    const r = await renderForTest(app(f, ui(), { task: 'TAR-0002' }), 120, 20);
    f.snapshot();
    f.status('LIVE');
    await tick();
    expect(txt(r)).toContain('TAR-0002');
    expect(txt(r)).not.toMatch(/TAR-0001/);
    r.unmount();
  });
});

// garante que o tipo usado no detalhe é o do store
export type _T = TaskRow | Snapshot;
