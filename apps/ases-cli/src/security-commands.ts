import os from 'node:os';
import path from 'node:path';
import { findExecutable, scopedEnv } from '@aer/provider-sdk';
import {
  discoverProjectMcp, discoverSkills, evaluate, installClaudePlugin, listClaudePlugins, mcpHealth, operationHash, scanPlugin, skillRoots, verdictOf, type Operation,
} from '@aer/security';
import type { ExtensionRow } from '@aer/persistence';
import type { Engine } from './engine.ts';

export const SECURITY_HELP = `Segurança e extensões (PHASE-10):
  /approval                       pedidos e aprovações (vinculados ao hash exato da operação)
  /approval grant APR-XXXX [minutos] <seu nome>   concede por tempo limitado (padrão 60, máx. 1440); uso único
  /approval deny APR-XXXX <seu nome>
  /ext discover                   procura Skills (.claude/.agents), MCP do .mcp.json e plugins (claude plugin list --json); inspeciona tudo
  /ext                            registry: estado, veredito do scan e compatibilidade por provider
  /ext EXT-XXXX                   detalhe com os achados da inspeção
  /ext approve EXT-XXXX           pede aprovação (INSTALL_PACKAGES / USE_MCP) para o manifesto exato; UNSAFE é recusado
  /ext install EXT-XXXX           com aprovação válida: Skill = referência verificada; MCP = health check sob timeout;
                                  plugin = \`claude plugin install\` oficial (sem -y)
  /ext reject EXT-XXXX            desativa a extensão
  /task new ... --ext EXT-1,EXT-2 a tarefa só inicia se as extensões estiverem VERIFIED e forem compatíveis com o provider`;

export const SECURITY_COMMANDS = new Set(['/approval', '/ext']);

const SCOPE: Record<ExtensionRow['kind'], string> = { SKILL: 'INSTALL_PACKAGES', PLUGIN: 'INSTALL_PACKAGES', MCP: 'USE_MCP' };
const opOf = (e: ExtensionRow): Operation => ({ scope: SCOPE[e.kind], subject: `${e.kind}:${e.name}@${e.origin}`, detail: { extension: e.id, manifestSha256: e.manifestSha256 } });
const compat = (e: ExtensionRow) => Object.entries(e.compatibility).map(([p, c]) => `${p}=${c}`).join(' ');

async function discover(engine: Engine): Promise<string> {
  const root = engine.projectRoot;
  const lines: string[] = [];
  const record = (i: Parameters<Engine['store']['upsertExtension']>[0]) => {
    const r = engine.mutate((s) => s.upsertExtension(i));
    lines.push(`${r.id} ${i.kind.padEnd(6)} ${i.verdict.padEnd(6)} ${i.name}${r.changed ? '' : ' (sem mudança)'}`);
  };
  for (const sk of discoverSkills(skillRoots(root, os.homedir()))) {
    const findings = [...sk.scan.findings, ...sk.problems.map((p) => ({ code: 'INVALID_FRONTMATTER', severity: 'HIGH' as const, path: 'SKILL.md', detail: p }))];
    record({ kind: 'SKILL', name: sk.name, origin: sk.dir, scope: sk.scope, manifestSha256: sk.manifestSha256, verdict: verdictOf(findings), findings, compatibility: sk.compatibility, detail: { description: sk.description, files: sk.scan.files } });
  }
  for (const m of discoverProjectMcp(path.join(root, '.mcp.json'))) {
    record({ kind: 'MCP', name: m.id, origin: m.origin, scope: 'PROJECT', manifestSha256: m.manifestSha256, verdict: verdictOf(m.findings), findings: m.findings, compatibility: m.compatibility,
      detail: { transport: m.transport, command: m.command ?? null, args: m.args, envKeys: m.envKeys, host: m.url ? new URL(m.url).host : null } });
  }
  const claude = findExecutable('claude', process.env);
  if (!claude) lines.push('plugins Claude: claude não está no PATH (nada listado)');
  else {
    try {
      for (const p of await listClaudePlugins(engine.platform, claude, { env: scopedEnv('claude', process.env) })) {
        const scan = scanPlugin(p);
        const findings = [...scan.findings, ...p.mcpServers.flatMap((m) => m.findings)];
        record({ kind: 'PLUGIN', name: p.id, origin: 'claude plugin list', scope: p.scope, manifestSha256: p.manifestSha256, verdict: verdictOf(findings), findings, compatibility: p.compatibility,
          detail: { version: p.version, enabled: p.enabled, components: p.components, mcpServers: p.mcpServers.map((m) => m.id), files: scan.files } });
      }
    } catch (e) {
      lines.push(`plugins Claude: ${(e as Error).message}`);
    }
  }
  return lines.length ? lines.join('\n') : 'nenhuma extensão encontrada';
}

async function install(engine: Engine, e: ExtensionRow): Promise<string> {
  const s = engine.store;
  const d = evaluate(opOf(e), { approvals: s.listApprovals() });
  if (d.decision !== 'ALLOW') return `${e.id}: ${d.reason}. Rode /ext approve ${e.id} e conceda com /approval grant.`;
  if (e.state !== 'APPROVED') return `${e.id} está ${e.state}; só APPROVED pode ser instalado`;
  engine.mutate((st) => st.consumeApproval(d.approvalId!));
  if (e.kind === 'SKILL') {
    // referência, não cópia: verifica que o manifesto continua o mesmo que foi aprovado (§9.2)
    const again = discoverSkills(skillRoots(engine.projectRoot, os.homedir())).find((x) => x.dir === e.origin);
    if (!again || again.manifestSha256 !== e.manifestSha256) {
      engine.mutate((st) => st.setExtensionState(e.id, 'FAILED', 'manifest changed after approval'));
      return `${e.id}: SKILL.md mudou depois da aprovação; FAILED (rode /ext discover e aprove de novo)`;
    }
    engine.mutate((st) => { st.setExtensionState(e.id, 'INSTALLED', 'referência registrada'); st.setExtensionState(e.id, 'VERIFIED', `sha256 ${e.manifestSha256.slice(0, 12)}…`); });
    return `${e.id} VERIFIED (referência a ${e.origin}; o original não foi copiado nem alterado)`;
  }
  if (e.kind === 'MCP') {
    const det = e.detail as { transport?: string; command?: string | null; args?: string[] };
    if (det.transport !== 'stdio' || !det.command) {
      engine.mutate((st) => st.setExtensionState(e.id, 'FAILED', 'only stdio health check is supported'));
      return `${e.id}: health check só para stdio nesta fase; FAILED`;
    }
    // env do processo do AER, sem credenciais de providers; as variáveis próprias do servidor não são repassadas (segredo não sai do arquivo)
    const h = await mcpHealth(engine.platform, { id: e.name, command: det.command, args: det.args ?? [], cwd: engine.projectRoot, env: scopedEnv('mcp', process.env), timeoutMs: 15_000 });
    engine.mutate((st) => { st.setExtensionState(e.id, 'INSTALLED', null); st.setExtensionState(e.id, h.ok && h.reconciled ? 'VERIFIED' : 'FAILED', h.ok ? h.tools.join(', ') : (h.error ?? 'health check failed')); });
    return h.ok ? `${e.id} VERIFIED: ${h.serverInfo ?? '?'} · ferramentas ${h.tools.join(', ') || '(nenhuma)'}` : `${e.id} FAILED: ${h.error}`;
  }
  const claude = findExecutable('claude', process.env);
  if (!claude) return `${e.id}: claude não está no PATH`;
  const r = await installClaudePlugin(engine.platform, claude, e.name, 'project', { cwd: engine.projectRoot, env: scopedEnv('claude', process.env) });
  engine.mutate((st) => { st.setExtensionState(e.id, r.ok ? 'INSTALLED' : 'FAILED', r.output.slice(0, 300)); if (r.ok) st.setExtensionState(e.id, 'VERIFIED', 'claude plugin install exit 0'); });
  return r.ok ? `${e.id} instalado pelo CLI oficial (claude plugin install ${e.name} -s project)` : `${e.id} FAILED: ${r.output.slice(0, 300)}`;
}

export function handleSecurity(engine: Engine, cmd: string, sub: string | undefined, rest: string[]): string | Promise<string> {
  const s = engine.store;
  if (cmd === '/approval') {
    if (!sub) return s.listApprovals().map((a) => `${a.id} ${a.state.padEnd(9)} ${a.scope.padEnd(17)} ${a.subject} · ${a.description}${a.expiresAt && a.state === 'GRANTED' ? ` · até ${a.expiresAt}` : ''}`).join('\n') || '(nenhum pedido de aprovação)';
    if (sub === 'grant' || sub === 'deny') {
      const [id = '', ...w] = rest;
      const ttl = sub === 'grant' && /^\d+$/.test(w[0] ?? '') ? Number(w.shift()) : 60;
      const a = engine.mutate((st) => st.decideApproval(id, sub === 'grant' ? 'GRANTED' : 'DENIED', w.join(' '), ttl));
      return `${a.id} ${a.state}${a.expiresAt ? ` até ${a.expiresAt}` : ''} (${a.subject})`;
    }
    return 'uso: /approval | /approval grant APR-XXXX [minutos] <nome> | /approval deny APR-XXXX <nome>';
  }
  if (!sub) return s.listExtensions().map((e) => `${e.id} ${e.kind.padEnd(6)} ${e.state.padEnd(10)} ${(e.verdict ?? '?').padEnd(6)} ${e.name} · ${compat(e)}`).join('\n') || '(registry vazio: /ext discover)';
  if (sub === 'discover') return discover(engine);
  const e = s.getExtension(rest[0] ?? sub);
  if (/^EXT-\d+$/.test(sub)) {
    if (!e) return `${sub} não encontrada`;
    return [`${e.id} · ${e.kind} · ${e.name} · ${e.state} · veredito ${e.verdict}`, `origem ${e.origin} · escopo ${e.scope} · manifesto sha256 ${e.manifestSha256.slice(0, 12)}…`,
      `compatibilidade: ${compat(e)}`, ...(e.findings.length ? e.findings.map((f) => `  ${f.severity.padEnd(6)} ${f.code} ${f.path}: ${f.detail}`) : ['  (nenhum achado)'])].join('\n');
  }
  if (!e) return `extensão não encontrada: ${rest[0] ?? '(vazia)'}`;
  if (sub === 'approve') {
    if (e.verdict === 'UNSAFE') return `${e.id} é UNSAFE (${e.findings.filter((f) => f.severity === 'HIGH').map((f) => f.code).join(', ')}): não pode ser aprovada`;
    const op = opOf(e);
    const a = engine.mutate((st) => st.requestApproval({ scope: op.scope, subject: op.subject, operationHash: operationHash(op), description: `${e.kind === 'MCP' ? 'iniciar' : 'instalar'} ${e.name} (manifesto ${e.manifestSha256.slice(0, 12)}…, veredito ${e.verdict})` }));
    if (e.state === 'INSPECTED') engine.mutate((st) => st.setExtensionState(e.id, 'APPROVED', `aguarda ${a.id}`));
    return `${a.id} ${a.state}: conceda com /approval grant ${a.id} <seu nome>; depois /ext install ${e.id}`;
  }
  if (sub === 'install') return install(engine, e);
  if (sub === 'reject') {
    engine.mutate((st) => st.setExtensionState(e.id, 'REJECTED', 'rejeitada pelo usuário'));
    return `${e.id} REJECTED`;
  }
  return 'uso: /ext | /ext discover | /ext EXT-XXXX | /ext approve|install|reject EXT-XXXX';
}
