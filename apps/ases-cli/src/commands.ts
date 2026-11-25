import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { PHASE_STATES, TASK_STATES, type PhaseState, type TaskState } from '@aer/contracts';
import { plan } from '@aer/scheduler';
import type { Engine } from './engine.ts';
import { METHODOLOGY_COMMANDS, METHODOLOGY_HELP, handleMethodology } from './methodology-commands.ts';
import { SECURITY_COMMANDS, SECURITY_HELP, handleSecurity } from './security-commands.ts';
import { CONTINUITY_COMMANDS, CONTINUITY_HELP, handleContinuity } from './continuity-commands.ts';
import { CHAT_ALIASES, CHAT_COMMANDS, chatMessage, chatSession, handleChat, resolveTaskRef } from './chat-commands.ts';
import { onboarding } from './onboarding.ts';

export const PLANNED_SLASH: Record<string, string> = {
  '/parallel': 'use /run --parallel N ou /config limite <ia> <n>', '/skills': 'use /ext', '/plugins': 'use /ext', '/mcp': 'use /ext',
  '/checkpoint': 'PHASE-05', '/safe-mode': 'sem fase alocada', '/dependencies': 'PHASE-06',
};

export const SLASH_HELP = `Comandos técnicos (o chat e os comandos simples estão em /ajuda):
  /status                         estado do engine e contagem de tarefas
  /phases                         lista fases
  /tasks [PHASE-XX]               lista tarefas
  /task TAR-XXXX                  detalhe de uma tarefa
  /phase new <título>             cria fase
  /phase move PHASE-XX <ESTADO> [motivo]
  /phase order PHASE-XX PHASE-YY …  reordena as fases (lista todas); os IDs não mudam
  /task new PHASE-XX <título> [--reqs AER-REQ-1,AER-REQ-2] [--provider simulator[:cenário]] [--resources r1,r2] [--ext EXT-1]
  /task move TAR-XXXX <ESTADO> [motivo]
  /dep add TAR-A TAR-B            TAR-A passa a depender de TAR-B (ciclo é recusado)
  /evidence add TAR-XXXX <arquivo> [nota]   registra evidência (caminho dentro do projeto + SHA-256)
  /schedule                       mostra a ordem do scheduler e por quê (não reserva nada)
  /run [PHASE-XX] [--parallel N] [--timeout S] [--consent claude,codex,kimi,opencode,google]
                                  executa as tarefas READY pelo provider de cada uma; simulator dispensa aceite;
                                  providers reais usam a SUA sessão oficial (cota/cobrança) e só rodam com --consent
  /cancel TAR-XXXX                cancela uma tarefa em execução (encerra a árvore de processos do agente)
  /help   /exit

${METHODOLOGY_HELP}

${SECURITY_HELP}

${CONTINUITY_HELP}`;

/** Executa um comando da sessão; mesmo código no modo linha e na TUI. 'EXIT' pede encerramento; /run devolve Promise. */
export function handleLine(engine: Engine, line: string, unicode = true): string | Promise<string> | undefined {
  // PHASE-23: /iniciar-projeto guia a metodologia; enquanto ativo, as respostas vão para ele (Enter vazio inclusive)
  const ob = onboarding(engine);
  if (/^\/(iniciar-projeto|iniciar)\s*$/i.test(line.trim())) return ob.start();
  if (ob.active) return ob.handle(line).then((r) => r ?? String(handleLineCore(engine, line, unicode) ?? ''));
  return handleLineCore(engine, line, unicode);
}

function handleLineCore(engine: Engine, line: string, unicode = true): string | Promise<string> | undefined {
  const arrow = unicode ? '→' : '->';
  if (!line) return undefined;
  // PHASE-18: texto livre vai para a IA principal
  if (!line.startsWith('/')) return chatMessage(engine, line);
  const parts = line.split(/\s+/);
  let [cmd = '', sub, ...rest] = parts;
  cmd = cmd.toLowerCase();
  // aliases em inglês; /tasks continua técnico e /diff com ATT também (/tarefas e /ver são os do chat)
  const technical = cmd === '/diff' && rest.length > 0;
  if (!technical && CHAT_ALIASES[cmd]) cmd = CHAT_ALIASES[cmd]!;
  const s = engine.store;
  if (cmd === '/sair' || cmd === '/exit') return 'EXIT';
  if (cmd === '/ver') return sub ? handleContinuity(engine, '/diff', resolveTaskRef(sub), rest) : 'uso: /ver <n> (ex.: /ver 12)';
  if (cmd === '/cancel' && !sub) {
    return chatSession(engine).pendingPlan().then((p) => {
      if (!p) return 'nenhum plano pendente (para cancelar uma tarefa: /cancel TAR-XXXX)';
      engine.mutate((st) => st.decidePlan(p.id, 'cancelled', 'user'));
      return `plano ${p.id} descartado; nada foi executado`;
    });
  }
  if (cmd === '/manual' || cmd === '/hybrid') {
    return chatSession(engine).conversation().then((c) => {
      engine.mutate((st) => st.setConversationMode(c.id, cmd === '/manual' ? 'manual' : 'hybrid'));
      return cmd === '/manual' ? 'modo manual: cada plano pergunta antes' : 'modo híbrido: planos pequenos e já autorizados rodam direto; os outros perguntam';
    });
  }
  if (CHAT_COMMANDS.has(cmd)) return handleChat(engine, cmd, [sub, ...rest].filter((x): x is string => Boolean(x)), () => SLASH_HELP);
  switch (cmd) {
    case '/doctor':
      return 'Use `ases doctor` fora da sessão.';
    case '/status': {
      const tasks = s.listTasks();
      const by = tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.state]: (acc[t.state] ?? 0) + 1 }), {});
      const busy = engine.runningTasks;
      return `projeto ${engine.info.name} · seq ${engine.info.lastSeq} · monitores ${engine.info.monitors} · fases ${s.listPhases().length} · tarefas ${tasks.length} ${JSON.stringify(by)}${busy.length ? ` · em execução ${busy.join(', ')}` : ''}${engine.mirrorError ? ` · ESPELHO PENDENTE: ${engine.mirrorError}` : ''}`;
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
      if (sub === 'order') {
        engine.mutate((st) => st.reorderPhases(rest));
        return `ordem: ${engine.store.listPhases().map((p) => p.id).join(' ')}`;
      }
      return 'uso: /phase new <título> | /phase move PHASE-XX <ESTADO> [motivo] | /phase order PHASE-XX PHASE-YY …';
    case '/task': {
      if (sub === 'new') {
        const [phaseId = '', ...words] = rest;
        const opt = (flag: string) => {
          const i = words.indexOf(flag);
          return i < 0 ? undefined : words.splice(i, 2)[1];
        };
        const reqs = opt('--reqs');
        const provider = opt('--provider');
        const resources = opt('--resources');
        const exts = opt('--ext');
        return `criada ${engine.mutate((st) => st.createTask({
          phaseId, title: words.join(' '),
          ...(reqs ? { reqs: reqs.split(',') } : {}), ...(provider ? { provider } : {}), ...(resources ? { resources: resources.split(',') } : {}),
          ...(exts ? { extensions: exts.split(',') } : {}),
        }))}`;
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
    case '/run': {
      const args = [sub, ...rest].filter((x): x is string => Boolean(x));
      const num = (flag: string, def: number, min: number, max: number) => {
        const i = args.indexOf(flag);
        if (i < 0) return def;
        const v = Number(args.splice(i, 2)[1]);
        if (!Number.isInteger(v) || v < min || v > max) throw Object.assign(new Error(`${flag} must be an integer ${min}..${max}`), { code: 'INVALID_INPUT' });
        return v;
      };
      const maxParallel = num('--parallel', 2, 1, 16);
      const timeoutS = num('--timeout', 600, 1, 24 * 3600);
      const ci = args.indexOf('--consent');
      const consent = ci < 0 ? [] : (args.splice(ci, 2)[1] ?? '').split(',').filter(Boolean);
      const [phaseId, extra] = args;
      if (extra || (phaseId && !/^PHASE-\d{2,}$/.test(phaseId)) || (ci >= 0 && !consent.length)) return 'uso: /run [PHASE-XX] [--parallel N] [--timeout S] [--consent claude,codex,kimi,opencode,google]';
      return engine.run({ ...(phaseId ? { phaseId } : {}), maxParallel, timeoutMs: timeoutS * 1000, consent }).then((r) => {
        if (!r.outcomes.length) return `nada para executar${phaseId ? ` em ${phaseId}` : ''}${r.waiting.length ? `:\n${r.waiting.map((w) => `   ${w.taskId} espera: ${w.reason}`).join('\n')}` : ' (nenhuma tarefa READY elegível)'}`;
        return [
          `run concluído (${r.outcomes.length} tentativa(s), paralelismo ${maxParallel}):`,
          ...r.outcomes.map((o) => `  ${o.taskId} ${o.attemptId ?? '-'} ${o.providerId ?? '-'}${o.simulated ? ' [SIMULATED]' : ''} ${arrow} ${o.state}: ${o.reason}`),
          ...r.waiting.map((w) => `  ${w.taskId} espera: ${w.reason}`),
        ].join('\n');
      });
    }
    case '/cancel':
      if (!sub) return 'uso: /cancel TAR-XXXX';
      return engine.cancelTask(sub) ? `${sub}: cancelamento pedido; o resultado aparece quando a árvore de processos for encerrada` : `${sub} não está em execução neste engine`;
    default:
      if (METHODOLOGY_COMMANDS.has(cmd)) return handleMethodology(engine, cmd, sub, rest);
      if (SECURITY_COMMANDS.has(cmd)) return handleSecurity(engine, cmd, sub, rest);
      if (CONTINUITY_COMMANDS.has(cmd)) return handleContinuity(engine, cmd, sub, rest);
      if (cmd in PLANNED_SLASH) return `${cmd}: ainda não implementado (planejado: ${PLANNED_SLASH[cmd]})`;
      return `comando desconhecido: ${cmd} (/help)`;
  }
}

