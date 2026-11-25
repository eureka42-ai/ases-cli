import { VERSIONS } from '@aer/contracts';
import { aboutText, LOGO_MODES, THEME_CHOICES } from '@aer/branding';
import type { PlanRow, PlannedTask } from '@aer/persistence';
import { saveChatConfig, saveUiConfig, type ChatMode } from '@aer/project-store';
import type { ChatTurnResult, PlanResult } from '@aer/scheduler';
import { ChatSession, decidePlanMode } from './chat-session.ts';
import { changesText } from './chat-format.ts';
import type { Engine } from './engine.ts';

// PHASE-18: comandos simples em português (aprovados pelo responsável), com alias em inglês e número curto de tarefa.

export const CHAT_ALIASES: Record<string, string> = {
  '/help': '/ajuda', '/model': '/ia', '/agent': '/ia', '/agents': '/ias', '/plan': '/plano', '/diff': '/ver',
  '/accept': '/aceitar', '/redo': '/refazer', '/assign': '/trocar', '/undo': '/desfazer', '/stop': '/parar', '/new': '/nova',
  '/settings': '/config', '/about': '/sobre', '/exit': '/sair', '/update': '/atualizar',
};

export const SLASH_MENU: { cmd: string; desc: string }[] = [
  { cmd: '/ajuda', desc: 'o que dá para fazer' },
  { cmd: '/ia', desc: 'mostra ou troca a IA principal' },
  { cmd: '/ias', desc: 'IAs instaladas, logadas, livres ou ocupadas' },
  { cmd: '/plano', desc: 'mostra o plano; Enter executa' },
  { cmd: '/auto', desc: 'liga ou desliga o modo automático' },
  { cmd: '/tarefas', desc: 'tarefas da conversa, ao vivo' },
  { cmd: '/ver', desc: 'o que uma tarefa mudou (/ver 12)' },
  { cmd: '/aceitar', desc: 'traz o trabalho pronto para o projeto' },
  { cmd: '/refazer', desc: 'devolve a tarefa com o motivo' },
  { cmd: '/trocar', desc: 'troca a IA de uma tarefa' },
  { cmd: '/desfazer', desc: 'desfaz a última edição da principal' },
  { cmd: '/parar', desc: 'para tudo' },
  { cmd: '/nova', desc: 'começa uma conversa nova' },
  { cmd: '/config', desc: 'tema, logo, modo, limites, teste, autorizações' },
  { cmd: '/atualizar', desc: 'atualiza o AER pelo npm' },
  { cmd: '/sobre', desc: 'quem faz o Eureka42' },
  { cmd: '/sair', desc: 'sai do ases' },
];

/** Filtra o menu do `/` pelo que foi digitado (`/a` → /ajuda /aceitar /atualizar /auto). */
export const filterMenu = (prefix: string) => SLASH_MENU.filter((m) => m.cmd.startsWith(prefix.toLowerCase()));

export const CHAT_HELP = `Converse em texto livre com a IA principal; ela lê, planeja e edita o projeto (/desfazer volta).
Pedidos grandes viram um plano que o ASES divide entre as outras IAs, em paralelo.

${SLASH_MENU.map((m) => `  ${m.cmd.padEnd(11)} ${m.desc}`).join('\n')}

Equivalentes em inglês: ${Object.keys(CHAT_ALIASES).join(' ')}
Comandos técnicos (fases, tarefas, gates): /ajuda avançado · eureka42.org`;

export const CHAT_COMMANDS = new Set(['/ajuda', '/ia', '/ias', '/plano', '/auto', '/tarefas', '/ver', '/aceitar', '/refazer', '/trocar', '/desfazer', '/parar', '/nova', '/config', '/sobre', '/sair', '/atualizar']);

/** `12` → `TAR-0012`; `TAR-0012` fica igual. */
export function resolveTaskRef(ref: string): string {
  if (/^TAR-\d{4,}$/.test(ref)) return ref;
  if (/^\d{1,6}$/.test(ref)) return `TAR-${ref.padStart(4, '0')}`;
  throw Object.assign(new Error(`tarefa inválida: ${ref} (use 12 ou TAR-0012)`), { code: 'INVALID_INPUT' });
}

const sessions = new WeakMap<Engine, ChatSession>();
export function chatSession(engine: Engine): ChatSession {
  let s = sessions.get(engine);
  if (!s) sessions.set(engine, (s = new ChatSession(engine)));
  return s;
}

export function formatPlan(p: PlanRow): string {
  return [`Plano ${p.id} (${p.tasks.length} tarefa${p.tasks.length > 1 ? 's' : ''}):`,
    ...p.tasks.map((t, i) => `  ${i + 1}. ${t.title} → ${t.provider}${t.dependsOn.length ? ` · depois de ${t.dependsOn.join(', ')}` : ''}${p.reasons[i] ? ` (${p.reasons[i]})` : ''}`),
    'Enter ou /plano executar para rodar · Ctrl+E ou /plano editar 1 provider=<ia> · Ctrl+N ou /cancel descarta'].join('\n');
}

const formatResult = (r: PlanResult) => r.tasks.map((t) => `  ${t.taskId} ${t.provider} ${t.state} · testes ${t.tests} · revisão ${t.review ?? '—'}${t.swaps ? ` · trocas ${t.swaps}` : ''}${t.reworks ? ` · refações ${t.reworks}` : ''} — ${t.reason}`).join('\n');

async function replyText(engine: Engine, r: ChatTurnResult): Promise<string> {
  const chat = chatSession(engine);
  if (!r.ok) return `erro ${r.code}: ${r.message}`;
  const c = await chat.conversation();
  const lines = [`${c.main}> ${r.reply}`];
  if (r.restore) {
    // o que mudou, arquivo por arquivo, com as linhas (+ verde / − vermelho na TUI)
    if (r.restore.changes?.length) lines.push(changesText(r.restore.changes));
    else lines.push(`● Editou ${r.restore.files.join(', ')}`);
    lines.push('    /desfazer volta estas mudanças');
  }
  if (r.planError) lines.push(`plano recusado: ${r.planError}. Nada foi executado.`);
  if (r.planId) {
    const plan = engine.store.getPlan(r.planId)!;
    if (decidePlanMode(c.mode, plan, chat.consent) === 'run') {
      engine.mutate((s) => s.decidePlan(plan.id, 'auto', `modo ${c.mode}`));
      lines.push(formatPlan(plan).split('\n').slice(0, -1).join('\n'), 'executando (modo automático)…', await runPlanText(engine, plan.id));
    } else lines.push(formatPlan(plan));
  }
  return lines.join('\n');
}

async function runPlanText(engine: Engine, planId: string): Promise<string> {
  const { result, summary } = await chatSession(engine).runPlan(planId);
  return [`Resultado de ${planId}:`, formatResult(result), await replyText(engine, summary), 'Use /ver <n> para conferir e /aceitar para trazer ao projeto.'].join('\n');
}

/** Texto livre: um turno da principal. */
export async function chatMessage(engine: Engine, text: string): Promise<string> {
  return replyText(engine, await chatSession(engine).send(text));
}

export async function handleChat(engine: Engine, cmd: string, args: string[], advancedHelp: () => string): Promise<string> {
  const chat = chatSession(engine);
  const [a = '', b = '', ...rest] = args;
  switch (cmd) {
    case '/ajuda':
      return a === 'avançado' || a === 'avancado' || a === 'advanced' ? advancedHelp() : CHAT_HELP;
    case '/sobre':
      return aboutText(VERSIONS.app);
    case '/ia': {
      const c = await chat.conversation();
      if (!a) return `principal: ${c.main} · modo: ${c.mode} · troque com /ia <nome> (${Object.keys(engine.providers).join(', ')})`;
      if (!(a in engine.providers)) return `IA desconhecida: ${a} (use uma de: ${Object.keys(engine.providers).join(', ')})`;
      engine.mutate((s) => s.setMainProvider(c.id, a));
      const p = (await chat.probeAll())[a];
      const warn = p && p.availability !== 'READY' ? ` (atenção: ${a} está ${p.availability})` : '';
      const consent = engine.providers[a]!.requiresConsent && !chat.consent.has(a) ? ` · autorize a sua conta com /config consentir ${a}` : '';
      return `principal agora: ${a}${warn}${consent}`;
    }
    case '/ias': {
      const p = await chat.probeAll(true);
      const c = await chat.conversation();
      const busy = new Set(engine.store.listTasks().filter((t) => t.state === 'RUNNING' && t.provider).map((t) => t.provider!.split(':')[0]));
      return Object.entries(p).map(([id, r]) => `  ${id.padEnd(12)} ${r.availability.padEnd(18)} ${r.version ?? ''}${id === c.main ? ' · principal' : ''}${busy.has(id) ? ' · ocupada' : ''}${engine.providers[id]!.requiresConsent ? (chat.consent.has(id) ? ' · autorizada' : ' · precisa de /config consentir') : ' · SIMULADA'}`).join('\n');
    }
    case '/plano': {
      const c = await chat.conversation();
      const p = await chat.pendingPlan();
      if (!a) return p ? formatPlan(p) : 'nenhum plano pendente (peça algo grande no chat)';
      if (!p) return 'nenhum plano pendente';
      if (a === 'executar' || a === 'go') {
        engine.mutate((s) => s.decidePlan(p.id, 'approved', 'user'));
        return runPlanText(engine, p.id);
      }
      if (a === 'editar' || a === 'edit') {
        const i = Number(b) - 1;
        if (!p.tasks[i]) return `item ${b} não existe no plano`;
        const tasks: PlannedTask[] = p.tasks.map((t) => ({ ...t }));
        for (const kv of rest) {
          const [k, ...v] = kv.split('=');
          if (k === 'provider' && v.length) tasks[i]!.provider = v.join('=');
          else if (k === 'title' && v.length) tasks[i]!.title = v.join('=');
          else return `uso: /plano editar <n> provider=<ia> | title=<texto>`;
        }
        if (!(tasks[i]!.provider in engine.providers)) return `IA desconhecida: ${tasks[i]!.provider}`;
        const id = engine.mutate((s) => {
          s.decidePlan(p.id, 'cancelled', 'user (edição)');
          return s.proposePlan(c.id, tasks, p.reasons.map((r, k) => (k === i ? `${tasks[i]!.provider}: escolhida pelo usuário` : r)));
        });
        return formatPlan(engine.store.getPlan(id)!);
      }
      return 'uso: /plano | /plano executar | /plano editar <n> provider=<ia>';
    }
    case '/auto': {
      const c = await chat.conversation();
      const mode: ChatMode = c.mode === 'auto' ? 'manual' : 'auto';
      engine.mutate((s) => s.setConversationMode(c.id, mode));
      return mode === 'auto' ? 'modo automático ligado: planos rodam sem perguntar (as autorizações por IA continuam valendo)' : 'modo automático desligado: cada plano pergunta antes';
    }
    case '/tarefas': {
      const t = await chat.tasks();
      return t.length ? t.map((x) => `  ${x.id} ${(x.provider ?? '—').padEnd(14)} ${x.state.padEnd(10)} ${x.title}`).join('\n') : 'nenhuma tarefa nesta conversa ainda';
    }
    case '/aceitar':
      return (await chat.accept(a ? resolveTaskRef(a) : undefined)).join('\n');
    case '/refazer': {
      const id = resolveTaskRef(a);
      const why = [b, ...rest].join(' ').trim() || 'refazer a pedido do usuário';
      const t = engine.store.getTask(id);
      if (!t || t.state !== 'REVIEW') return `${id} precisa estar em REVIEW para refazer`;
      const { handoffTask } = await import('@aer/scheduler');
      engine.mutate((s) => s.appendEvent({ eventType: 'TaskReworkRequested', phaseId: t.phaseId, taskId: id, payload: { reason: why, by: 'user' } }));
      await handoffTask(chat.deps(), id, t.provider ?? '', `refação pedida pelo usuário: ${why}`);
      return `${id} volta para ${t.provider}: ${why} · rode /plano executar ou /run para continuar`;
    }
    case '/trocar': {
      const id = resolveTaskRef(a);
      if (!(b in engine.providers)) return `IA desconhecida: ${b}`;
      const t = engine.store.getTask(id);
      if (!t) return `tarefa ${id} não encontrada`;
      if (['PLANNED', 'READY'].includes(t.state)) {
        engine.mutate((s) => s.setTaskProvider(id, b));
        return `${id} agora é de ${b}`;
      }
      const { handoffTask } = await import('@aer/scheduler');
      await handoffTask(chat.deps(), id, b, `troca pedida pelo usuário`);
      return `${id}: ${t.provider} → ${b} (handoff gravado; nada se perde)`;
    }
    case '/desfazer':
      return chat.undo();
    case '/parar': {
      const running = engine.runningTasks;
      const aborted = engine.abortExclusive();
      for (const id of running) engine.cancelTask(id);
      const turn = chat.stopTurn();
      const what = [...running, ...(aborted ? ['plano em execução'] : [])];
      const turnRunning = await Promise.race([turn, new Promise<boolean>((r) => setTimeout(() => r(true), 50))]);
      if (turnRunning) what.push('turno da principal');
      return what.length ? `parando: ${what.join(', ')} (os processos das IAs são encerrados)` : 'nada em execução';
    }
    case '/nova':
      return `nova conversa ${chat.newConversation()}`;
    case '/config':
      return config(engine, chat, a, b, rest);
    case '/atualizar': {
      const { runUpdate } = await import('./update.ts');
      const { realpathSync } = await import('node:fs');
      const r = await runUpdate({ current: VERSIONS.app, check: a === '--check' || a === 'verificar', running: engine.runningTasks.length, binPath: realpathSync(process.argv[1] ?? '.') });
      return r.message;
    }
    default:
      return `comando desconhecido: ${cmd}`;
  }
}

function config(engine: Engine, chat: ChatSession, a: string, b: string, rest: string[]): string {
  const root = engine.projectRoot;
  const cfg = chat.config();
  switch (a) {
    case '':
      return [`principal: ${cfg.main ?? '(primeira IA pronta)'} (${cfg.sources.main})`, `modo: ${cfg.mode} (${cfg.sources.mode})`,
        `limites: ${Object.entries(cfg.limits).map(([k, v]) => `${k}=${v}`).join(' ') || '1 por IA'} (${cfg.sources.limits})`, `revisão cruzada: ${cfg.crossReview ? 'ligada' : 'desligada'} (${cfg.sources.crossReview})`,
        `comando de teste: ${cfg.testCommand ? `${cfg.testCommand.join(' ')} (${chat.testApproved(cfg.testCommand) ? 'autorizado' : `não autorizado; confirme com /config teste ${cfg.testCommand.join(' ')}`})` : 'nenhum'} [${cfg.sources.testCommand}]`, `autorizadas: ${[...chat.consent].join(', ') || 'nenhuma'}`,
        'mude com: /config consentir|revogar <ia> · limite <ia> <n> · revisão on|off · teste <comando…> · modo manual|auto|hybrid · principal <ia> · tema <t> · logo <l>'].join('\n');
    case 'consentir': {
      if (b === 'todas' || b === 'all') {
        chat.setConsentAll(true);
        return 'todas as IAs instaladas autorizadas neste computador: elas usam a SUA conta e cota (desligue com /config revogar todas)';
      }
      if (!(b in engine.providers)) return `IA desconhecida: ${b}`;
      if (!engine.providers[b]!.requiresConsent) return `${b} é simulada e não precisa de autorização`;
      chat.grantConsent(b, rest.includes('--save'));
      return `${b} autorizada nesta sessão${rest.includes('--save') ? ' e lembrada neste computador' : ''}: ela usa a SUA conta e a sua cota de ${b}`;
    }
    case 'revogar':
      if (b === 'todas' || b === 'all') {
        chat.setConsentAll(false);
        return 'todas as IAs revogadas: cada uma volta a pedir autorização (a sua conta e cota)';
      }
      chat.revokeConsent(b);
      return `${b} revogada: não roda mais sem nova autorização`;
    case 'limite': {
      const n = Number(rest[0]);
      if (!(b in engine.providers) || !Number.isInteger(n) || n < 1 || n > 8) return 'uso: /config limite <ia> <1..8> [--sim]';
      if (n > 1 && !rest.includes('--sim')) return `mais de 1 sessão de ${b} ao mesmo tempo depende dos termos da sua conta; confirme com --sim`;
      saveChatConfig('project', root, { limits: { ...cfg.limits, [b]: n } });
      return `${b}: ${n} sess${n > 1 ? 'ões' : 'ão'} ao mesmo tempo`;
    }
    case 'revisão':
    case 'revisao':
      if (b !== 'on' && b !== 'off') return 'uso: /config revisão on|off';
      saveChatConfig('project', root, { crossReview: b === 'on' });
      return `revisão cruzada ${b === 'on' ? 'ligada' : 'desligada'}`;
    case 'teste': {
      const argv = [b, ...rest].filter(Boolean);
      if (!argv.length) return 'uso: /config teste <comando …> (sem shell; ex.: /config teste npm test)';
      saveChatConfig('project', root, { testCommand: argv });
      engine.mutate((s) => s.appendEvent({ eventType: 'ApprovalGranted', payload: { scope: 'chat-test-command', argv, grantedBy: 'user (/config teste)', note: 'roda automaticamente nas tarefas do chat, sem shell' } }));
      return `comando de teste: ${argv.join(' ')} (roda em cada tarefa do chat antes de ela ficar pronta)`;
    }
    case 'modo':
      if (b !== 'manual' && b !== 'auto' && b !== 'hybrid') return 'uso: /config modo manual|auto|hybrid';
      saveChatConfig('project', root, { mode: b });
      return `modo padrão: ${b} (vale para as próximas conversas; /auto muda a atual)`;
    case 'principal':
      if (!(b in engine.providers)) return `IA desconhecida: ${b}`;
      saveChatConfig('project', root, { main: b });
      return `principal padrão: ${b}`;
    case 'tema':
      if (!(THEME_CHOICES as readonly string[]).includes(b)) return `tema inválido; use ${THEME_CHOICES.join('|')}`;
      saveUiConfig('project', root, { theme: b });
      return `tema ${b} gravado; vale na próxima abertura do ases`;
    case 'logo':
      if (!(LOGO_MODES as readonly string[]).includes(b)) return `logo inválido; use ${LOGO_MODES.join('|')}`;
      saveUiConfig('project', root, { logo: b });
      return `logo ${b} gravado; vale na próxima abertura do ases`;
    default:
      return 'uso: /config [consentir|revogar|limite|revisão|teste|modo|principal|tema|logo]';
  }
}
