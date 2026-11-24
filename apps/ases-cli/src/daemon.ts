import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { IpcClient } from '@aer/ipc';
import type { PlatformAdapter } from '@aer/platform-core';
import { readManifest, readSession, sessionFile } from '@aer/project-store';
import { handleLine } from './commands.ts';
import { Engine } from './engine.ts';

/**
 * Motor residente (PHASE-12, ADR-0017): o engine roda num processo destacado, sem TUI; o `ases` interativo se liga a ele
 * como cliente `control` pelo IPC já existente. Fechar o cliente (ou o terminal) não para tarefas em execução.
 * Supervisão do SO (launchd/systemd/Windows): NÃO habilitada nesta fase — sobreviver a reboot/crash do motor não é prometido.
 */
const logFile = (adapter: PlatformAdapter, projectId: string) => path.join(adapter.getRuntimeDir(projectId), 'daemon.log');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Liga como cliente ao motor deste projeto, se houver um vivo; senão undefined (sem efeitos). */
export async function connectResident(adapter: PlatformAdapter, root: string, role: 'control' | 'monitor' = 'control'): Promise<{ client: IpcClient; pid: number } | undefined> {
  const { projectId } = readManifest(root);
  if (!existsSync(sessionFile(adapter, projectId))) return undefined;
  const s = readSession(adapter, projectId);
  if (!alive(s.pid)) return undefined;
  try {
    const client = await IpcClient.connect({ endpoint: s.endpoint, projectId, role, token: role === 'control' ? s.controlToken : s.monitorToken, timeoutMs: 3000 });
    return { client, pid: s.pid };
  } catch {
    return undefined;
  }
}

/** Corpo do processo residente: engine sem TUI até /shutdown, SIGTERM ou SIGINT. */
export async function runDaemon(root: string, adapter: PlatformAdapter): Promise<number> {
  const engine = await Engine.start(root, adapter);
  let resolveStop!: (why: string) => void;
  const stopped = new Promise<string>((r) => (resolveStop = r));
  const inflight = new Set<Promise<unknown>>();
  const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);
  engine.commandHandler = async (line) => {
    const cmd = line.trim().split(/\s+/)[0];
    if (cmd === '/shutdown') {
      setTimeout(() => resolveStop('/shutdown'), 50);
      return 'motor residente encerrando (tarefas em execução são canceladas e a árvore de processos encerrada)';
    }
    if (cmd === '/exit') return 'DETACH';
    log(`cmd ${cmd}`);
    const out = handleLine(engine, line.trim(), false);
    if (out === 'EXIT') return 'DETACH';
    if (out instanceof Promise) {
      if (cmd === '/run') {
        // o /run continua no motor; o cliente pode sair que as tarefas seguem (o resultado vai para o log e os eventos)
        const p = out.then((t) => log(t), (e: Error) => log(`erro: ${e.message}`)).finally(() => inflight.delete(p));
        inflight.add(p);
        return 'executando no motor residente: as tarefas continuam mesmo se você sair (/exit). Acompanhe com ases-tar ou /tasks.';
      }
      return out;
    }
    return out ?? '';
  };
  log(`motor residente pronto: ${engine.info.name} (${engine.info.projectId}) pid ${process.pid}`);
  process.once('SIGTERM', () => resolveStop('SIGTERM'));
  process.once('SIGINT', () => resolveStop('SIGINT'));
  const why = await stopped;
  const r = await engine.stop();
  await Promise.allSettled([...inflight]);
  log(`encerrado (${why}): ${r.cancelled} tarefa(s) cancelada(s); estado salvo até seq ${r.lastSeq}`);
  return 0;
}

/** Sobe o motor destacado (stdio no log privado) e espera ele responder. Idempotente: se já há um, só informa. */
export async function startDaemon(root: string, adapter: PlatformAdapter, bin: string): Promise<string> {
  const { projectId } = readManifest(root);
  const existing = await connectResident(adapter, root, 'monitor');
  if (existing) {
    existing.client.close();
    return `motor residente já em execução (pid ${existing.pid})`;
  }
  adapter.ensurePrivateDir(adapter.getRuntimeDir(projectId));
  const lf = logFile(adapter, projectId);
  const fd = openSync(lf, 'a', 0o600);
  const child = spawn(process.execPath, [bin, 'daemon', 'run'], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: process.env });
  child.unref();
  closeSync(fd);
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    const c = await connectResident(adapter, root, 'monitor');
    if (c) {
      c.client.close();
      return `motor residente iniciado (pid ${c.pid}); log ${lf}`;
    }
    if (child.exitCode !== null) break;
  }
  const tail = existsSync(lf) ? readFileSync(lf, 'utf8').slice(-1500) : '';
  throw Object.assign(new Error(`o motor residente não respondeu em 10 s; log ${lf}\n${tail}`), { code: 'DAEMON_START_FAILED' });
}

export async function daemonStatus(root: string, adapter: PlatformAdapter): Promise<{ running: boolean; text: string; json: Record<string, unknown> }> {
  const { projectId } = readManifest(root);
  const c = await connectResident(adapter, root, 'monitor');
  if (!c) return { running: false, text: 'motor residente parado', json: { running: false } };
  const h = (await c.client.call('diagnostics.getHealth')) as Record<string, unknown>;
  c.client.close();
  return { running: true, text: `motor residente em execução (pid ${c.pid}) · ${String(h.status)} · seq ${String(h.lastSeq)} · monitores ${String(h.monitors)} · log ${logFile(adapter, projectId)}`, json: { running: true, pid: c.pid, ...h, supervisor: 'NONE' } };
}

/** Pede /shutdown e espera o processo sair (as tarefas em execução são canceladas com a árvore de processos). */
export async function stopDaemon(root: string, adapter: PlatformAdapter): Promise<string> {
  const c = await connectResident(adapter, root, 'control');
  if (!c) return 'motor residente já estava parado';
  await c.client.call('session.command', { line: '/shutdown' }).catch(() => undefined);
  c.client.close();
  for (let i = 0; i < 300 && alive(c.pid); i++) await sleep(100);
  return alive(c.pid) ? `motor residente (pid ${c.pid}) não saiu em 30 s` : `motor residente encerrado (pid ${c.pid})`;
}

/** Cliente de linha ligado ao motor: cada linha vira `session.command`; /exit só desliga o cliente. */
export async function attachRepl(client: IpcClient, pid: number, interactive: boolean): Promise<number> {
  console.log(`conectado ao motor residente (pid ${pid}). /exit sai sem parar o motor; /shutdown para o motor.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive, prompt: 'ases (residente)> ' });
  const closed = new Promise<void>((r) => client.onClose(() => r()));
  let lost = false;
  void closed.then(() => {
    lost = true;
    rl.close();
  });
  if (interactive) rl.prompt();
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) {
      if (interactive) rl.prompt();
      continue;
    }
    try {
      const out = await client.call<string>('session.command', { line }, 30 * 60_000);
      if (out === 'DETACH') break;
      if (out) console.log(out);
      if (line.startsWith('/shutdown')) break;
    } catch (e) {
      console.log(`erro: ${(e as Error).message}`);
    }
    if (interactive) rl.prompt();
  }
  rl.close();
  client.close();
  console.log(lost ? 'conexão com o motor residente perdida' : 'cliente desligado; o motor residente continua (ases daemon status | stop)');
  return 0;
}
