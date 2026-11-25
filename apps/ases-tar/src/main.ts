import { parseArgs } from 'node:util';
import { VERSIONS, type EventEnvelope } from '@aer/contracts';
import { LOGO_MODES, SITE, THEME_CHOICES, aboutText, pickLogoMode, renderBrand, resolveBrandPrefs, resolveTheme } from '@aer/branding';
import type { Snapshot } from '@aer/persistence';
import { brandConfigLayers, findProjectRoot, loadPlatformAdapter, readManifest, recentProjects } from '@aer/project-store';
import { formatEvent, isError } from './format.ts';
import { Monitor, type LinkStatus, type MonitorHandlers } from './monitor.ts';
import { runTui } from './tui.tsx';

const HELP = `Eureka42 · ASES-TAR — monitor somente leitura ${VERSIONS.app} · eureka42.org

Uso:
  ases-tar                         TUI ao vivo (em terminal interativo); fora de TTY, texto linha a linha
  ases-tar --no-tui                força o modo texto linha a linha
  ases-tar --follow --format jsonl stream de eventos em JSONL no stdout (estado da conexão no stderr)
  ases-tar --json                  snapshot único em JSON e sai
Filtros: --task TAR-XXXX  --phase PHASE-XX  --from-seq N  --errors (só severidade error/critical)
Opções: --no-color  --no-banner  --no-animation (aceito; as TUIs não animam)  --theme auto|green|teal|blue|purple|gold|mono|contrast  --logo banner|full|compact|minimal|ascii  --version  --about  --help
Tema e logo: --theme/--logo > .ases/CONFIG.json (ui.theme, ui.logo) > config global do usuário > auto
Ainda NÃO implementado: --history (Replay)

O ases-tar nunca altera estado: conecta com o token de monitor, que o engine recusa para qualquer método mutante.
`;

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, follow: { type: 'boolean' },
      format: { type: 'string' }, task: { type: 'string' }, phase: { type: 'string' }, 'from-seq': { type: 'string' },
      'no-color': { type: 'boolean' }, 'no-banner': { type: 'boolean' }, 'no-tui': { type: 'boolean' }, 'no-animation': { type: 'boolean' }, theme: { type: 'string' }, logo: { type: 'string' },
      errors: { type: 'boolean' }, history: { type: 'boolean' }, live: { type: 'boolean' }, about: { type: 'boolean' },
    },
  });
  if (values.version) {
    console.log(values.json ? JSON.stringify({ app: VERSIONS.app, protocol: VERSIONS.protocol }) : `ases-tar ${VERSIONS.app} (protocol ${VERSIONS.protocol}) · ${SITE}`);
    return 0;
  }
  if (values.about) {
    console.log(aboutText(VERSIONS.app));
    return 0;
  }
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.history) {
    console.error('ases-tar --history: ainda não implementado (planejado: PHASE-14 Replay)');
    return 2;
  }
  const format = values.format ?? 'text';
  if (format !== 'text' && format !== 'jsonl') throw new UsageError(`invalid --format ${format}`);
  if (values.theme && !(THEME_CHOICES as readonly string[]).includes(values.theme)) throw new UsageError(`invalid --theme ${values.theme}`);
  if (values.logo && !(LOGO_MODES as readonly string[]).includes(values.logo)) throw new UsageError(`invalid --logo ${values.logo}`);
  const fromSeq = values['from-seq'] === undefined ? undefined : Number(values['from-seq']);
  if (fromSeq !== undefined && (!Number.isInteger(fromSeq) || fromSeq < 0)) throw new UsageError('--from-seq must be an integer >= 0');

  // PHASE-19: fora de um projeto, acompanha o último projeto aberto pelo `ases` (sem init)
  let root = findProjectRoot(process.cwd());
  if (!root) {
    root = recentProjects().find((p) => findProjectRoot(p) === p);
    if (root) console.error(`acompanhando o último projeto aberto no ases: ${root}`);
  }
  if (!root) {
    console.error('Nenhum projeto ainda: abra o `ases` primeiro e escolha a pasta; depois rode `ases-tar`.');
    return 2;
  }
  const adapter = await loadPlatformAdapter();
  const manifest = readManifest(root);

  if (values.json) {
    const client = await Monitor.connect(adapter, manifest.projectId);
    const snap = await client.call<Snapshot>('project.snapshot');
    client.close();
    console.log(JSON.stringify(snap));
    return 0;
  }

  const caps = adapter.getTerminalCapabilities(process.stdout);
  const jsonl = format === 'jsonl';
  const color = caps.color && !values['no-color'] && !jsonl;
  const prefs = resolveBrandPrefs([{ source: '--theme/--logo', theme: values.theme, logo: values.logo }, ...brandConfigLayers(root)]);
  const colorDepth = color ? caps.colorDepth : 0;
  const theme = resolveTheme(prefs.theme, colorDepth);
  const filter = { task: values.task, phase: values.phase, errors: values.errors };
  const keep = (e: EventEnvelope) => (!filter.task || e.taskId === filter.task) && (!filter.phase || e.phaseId === filter.phase) && (!values.errors || isError(e));

  const tui = !jsonl && !values['no-tui'] && caps.isTTY && process.stdin.isTTY === true && process.env.TERM !== 'dumb' && !caps.ci;
  if (tui) {
    const target: { h?: MonitorHandlers } = {};
    const monitor = new Monitor(adapter, manifest.projectId, { fromSeq, snapshot: fromSeq === undefined }, {
      onStatus: (s, d) => target.h?.onStatus(s, d),
      onSnapshot: (s, r) => target.h?.onSnapshot?.(s, r),
      onEvent: (e) => target.h?.onEvent(e),
    });
    await runTui(monitor, { color, colorDepth, unicode: caps.unicode, theme, logo: prefs.logo }, manifest.name, filter, target);
    return 0;
  }

  // modo linha: texto legível ou JSONL estrito (estado no stderr, AER-REQ-247)
  const showBanner = caps.isTTY && !values['no-banner'] && !jsonl;
  const brand = (s: LinkStatus) => renderBrand({ app: 'ASES-TAR', mode: pickLogoMode(caps, prefs.logo ?? 'compact'), theme, color, colorDepth, status: s });
  let lastLine = '';
  const status = (s: LinkStatus, d: string) => {
    if (`${s} ${d}` === lastLine) return; // só mudanças, não cada nova tentativa
    lastLine = `${s} ${d}`;
    if (jsonl) console.error(`status: ${s}${d ? ` ${d}` : ''}`);
    else console.log(showBanner ? `${brand(s)}${d ? `  ${d}` : ''}` : `[${s}]${d ? ` ${d}` : ''}`);
  };
  const monitor = new Monitor(adapter, manifest.projectId, { fromSeq: fromSeq ?? (jsonl ? 0 : undefined), snapshot: !jsonl && fromSeq === undefined }, {
    onStatus: (s, d) => status(s, d ? `(${d})` : ''),
    onSnapshot: (snap) => {
      const tasks = snap.tasks.filter((t) => (!filter.task || t.id === filter.task) && (!filter.phase || t.phaseId === filter.phase));
      status('LIVE', `snapshot seq ${snap.snapshotSeq}: ${snap.phases.length} fase(s), ${tasks.length} tarefa(s)`);
      for (const t of tasks) console.log(`  ${t.id} ${t.phaseId} ${t.state.padEnd(16)} ${t.title}  progresso: indeterminado`);
    },
    onEvent: (e) => {
      if (!keep(e)) return;
      if (jsonl) process.stdout.write(`${JSON.stringify(e)}\n`);
      else console.log(formatEvent(e, caps.unicode));
    },
  });
  process.once('SIGINT', () => monitor.stop());
  await monitor.run();
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: Error & { code?: string }) => {
    console.error(`ases-tar: ${err.code ? `${err.code}: ` : ''}${err.message}`);
    process.exitCode = err instanceof UsageError || err.name === 'TypeError' ? 2 : 1;
  },
);
