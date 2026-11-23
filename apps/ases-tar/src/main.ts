import { parseArgs } from 'node:util';
import { VERSIONS, type EventEnvelope } from '@aer/contracts';
import { LOGO_MODES, THEMES, pickLogoMode, renderBrand, type LogoMode, type ThemeName } from '@aer/branding';
import { IpcClient } from '@aer/ipc';
import type { Snapshot } from '@aer/persistence';
import type { PlatformAdapter } from '@aer/platform-core';
import { findProjectRoot, loadPlatformAdapter, readManifest, readSession } from '@aer/project-store';

const HELP = `Eureka42 · ASES-TAR — monitor somente leitura ${VERSIONS.app}

Uso:
  ases-tar                         acompanha eventos ao vivo (texto)
  ases-tar --follow --format jsonl stream de eventos em JSONL no stdout (estado da conexão no stderr)
  ases-tar --json                  snapshot único em JSON e sai
Filtros: --task TAR-XXXX  --phase PHASE-XX  --from-seq N
Opções: --no-color  --no-banner  --theme teal|blue|purple|gold|mono  --logo full|compact|minimal|ascii  --version  --help
Ainda NÃO implementados: --errors, --history, --live (TUI navegável na PHASE-04)

O ases-tar nunca altera estado: conecta com o token de monitor, que o engine recusa para qualquer método mutante.
`;

type Status = 'LIVE' | 'RECONNECTING' | 'OFFLINE';

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, follow: { type: 'boolean' },
      format: { type: 'string' }, task: { type: 'string' }, phase: { type: 'string' }, 'from-seq': { type: 'string' },
      'no-color': { type: 'boolean' }, 'no-banner': { type: 'boolean' }, theme: { type: 'string' }, logo: { type: 'string' },
      errors: { type: 'boolean' }, history: { type: 'boolean' }, live: { type: 'boolean' },
    },
  });
  if (values.version) {
    console.log(values.json ? JSON.stringify({ app: VERSIONS.app, protocol: VERSIONS.protocol }) : `ases-tar ${VERSIONS.app} (protocol ${VERSIONS.protocol})`);
    return 0;
  }
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  for (const f of ['errors', 'history', 'live'] as const) {
    if (values[f]) {
      console.error(`ases-tar --${f}: ainda não implementado (planejado: PHASE-04)`);
      return 2;
    }
  }
  const format = values.format ?? 'text';
  if (format !== 'text' && format !== 'jsonl') throw new UsageError(`invalid --format ${format}`);
  if (values.theme && !(values.theme in THEMES)) throw new UsageError(`invalid --theme ${values.theme}`);
  if (values.logo && !(LOGO_MODES as readonly string[]).includes(values.logo)) throw new UsageError(`invalid --logo ${values.logo}`);
  const fromSeq = values['from-seq'] === undefined ? undefined : Number(values['from-seq']);
  if (fromSeq !== undefined && (!Number.isInteger(fromSeq) || fromSeq < 0)) throw new UsageError('--from-seq must be an integer >= 0');

  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error('Este diretório não é um projeto ASES. Rode `ases init` e depois `ases`.');
    return 2;
  }
  const adapter = await loadPlatformAdapter();
  const projectId = readManifest(root).projectId;

  if (values.json) {
    const client = await connect(adapter, projectId);
    const snap = await client.call<Snapshot>('project.snapshot');
    client.close();
    console.log(JSON.stringify(snap));
    return 0;
  }

  const caps = adapter.getTerminalCapabilities(process.stdout);
  const jsonl = format === 'jsonl';
  const color = caps.color && !values['no-color'] && !jsonl;
  const ascii = !caps.unicode;
  const brand = (status: Status) => renderBrand({ app: 'ASES-TAR', mode: pickLogoMode(caps, (values.logo as LogoMode | undefined) ?? 'compact'), theme: (values.theme ?? 'teal') as ThemeName, color, status });
  const showBanner = caps.isTTY && !values['no-banner'] && !jsonl;
  // em jsonl o stdout só recebe eventos (AER-REQ-247); o estado da conexão vai para o stderr
  const status = (s: Status, detail = '') => {
    if (jsonl) console.error(`status: ${s}${detail ? ` ${detail}` : ''}`);
    else console.log(showBanner ? `${brand(s)}${detail ? `  ${detail}` : ''}` : `[${s}]${detail ? ` ${detail}` : ''}`);
  };
  const keep = (e: EventEnvelope) => (!values.task || e.taskId === values.task) && (!values.phase || e.phaseId === values.phase);
  const arrow = ascii ? '->' : '→';
  const print = (e: EventEnvelope) => {
    if (jsonl) {
      process.stdout.write(`${JSON.stringify(e)}\n`);
      return;
    }
    const p = e.payload as Record<string, unknown>;
    const time = new Date(e.occurredAt).toLocaleTimeString('pt-BR', { hour12: false });
    const what = typeof p.from === 'string' ? `${String(p.from)} ${arrow} ${String(p.to)}${p.reason ? ` (${String(p.reason)})` : ''}` : typeof p.title === 'string' ? `"${p.title}"` : '';
    console.log(`#${String(e.seq).padStart(4, '0')} ${time} ${e.eventType.padEnd(18)} ${e.taskId ?? e.phaseId ?? ''} ${what}`.trimEnd());
  };

  let lastSeq = fromSeq ?? -1; // -1: ainda não decidido (texto começa do snapshot)
  let current: IpcClient | undefined;
  let stopping = false;
  let delay = 250;
  let lastStatus: Status | undefined;
  let lastLine = '';
  const setStatus = (s: Status, d = '') => {
    if (`${s} ${d}` !== lastLine) status(s, d); // imprime só mudanças, não cada nova tentativa
    lastLine = `${s} ${d}`;
    lastStatus = s;
  };

  const session = async (): Promise<void> => {
    const client = await connect(adapter, projectId);
    current = client;
    delay = 250;
    if (lastSeq < 0) {
      if (jsonl) lastSeq = 0;
      else {
        const snap = await client.call<Snapshot>('project.snapshot');
        lastSeq = snap.snapshotSeq;
        const tasks = snap.tasks.filter((t) => (!values.task || t.id === values.task) && (!values.phase || t.phaseId === values.phase));
        setStatus('LIVE', `snapshot seq ${snap.snapshotSeq}: ${snap.phases.length} fase(s), ${tasks.length} tarefa(s)`);
        for (const t of tasks) console.log(`  ${t.id} ${t.phaseId} ${t.state.padEnd(16)} ${t.title}  progresso: indeterminado`);
      }
    }
    const closed = new Promise<void>((resolve) => client.onClose(resolve));
    const subscribe = () => client.call('project.subscribe', { fromSeq: lastSeq });
    client.onNotification((n) => {
      if (n.method === 'project.resyncRequired') {
        void subscribe().catch(() => client.close());
        return;
      }
      if (n.method !== 'project.event') return;
      const e = n.params.event as EventEnvelope;
      if (e.seq <= lastSeq) return; // dedupe por seq
      if (e.seq !== lastSeq + 1) {
        client.close(); // lacuna: reconecta e relê a partir do último seq confirmado (§10.3)
        return;
      }
      lastSeq = e.seq;
      if (keep(e)) print(e);
    });
    await subscribe();
    setStatus('LIVE', `desde seq ${lastSeq}`);
    await closed;
  };

  process.once('SIGINT', () => {
    stopping = true;
    current?.close();
  });
  while (!stopping) {
    try {
      await session();
    } catch (err) {
      const e = err as Error & { code?: unknown };
      setStatus(e.code === 'ENGINE_NOT_RUNNING' || e.code === 'ENOENT' || e.code === 'ECONNREFUSED' ? 'OFFLINE' : 'RECONNECTING', `(${String(e.code ?? e.message)})`);
    }
    if (stopping) break;
    if (lastStatus === 'LIVE') setStatus('RECONNECTING');
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 2000);
  }
  return 0;
}

async function connect(adapter: PlatformAdapter, projectId: string): Promise<IpcClient> {
  const s = readSession(adapter, projectId); // relido a cada tentativa: um engine reiniciado gera tokens novos
  return IpcClient.connect({ endpoint: s.endpoint, projectId, role: 'monitor', token: s.monitorToken });
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
