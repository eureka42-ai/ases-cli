/** Compatibilidade por provider (§9.1, AER-REQ-133/140). UNKNOWN nunca vira suportado por suposição. */
export const COMPATIBILITY = ['NATIVE', 'PORTABLE', 'ADAPTED', 'CLAUDE_ONLY', 'UNSUPPORTED', 'UNKNOWN'] as const;
export type Compatibility = (typeof COMPATIBILITY)[number];
export const PROVIDERS = ['claude', 'codex', 'kimi', 'opencode', 'google'] as const;
export type CompatMatrix = Record<(typeof PROVIDERS)[number], Compatibility>;

/** Só NATIVE/PORTABLE/ADAPTED podem rodar; CLAUDE_ONLY só no claude; UNKNOWN/UNSUPPORTED em lugar nenhum. */
export function canUse(matrix: Partial<Record<string, Compatibility>>, providerId: string): { ok: boolean; reason: string } {
  const base = providerId.split(':')[0]!;
  const c = matrix[base] ?? 'UNKNOWN';
  if (c === 'CLAUDE_ONLY') return base === 'claude' ? { ok: true, reason: 'CLAUDE_ONLY on claude' } : { ok: false, reason: `CLAUDE_ONLY: not executable on ${base}` };
  if (c === 'NATIVE' || c === 'PORTABLE' || c === 'ADAPTED') return { ok: true, reason: `${c} on ${base}` };
  return { ok: false, reason: `${c} on ${base}` };
}

const all = (c: Compatibility): CompatMatrix => Object.fromEntries(PROVIDERS.map((p) => [p, c])) as CompatMatrix;

/**
 * Plugin do Claude Code: NATIVE no claude. Hooks, commands, agents, LSP ou MCP interno → CLAUDE_ONLY nos demais
 * (§9.3: Claude-only até um adaptador equivalente ser validado). Sem nada disso → UNKNOWN (não testado), não PORTABLE.
 */
export function pluginCompatibility(components: { hooks: boolean; commands: boolean; agents: boolean; lsp: boolean; mcp: boolean; skills: boolean }): CompatMatrix {
  const proprietary = components.hooks || components.commands || components.agents || components.lsp || components.mcp;
  return { ...all(proprietary ? 'CLAUDE_ONLY' : 'UNKNOWN'), claude: 'NATIVE' };
}

/** Skill (SKILL.md): NATIVE onde o próprio provider a carrega desse local; nos demais, UNKNOWN até teste. */
export function skillCompatibility(location: 'claude' | 'agents' | 'other'): CompatMatrix {
  return { ...all('UNKNOWN'), ...(location === 'claude' ? { claude: 'NATIVE' as const } : {}) };
}

/** Servidor MCP: protocolo aberto, mas cada provider o carrega por config própria; sem teste de execução → UNKNOWN. */
export function mcpCompatibility(): CompatMatrix {
  return all('UNKNOWN');
}
