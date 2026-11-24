#!/usr/bin/env node
// Matriz de suporte publicada (AER-REQ-225/233/239): lê os jobs REAIS de um run do CI (gh run view) e escreve, por
// alvo, PASS / FAIL / NOT_RUN. Cancelado, pulado ou na fila = NOT_RUN, nunca PASS. Sem run, nada é inventado.
// Uso: node scripts/support-matrix.mjs <run-id> [--out arquivo.md]   (no Actions: GH_TOKEN + GITHUB_RUN_ID)
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

// runner → alvo (CHANGE-0001: sem macOS Intel). Status do alvo conforme platform-core (TARGET / CONDITIONAL).
const RUNNERS = {
  'macos-latest': { target: 'darwin-arm64', tier: 'TARGET' },
  'windows-latest': { target: 'win32-x64', tier: 'TARGET' },
  'ubuntu-latest': { target: 'linux-x64', tier: 'TARGET' },
  'windows-11-arm': { target: 'win32-arm64', tier: 'TARGET' }, // arm64: TARGET desde 24/11/2026 (AER-REQ-239)
  'ubuntu-24.04-arm': { target: 'linux-arm64', tier: 'TARGET' },
};

export function stateOf(job) {
  if (job.status !== 'completed') return 'NOT_RUN';
  if (job.conclusion === 'success') return 'PASS';
  if (job.conclusion === 'failure' || job.conclusion === 'timed_out') return 'FAIL';
  return 'NOT_RUN'; // cancelled, skipped, neutral, action_required
}

export function matrix(jobs) {
  const rows = [];
  for (const j of jobs) {
    const m = /^verify \(([^,]+), ([^)]+)\)$/.exec(j.name);
    if (!m || !RUNNERS[m[1]]) continue;
    rows.push({ ...RUNNERS[m[1]], runner: m[1], node: m[2], state: stateOf(j) });
  }
  return rows.sort((a, b) => a.target.localeCompare(b.target) || a.node.localeCompare(b.node));
}

/** Um alvo só é "suportado" com TODOS os jobs dele em PASS; CONDITIONAL nunca vira suportado sem decisão do responsável. */
export function render(rows, meta) {
  const by = new Map();
  for (const r of rows) by.set(r.target, [...(by.get(r.target) ?? []), r]);
  const verdict = (rs) => (rs.every((r) => r.state === 'PASS') ? 'PASS' : rs.some((r) => r.state === 'FAIL') ? 'FAIL' : 'NOT_RUN');
  return [
    `# Matriz de suporte (run ${meta.run}${meta.sha ? `, commit ${meta.sha.slice(0, 7)}` : ''})`,
    '',
    'Gerada por `scripts/support-matrix.mjs` a partir dos jobs reais do CI. NOT_RUN não é PASS.',
    '',
    '| Alvo | Nível | Node | Runner | Estado |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.target} | ${r.tier} | ${r.node} | ${r.runner} | ${r.state} |`),
    '',
    '| Alvo | Resultado do alvo |',
    '|---|---|',
    ...[...by].map(([t, rs]) => `| ${t} | ${verdict(rs)}${rs[0].tier === 'CONDITIONAL' ? ' (CONDITIONAL: não anunciado como suportado)' : ''} |`),
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('support-matrix.mjs')) {
  const run = process.argv[2] ?? process.env.GITHUB_RUN_ID;
  if (!run) {
    console.error('uso: node scripts/support-matrix.mjs <run-id> [--out arquivo.md]');
    process.exit(2);
  }
  const data = JSON.parse(execFileSync('gh', ['run', 'view', String(run), '--json', 'jobs,headSha'], { encoding: 'utf8' }));
  const md = render(matrix(data.jobs), { run, sha: data.headSha });
  const i = process.argv.indexOf('--out');
  if (i > 0) writeFileSync(process.argv[i + 1], md);
  else if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  else process.stdout.write(md);
}
