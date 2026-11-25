/** Ferramenta de um agente → ação em português ("Read" + file_path → "Lendo src/app.ts"). Usado no ases e no ases-tar. */
export function describeToolCall(name: string, args: unknown): string {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const target = String(a.file_path ?? a.path ?? a.pattern ?? a.command ?? a.query ?? a.url ?? '').slice(0, 80);
  const n = name.toLowerCase();
  const verb = /read|view|cat|open/.test(n) ? 'Lendo' : /grep|glob|search|find|list|ls/.test(n) ? 'Procurando' : /write|create/.test(n) ? 'Escrevendo'
    : /edit|patch|replace|update/.test(n) ? 'Editando' : /bash|shell|exec|run/.test(n) ? 'Rodando' : /fetch|web/.test(n) ? 'Consultando' : name;
  return target ? `${verb} ${target}` : verb;
}
