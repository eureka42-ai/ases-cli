import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { PHASE_STATES, TASK_STATES, type PhaseState, type TaskState } from '@aer/contracts';
import { plan } from '@aer/scheduler';
import type { Engine } from './engine.ts';

export const PLANNED_SLASH: Record<string, string> = {
  '/agent': 'PHASE-07', '/auto': 'PHASE-06', '/manual': 'PHASE-06', '/hybrid': 'PHASE-06', '/parallel': 'PHASE-06', '/usage': 'PHASE-11',
  '/plan': 'PHASE-09', '/skills': 'PHASE-10', '/plugins': 'PHASE-10', '/mcp': 'PHASE-10', '/review': 'PHASE-11', '/diff': 'PHASE-05',
  '/checkpoint': 'PHASE-05', '/resume': 'PHASE-11', '/approval': 'PHASE-10', '/safe-mode': 'PHASE-10', '/history': 'PHASE-04', '/dependencies': 'PHASE-06',
};

export const SLASH_HELP = `Comandos:
  /status                         estado do engine e contagem de tarefas
  /phases                         lista fases
  /tasks [PHASE-XX]               lista tarefas
  /task TAR-XXXX                  detalhe de uma tarefa
  /phase new <título>             cria fase
  /phase move PHASE-XX <ESTADO> [motivo]
  /task new PHASE-XX <título>     cria tarefa
  /task move TAR-XXXX <ESTADO> [motivo]
  /dep add TAR-A TAR-B            TAR-A passa a depender de TAR-B (ciclo é recusado)
  /evidence add TAR-XXXX <arquivo> [nota]   registra evidência (caminho dentro do projeto + SHA-256)
  /schedule                       mostra a ordem do scheduler e por quê (não reserva nada)
  /help   /exit`;

/** Executa um comando da sessão; mesmo código no modo linha e na TUI. 'EXIT' pede encerramento. */
export function handleLine(engine: Engine, line: string, unicode = true): string | undefined {
  const arrow = unicode ? '→' : '->';
  if (!line) return undefined;
  if (!line.startsWith('/')) return 'Chat com agentes ainda não implementado (PHASE-07). Nada foi enviado a nenhum provedor.';
  const [cmd = '', sub, ...rest] = line.split(/\s+/);
  const s = engine.store;
  switch (cmd) {
    case '/help':
      return SLASH_HELP;
    case '/exit':
      return 'EXIT';
    case '/doctor':
      return 'Use `ases doctor` fora da sessão.';
    case '/status': {
      const tasks = s.listTasks();
      const by = tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.state]: (acc[t.state] ?? 0) + 1 }), {});
      return `projeto ${engine.info.name} · seq ${engine.info.lastSeq} · monitores ${engine.info.monitors} · fases ${s.listPhases().length} · tarefas ${tasks.length} ${JSON.stringify(by)}${engine.mirrorError ? ` · ESPELHO PENDENTE: ${engine.mirrorError}` : ''}`;
    }
    case '/phases':
      return s.listPhases().map((p) => `${p.id}  ${p.state.padEnd(10)} ${p.title}`).join('\n') || '(nenhuma fase)';
    case '/tasks':
      return s.listTasks(sub).map((t) => `${t.id}  ${t.phaseId}  ${t.state.padEnd(16)} ${t.title}`).join('\n') || '(nenhuma tarefa)';
    case '/phase':
      if (sub === 'new') return `criada ${engine.mutate((st) => st.createPhase(rest.join(' ')))}`;
      if (sub === 'move') {
        const [id = '', to = '', ...why] = rest;
        if (!(PHASE_STATES as readonly string[]).includes(to)) return `estado inválido; use: ${PHASE_STATES.join(' ')}`;
        return `${id} ${arrow} ${to} (versão ${engine.transitionPhase(id, to as PhaseState, why.join(' ') || null)})`;
      }
      return 'uso: /phase new <título> | /phase move PHASE-XX <ESTADO> [motivo]';
    case '/task': {
      if (sub === 'new') {
        const [phaseId = '', ...title] = rest;
        return `criada ${engine.mutate((st) => st.createTask({ phaseId, title: title.join(' ') }))}`;
      }
      if (sub === 'move') {
        const [id = '', to = '', ...why] = rest;
        if (!(TASK_STATES as readonly string[]).includes(to)) return `estado inválido; use: ${TASK_STATES.join(' ')}`;
        const t = s.getTask(id);
        if (!t) return `tarefa ${id} não encontrada`;
        return `${id} ${t.state} ${arrow} ${to} (versão ${engine.mutate((st) => st.transitionTask(id, to as TaskState, t.version, why.join(' ') || null))})`;
      }
      const t = sub ? s.getTask(sub) : undefined;
      if (!t) return 'uso: /task TAR-XXXX | /task new PHASE-XX <título> | /task move TAR-XXXX <ESTADO> [motivo]';
      const history = s.eventsSince(0, 1000).filter((e) => e.taskId === t.id).map((e) => `  #${e.seq} ${e.eventType} ${JSON.stringify(e.payload)}`);
      // shortcut: varre só os primeiros 1000 eventos; trocar por consulta indexada por task_id quando o histórico crescer
      return [`${t.id} ${unicode ? '—' : '-'} ${t.title}`, `  fase ${t.phaseId} · estado ${t.state} · v${t.version} · prioridade ${t.priority} · risco ${t.risk}`,
        `  requisitos ${t.reqs.join(', ') || '—'} · depende de ${t.dependsOn.join(', ') || '—'}`, '  progresso: indeterminado (sem milestones, AER-REQ-098)', ...history].join('\n');
    }
    case '/dep': {
      const [a = '', b = ''] = rest;
      if (sub !== 'add' || !a || !b) return 'uso: /dep add TAR-A TAR-B  (TAR-A depende de TAR-B)';
      engine.mutate((st) => st.addDependency(a, b));
      return `${a} agora depende de ${b}`;
    }
    case '/evidence': {
      const [id = '', file = '', ...note] = rest;
      if (sub !== 'add' || !id || !file) return 'uso: /evidence add TAR-XXXX <arquivo> [nota]';
      const root = realpathSync.native(engine.projectRoot);
      const abs = path.resolve(root, file);
      if (!existsSync(abs) || !statSync(abs).isFile()) return `arquivo não encontrado: ${file}`;
      const real = realpathSync.native(abs);
      if (!real.startsWith(root + path.sep)) return `evidência precisa estar dentro do projeto: ${file}`;
      const rel = path.relative(root, real).split(path.sep).join('/');
      const sha = createHash('sha256').update(readFileSync(real)).digest('hex');
      engine.mutate((st) => st.recordArtifact(id, { kind: 'EVIDENCE', relativePath: rel, sha256: sha, ...(note.length ? { note: note.join(' ') } : {}) }));
      return `evidência ${rel} (sha256 ${sha.slice(0, 12)}…) registrada em ${id}`;
    }
    case '/schedule': {
      const r = plan(s.listTasks(), s.activeLeases());
      const lines = [
        ...r.eligible.map((c, i) => `${i + 1}. ${c.explanation}`),
        ...r.waiting.map((w) => `   ${w.taskId} espera: ${w.reason}`),
      ];
      return lines.length ? lines.join('\n') : 'nenhuma tarefa READY (use /task move TAR-XXXX READY)';
    }
    default:
      if (cmd in PLANNED_SLASH) return `${cmd}: ainda não implementado (planejado: ${PLANNED_SLASH[cmd]})`;
      return `comando desconhecido: ${cmd} (/help)`;
  }
}

