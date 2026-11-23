import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { PHASE_STATES, TASK_STATES, VERSIONS, type PhaseState, type TaskState } from '@aer/contracts';
import { LOGO_MODES, THEMES, pickLogoMode, renderBrand, type LogoMode, type ThemeName } from '@aer/branding';
import { sqliteVersion } from '@aer/persistence';
import { findProjectRoot, initProject, loadPlatformAdapter, readManifest } from '@aer/project-store';
import { Engine } from './engine.ts';

const HELP = `Eureka42 · ASES Engineering Runtime — ases ${VERSIONS.app}

Uso:
  ases [opções]              sessão interativa: engine local + prompt (modo linha; TUI completa na PHASE-04)
  ases init [--name <nome>]  cria .ases/ no diretório atual sem sobrescrever nada
  ases doctor [--json]       diagnóstico local (sem login, sem rede, sem custo)

Opções:
  --no-color   --no-banner   --theme teal|blue|purple|gold|mono   --logo full|compact|minimal|ascii
  --json       saída estritamente JSON (sem banner/ANSI)   --version   --help

Ainda NÃO implementados (resposta explícita, nunca falso sucesso):
  status, agents, usage, skills, plugins, mcp, phases, tasks, task, run, resume, checkpoint, export, repair, config, logs
`;

const PLANNED: Record<string, string> = {
  status: 'PHASE-04', agents: 'PHASE-07', usage: 'PHASE-11', skills: 'PHASE-10', plugins: 'PHASE-10', mcp: 'PHASE-10',
  phases: 'PHASE-04', tasks: 'PHASE-04', task: 'PHASE-04', run: 'PHASE-05', resume: 'PHASE-11', checkpoint: 'PHASE-05',
  export: 'PHASE-11', repair: 'PHASE-11', config: 'PHASE-04', logs: 'PHASE-04',
};
const PLANNED_SLASH: Record<string, string> = {
  '/agent': 'PHASE-07', '/auto': 'PHASE-05', '/manual': 'PHASE-05', '/hybrid': 'PHASE-05', '/parallel': 'PHASE-05', '/usage': 'PHASE-11',
  '/plan': 'PHASE-09', '/skills': 'PHASE-10', '/plugins': 'PHASE-10', '/mcp': 'PHASE-10', '/review': 'PHASE-11', '/diff': 'PHASE-05',
  '/checkpoint': 'PHASE-05', '/resume': 'PHASE-11', '/approval': 'PHASE-10', '/safe-mode': 'PHASE-10', '/history': 'PHASE-04', '/dependencies': 'PHASE-05',
};

const SLASH_HELP = `Comandos:
  /status                         estado do engine e contagem de tarefas
  /phases                         lista fases
  /tasks [PHASE-XX]               lista tarefas
  /task TAR-XXXX                  detalhe de uma tarefa
  /phase new <título>             cria fase
  /phase move PHASE-XX <ESTADO> [motivo]
  /task new PHASE-XX <título>     cria tarefa
  /task move TAR-XXXX <ESTADO> [motivo]
  /help   /exit`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, name: { type: 'string' },
      'no-color': { type: 'boolean' }, 'no-banner': { type: 'boolean' }, theme: { type: 'string' }, logo: { type: 'string' },
    },
  });
  if (values.version) {
    console.log(values.json ? JSON.stringify({ app: VERSIONS.app, protocol: VERSIONS.protocol }) : `ases ${VERSIONS.app} (protocol ${VERSIONS.protocol})`);
    return 0;
  }
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.theme && !(values.theme in THEMES)) throw new UsageError(`invalid --theme ${values.theme}`);
  if (values.logo && !(LOGO_MODES as readonly string[]).includes(values.logo)) throw new UsageError(`invalid --logo ${values.logo}`);

  const adapter = await loadPlatformAdapter();
  const caps = adapter.getTerminalCapabilities(process.stdout);
  const ui = {
    color: caps.color && !values['no-color'] && !values.json,
    banner: caps.isTTY && !values['no-banner'] && !values.json,
    theme: (values.theme ?? 'teal') as ThemeName,
    mode: pickLogoMode(caps, values.logo as LogoMode | undefined),
  };
  const [cmd] = positionals;

  if (cmd === 'init') {
    const { created, manifest } = initProject(process.cwd(), adapter, values.name);
    if (values.json) console.log(JSON.stringify({ projectId: manifest.projectId, created }));
    else console.log(created.length ? `.ases/ inicializada (${manifest.projectId}); ${created.length} arquivo(s) criado(s)` : `.ases/ já existia (${manifest.projectId}); nada foi alterado`);
    return 0;
  }
  if (cmd === 'doctor') {
    const root = findProjectRoot(process.cwd());
    const report = {
      app: VERSIONS.app, protocol: VERSIONS.protocol, platform: adapter.id, arch: process.arch, node: process.version,
      sqlite: { version: sqliteVersion(), driver: 'node:sqlite (experimental API, ADR-0002)' },
      terminal: caps,
      project: root ? { projectId: readManifest(root).projectId, ipc: adapter.createLocalIpcEndpoint(readManifest(root).projectId).kind } : null,
      providers: { status: 'NOT_PROBED', plannedPhase: 'PHASE-07' },
      secretStore: await adapter.getSecretStore().probe(),
      support: { [adapter.id]: 'ALPHA (testes locais)', note: 'demais SO: NOT_RUN até execução real (§3.7)' },
    };
    if (values.json) console.log(JSON.stringify(report));
    else for (const [k, v] of Object.entries(report)) console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    return 0;
  }
  if (cmd && cmd in PLANNED) {
    console.error(`ases ${cmd}: ainda não implementado (planejado: ${PLANNED[cmd]})`);
    return 2;
  }
  if (cmd) throw new UsageError(`unknown command: ${cmd}`);

  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error('Este diretório não é um projeto ASES. Rode `ases init` primeiro.');
    return 2;
  }
  return interactive(root, adapter, ui);
}

class UsageError extends Error {}

async function interactive(root: string, adapter: Awaited<ReturnType<typeof loadPlatformAdapter>>, ui: { color: boolean; banner: boolean; theme: ThemeName; mode: LogoMode }): Promise<number> {
  const engine = await Engine.start(root, adapter);
  if (ui.banner) console.log(renderBrand({ app: 'ASES CLI', mode: ui.mode, theme: ui.theme, color: ui.color }));
  console.log(`engine ready: ${engine.info.name} (${engine.info.projectId}), seq ${engine.info.lastSeq}, journal ${engine.info.journalMode}`);
  console.log('Abra `ases-tar` em outro terminal, na mesma pasta, para acompanhar. /help para comandos.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true, prompt: 'ases> ' });
  let stopping = false;
  const stop = async (why: string) => {
    if (stopping) return;
    stopping = true;
    // §6.4/AER-REQ-090: diz claramente o que acontece com o motor ao sair
    console.log(`${why}: encerrando engine. Nenhuma tarefa está em execução nesta versão; estado salvo até seq ${engine.info.lastSeq}.`);
    rl.close();
    await engine.stop();
  };
  const done = new Promise<void>((resolve) => {
    rl.on('close', () => void stop('fim da entrada').then(resolve));
    process.once('SIGTERM', () => void stop('SIGTERM').then(resolve));
    rl.on('SIGINT', () => void stop('Ctrl+C').then(resolve));
    process.once('SIGINT', () => void stop('SIGINT').then(resolve));
  });
  if (process.stdin.isTTY) rl.prompt();
  rl.on('line', (line) => {
    try {
      const out = handleLine(engine, line.trim());
      if (out === 'EXIT') {
        void stop('/exit');
        return;
      }
      if (out) console.log(out);
    } catch (err) {
      const e = err as Error & { code?: string };
      console.log(`erro${e.code ? ` ${e.code}` : ''}: ${e.message}`);
    }
    if (!stopping && process.stdin.isTTY) rl.prompt();
  });
  await done;
  process.stdin.destroy(); // rl.close() não solta um stdin em pipe; sem isso o processo não termina após /exit
  return 0;
}

function handleLine(engine: Engine, line: string): string | undefined {
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
        return `${id} → ${to} (versão ${engine.transitionPhase(id, to as PhaseState, why.join(' ') || null)})`;
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
        return `${id} ${t.state} → ${to} (versão ${engine.mutate((st) => st.transitionTask(id, to as TaskState, t.version, why.join(' ') || null))})`;
      }
      const t = sub ? s.getTask(sub) : undefined;
      if (!t) return 'uso: /task TAR-XXXX | /task new PHASE-XX <título> | /task move TAR-XXXX <ESTADO> [motivo]';
      const history = s.eventsSince(0, 1000).filter((e) => e.taskId === t.id).map((e) => `  #${e.seq} ${e.eventType} ${JSON.stringify(e.payload)}`);
      // shortcut: varre só os primeiros 1000 eventos; trocar por consulta indexada por task_id quando o histórico crescer
      return [`${t.id} — ${t.title}`, `  fase ${t.phaseId} · estado ${t.state} · v${t.version} · prioridade ${t.priority} · risco ${t.risk}`,
        `  requisitos ${t.reqs.join(', ') || '—'} · depende de ${t.dependsOn.join(', ') || '—'}`, '  progresso: indeterminado (sem milestones, AER-REQ-098)', ...history].join('\n');
    }
    default:
      if (cmd in PLANNED_SLASH) return `${cmd}: ainda não implementado (planejado: ${PLANNED_SLASH[cmd]})`;
      return `comando desconhecido: ${cmd} (/help)`;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: Error & { code?: string }) => {
    console.error(`ases: ${err.code ? `${err.code}: ` : ''}${err.message}`);
    process.exitCode = err instanceof UsageError || err.name === 'TypeError' ? 2 : 1;
  },
);
