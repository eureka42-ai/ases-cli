import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { VERSIONS } from '@aer/contracts';
import { LOGO_MODES, THEMES, pickLogoMode, renderBrand, type LogoMode, type ThemeName } from '@aer/branding';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ProjectStore, exportHistory, importLegacy, sqliteVersion } from '@aer/persistence';
import { defaultDeps, syncedFolderHint, targetStatus } from '@aer/platform-core';
import { findProjectRoot, initProject, isInterimProject, loadPlatformAdapter, paths, readInterimProject, readManifest } from '@aer/project-store';
import { writeReports } from './reports.ts';
import { Engine } from './engine.ts';
import { handleLine } from './commands.ts';
import { runTui } from './tui.tsx';

const HELP = `Eureka42 · ASES Engineering Runtime — ases ${VERSIONS.app}

Uso:
  ases [opções]              sessão interativa: engine local + TUI (fora de TTY ou com --no-tui: modo linha)
  ases init [--name <nome>]  cria .ases/ no diretório atual sem sobrescrever nada
  ases doctor [--json]       diagnóstico local (sem login, sem rede, sem custo)
  ases migrate-interim       entrega ao engine um .ases/ criado pelo bootstrap interino (scripts/ases-dev.mjs)

Opções:
  --no-color   --no-banner   --no-tui   --theme teal|blue|purple|gold|mono   --logo full|compact|minimal|ascii
  --json       saída estritamente JSON (sem banner/ANSI)   --version   --help

Ainda NÃO implementados (resposta explícita, nunca falso sucesso):
  status, agents, usage, skills, plugins, mcp, phases, tasks, task, run, resume, checkpoint, export, repair, config, logs
`;

const PLANNED: Record<string, string> = {
  status: 'PHASE-04', agents: 'PHASE-07', usage: 'PHASE-11', skills: 'PHASE-10', plugins: 'PHASE-10', mcp: 'PHASE-10',
  phases: 'PHASE-04', tasks: 'PHASE-04', task: 'PHASE-04', run: 'PHASE-05', resume: 'PHASE-11', checkpoint: 'PHASE-05',
  export: 'PHASE-11', repair: 'PHASE-11', config: 'PHASE-04', logs: 'PHASE-04',
};
async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, name: { type: 'string' },
      'no-color': { type: 'boolean' }, 'no-banner': { type: 'boolean' }, 'no-tui': { type: 'boolean' }, theme: { type: 'string' }, logo: { type: 'string' },
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
    unicode: caps.unicode,
    logo: values.logo as LogoMode | undefined,
    tui: !values['no-tui'] && !values.json && caps.isTTY && process.stdin.isTTY === true && process.env.TERM !== 'dumb' && !caps.ci,
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
      project: root ? { projectId: readManifest(root).projectId, ipc: adapter.createLocalIpcEndpoint(readManifest(root).projectId).kind, syncedFolder: syncedFolderHint(adapter.id, defaultDeps(), root) ?? null } : null,
      providers: { status: 'NOT_PROBED', plannedPhase: 'PHASE-07' },
      secretStore: await adapter.getSecretStore().probe(),
      target: { id: `${process.platform}-${process.arch}`, status: targetStatus(process.platform, process.arch) },
      support: { tested: 'darwin-arm64 (ALPHA, testes locais)', notRun: ['win32-x64', 'linux-x64', 'win32-arm64', 'linux-arm64'], outOfScope: ['darwin-x64 (CHANGE-0001)'] },
    };
    if (values.json) console.log(JSON.stringify(report));
    else for (const [k, v] of Object.entries(report)) console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    return 0;
  }
  if (cmd === 'migrate-interim') {
    const root = findProjectRoot(process.cwd());
    if (!root || !isInterimProject(root)) {
      console.error('Nada a migrar: não há .ases/ interino (sem banco) neste diretório ou acima.');
      return 2;
    }
    const manifest = readManifest(root);
    const interim = readInterimProject(root);
    if (interim.missingEvidence.length) {
      console.error(`Evidências ausentes (não serão importadas):\n  ${interim.missingEvidence.join('\n  ')}`);
    }
    // backup verificável do espelho interino antes de qualquer escrita (AER-REQ-018)
    const backupDir = path.join(paths(root).ases, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `HISTORY.interim.${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    copyFileSync(paths(root).history, backup);
    adapter.ensurePrivateDir(paths(root).dbDir);
    const r = importLegacy(paths(root).db, { id: manifest.projectId, name: manifest.name }, interim.events, interim, 'scripts/ases-dev.mjs');
    const store = ProjectStore.open(paths(root).db, { id: manifest.projectId, name: manifest.name }, { actor: 'ases migrate-interim' });
    try {
      exportHistory(store, paths(root).history);
      const before = readFileSync(backup, 'utf8');
      const after = readFileSync(paths(root).history, 'utf8');
      if (!after.startsWith(before)) throw new Error(`mirror check failed: regenerated HISTORY.jsonl does not start with the interim history (backup kept at ${backup})`);
      writeReports(root, store);
    } finally {
      store.close();
    }
    const out = { ...r, backup: path.relative(root, backup), mirror: 'interim history preserved byte for byte as prefix' };
    console.log(values.json ? JSON.stringify(out) : `migrado: ${r.events} eventos, ${r.phases} fases, ${r.tasks} tarefas, ${r.artifacts} evidências; backup ${out.backup}. Agora use \`ases\` neste projeto.`);
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

const exitNote = (n: number) => (n ? `${n} tarefa(s) em execução cancelada(s), árvore de processos encerrada` : 'Nenhuma tarefa estava em execução');

async function interactive(root: string, adapter: Awaited<ReturnType<typeof loadPlatformAdapter>>, ui: { color: boolean; banner: boolean; theme: ThemeName; mode: LogoMode; unicode: boolean; logo: LogoMode | undefined; tui: boolean }): Promise<number> {
  const synced = syncedFolderHint(adapter.id, defaultDeps(), root);
  if (synced) console.error(`AVISO: o projeto está numa pasta sincronizada (${synced}). O sync pode copiar o banco SQLite no meio de uma escrita e corrompê-lo; mova o projeto para uma pasta não sincronizada.`);
  const engine = await Engine.start(root, adapter);
  if (ui.tui) {
    const reason = await runTui(engine, { color: ui.color, unicode: ui.unicode, theme: ui.theme, logo: ui.logo });
    const r = await engine.stop();
    // §6.4/AER-REQ-090: impresso depois que o Ink devolveu o terminal
    console.log(`${reason}: engine encerrado. ${exitNote(r.cancelled)}; estado salvo até seq ${r.lastSeq}.`);
    return 0;
  }
  if (ui.banner) console.log(renderBrand({ app: 'ASES CLI', mode: ui.mode, theme: ui.theme, color: ui.color }));
  console.log(`engine ready: ${engine.info.name} (${engine.info.projectId}), seq ${engine.info.lastSeq}, journal ${engine.info.journalMode}`);
  console.log('Abra `ases-tar` em outro terminal, na mesma pasta, para acompanhar. /help para comandos.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true, prompt: 'ases> ' });
  let stopping = false;
  const stop = async (why: string) => {
    if (stopping) return;
    stopping = true;
    rl.close();
    const r = await engine.stop();
    // §6.4/AER-REQ-090: diz claramente o que aconteceu com o motor e com as tarefas ao sair
    console.log(`${why}: engine encerrado. ${exitNote(r.cancelled)}; estado salvo até seq ${r.lastSeq}.`);
  };
  // comandos em fila: /run termina antes do próximo (um script `/run` + `/exit` espera o run acabar)
  let queue: Promise<void> = Promise.resolve();
  const done = new Promise<void>((resolve) => {
    rl.on('close', () => void queue.then(() => stop('fim da entrada')).then(resolve));
    process.once('SIGTERM', () => void stop('SIGTERM').then(resolve));
    rl.on('SIGINT', () => void stop('Ctrl+C').then(resolve));
    process.once('SIGINT', () => void stop('SIGINT').then(resolve));
  });
  if (process.stdin.isTTY) rl.prompt();
  const report = (err: unknown) => {
    const e = err as Error & { code?: string };
    console.log(`erro${e.code ? ` ${e.code}` : ''}: ${e.message}`);
  };
  rl.on('line', (line) => {
    queue = queue.then(async () => {
      if (stopping) return;
      try {
        const out = handleLine(engine, line.trim());
        if (out === 'EXIT') {
          await stop('/exit');
          return;
        }
        if (out instanceof Promise) console.log('executando... (acompanhe no ases-tar)');
        const text = await out;
        if (text) console.log(text);
      } catch (err) {
        report(err);
      }
      if (!stopping && process.stdin.isTTY) rl.prompt();
    });
  });
  await done;
  process.stdin.destroy(); // rl.close() não solta um stdin em pipe; sem isso o processo não termina após /exit
  return 0;
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
