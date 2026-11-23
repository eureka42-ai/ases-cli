import { existsSync, readFileSync } from 'node:fs';
import { canonicalJson, sha256Hex } from '@aer/contracts';
import { NdjsonDecoder, findExecutable, type ProcessPlatform } from '@aer/provider-sdk';
import { mcpCompatibility, type CompatMatrix } from './compat.ts';
import type { Finding } from './scan.ts';

export interface McpServerInfo {
  id: string;
  /** de onde veio: ".mcp.json" do projeto ou "plugin:<id>" */
  origin: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  command?: string;
  args: string[];
  url?: string;
  /** só os NOMES das variáveis; valores nunca são guardados nem exibidos (AER-REQ-166) */
  envKeys: string[];
  manifestSha256: string;
  findings: Finding[];
  compatibility: CompatMatrix;
}

/** Executáveis que podem subir um servidor MCP sem aprovação de exceção; o resto é REVIEW. */
export const MCP_COMMAND_ALLOWLIST = ['node', 'npx', 'uvx', 'python', 'python3', 'deno', 'bun'];
const SECRETISH = /(KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH|CREDENTIAL|COOKIE)/i;

/** Normaliza uma entrada de config MCP (formato `mcpServers` do Claude Code / .mcp.json) sem copiar valores sensíveis. */
export function describeMcpServer(id: string, raw: unknown, origin: string): McpServerInfo {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const command = typeof o.command === 'string' ? o.command : undefined;
  const url = typeof o.url === 'string' ? o.url : undefined;
  const type = typeof o.type === 'string' ? o.type : command ? 'stdio' : url ? 'http' : 'unknown';
  const transport = (['stdio', 'http', 'sse'] as const).find((t) => t === type) ?? 'unknown';
  const args = Array.isArray(o.args) ? o.args.filter((a): a is string => typeof a === 'string') : [];
  const env = typeof o.env === 'object' && o.env !== null ? (o.env as Record<string, unknown>) : {};
  const headers = typeof o.headers === 'object' && o.headers !== null ? Object.keys(o.headers as object) : [];
  const envKeys = Object.keys(env).sort();
  const findings: Finding[] = [];
  if (transport === 'unknown') findings.push({ code: 'UNKNOWN_TRANSPORT', severity: 'HIGH', path: id, detail: `transport ${type}` });
  if (transport !== 'stdio' && url) findings.push({ code: 'NETWORK', severity: 'MEDIUM', path: id, detail: `remote endpoint ${new URL(url).host} needs network approval (AER-REQ-136)` });
  if (command && !MCP_COMMAND_ALLOWLIST.includes(command.split(/[\\/]/).pop()!.replace(/\.(exe|cmd)$/i, ''))) findings.push({ code: 'COMMAND_NOT_ALLOWLISTED', severity: 'MEDIUM', path: id, detail: `command ${command}` });
  if (command && /(^|[\\/])npx$|uvx$/.test(command.replace(/\.(exe|cmd)$/i, ''))) findings.push({ code: 'REMOTE_PACKAGE', severity: 'MEDIUM', path: id, detail: `${command} downloads and runs a package: ${args.find((a) => !a.startsWith('-')) ?? '?'}` });
  const secretKeys = [...envKeys, ...headers].filter((k) => SECRETISH.test(k));
  if (secretKeys.length) findings.push({ code: 'CREDENTIALS', severity: 'MEDIUM', path: id, detail: `passes credentials (${secretKeys.join(', ')}); needs ACCESS_SECRETS approval` });
  // o hash cobre a config inteira (inclusive valores): mudança de credencial ou comando invalida a aprovação (AER-REQ-138)
  return { id, origin, transport, ...(command ? { command } : {}), args, ...(url ? { url } : {}), envKeys, manifestSha256: sha256Hex(canonicalJson(o)), findings, compatibility: mcpCompatibility() };
}

/** `.mcp.json` do projeto (formato documentado do Claude Code). Não lê configs internas de outros clientes. */
export function discoverProjectMcp(file: string): McpServerInfo[] {
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [{ id: '(invalid .mcp.json)', origin: '.mcp.json', transport: 'unknown', args: [], envKeys: [], manifestSha256: '0'.repeat(64), findings: [{ code: 'INVALID_MANIFEST', severity: 'HIGH', path: file, detail: 'not valid JSON' }], compatibility: mcpCompatibility() }];
  }
  const servers = (parsed as { mcpServers?: Record<string, unknown> }).mcpServers ?? {};
  return Object.entries(servers).map(([id, raw]) => describeMcpServer(id, raw, '.mcp.json'));
}

export interface McpHealth {
  ok: boolean;
  serverInfo?: string;
  /** ferramentas no namespace estável `mcp::<server-id>::<tool>` (§9.4) */
  tools: string[];
  error?: string;
  reconciled: boolean;
}

/**
 * Sobe um servidor MCP stdio sob timeout, faz `initialize` + `tools/list` e encerra a árvore (AER-REQ-135).
 * Só deve ser chamado DEPOIS de aprovação (USE_MCP) — quem chama garante. O env recebido já deve estar filtrado.
 */
export async function mcpHealth(platform: ProcessPlatform, s: { id: string; command: string; args: readonly string[]; cwd: string; env: Readonly<Record<string, string | undefined>>; timeoutMs?: number }): Promise<McpHealth> {
  const exe = s.command.includes('/') || s.command.includes('\\') ? s.command : findExecutable(s.command, s.env);
  if (!exe) return { ok: false, tools: [], error: `${s.command} not found in PATH`, reconciled: true };
  let p;
  try {
    p = platform.spawnManagedProcess(exe, s.args, { cwd: s.cwd, env: s.env, stdin: 'pipe' });
  } catch (e) {
    return { ok: false, tools: [], error: (e as Error).message, reconciled: true };
  }
  const send = (m: unknown) => p.child.stdin?.write(`${JSON.stringify(m)}\n`);
  p.child.stdin?.on('error', () => undefined);
  p.child.stderr.on('data', () => undefined);
  const decoder = new NdjsonDecoder();
  const result = await new Promise<McpHealth>((resolve) => {
    let serverInfo: string | undefined;
    const done = (h: Omit<McpHealth, 'reconciled'>) => resolve({ ...h, reconciled: false });
    const timer = setTimeout(() => done({ ok: false, tools: [], error: `no answer within ${s.timeoutMs ?? 10_000} ms` }), s.timeoutMs ?? 10_000);
    p.child.stdout.on('data', (chunk: Buffer) => {
      for (const line of decoder.push(chunk)) {
        if (!line.ok) continue;
        const m = line.value as { id?: number; result?: Record<string, unknown>; error?: { message?: string } };
        if (m.id === 1) {
          if (m.error) {
            clearTimeout(timer);
            done({ ok: false, tools: [], error: `initialize: ${m.error.message ?? 'error'}` });
            return;
          }
          const info = m.result?.serverInfo as { name?: string; version?: string } | undefined;
          serverInfo = `${info?.name ?? '?'} ${info?.version ?? ''}`.trim();
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } else if (m.id === 2) {
          clearTimeout(timer);
          const tools = Array.isArray(m.result?.tools) ? (m.result!.tools as { name?: unknown }[]).map((t) => String(t.name)).filter(Boolean) : [];
          done({ ok: !m.error, ...(serverInfo ? { serverInfo } : {}), tools: tools.map((t) => `mcp::${s.id}::${t}`), ...(m.error ? { error: `tools/list: ${m.error.message ?? 'error'}` } : {}) });
        }
      }
    });
    p.exited.then((r) => {
      clearTimeout(timer);
      done({ ok: false, tools: [], error: `server exited (${r.exitCode ?? r.signal}) before answering` });
    }, () => undefined);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'aer', version: '0.0.0' } } });
  });
  const t = await platform.terminateProcessTree(p.pid, { graceMs: 300 });
  return { ...result, reconciled: t.terminated };
}
