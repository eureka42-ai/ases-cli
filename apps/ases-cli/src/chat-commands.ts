import os from 'node:os';
import { metricsText } from './metrics.ts';
import { VERSIONS } from '@aer/contracts';
import { repoRoot } from '@aer/git-bridge';
import { aboutText, LOGO_MODES, THEME_CHOICES } from '@aer/branding';
import type { PlanRow, PlannedTask } from '@aer/persistence';
import { saveChatConfig, saveUiConfig, setLanguagePreference, type ChatMode } from '@aer/project-store';
import type { ChatTurnResult, PlanResult } from '@aer/scheduler';
import { ChatSession, decidePlanMode } from './chat-session.ts';
import { changesText } from './chat-format.ts';
import type { Engine } from './engine.ts';
import { LANGS, cmdName, lang, machineLang, parseLang, setLang, t, translatedAliases } from './i18n.ts';

// PHASE-18: comandos simples em português (aprovados pelo responsável), com alias em inglês e número curto de tarefa.

export const CHAT_ALIASES: Record<string, string> = {
  '/help': '/ajuda', '/agent': '/ia', '/agents': '/ias', '/plan': '/plano', '/diff': '/ver',
  '/accept': '/aceitar', '/redo': '/refazer', '/assign': '/trocar', '/undo': '/desfazer', '/stop': '/parar', '/new': '/nova',
  '/settings': '/config', '/about': '/sobre', '/exit': '/sair', '/update': '/atualizar', '/models': '/modelo',
  '/lessons': '/licoes', '/lecciones': '/licoes', '/lesson': '/licao', '/leccion': '/licao', '/metrics': '/metricas', '/verify': '/verificar',
  // 1.4.0: /model é o seletor de modelos (como /modelo); a IA principal é /agent (/ia)
  '/model': '/modelo', '/sync': '/sincronizar', '/connect': '/conectar',
  // nomes do menu em inglês e espanhol (i18n.ts), aceitos em qualquer idioma
  ...translatedAliases(),
};

/** Comandos do menu do `/` (nome interno em português; o menu mostra o nome no idioma atual). */
const MENU_CMDS = ['/ajuda', '/iniciar-projeto', '/ia', '/ias', '/plano', '/auto', '/tarefas', '/ver', '/aceitar', '/refazer', '/trocar', '/desfazer', '/parar', '/nova', '/modelo', '/config', '/sincronizar', '/conectar', '/atualizar', '/licoes', '/metricas', '/verificar', '/sobre', '/sair'];

export interface MenuItem { cmd: string; name: string; desc: string }
export const slashMenu = (): MenuItem[] => MENU_CMDS.map((cmd) => ({ cmd, name: cmdName(cmd), desc: t(`menu.${cmd}`) }));
/** Compatibilidade: o menu no idioma atual. */
export const SLASH_MENU = slashMenu();

/** Filtra o menu do `/` pelo que foi digitado, no nome mostrado ou no nome em português (`/mod` → /model). */
export const filterMenu = (prefix: string): MenuItem[] => {
  const p = prefix.toLowerCase();
  return slashMenu().filter((m) => m.name.startsWith(p) || m.cmd.startsWith(p));
};

export const chatHelp = (): string => [
  t('help.intro', { undo: cmdName('/desfazer') }),
  '',
  ...slashMenu().map((m) => `  ${m.name.padEnd(16)} ${m.desc}`),
  '',
  t('help.other'),
  t('help.advanced'),
].join('\n');

export const CHAT_COMMANDS = new Set(['/modelo', '/ajuda', '/ia', '/ias', '/plano', '/auto', '/tarefas', '/ver', '/aceitar', '/refazer', '/trocar', '/desfazer', '/parar', '/nova', '/config', '/sobre', '/sair', '/atualizar', '/sincronizar', '/conectar', '/licao', '/licoes', '/verificar', '/metricas']);

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
      return a === 'avançado' || a === 'avancado' || a === 'advanced' || a === 'avanzado' ? advancedHelp() : chatHelp();
    case '/sobre':
      return aboutText(VERSIONS.app);
    case '/verificar': {
      // PHASE-26 (verify/replay do ESAA): o estado do banco tem de ser o que o histórico diz
      const r = engine.store.verifyState();
      return r.problems.length
        ? [`Verificação: ${r.problems.length} problema(s) · ${r.events} eventos · ${r.checked} itens conferidos`, ...r.problems.slice(0, 20).map((p) => `  ${p}`), 'Algo foi alterado fora do ASES (edição manual ou arquivo corrompido). Restaure de um backup em .ases/ ou peça ajuda.'].join('\n')
        : `Verificação: OK · ${r.events} eventos · ${r.checked} itens conferidos com o histórico (fases, tarefas, lições) · sequência e hashes íntegros`;
    }
    case '/metricas':
      return metricsText(engine.store.eventsSince(0, 1_000_000));
    case '/licoes': {
      // PHASE-25 (ESAA): as lições ACTIVE entram nas instruções de toda tarefa e da principal
      const all = engine.store.listLessons();
      return all.length ? all.map((l) => `${l.id} ${l.state} · ${l.text}${l.state === 'PROPOSED' ? ` (sugerida em ${l.source ?? '?'}; /licao aprovar ${l.id})` : l.approvedBy ? ` (aprovada por ${l.approvedBy})` : ''}`).join('\n') : 'nenhuma lição ainda. /licao <texto> registra uma (ex.: /licao sempre rode os testes antes de entregar)';
    }
    case '/licao': {
      const who = os.userInfo().username || 'responsável';
      try {
        if ((a === 'arquivar' || a === 'aprovar') && /^LES-\d{4,}$/.test(b)) {
          engine.mutate((s) => s.setLessonState(b, a === 'aprovar' ? 'ACTIVE' : 'ARCHIVED', who));
          return `${b} ${a === 'aprovar' ? 'aprovada: entra nas próximas tarefas' : 'arquivada: sai das instruções das IAs'}`;
        }
        const text = args.join(' ').trim();
        if (!text) return 'uso: /licao <texto> · /licao arquivar LES-0001 · /licao aprovar LES-0001 · /licoes';
        const id = engine.mutate((s) => s.addLesson({ text, source: 'chat' }));
        engine.mutate((s) => s.setLessonState(id, 'ACTIVE', who)); // quem digita é o responsável: já fica aprovada
        return `${id} aprovada por ${who}: entra nas instruções de toda tarefa e da principal (/licoes, /licao arquivar ${id})`;
      } catch (err) {
        return `erro ${(err as { code?: string }).code ?? ''}: ${(err as Error).message}`;
      }
    }
    case '/sincronizar':
      return syncCommand(engine.projectRoot, a, b);
    case '/conectar':
      return connectCommand(a);
    case '/modelo': {
      const { chosenModels, setChosenModel } = await import('@aer/project-store');
      const real = Object.keys(engine.providers).filter((p) => !p.startsWith('simulator'));
      if (!a) {
        const cur = chosenModels();
        return ['Modelo de cada IA (na TUI, /modelo abre a lista com ← → ↑ ↓ e Espaço):', ...real.map((p) => `  ${p.padEnd(10)} ${cur[p] ?? 'padrão (o da própria IA)'}`), 'mude com /modelo <ia> <modelo> · /modelo <ia> lista os modelos · /modelo <ia> padrão volta ao da IA'].join('\n');
      }
      if (!real.includes(a)) return `IA desconhecida: ${a} (use uma de: ${real.join(', ')})`;
      const list = await chat.models(a);
      const name = [b, ...rest].join(' ').trim();
      if (!name) return [`${a} · lista: ${list.source}${list.note ? ` · ${list.note}` : ''}`, ...list.models.slice(0, 60).map((m) => `  ${m.id}${m.name !== m.id ? `  ${m.name}` : ''}`)].join('\n');
      if (!list.canSet) return `${a}: ${list.note ?? 'sem troca de modelo pelo AER'}`.replace(/^opencode: o OpenCode/, 'opencode: o OpenCode');
      if (name === 'padrão' || name === 'padrao' || name === 'default') {
        setChosenModel(a, null);
        return `${a}: padrão (o modelo configurado na própria IA)`;
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._/,:@+-]{0,120}$/.test(name)) return `nome de modelo inválido: ${name}`;
      setChosenModel(a, name);
      return `${a}: ${name} (vale para a principal e para as tarefas desta IA; fica na sua config pessoal)`;
    }
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
        if (!(await repoRoot(engine.projectRoot).then(() => true, () => false))) return 'erro NOT_A_REPO: planos em paralelo precisam de Git nesta pasta (cada IA trabalha numa cópia). Rode `git init` e faça um primeiro commit, ou escolha uma pasta de projeto com Git. A conversa com a principal continua funcionando.';
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
    case 'idioma':
    case 'language':
    case 'lang': {
      // 1.4.0: idioma da interface (config pessoal); "auto" volta ao da máquina
      if (b === 'auto') {
        setLanguagePreference(null);
        setLang(undefined);
        return t('lang.set', { l: `auto (${machineLang() ?? 'pt'})` });
      }
      const l = parseLang(b);
      if (!l) return `idioma: ${lang()} · use /config idioma ${LANGS.join('|')}|auto`;
      setLanguagePreference(l);
      setLang(l);
      return t('lang.set', { l });
    }
    case 'logo':
      if (!(LOGO_MODES as readonly string[]).includes(b)) return `logo inválido; use ${LOGO_MODES.join('|')}`;
      saveUiConfig('project', root, { logo: b });
      return `logo ${b} gravado; vale na próxima abertura do ases`;
    default:
      return 'uso: /config [consentir|revogar|limite|revisão|teste|modo|principal|tema|logo|idioma]';
  }
}

/** /sincronizar [github|nuvem [remoto]|ambos|desligar|status]: escolhe os destinos e envia o projeto (1.4.0). */
export async function syncCommand(root: string, a: string, b: string, run?: import('./sync.ts').Run): Promise<string> {
  const sync = await import('./sync.ts');
  const { projectSync, setPreferredCloudRemote } = await import('@aer/project-store');
  const cur = projectSync(root);
  const status = () => {
    const c = projectSync(root);
    return [`sincronização: ${c.targets.length ? c.targets.map((t) => (t === 'github' ? `GitHub (${c.github ?? 'repositório criado no 1º envio'})` : `nuvem (${c.cloud ?? '?'})`)).join(' + ') : 'desligada'}`,
      'escolha: /sincronizar github | nuvem [remoto:] | ambos | desligar · sem argumento envia agora (e o ases envia sozinho ao sair)'].join('\n');
  };
  const op = a.toLowerCase();
  if (op === 'status') return status();
  if (op === 'desligar' || op === 'off') {
    sync.enableSync(root, [], undefined);
    return 'sincronização desligada (nada foi apagado no GitHub nem na nuvem)';
  }
  if (!op) return cur.targets.length ? sync.syncProject(root, run).join('\n') : status();
  const want: ('github' | 'cloud')[] = op === 'github' ? ['github'] : op === 'nuvem' || op === 'cloud' || op === 'nube' ? ['cloud'] : op === 'ambos' || op === 'both' ? ['github', 'cloud'] : [];
  if (!want.length) return status();
  const problems: string[] = [];
  if (want.includes('github') && !sync.githubReady(run)) problems.push('GitHub: faça login com `gh auth login` no terminal');
  let remote: string | undefined;
  if (want.includes('cloud')) {
    const remotes = sync.cloudRemotes(run);
    if (remotes === undefined) problems.push('nuvem: instale o rclone (https://rclone.org/install) e rode `rclone config` para logar no Google Drive, OneDrive, Mega…');
    else if (b && !remotes.includes(b.endsWith(':') ? b : `${b}:`)) problems.push(`nuvem: remoto ${b} não existe (tem: ${remotes.join(' ') || 'nenhum; rode `rclone config`'})`);
    else {
      remote = b ? (b.endsWith(':') ? b : `${b}:`) : sync.pickCloudRemote(remotes);
      if (!remote) problems.push('nuvem: nenhum remoto; rode `rclone config` e faça login na sua nuvem');
      else if (b) setPreferredCloudRemote(remote);
    }
  }
  if (problems.length) return problems.join('\n');
  sync.enableSync(root, want, remote);
  return [status(), ...sync.syncProject(root, run)].join('\n');
}

/** /conectar [google|onedrive|dropbox]: login na nuvem pelo navegador; vira a nuvem padrão (1.4.0). */
export async function connectCommand(which: string, connect?: typeof import('./sync.ts').connectCloud): Promise<string> {
  const sync = await import('./sync.ts');
  const { setPreferredCloudRemote } = await import('@aer/project-store');
  const id = ({ google: 'google', drive: 'google', gdrive: 'google', 'google-drive': 'google', onedrive: 'onedrive', dropbox: 'dropbox' } as Record<string, 'google' | 'onedrive' | 'dropbox'>)[which.toLowerCase()];
  if (!id) return [`uso: /conectar ${sync.CLOUD_PROVIDERS.map((c) => c.id).join(' | ')}  (abre o navegador para você entrar na sua conta)`,
    'Mega e outras com senha: rode `rclone config` no terminal (o AER não digita senhas).'].join('\n');
  try {
    const r = await (connect ?? sync.connectCloud)(id);
    setPreferredCloudRemote(r.remote);
    return `${r.label} conectado (${r.remote}). Para enviar este projeto: /sincronizar nuvem (ou ambos, com o GitHub)`;
  } catch (err) {
    return `não conectei: ${(err as Error).message}`;
  }
}
