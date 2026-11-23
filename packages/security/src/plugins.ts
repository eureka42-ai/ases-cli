import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256Hex } from '@aer/contracts';
import { runShort, type ProcessPlatform } from '@aer/provider-sdk';
import { pluginCompatibility, type CompatMatrix } from './compat.ts';
import { describeMcpServer, type McpServerInfo } from './mcp.ts';
import { scanDirectory, type ScanResult } from './scan.ts';

export interface ClaudePluginInfo {
  id: string;
  version: string;
  scope: string;
  enabled: boolean;
  installPath: string;
  components: { hooks: boolean; commands: boolean; agents: boolean; lsp: boolean; mcp: boolean; skills: boolean };
  manifestSha256: string;
  compatibility: CompatMatrix;
  mcpServers: McpServerInfo[];
}

/** Componentes do plugin pela estrutura documentada (só leitura do diretório instalado; nada é escrito lá, §9.3). */
function components(dir: string, mcp: boolean) {
  const has = (...p: string[]) => existsSync(path.join(dir, ...p));
  return {
    hooks: has('hooks') || has('hooks.json'), commands: has('commands'), agents: has('agents'), lsp: has('.lsp.json'),
    mcp: mcp || has('.mcp.json'), skills: has('skills'),
  };
}

const manifestOf = (dir: string) => {
  const f = [path.join(dir, '.claude-plugin', 'plugin.json'), path.join(dir, 'plugin.json')].find((x) => existsSync(x));
  return f ? sha256Hex(readFileSync(f, 'utf8')) : '0'.repeat(64);
};

/** Lista plugins pelo comando oficial `claude plugin list --json` (AER-REQ-134); nunca lê arquivos internos de config do Claude. */
export async function listClaudePlugins(platform: ProcessPlatform, exe: string, o: { env?: Readonly<Record<string, string | undefined>>; prefixArgs?: readonly string[] } = {}): Promise<ClaudePluginInfo[]> {
  const r = await runShort(platform, exe, [...(o.prefixArgs ?? []), 'plugin', 'list', '--json'], { cwd: os.homedir(), ...(o.env ? { env: o.env } : {}), timeoutMs: 30_000 });
  if (r.exitCode !== 0) throw Object.assign(new Error(`claude plugin list failed (exit ${r.exitCode})`), { code: 'PROVIDER_UNAVAILABLE' });
  const list = JSON.parse(r.stdout) as { id: string; version?: string; scope?: string; enabled?: boolean; installPath?: string; mcpServers?: Record<string, unknown> }[];
  return list.map((p) => {
    const mcpServers = Object.entries(p.mcpServers ?? {}).map(([id, raw]) => describeMcpServer(id, raw, `plugin:${p.id}`));
    const installPath = p.installPath ?? '';
    const c = components(installPath, mcpServers.length > 0);
    return { id: p.id, version: p.version ?? '?', scope: p.scope ?? '?', enabled: p.enabled === true, installPath, components: c, manifestSha256: manifestOf(installPath), compatibility: pluginCompatibility(c), mcpServers };
  });
}

export function scanPlugin(p: Pick<ClaudePluginInfo, 'installPath'>): ScanResult {
  return scanDirectory(p.installPath);
}

/**
 * Instalação delegada ao CLI oficial (`claude plugin install <id> --json -s <scope>`). Nunca passa `-y` nem
 * `--accept-command`: se o marketplace declarar um comando, o CLI recusa sem TTY e o humano confirma no próprio Claude.
 */
export async function installClaudePlugin(platform: ProcessPlatform, exe: string, id: string, scope: 'user' | 'project' | 'local', o: { env?: Readonly<Record<string, string | undefined>>; prefixArgs?: readonly string[]; cwd: string }): Promise<{ ok: boolean; output: string }> {
  if (!/^[A-Za-z0-9._@/-]{1,200}$/.test(id)) throw Object.assign(new Error(`invalid plugin id: ${id}`), { code: 'INVALID_INPUT' });
  const r = await runShort(platform, exe, [...(o.prefixArgs ?? []), 'plugin', 'install', id, '--json', '-s', scope], { cwd: o.cwd, ...(o.env ? { env: o.env } : {}), timeoutMs: 180_000 });
  return { ok: r.exitCode === 0, output: `${r.stdout}${r.stderr}`.slice(0, 4000) };
}
