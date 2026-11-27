import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openSqlite } from '../src/driver.ts';
import { openStore, tempDir } from './helpers.ts';

const dir = tempDir();

describe('/verificar: o estado refeito a partir do histórico (PHASE-26, ESAA verify/replay)', () => {
  it('a project used only through the store verifies clean', () => {
    const s = openStore(path.join(dir, 'ok.sqlite'));
    const p = s.createPhase('Fase');
    const t = s.createTask({ phaseId: p, title: 'a', reqs: [] });
    s.transitionTask(t, 'READY', s.getTask(t)!.version, null);
    s.setLessonState(s.addLesson({ text: 'x' }), 'ACTIVE', 'Prof');
    const r = s.verifyState();
    expect(r.problems).toEqual([]);
    expect(r.checked).toBeGreaterThanOrEqual(3);
  });

  it('a state edited by hand in the database is caught', () => {
    const file = path.join(dir, 'mexido.sqlite');
    const s = openStore(file);
    const p = s.createPhase('Fase');
    const t = s.createTask({ phaseId: p, title: 'a', reqs: [] });
    const raw = openSqlite(file);
    raw.prepare("UPDATE tasks SET state = 'COMPLETED' WHERE id = ?").run(t);
    raw.close();
    expect(s.verifyState().problems).toEqual([`${t}: o banco diz COMPLETED, o histórico diz PLANNED`]);
  });
});

describe('cadeia de integridade dos eventos (PHASE-27, chain do ESAA)', () => {
  it('each event carries the hash of the previous one; the head moves forward', () => {
    const s = openStore(path.join(dir, 'cadeia.sqlite'));
    const h1 = s.chainHead();
    s.createPhase('Fase');
    const h2 = s.chainHead();
    expect(h2.seq).toBe(h1.seq + 1);
    expect(h2.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(h2.hash).not.toBe(h1.hash);
    expect(s.verifyState().problems).toEqual([]);
  });

  it('a database without the chain (older version) gets it built when opened', () => {
    const file = path.join(dir, 'antigo.sqlite');
    const s = openStore(file);
    s.createPhase('Fase');
    s.close();
    const raw = openSqlite(file);
    raw.exec('DROP TRIGGER event_chain_append_only_delete; DELETE FROM event_chain;');
    raw.close();
    const again = openStore(file);
    expect(again.chainHead().seq).toBe(again.eventsSince(0).at(-1)!.seq);
    expect(again.verifyState().problems).toEqual([]);
  });

  it('rewriting an old event behind the store breaks the chain and is reported', () => {
    const file = path.join(dir, 'reescrito.sqlite');
    const s = openStore(file);
    s.createPhase('Fase');
    s.createPhase('Outra');
    const raw = openSqlite(file);
    raw.exec("DROP TRIGGER events_append_only_update; UPDATE events SET actor = 'intruso' WHERE seq = 2;");
    raw.close();
    expect(s.verifyState().problems).toContain('cadeia de integridade quebrada no evento seq 2: o histórico foi alterado depois de gravado');
  });

  it('a pinned head that no longer matches means the history was rewritten', () => {
    const s = openStore(path.join(dir, 'pino.sqlite'));
    const pin = s.chainHead();
    expect(s.verifyState({ pin }).problems).toEqual([]);
    expect(s.verifyState({ pin: { seq: pin.seq, hash: 'f'.repeat(64) } }).problems).toEqual([`o ponto fixado (seq ${pin.seq}) não confere: o histórico foi reescrito desde que foi fixado`]);
  });
});
