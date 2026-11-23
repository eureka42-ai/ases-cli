import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportHistory, verifyHistory } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

const dir = tempDir();
const store = openStore(path.join(dir, 'x.sqlite'));
const phase = store.createPhase('Fase');
for (let i = 0; i < 12; i++) store.createTask({ phaseId: phase, title: `t${i}`, reqs: ['AER-REQ-036'] });
const mirror = path.join(dir, 'HISTORY.jsonl');

describe('JSONL mirror (TAR-0009)', () => {
  it('rebuilds the mirror in seq order and verifies clean (AER-REQ-067)', () => {
    expect(exportHistory(store, mirror, 5)).toEqual({ events: store.lastSeq(), lastSeq: store.lastSeq() });
    const seqs = readFileSync(mirror, 'utf8').trim().split('\n').map((l) => (JSON.parse(l) as { seq: number }).seq);
    expect(seqs).toEqual(Array.from({ length: store.lastSeq() }, (_, i) => i + 1));
    expect(verifyHistory(mirror)).toEqual({ events: store.lastSeq(), problems: [] });
    const again = readFileSync(mirror, 'utf8');
    exportHistory(store, mirror, 3);
    expect(readFileSync(mirror, 'utf8')).toBe(again); // rebuild determinístico
  });

  it('detects tampering, gaps and duplicates (AER-REQ-068)', () => {
    const lines = readFileSync(mirror, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[2]!) as { payload: { title: string } };
    tampered.payload.title = 'adulterado';
    const bad = [lines[0], lines[1], JSON.stringify(tampered), lines[4], lines[4]];
    const f = path.join(dir, 'bad.jsonl');
    writeFileSync(f, `${bad.join('\n')}\n`);
    const { problems } = verifyHistory(f);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/line 3: payloadSha256 mismatch/),
      expect.stringMatching(/line 4: expected seq 4, got 5/),
      expect.stringMatching(/line 5: duplicate eventId/),
    ]));
  });

  it('an export failing midway leaves the previous mirror intact and no temp file (§4.3)', () => {
    const before = readFileSync(mirror, 'utf8');
    let calls = 0;
    const flaky = { eventsSince: (seq: number, n?: number) => (++calls > 2 ? (() => { throw new Error('disk gone'); })() : store.eventsSince(seq, n)) };
    expect(() => exportHistory(flaky, mirror, 2)).toThrow('disk gone');
    expect(readFileSync(mirror, 'utf8')).toBe(before);
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('verifies the interim PHASE-01 history with the same canonical hash (ADR-0002 §7)', () => {
    const interim = fileURLToPath(new URL('../../../.ases/HISTORY.jsonl', import.meta.url));
    if (!existsSync(interim)) return;
    expect(verifyHistory(interim).problems).toEqual([]);
  });
});
