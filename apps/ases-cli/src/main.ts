import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { VERSIONS } from '@aer/contracts';
import { LOGO_MODES, SITE, THEME_CHOICES, aboutText, pickLogoMode, renderBrand, resolveBrandPrefs, resolveTheme, type LogoMode, type ThemeName } from '@aer/branding';
import { copyFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ProjectStore, exportHistory, importLegacy, sqliteVersion } from '@aer/persistence';
import { SUPPORTED_TARGETS, defaultDeps, syncedFolderHint, targetStatus } from '@aer/platform-core';
import { brandConfigLayers, chatConfig, desktopDir, findProjectRoot, recentProjects, rememberProject, initProject, isInterimProject, loadPlatformAdapter, paths, readInterimProject, readManifest } from '@aer/project-store';
import { ClaudeCodeProvider } from '@aer/provider-claude';
import { CodexProvider } from '@aer/provider-codex';
import { createAntigravityProvider, createKimiProvider, createOpenCodeProvider } from '@aer/provider-acp';
import { SimulatorProvider } from '@aer/provider-simulator';
import { writeReports } from './reports.ts';
import { Engine } from './engine.ts';
import { handleLine } from './commands.ts';
import { runTui } from './tui.tsx';
import { runWizard } from './wizard.tsx';
import { runStartScreen } from './start-screen.tsx';
import { runUpdate } from './update.ts';
import { shouldAnimate } from './ticker.ts';
import { attachRepl, connectResident, daemonStatus, runDaemon, startDaemon, stopDaemon } from './daemon.ts';

const HELP = `Eureka42 · ASES Engineering Runtime — ases ${VERSIONS.app} · eureka42.org

Uso:
  ases [opções]              sessão interativa: engine local + TUI (fora de TTY ou com --no-tui: modo linha)
  ases init [--name <nome>]  cria .ases/ no diretório atual sem sobrescrever nada
  ases doctor [--json]       diagnóstico local (sem login, sem rede, sem custo)
  ases migrate-interim       entrega ao engine um .ases/ criado pelo bootstrap interino (scripts/ases-dev.mjs)
  ases secret status | set <id> | has <id> | delete <id>   chave de API no cofre nativo (valor pelo stdin; nunca impresso)
  ases daemon start | stop | status   motor residente: tarefas seguem com o terminal fechado; o ases vira cliente dele
  ases about                 quem faz o Eureka42, site e licença
  ases update [--check]      atualiza o AER para a versão mais nova do npm (--check só mostra; consulta o npm só quando pedido)

Opções:
  --no-color   --no-banner   --no-tui   --no-animation (para o relógio de "pensando")   --theme auto|green|teal|blue|purple|gold|mono|contrast   --logo banner|full|compact|minimal|ascii
  tema e logo: --theme/--logo > .ases/CONFIG.json (ui.theme, ui.logo) > config global do usuário > auto
  --json       saída estritamente JSON (sem banner/ANSI)   --version   --help

Ainda NÃO implementados (resposta explícita, nunca falso sucesso):
  status, agents, usage, phases, tasks, task, run, resume, checkpoint, export, repair, config, logs
  (dentro da sessão: /run executa tarefas, providers reais só com /run --consent <ids>; Skills/MCP/plugins: /ext)
`;

const PLANNED: Record<string, string> = {
  status: 'PHASE-04', agents: 'PHASE-07', usage: 'PHASE-11', skills: 'na sessão: /ext', plugins: 'na sessão: /ext', mcp: 'na sessão: /ext',
  phases: 'PHASE-04', tasks: 'PHASE-04', task: 'PHASE-04', run: 'PHASE-05', resume: 'PHASE-11', checkpoint: 'PHASE-05',
  export: 'PHASE-11', repair: 'PHASE-11', config: 'PHASE-04', logs: 'PHASE-04',
};
async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, name: { type: 'string' }, check: { type: 'boolean' },
      'no-color': { type: 'boolean' }, 'no-banner': { type: 'boolean' }, 'no-tui': { type: 'boolean' }, 'no-animation': { type: 'boolean' }, theme: { type: 'string' }, logo: { type: 'string' },
    },
  });
  if (values.version) {
    console.log(values.json ? JSON.stringify({ app: VERSIONS.app, protocol: VERSIONS.protocol }) : `ases ${VERSIONS.app} (protocol ${VERSIONS.protocol}) · ${SITE}`);
    return 0;
  }
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.theme && !(THEME_CHOICES as readonly string[]).includes(values.theme)) throw new UsageError(`invalid --theme ${values.theme}`);
  if (values.logo && !(LOGO_MODES as readonly string[]).includes(values.logo)) throw new UsageError(`invalid --logo ${values.logo}`);

  const adapter = await loadPlatformAdapter();
  const caps = adapter.getTerminalCapabilities(process.stdout);
  // CLI > .ases/CONFIG.json > config global > padrão (AER-REQ-249)
  const prefs = resolveBrandPrefs([{ source: '--theme/--logo', theme: values.theme, logo: values.logo }, ...brandConfigLayers(findProjectRoot(process.cwd()))]);
  const color = caps.color && !values['no-color'] && !values.json;
  const ui = {
    color,
    colorDepth: color ? caps.colorDepth : 0,
    banner: caps.isTTY && !values['no-banner'] && !values.json,
    theme: resolveTheme(prefs.theme, color ? caps.colorDepth : 0),
    mode: pickLogoMode(caps, prefs.logo),
    unicode: caps.unicode,
    logo: prefs.logo,
    tui: !values['no-tui'] && !values.json && caps.isTTY && process.stdin.isTTY === true && process.env.TERM !== 'dumb' && !caps.ci,
    animation: shouldAnimate({ noAnimation: values['no-animation'] === true, ci: caps.ci }),
  };
  const [cmd] = positionals;

  if (cmd === 'about') {
    console.log(aboutText(VERSIONS.app));
    return 0;
  }
  if (cmd === 'update') {
    const r = await runUpdate({ current: VERSIONS.app, check: values.check === true, running: 0, binPath: realpathSync(process.argv[1] ?? '') });
    if (values.json) console.log(JSON.stringify(r));
    else console.log(r.message);
    return r.status === 'FAILED' ? 1 : r.status === 'REFUSED' ? 2 : 0;
  }
  if (cmd === 'init') {
    const { created, manifest } = initProject(process.cwd(), adapter, values.name);
    if (values.json) console.log(JSON.stringify({ projectId: manifest.projectId, created }));
    else console.log(created.length ? `.ases/ inicializada (${manifest.projectId}); ${created.length} arquivo(s) criado(s)` : `.ases/ já existia (${manifest.projectId}); nada foi alterado`);
    return 0;
  }
  if (cmd === 'secret') {
    // chaves de API explícitas no cofre nativo (§12.2 item 8): o valor vem do stdin e nunca é impresso
    const [, op, keyId] = positionals;
    const store = adapter.getSecretStore();
    if (op === 'status') {
      console.log(JSON.stringify(await store.probe()));
      return 0;
    }
    if (!keyId || !['set', 'has', 'delete'].includes(op ?? '')) throw new UsageError('usage: ases secret status | set <keyId> (value via stdin) | has <keyId> | delete <keyId>');
    if (op === 'set') {
      if (process.stdin.isTTY) process.stderr.write('Cole o valor e tecle Enter (não aparece na tela):\n');
      const value = await readSecretFromStdin();
      if (!value) throw new UsageError('empty value');
      await store.create(keyId, value);
      console.log(`${keyId}: guardada no cofre ${(await store.probe()).backend}`);
    } else if (op === 'has') console.log(`${keyId}: ${(await store.get(keyId)) === undefined ? 'ausente' : 'presente'}`);
    else {
      await store.delete(keyId);
      console.log(`${keyId}: removida`);
    }
    return 0;
  }
  if (cmd === 'doctor') {
    const root = findProjectRoot(process.cwd());
    const report = {
      app: VERSIONS.app, protocol: VERSIONS.protocol, platform: adapter.id, arch: process.arch, node: process.version,
      sqlite: { version: sqliteVersion(), driver: 'node:sqlite (experimental API, ADR-0002)' },
      terminal: caps,
      project: root ? { projectId: readManifest(root).projectId, ipc: adapter.createLocalIpcEndpoint(readManifest(root).projectId).kind, syncedFolder: syncedFolderHint(adapter.id, defaultDeps(), root) ?? null } : null,
      // probes sem custo (--version e status de login dos clientes oficiais); nenhum prompt é enviado (§7.4)
      providers: await probeProviders(adapter),
      secretStore: await adapter.getSecretStore().probe(),
      target: { id: `${process.platform}-${process.arch}`, status: targetStatus(process.platform, process.arch) },
      // o resultado por alvo vem do CI (job support-matrix), não do binário; aqui só o nível declarado e o que nunca foi testado
      support: { targets: SUPPORTED_TARGETS, matrix: 'docs/MATRIZ_SUPORTE.md (gerada dos jobs reais do CI; NOT_RUN não é PASS)', notRun: ['darwin-arm64 no CI do GitHub (jobs cancelados na fila; verificado localmente a cada fase)'], outOfScope: ['darwin-x64 (CHANGE-0001)'] },
    };
    if (values.json) console.log(JSON.stringify(report));
    else {
      for (const [k, v] of Object.entries(report)) if (k !== 'providers') console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
      console.log('providers:');
      for (const p of report.providers) console.log(`  ${p.id.padEnd(10)} ${p.availability.padEnd(22)} ${(p.version ?? '-').padEnd(10)} ${p.contract.padEnd(10)} ${p.evidence.join('; ')}`);
    }
    return 0;
  }
  if (cmd === 'daemon') {
    // motor residente (PHASE-12): as tarefas seguem quando o terminal/TUI fecha; sem supervisor do SO nesta fase
    const root = findProjectRoot(process.cwd());
    if (!root) throw new UsageError('no .ases/ project here (run `ases init` first)');
    const op = positionals[1];
    if (op === 'run') return runDaemon(root, adapter);
    if (op === 'start') console.log(await startDaemon(root, adapter, process.argv[1]!));
    else if (op === 'stop') console.log(await stopDaemon(root, adapter));
    else if (op === 'status') {
      const st = await daemonStatus(root, adapter);
      console.log(values.json ? JSON.stringify(st.json) : st.text);
    } else throw new UsageError('usage: ases daemon start | stop | status');
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

  // PHASE-19: "Onde vamos trabalhar?" — a pasta escolhida vira projeto sozinha (sem `ases init`)
  let root = findProjectRoot(process.cwd());
  if (ui.tui) {
    const picked = await runStartScreen({ color: ui.color, colorDepth: ui.colorDepth, unicode: ui.unicode, theme: ui.theme, logo: ui.logo }, { cwd: root ?? process.cwd(), desktop: desktopDir(), recent: recentProjects().filter((p) => findProjectRoot(p) === p) });
    if (!picked) return 0;
    root = findProjectRoot(picked) === picked ? picked : (initProject(picked, adapter), picked);
  }
  if (!root) {
    console.error('Este diretório não é um projeto ASES. Abra o `ases` num terminal para escolher a pasta (ou rode `ases init`).');
    return 2;
  }
  rememberProject(root);
  return interactive(root, adapter, ui);
}

class UsageError extends Error {}

/** Lê o segredo do stdin sem eco quando é um terminal; por pipe, lê tudo e tira só o \n final. */
async function readSecretFromStdin(): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let data = '';
    for await (const chunk of stdin) data += String(chunk);
    return data.replace(/\r?\n$/, '');
  }
  return new Promise((resolve) => {
    let v = '';
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (b: Buffer) => {
      for (const ch of b.toString('utf8')) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stderr.write('\n');
          resolve(v);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        v = ch === '\u007f' ? v.slice(0, -1) : v + ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** AER-REQ-116/119: cada provider é sondado isoladamente; a falha de um não impede os outros. */
async function probeProviders(adapter: Awaited<ReturnType<typeof loadPlatformAdapter>>) {
  const providers = [new SimulatorProvider(adapter), new ClaudeCodeProvider(adapter), new CodexProvider(adapter), createKimiProvider(adapter), createOpenCodeProvider(adapter), createAntigravityProvider(adapter)];
  return Promise.all(providers.map(async (p) => {
    try {
      const r = await p.probe();
      return { id: r.providerId, availability: r.availability, version: r.version ?? null, contract: r.contractStatus, evidence: r.evidence };
    } catch (err) {
      return { id: p.id, availability: 'UNKNOWN', version: null, contract: 'UNVERIFIED', evidence: [`probe failed: ${(err as Error).message}`] };
    }
  }));
}

const exitNote = (n: number) => (n ? `${n} tarefa(s) em execução cancelada(s), árvore de processos encerrada` : 'Nenhuma tarefa estava em execução');

async function interactive(root: string, adapter: Awaited<ReturnType<typeof loadPlatformAdapter>>, ui: { color: boolean; colorDepth: 0 | 4 | 8 | 24; banner: boolean; theme: ThemeName; mode: LogoMode; unicode: boolean; logo: LogoMode | undefined; tui: boolean; animation: boolean }): Promise<number> {
  const synced = syncedFolderHint(adapter.id, defaultDeps(), root);
  if (synced) console.error(`AVISO: o projeto está numa pasta sincronizada (${synced}). O sync pode copiar o banco SQLite no meio de uma escrita e corrompê-lo; mova o projeto para uma pasta não sincronizada.`);
  // há um motor residente neste projeto? então este `ases` é só um cliente dele (PHASE-12)
  const resident = await connectResident(adapter, root, 'control');
  if (resident) {
    const probe = await resident.client.call<string>('session.command', { line: '/status' }).catch((e: Error) => e);
    if (probe instanceof Error) {
      resident.client.close();
      throw Object.assign(new Error(`outro \`ases\` interativo já está aberto neste projeto (pid ${resident.pid}); use-o, ou feche-o e rode \`ases daemon start\``), { code: 'ENGINE_ALREADY_RUNNING' });
    }
    return attachRepl(resident.client, resident.pid, process.stdin.isTTY === true);
  }
  const engine = await Engine.start(root, adapter);
  if (ui.tui) {
    // PHASE-18: primeiro uso sem principal configurada → assistente (sem IA) antes do chat
    if (!chatConfig(root).main) await runWizard(engine, { color: ui.color, colorDepth: ui.colorDepth, unicode: ui.unicode, theme: ui.theme, logo: ui.logo });
    const reason = await runTui(engine, { color: ui.color, colorDepth: ui.colorDepth, unicode: ui.unicode, theme: ui.theme, logo: ui.logo, animation: ui.animation });
    const r = await engine.stop();
    // §6.4/AER-REQ-090: impresso depois que o Ink devolveu o terminal
    console.log(`${reason}: engine encerrado. ${exitNote(r.cancelled)}; estado salvo até seq ${r.lastSeq}.`);
    return 0;
  }
  if (ui.banner) console.log(renderBrand({ app: 'ASES CLI', mode: ui.mode, theme: ui.theme, color: ui.color, colorDepth: ui.colorDepth }));
  console.log(`engine ready: ${engine.info.name} (${engine.info.projectId}), seq ${engine.info.lastSeq}, journal ${engine.info.journalMode}`);
  console.log('Abra `ases-tar` em outro terminal, na mesma pasta, para acompanhar. /help para comandos.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true, prompt: 'ases> ' });
  let stopping = false;
  let stopped: Promise<void> | undefined;
  // idempotente: a segunda chamada (p.ex. o 'close' disparado pelo próprio rl.close) espera o mesmo encerramento
  const stop = (why: string): Promise<void> => (stopped ??= (async () => {
    stopping = true;
    rl.close();
    const r = await engine.stop();
    // §6.4/AER-REQ-090: diz claramente o que aconteceu com o motor e com as tarefas ao sair
    console.log(`${why}: engine encerrado. ${exitNote(r.cancelled)}; estado salvo até seq ${r.lastSeq}.`);
  })());
  // /run roda em segundo plano (os outros comandos, inclusive /cancel, seguem respondendo); /exit e o fim da entrada
  // esperam os runs em andamento, então um script `/run` + `/exit` só sai quando o run termina
  const inflight = new Set<Promise<unknown>>();
  const settle = () => Promise.allSettled([...inflight]);
  const done = new Promise<void>((resolve) => {
    rl.on('close', () => void settle().then(() => stop('fim da entrada')).then(resolve));
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
    if (stopping) return;
    try {
      const out = handleLine(engine, line.trim());
      if (out === 'EXIT') {
        void settle().then(() => stop('/exit'));
        return;
      }
      if (out instanceof Promise) {
        // só o /run tem tarefas canceláveis; os demais comandos assíncronos (/ext, /review, /test…) só imprimem ao terminar
        if (line.trimStart().startsWith('/run')) console.log('executando em segundo plano (acompanhe no ases-tar; /cancel TAR-XXXX cancela)');
        const p = out.then((text) => console.log(text), report).finally(() => inflight.delete(p));
        inflight.add(p);
      } else if (out) console.log(out);
    } catch (err) {
      report(err);
    }
    if (!stopping && process.stdin.isTTY) rl.prompt();
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
