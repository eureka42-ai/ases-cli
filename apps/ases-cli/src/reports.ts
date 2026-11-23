import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProjectStore } from '@aer/persistence';
import { paths } from '@aer/project-store';

const AUTO_BEGIN = '<!-- AUTO:BEGIN (gerado pelo engine do AER; não editar) -->';
const AUTO_END = '<!-- AUTO:END -->';
const LEGACY_BEGIN = '<!-- AUTO:BEGIN (gerado por scripts/ases-dev.mjs refresh; não editar) -->';

function writeIfChanged(file: string, content: string): void {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, file);
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    return null;
  }
}

/**
 * Artefatos legíveis sem o AER (AER-REQ-016/036/181), derivados do banco: STATUS.md, TRACEABILITY.csv,
 * bloco automático do HANDOFF.md e phases/<PHASE>/<TAR>/STATUS.json. Partes escritas por humanos nunca são tocadas.
 */
export function writeReports(root: string, store: ProjectStore): void {
  const A = paths(root).ases;
  const phases = store.listPhases();
  const tasks = store.listTasks();
  const last = store.eventsSince(Math.max(0, store.lastSeq() - 1), 1)[0];
  const evidence = new Map(tasks.map((t) => [t.id, store.listArtifacts(t.id)]));
  const tests = new Map(tasks.map((t) => [t.id, store.latestTestRun(t.id)]));
  const cell = (xs: string[]) => xs.join('<br>') || '—';

  writeIfChanged(path.join(A, 'STATUS.md'), `# STATUS

Gerado pelo engine a partir do banco (\`.ases/db/ases.sqlite\`). Último evento: seq ${last?.seq ?? '—'} (${last?.eventType ?? '—'}, ${last?.occurredAt ?? '—'})

## Fases
| Fase | Título | Estado |
|---|---|---|
${phases.map((p) => `| ${p.id} | ${p.title} | ${p.state} |`).join('\n')}

## Tarefas
| Tarefa | Fase | Título | Estado | Último teste | Evidência |
|---|---|---|---|---|---|
${tasks.map((t) => {
    const tr = tests.get(t.id);
    return `| ${t.id} | ${t.phaseId} | ${t.title} | ${t.state} | ${tr ? `${tr.command}: exit ${tr.exitCode}, ${tr.failed} falha(s)` : '—'} | ${cell((evidence.get(t.id) ?? []).map((a) => a.relativePath))} |`;
  }).join('\n')}

COMPLETED exige evidência ou test run aprovado (o engine recusa o contrário). NOT_RUN ≠ PASS.
`);

  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const rows = tasks.flatMap((t) => t.reqs.map((r) => [r, t.phaseId, t.id, tests.get(t.id)?.command ?? '', (evidence.get(t.id) ?? []).map((a) => `${a.relativePath}#${a.sha256.slice(0, 12)}`).join(' | '), t.state].map(q).join(',')));
  writeIfChanged(path.join(A, 'TRACEABILITY.csv'), `req_id,phase_id,task_id,last_test,evidence,state\n${rows.join('\n')}\n`);

  const handoff = path.join(A, 'HANDOFF.md');
  if (existsSync(handoff)) {
    const open = tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.state));
    const auto = `${AUTO_BEGIN}
- Último evento válido: seq ${last?.seq ?? '—'} em ${last?.occurredAt ?? '—'}
- Git: branch \`${git(root, ['symbolic-ref', '--short', 'HEAD']) ?? 'desconhecido'}\`, HEAD \`${git(root, ['rev-parse', '--short', 'HEAD']) ?? 'sem commits'}\`
- Concluídas: ${tasks.filter((t) => t.state === 'COMPLETED').length} de ${tasks.length}
- Abertas: ${open.map((t) => `${t.id} (${t.state})`).join(', ') || 'nenhuma'}
- Comando para retomar: \`ases\` nesta pasta (ou \`ases --no-tui\` em scripts); monitor: \`ases-tar\`
${AUTO_END}`;
    const text = readFileSync(handoff, 'utf8');
    const begin = text.includes(AUTO_BEGIN) ? AUTO_BEGIN : LEGACY_BEGIN;
    const s = text.indexOf(begin);
    const e = text.indexOf(AUTO_END);
    if (s !== -1 && e > s) writeIfChanged(handoff, text.slice(0, s) + auto + text.slice(e + AUTO_END.length));
  }

  for (const t of tasks) {
    writeIfChanged(path.join(A, 'phases', t.phaseId, t.id, 'STATUS.json'), `${JSON.stringify({
      schemaVersion: 2, generatedBy: 'aer-engine', taskId: t.id, phaseId: t.phaseId, title: t.title, state: t.state, version: t.version,
      reqs: t.reqs, dependsOn: t.dependsOn, evidence: (evidence.get(t.id) ?? []).map((a) => ({ path: a.relativePath, sha256: a.sha256 })),
      lastTest: tests.get(t.id) ?? null,
    }, null, 2)}\n`);
  }
}
