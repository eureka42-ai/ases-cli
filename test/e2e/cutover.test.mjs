import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, start, tempProject } from './helpers.mjs';

requireBuild();
const DEV = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/ases-dev.mjs');
const p = tempProject('cutover');
const procs = [];
afterAll(async () => {
  await Promise.all(procs.map((x) => (x.child.exitCode === null ? (x.child.kill('SIGKILL'), x.exited) : undefined)));
  p.cleanup();
});

describe('interim .ases/ handed over to the engine (TAR-0026)', () => {
  it('imports the interim history byte-for-byte, then only the engine writes', async () => {
    const plan = path.join(p.dir, 'plan.json');
    writeFileSync(path.join(p.dir, 'fonte.md'), 'fonte\n');
    writeFileSync(plan, JSON.stringify({
      project: { name: 'corte', brand: 'Eureka42 · corte' }, sources: ['fonte.md'],
      phases: [{ id: 'PHASE-01', title: 'Um', gate: 'g' }, { id: 'PHASE-02', title: 'Dois' }],
      tasks: [
        { id: 'TAR-0001', phase: 'PHASE-01', title: 'feita', priority: 90, risk: 'LOW', dependencies: [], reqs: ['AER-REQ-001'], scope: 's', acceptance: ['a'], tests: ['t'] },
        { id: 'TAR-0002', phase: 'PHASE-02', title: 'aberta', priority: 50, risk: 'LOW', dependencies: ['TAR-0001'], reqs: ['AER-REQ-002'], scope: 's', acceptance: ['a'], tests: ['t'] },
      ],
    }));
    const dev = (...a) => runSync(DEV, [...a, '--root', p.dir, '--plan', plan], p.dir);
    expect(dev('init').status).toBe(0);
    mkdirSync(path.join(p.dir, 'ev'));
    writeFileSync(path.join(p.dir, 'ev', 'ok.md'), 'evidência\n');
    expect(dev('set', 'TAR-0001', 'COMPLETED', '--evidence', 'ev/ok.md').status).toBe(0);
    const interim = readFileSync(path.join(p.dir, '.ases', 'HISTORY.jsonl'), 'utf8');

    // antes do corte o engine recusa ser segundo escritor
    expect(runSync(BIN.ases, ['--no-tui'], p.dir).stderr).toMatch(/ases migrate-interim/);

    const m = runSync(BIN.ases, ['migrate-interim', '--json'], p.dir);
    expect(m.status, m.stderr).toBe(0);
    expect(JSON.parse(m.stdout)).toMatchObject({ events: 6, phases: 2, tasks: 2, artifacts: 1 });
    const mirror = readFileSync(path.join(p.dir, '.ases', 'HISTORY.jsonl'), 'utf8');
    expect(mirror.startsWith(interim)).toBe(true); // mesmo eventId/seq/hash, byte a byte
    expect(mirror.slice(interim.length)).toMatch(/"eventType":"LegacyImported"/);
    expect(existsSync(path.join(p.dir, JSON.parse(m.stdout).backup))).toBe(true);
    expect(runSync(DEV, ['verify', '--root', p.dir], p.dir).status).toBe(0);

    // o script interino não escreve mais
    const refused = dev('set', 'TAR-0002', 'READY');
    expect(refused.status).toBe(2);
    expect(refused.stderr).toMatch(/gerido pelo engine/);
    expect(runSync(BIN.ases, ['migrate-interim'], p.dir).status).toBe(2); // segunda vez: nada a migrar

    // o engine assume: estado importado, dependência preservada, evidência obrigatória para concluir
    const ases = start(BIN.ases, ['--no-tui'], p.dir);
    procs.push(ases);
    await ases.waitFor('stdout', 'engine ready');
    ases.send('/tasks');
    await ases.waitFor('stdout', 'TAR-0002');
    expect(ases.out.stdout).toMatch(/TAR-0001\s+PHASE-01\s+COMPLETED\s+feita/);
    ases.send('/task TAR-0002');
    await ases.waitFor('stdout', 'depende de TAR-0001');
    ases.send('/phase new Três');
    await ases.waitFor('stdout', 'criada PHASE-03'); // contadores continuam do ponto importado
    ases.send('/task new PHASE-03 nova');
    await ases.waitFor('stdout', 'criada TAR-0003');
    writeFileSync(path.join(p.dir, 'ev', 'nova.md'), 'prova\n');
    ases.send('/evidence add TAR-0003 ev/nova.md verificação manual');
    await ases.waitFor('stdout', 'evidência ev/nova.md');
    ases.send('/evidence add TAR-0003 ../fora.md');
    await ases.waitFor('stdout', 'arquivo não encontrado: ../fora.md');
    ases.send('/exit');
    expect((await ases.exited).code).toBe(0);

    // clone novo (histórico do engine, sem banco): o engine recusa em vez de sobrescrever o histórico versionado
    const dbFile = path.join(p.dir, '.ases', 'db', 'ases.sqlite');
    const { renameSync } = await import('node:fs');
    renameSync(dbFile, `${dbFile}.away`);
    for (const ext of ['-wal', '-shm']) if (existsSync(dbFile + ext)) renameSync(dbFile + ext, `${dbFile}${ext}.away`);
    const before = readFileSync(path.join(p.dir, '.ases', 'HISTORY.jsonl'), 'utf8');
    const refusedStart = runSync(BIN.ases, ['--no-tui'], p.dir);
    expect(refusedStart.status).toBe(1);
    expect(refusedStart.stderr).toMatch(/DB_MISSING/);
    expect(readFileSync(path.join(p.dir, '.ases', 'HISTORY.jsonl'), 'utf8')).toBe(before);
    renameSync(`${dbFile}.away`, dbFile);
    for (const ext of ['-wal', '-shm']) if (existsSync(`${dbFile}${ext}.away`)) renameSync(`${dbFile}${ext}.away`, dbFile + ext);

    const status = readFileSync(path.join(p.dir, '.ases', 'STATUS.md'), 'utf8');
    expect(status).toContain('Gerado pelo engine');
    expect(status).toMatch(/\| TAR-0003 \| PHASE-03 \| nova \| PLANNED \| — \| ev\/nova\.md \|/);
    expect(readFileSync(path.join(p.dir, '.ases', 'TRACEABILITY.csv'), 'utf8')).toContain('"AER-REQ-001","PHASE-01","TAR-0001"');
    expect(readFileSync(path.join(p.dir, '.ases', 'HANDOFF.md'), 'utf8')).toMatch(/gerado pelo engine do AER[\s\S]*Abertas: TAR-0002 \(PLANNED\), TAR-0003 \(PLANNED\)/);
    expect(JSON.parse(readFileSync(path.join(p.dir, '.ases', 'phases', 'PHASE-03', 'TAR-0003', 'STATUS.json'), 'utf8'))).toMatchObject({ generatedBy: 'aer-engine', evidence: [{ path: 'ev/nova.md' }] });
  }, 60_000);
});
