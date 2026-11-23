import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { payloadSha256, type EventEnvelope } from '@aer/contracts';
import type { LocalIpcEndpoint } from '@aer/platform-core';
import { IpcClient, IpcServer, RPC, type RpcError } from '../src/index.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'aer-ipc-'));
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
let n = 0;
const endpoint = (): LocalIpcEndpoint =>
  process.platform === 'win32' ? { kind: 'named-pipe', address: `\\\\.\\pipe\\aer-test-${process.pid}-${++n}` } : { kind: 'uds', address: path.join(dir, `s${++n}.sock`) };

const PROJECT = 'prj_ipc00001';
const tokens = { control: 'c'.repeat(64), monitor: 'm'.repeat(64) };
const ev = (seq: number, extra = ''): EventEnvelope => {
  const payload = { i: seq, extra };
  return {
    schemaVersion: 1, eventId: randomUUID(), seq, projectId: PROJECT, phaseId: null, taskId: null, attemptId: null, eventType: 'TestRunStarted',
    occurredAt: '2026-11-22T00:00:00.000Z', observedAt: '2026-11-22T00:00:00.000Z', actor: 't', payload, redactionLevel: 'SAFE', payloadSha256: payloadSha256(payload),
  };
};

const servers: IpcServer[] = [];
const clients: IpcClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function start(opts: Partial<ConstructorParameters<typeof IpcServer>[0]> = {}, events: EventEnvelope[] = []) {
  const ep = endpoint();
  const server = new IpcServer({
    endpoint: ep, projectId: PROJECT, tokens, eventsSince: (after, limit) => events.filter((e) => e.seq > after).slice(0, limit),
    handlers: { 'project.getInfo': () => ({ ok: true }), 'task.create': (p) => ({ created: p.title }) }, ...opts,
  });
  await server.listen();
  servers.push(server);
  return { server, ep, events };
}
const connect = async (ep: LocalIpcEndpoint, role: 'control' | 'monitor' = 'monitor', extra: Partial<Parameters<typeof IpcClient.connect>[0]> = {}) => {
  const c = await IpcClient.connect({ endpoint: ep, projectId: PROJECT, role, token: tokens[role], ...extra });
  clients.push(c);
  return c;
};
const code = (c: number) => expect.objectContaining({ code: c }) as RpcError;

function raw(ep: LocalIpcEndpoint): Promise<{ socket: net.Socket; send: (m: unknown) => void; next: () => Promise<Record<string, unknown>> }> {
  return new Promise((resolve) => {
    const socket = net.connect(ep.address, () => {
      let buf = '';
      const queue: string[] = [];
      const waiters: ((l: string) => void)[] = [];
      socket.setEncoding('utf8');
      socket.on('data', (d: string) => {
        buf += d;
        const lines = buf.split('\n');
        buf = lines.pop()!;
        for (const l of lines) (waiters.shift() ?? ((x: string) => queue.push(x)))(l);
      });
      resolve({
        socket,
        send: (m) => socket.write(typeof m === 'string' ? m : `${JSON.stringify(m)}\n`),
        next: () => new Promise((r) => (queue.length ? r(JSON.parse(queue.shift()!)) : waiters.push((l) => r(JSON.parse(l))))),
      });
    });
  });
}

describe('handshake and auth (TAR-0012, AER-REQ-072, AER-REQ-073)', () => {
  it('listens on a local socket path, never TCP (AER-REQ-071)', async () => {
    const { server, ep } = await start();
    expect(typeof (server as unknown as { server: net.Server }).server.address()).toBe('string');
    expect(ep.address).not.toMatch(/:\d+$/);
  });

  it('accepts valid monitor and control tokens', async () => {
    const { ep } = await start();
    expect((await connect(ep, 'monitor')).handshake).toMatchObject({ role: 'monitor', protocolVersion: 1, projectId: PROJECT });
    expect((await connect(ep, 'control')).handshake).toMatchObject({ role: 'control' });
  });

  it('rejects wrong token, wrong project and incompatible protocol', async () => {
    const { ep } = await start();
    await expect(connect(ep, 'monitor', { token: 'x'.repeat(64) })).rejects.toEqual(code(RPC.UNAUTHENTICATED));
    await expect(connect(ep, 'control', { token: tokens.monitor })).rejects.toEqual(code(RPC.UNAUTHENTICATED));
    await expect(connect(ep, 'monitor', { projectId: 'prj_other0001' })).rejects.toEqual(code(RPC.PROJECT_MISMATCH));
    await expect(connect(ep, 'monitor', { protocolVersion: 99 })).rejects.toEqual(code(RPC.VERSION_MISMATCH));
  });

  it('refuses any method before handshake', async () => {
    const { ep } = await start();
    const r = await raw(ep);
    r.send({ jsonrpc: '2.0', id: 1, method: 'project.getInfo' });
    expect(await r.next()).toMatchObject({ id: 1, error: { code: RPC.UNAUTHENTICATED } });
    r.socket.destroy();
  });

  it('closes a connection that never handshakes (AER-REQ-080)', async () => {
    const { ep } = await start({ handshakeTimeoutMs: 100 });
    const r = await raw(ep);
    await new Promise((resolve) => r.socket.on('close', resolve));
  });
});

describe('read-only monitor (TAR-0014, AER-REQ-079, C20)', () => {
  it('denies mutating RPC for the monitor role, even hand-crafted', async () => {
    const { ep } = await start();
    const mon = await connect(ep, 'monitor');
    await expect(mon.call('task.create', { title: 'x' })).rejects.toEqual(code(RPC.FORBIDDEN));
    const r = await raw(ep);
    r.send({ jsonrpc: '2.0', id: 1, method: 'rpc.handshake', params: { protocolVersion: 1, projectId: PROJECT, role: 'monitor', token: tokens.monitor } });
    await r.next();
    r.send({ jsonrpc: '2.0', id: 2, method: 'task.create', params: { title: 'forjado' } });
    expect(await r.next()).toMatchObject({ id: 2, error: { code: RPC.FORBIDDEN } });
    r.socket.destroy();
    expect(await (await connect(ep, 'control')).call('task.create', { title: 'ok' })).toEqual({ created: 'ok' });
  });

  it('unknown methods are not reachable', async () => {
    const { ep } = await start({ handlers: { 'fs.delete': () => 'nope' } });
    await expect((await connect(ep, 'control')).call('fs.delete')).rejects.toEqual(code(RPC.METHOD_NOT_FOUND));
  });
});

describe('frames and timeouts', () => {
  it('rejects frames over the limit and closes the connection (AER-REQ-078)', async () => {
    const { ep } = await start({ maxFrameBytes: 1024 });
    const r = await raw(ep);
    const closed = new Promise((resolve) => r.socket.on('close', resolve));
    r.send('x'.repeat(5000));
    expect(await r.next()).toMatchObject({ error: { code: RPC.FRAME_TOO_LARGE } });
    await closed;
  });

  it('a silent server makes calls fail with a typed timeout (AER-REQ-080)', async () => {
    const ep = endpoint();
    const silent = net.createServer((s) => s.resume()); // lê e descarta, nunca responde
    await new Promise<void>((r) => silent.listen(ep.address, r));
    await expect(IpcClient.connect({ endpoint: ep, projectId: PROJECT, role: 'monitor', token: tokens.monitor, timeoutMs: 150 })).rejects.toEqual(code(RPC.TIMEOUT));
    await new Promise((r) => silent.close(r));
  });
});

describe('subscription (TAR-0013, AER-REQ-074, AER-REQ-075, AER-REQ-070)', () => {
  it('delivers backlog then live events exactly once, in seq order', async () => {
    const events = [1, 2, 3].map((s) => ev(s));
    const { server, ep } = await start({}, events);
    const mon = await connect(ep);
    const seen: number[] = [];
    mon.onNotification((m) => m.method === 'project.event' && seen.push((m.params.event as EventEnvelope).seq));
    expect(await mon.call('project.subscribe', { fromSeq: 1 })).toEqual({ subscribed: true, fromSeq: 1, backlog: 2 });
    for (const s of [4, 5]) {
      events.push(ev(s));
      server.notify(events.at(-1)!);
    }
    server.notify(events[2]!); // repetido: não reenvia
    await expect.poll(() => seen).toEqual([2, 3, 4, 5]);
  });

  it('a reconnecting client resumes from its last seq without gaps or duplicates', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ev(i + 1));
    const { ep } = await start({}, events);
    const seen: number[] = [];
    const listen = (c: IpcClient) => c.onNotification((m) => m.method === 'project.event' && seen.push((m.params.event as EventEnvelope).seq));
    const a = await connect(ep);
    listen(a);
    await a.call('project.subscribe', { fromSeq: 0 });
    await expect.poll(() => seen.length).toBe(10);
    a.close();
    events.push(ev(11), ev(12));
    const b = await connect(ep);
    listen(b);
    await b.call('project.subscribe', { fromSeq: seen.at(-1)! });
    await expect.poll(() => seen).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('a slow consumer never blocks the engine and gets resyncRequired (AER-REQ-077)', async () => {
    const events: EventEnvelope[] = [];
    const { server, ep } = await start({ maxBufferedBytes: 64 * 1024 }, events);
    const r = await raw(ep);
    r.send({ jsonrpc: '2.0', id: 1, method: 'rpc.handshake', params: { protocolVersion: 1, projectId: PROJECT, role: 'monitor', token: tokens.monitor } });
    await r.next();
    r.send({ jsonrpc: '2.0', id: 2, method: 'project.subscribe', params: { fromSeq: 0 } });
    await r.next();
    r.socket.pause(); // para de ler
    const t0 = performance.now();
    for (let s = 1; s <= 10_000; s++) server.notify(ev(s, 'x'.repeat(200)));
    expect(performance.now() - t0).toBeLessThan(2000);
    r.socket.resume();
    let msg: Record<string, unknown>;
    do msg = await r.next(); while (msg.method === 'project.event');
    expect(msg.method).toBe('project.resyncRequired');
    r.socket.destroy();
  });
});

describe('single engine per project (§3.4)', () => {
  it('a second server on a live endpoint fails with ENGINE_ALREADY_RUNNING', async () => {
    const { ep } = await start();
    const dup = new IpcServer({ endpoint: ep, projectId: PROJECT, tokens, handlers: {}, eventsSince: () => [] });
    await expect(dup.listen()).rejects.toMatchObject({ code: 'ENGINE_ALREADY_RUNNING' });
  });

  it.runIf(process.platform !== 'win32')('replaces a stale socket path left by a dead engine', async () => {
    const ep = endpoint();
    writeFileSync(ep.address, ''); // caminho ocupado por arquivo órfão, sem ninguém escutando
    const s = new IpcServer({ endpoint: ep, projectId: PROJECT, tokens, handlers: {}, eventsSince: () => [] });
    await s.listen();
    servers.push(s);
    expect((await connect(ep)).handshake).toMatchObject({ role: 'monitor' });
  });
});
