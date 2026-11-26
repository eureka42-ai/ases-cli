import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, start, tempProject } from './helpers.mjs';

// Pedido de aprovação feito pelo agente: vira APR pendente em /approval; concedido, a tarefa volta a READY e o próximo
// /run executa a operação aprovada (uso único).
describe('agent approval request is grantable from /approval', () => {
  requireBuild();
  const p = tempProject('e2e approval');
  afterAll(() => p.cleanup());

  it('PENDING APR → grant → READY → /run → REVIEW, APR CONSUMED', async () => {
    for (const a of [['init', '-q', '-b', 'main'], ['config', 'user.name', 'E2E'], ['config', 'user.email', 'e2e@example.invalid'], ['config', 'commit.gpgsign', 'false'], ['commit', '-q', '--allow-empty', '-m', 'base']]) spawnSync('git', a, { cwd: p.dir });
    expect(runSync(BIN.ases, ['init', '--name', 'apr'], p.dir).status).toBe(0);
    const ases = start(BIN.ases, ['--no-tui'], p.dir, { NO_COLOR: '1' });
    await ases.waitFor('stdout', 'engine ready');
    ases.send('/phase new Aprovacoes');
    ases.send('/task new PHASE-01 Apagar build --provider simulator:approval');
    ases.send('/task move TAR-0001 READY');
    ases.send('/run');
    await ases.waitFor('stdout', (s) => /TAR-0001 ATT-0001 .*BLOCKED: APPROVAL_REQUIRED: APR-0001/.test(s), 30_000);
    ases.send('/approval');
    await ases.waitFor('stdout', (s) => /APR-0001 PENDING\s+PROVIDER_OPERATION\s+TAR-0001 simulator · SIMULATED: apagar a pasta build\//.test(s));
    ases.send('/approval grant APR-0001 Tester');
    await ases.waitFor('stdout', 'TAR-0001 BLOCKED → READY');
    ases.send('/run');
    await ases.waitFor('stdout', (s) => /TAR-0001 ATT-0002 .*REVIEW/.test(s), 30_000);
    ases.send('/approval');
    await ases.waitFor('stdout', (s) => /APR-0001 CONSUMED/.test(s));
    ases.send('/exit');
    expect((await ases.exited).code).toBe(0);
  }, 90_000);
});
