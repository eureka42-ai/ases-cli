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
