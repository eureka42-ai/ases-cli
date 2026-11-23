import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/ases-dev.mjs');
const root = mkdtempSync(path.join(os.tmpdir(), 'aer ases-dev ç '));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const plan = path.join(root, 'plan.json');
writeFileSync(path.join(root, 'fonte.md'), 'fonte original\n');
writeFileSync(plan, JSON.stringify({
  project: { name: 'demo', brand: 'Eureka42 · demo' },
  sources: ['fonte.md'],
  phases: [{ id: 'PHASE-01', title: 'Fase um', gate: 'g' }, { id: 'PHASE-02', title: 'Sem tarefas' }],
  tasks: [
    { id: 'TAR-0001', phase: 'PHASE-01', title: 'A', priority: 100, risk: 'LOW', dependencies: [], reqs: ['AER-REQ-001'], scope: 's', acceptance: ['a'], tests: ['t'] },
    { id: 'TAR-0002', phase: 'PHASE-01', title: 'B', priority: 90, risk: 'LOW', dependencies: ['TAR-0001'], reqs: ['AER-REQ-002', 'AER-REQ-003'], scope: 's', acceptance: ['a'], tests: ['t'] },
  ],
}));

const run = (...args) => spawnSync(process.execPath, [script, ...args, '--root', root, '--plan', plan], { encoding: 'utf8' });
const asesDir = path.join(root, '.ases');
function snapshot(dir = asesDir, out = {}) {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) snapshot(f, out);
    else out[path.relative(asesDir, f)] = createHash('sha256').update(readFileSync(f)).digest('hex');
  }
  return out;
}
const history = () => readFileSync(path.join(asesDir, 'HISTORY.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('ases-dev bootstrap (TAR-0004)', () => {
  it('init creates the .ases/ layout with source hashes (AER-REQ-151)', () => {
    expect(run('init').status).toBe(0);
    const manifest = JSON.parse(readFileSync(path.join(asesDir, 'MANIFEST.json'), 'utf8'));
    expect(manifest.sources).toEqual([{ path: 'fonte.md', sha256: createHash('sha256').update('fonte original\n').digest('hex') }]);
    for (const f of ['STATUS.md', 'HANDOFF.md', 'NEXT-STEPS.md', 'TRACEABILITY.csv', 'phases/PHASE-01/TAR-0002/TASK.md']) {
      expect(statSync(path.join(asesDir, f)).isFile()).toBe(true);
    }
    expect(readdirSync(path.join(asesDir, 'phases'))).toEqual(['PHASE-01']);
    expect(history().map((e) => e.eventType)).toEqual(['ProjectInitialized', 'PhaseCreated', 'TaskCreated', 'TaskCreated']);
  });

  it('second init changes nothing and keeps user edits (AER-REQ-011)', () => {
    writeFileSync(path.join(asesDir, 'NEXT-STEPS.md'), 'editado pelo usuário\n');
    const before = snapshot();
    const r = run('init');
    expect(r.stdout).toMatch(/nothing to create/);
    expect(snapshot()).toEqual(before);
  });

  it('refuses COMPLETED without evidence, accepts it with evidence', () => {
    expect(run('set', 'TAR-0001', 'COMPLETED').status).toBe(2);
    expect(run('set', 'TAR-0001', 'BOGUS').status).toBe(2);
    expect(run('set', 'TAR-0001', 'COMPLETED', '--evidence', '../escape.md').status).toBe(2);
    mkdirSync(path.join(root, 'ev'));
    writeFileSync(path.join(root, 'ev', 'log.txt'), 'ok');
    expect(run('set', 'TAR-0001', 'COMPLETED', '--evidence', 'ev/log.txt', '--note', 'feito').status).toBe(0);
    expect(readFileSync(path.join(asesDir, 'STATUS.md'), 'utf8')).toMatch(/\| TAR-0001 \| PHASE-01 \| A \| COMPLETED \| ev\/log.txt \|/);
    expect(readFileSync(path.join(asesDir, 'TRACEABILITY.csv'), 'utf8')).toContain('"AER-REQ-001","PHASE-01","TAR-0001","t","ev/log.txt","COMPLETED"');
    expect(readFileSync(path.join(asesDir, 'HANDOFF.md'), 'utf8')).toMatch(/Concluídas: TAR-0001/);
    expect(history().at(-1)).toMatchObject({ seq: 5, eventType: 'TaskUpdated', taskId: 'TAR-0001', payload: { from: 'PLANNED', to: 'COMPLETED' } });
  });

  it('verify passes on intact history and detects tampering (AER-REQ-068)', () => {
    expect(run('verify').status).toBe(0);
    const file = path.join(asesDir, 'HISTORY.jsonl');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    const e = JSON.parse(lines[1]);
    e.payload.title = 'adulterado';
    lines[1] = JSON.stringify(e);
    writeFileSync(file, `${lines.join('\n')}\n`);
    const r = run('verify');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/payloadSha256 mismatch \(seq 2\)/);
  });
});
