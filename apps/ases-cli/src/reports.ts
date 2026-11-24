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

  // PHASE-09: matriz ASES-300/500 (só quando a metodologia está ativa no projeto)
  const reqs = store.listRequirements();
  if (reqs.length) {
    const tasksByReq = new Map<string, string[]>();
    for (const t of tasks) for (const r of t.reqs) tasksByReq.set(r, [...(tasksByReq.get(r) ?? []), t.id]);
    writeIfChanged(path.join(A, 'REQUIREMENTS-MATRIX.csv'), `id,series,title,classification,priority,status,approved_by,evidence,note,tasks,text_sha256,origin\n${reqs.map((r) => [
      r.id, r.series, r.title, r.classification, r.priority, r.status, r.approvedBy ?? '', r.evidencePath ? `${r.evidencePath}#${r.evidenceSha256!.slice(0, 12)}` : '',
      r.note ?? '', (tasksByReq.get(r.id) ?? []).join(' '), r.textSha256, r.origin,
    ].map(q).join(',')).join('\n')}\n`);
    const decisions = store.listDecisions();
    const changes = store.listChanges();
    writeIfChanged(path.join(A, 'DECISIONS.md'), `# Decisões e mudanças (ASES-500)

Gerado pelo engine. Fonte ASES-500 consolidada **para validação** (não é original homologado).

## Decisões
| ID | Pergunta | Estado | Resposta | CHANGE |
|---|---|---|---|---|
${decisions.map((d) => `| ${d.id} | ${d.questionId} — ${d.question.replaceAll('|', '/')} | ${d.state} | ${d.answer.replaceAll('|', '/') || '—'} | ${d.changeId ?? '—'} |`).join('\n')}

## Mudanças controladas
| ID | Motivo | Itens | Aprovado por |
|---|---|---|---|
${changes.map((c) => `| ${c.id} | ${c.reason.replaceAll('|', '/')} | ${c.targets.join(', ')} | ${c.approvedBy} |`).join('\n')}
`);
  }

  // TASK.md e PHASE.md derivados do banco (AER-REQ-023/025/028/030/032); nunca editados à mão
  const reqInfo = (id: string) => {
    const r = store.getRequirement(id);
    return r ? `${id} — ${r.title}${r.acceptance ? ` · aceite: ${r.acceptance}` : ''} (${r.status})` : id;
  };
  const header = '<!-- GERADO pelo engine do AER a partir do banco; não editar -->';
  for (const t of tasks) {
    const attempts = store.listAttempts(t.id);
    const runs = store.listTestRuns(t.id);
    const arts = evidence.get(t.id) ?? [];
    writeIfChanged(path.join(A, 'phases', t.phaseId, t.id, 'TASK.md'), `${header}
# ${t.id} — ${t.title}

| Campo | Valor |
|---|---|
| task_id | ${t.id} |
| phase_id | ${t.phaseId} |
| estado | ${t.state} (v${t.version}) |
| prioridade / risco | ${t.priority} / ${t.risk} |
| provider | ${t.provider ?? '—'} |
| dependências | ${t.dependsOn.join(', ') || '—'} |
| extensões | ${t.extensions.join(', ') || '—'} |
| recursos | ${t.resources.join(', ') || '—'} |

## Objetivo / escopo
${t.description || t.title}

## Requisitos e critérios de aceite
${t.reqs.length ? t.reqs.map((r) => `- ${reqInfo(r)}`).join('\n') : '- **nenhum requisito ligado**'}

## Tentativas
${attempts.length ? attempts.map((a) => `- ${a.id} · ${a.providerId} · ${a.state}${a.exitCode !== null ? ` · exit ${a.exitCode}` : ''}${a.failureCode ? ` · ${a.failureCode}` : ''} · \`${a.branch ?? '—'}\``).join('\n') : '- nenhuma'}

## Testes executados
${runs.length ? runs.map((r) => `- ${r.startedAt} \`${r.command}\` → exit ${r.exitCode}`).join('\n') : '- nenhum (validação NÃO concluída)'}

## Evidências, revisões e handoffs
${arts.length ? arts.map((a) => `- ${a.kind} ${a.relativePath} (sha256 ${a.sha256.slice(0, 12)}…)${a.note ? ` — ${a.note}` : ''}`).join('\n') : '- nenhuma'}

## Critério de saída
COMPLETED só com evidência ou test run aprovado, depois de REVIEW → APPROVED → MERGING (o engine recusa o contrário).
`);
  }
  let phaseEvents: ReturnType<ProjectStore['eventsSince']> | undefined;
  const phaseReason = (phaseId: string) => {
    phaseEvents ??= (() => {
      const all: ReturnType<ProjectStore['eventsSince']> = [];
      for (let after = 0, page; (page = store.eventsSince(after, 1000)).length; after = page.at(-1)!.seq) all.push(...page.filter((e) => e.eventType === 'PhaseUpdated'));
      return all;
    })();
    const last = phaseEvents.filter((e) => e.phaseId === phaseId).at(-1);
    return last ? `${String(last.payload.reason ?? '—')} (seq ${last.seq})` : '—';
  };
  for (const ph of phases) {
    const pt = tasks.filter((t) => t.phaseId === ph.id);
    const reqs = [...new Set(pt.flatMap((t) => t.reqs))].sort();
    const open = pt.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.state));
    writeIfChanged(path.join(A, 'phases', ph.id, 'PHASE.md'), `${header}
# ${ph.id} — ${ph.title}

- **Estado:** ${ph.state} (v${ph.version})${ph.state === 'BLOCKED' ? `\n- **Motivo do bloqueio:** ${phaseReason(ph.id)} · tarefas pendentes: ${open.map((t) => `${t.id} (${t.state})`).join(', ') || '—'}` : ''}
- **Requisitos da fase** (união das tarefas): ${reqs.join(', ') || '—'}

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
${pt.map((t) => `| ${t.id} — ${t.title.replaceAll('|', '/')} | ${t.state} | ${t.provider ?? '—'} | ${t.dependsOn.join(', ') || '—'} | ${t.reqs.join(', ') || '—'} |`).join('\n')}

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).
${ph.state === 'COMPLETED' ? `
## Relatório de conclusão
${pt.map((t) => {
      const runs = store.listTestRuns(t.id);
      const arts = evidence.get(t.id) ?? [];
      return `- **${t.id}** ${t.state}: ${runs.length ? `${runs.length} test run(s), último exit ${runs.at(-1)!.exitCode}` : 'sem test run'}; ${arts.length} evidência(s)${t.state === 'CANCELLED' ? ' · **exceção: cancelada**' : ''}`;
    }).join('\n')}
- Motivo registrado na conclusão: ${phaseReason(ph.id)}
` : ''}`);
  }

  for (const t of tasks) {
    writeIfChanged(path.join(A, 'phases', t.phaseId, t.id, 'STATUS.json'), `${JSON.stringify({
      schemaVersion: 2, generatedBy: 'aer-engine', taskId: t.id, phaseId: t.phaseId, title: t.title, state: t.state, version: t.version,
      reqs: t.reqs, dependsOn: t.dependsOn, evidence: (evidence.get(t.id) ?? []).map((a) => ({ path: a.relativePath, sha256: a.sha256 })),
      lastTest: tests.get(t.id) ?? null,
    }, null, 2)}\n`);
  }
}
