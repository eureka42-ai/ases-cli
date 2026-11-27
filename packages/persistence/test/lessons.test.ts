import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStore, tempDir } from './helpers.ts';

const dir = tempDir();
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'NO_ERROR';
};

describe('lições aprendidas (PHASE-25, inspiradas no ESAA)', () => {
  it('a lesson is proposed, approved by a person, archived; every step is an event', () => {
    const s = openStore(path.join(dir, 'l.sqlite'));
    const id = s.addLesson({ text: 'Rode os testes antes de entregar', source: 'TAR-0003' });
    expect(id).toBe('LES-0001');
    expect(s.listLessons()).toMatchObject([{ id, state: 'PROPOSED', text: 'Rode os testes antes de entregar', source: 'TAR-0003', approvedBy: null }]);
    expect(s.activeLessons()).toEqual([]); // proposta ainda não vale
    s.setLessonState(id, 'ACTIVE', 'Prof. Raul');
    expect(s.activeLessons().map((l) => l.text)).toEqual(['Rode os testes antes de entregar']);
    expect(s.listLessons()[0]!.approvedBy).toBe('Prof. Raul');
    s.setLessonState(id, 'ARCHIVED', 'Prof. Raul');
    expect(s.activeLessons()).toEqual([]);
    expect(s.eventsSince(0).filter((e) => e.eventType.startsWith('Lesson')).map((e) => e.eventType)).toEqual(['LessonRecorded', 'LessonUpdated', 'LessonUpdated']);
  });

  it('refuses empty text, unknown lessons, bad states and activation without a name', () => {
    const s = openStore(path.join(dir, 'm.sqlite'));
    expect(code(() => s.addLesson({ text: '  ' }))).toBe('INVALID_INPUT');
    expect(code(() => s.setLessonState('LES-0009', 'ACTIVE', 'x'))).toBe('NOT_FOUND');
    const id = s.addLesson({ text: 'a' });
    expect(code(() => s.setLessonState(id, 'ACTIVE', ' '))).toBe('INVALID_INPUT');
    expect(code(() => s.setLessonState(id, 'DONE' as 'ACTIVE', 'x'))).toBe('INVALID_INPUT');
  });
});
