// PHASE-20: de onde vem a lista de modelos de cada IA (conferido nas CLIs instaladas em 24/11/2026, sem gastar cota).
// Nada é inventado: sem comando de lista, a tela pede para digitar o nome.

export interface ModelList {
  provider: string;
  models: { id: string; name: string }[];
  /** o AER consegue aplicar a escolha (claude --model, codex -m, ACP session/set_model) */
  canSet: boolean;
  source: string;
  note?: string;
}

type Run = (cmd: string, args: string[]) => Promise<{ exitCode: number | null; stdout: string }>;

export async function listModels(provider: string, run: Run): Promise<ModelList> {
  switch (provider) {
    case 'claude':
      // `claude --help`: "Use an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet') or a model's full name"
      return { provider, canSet: true, source: 'claude --help', models: ['fable', 'opus', 'sonnet'].map((id) => ({ id, name: id })), note: 'ou digite o nome completo de um modelo' };
    case 'codex':
      return { provider, canSet: true, source: 'codex -m', models: [], note: 'o codex não tem comando de lista: digite o nome do modelo (o mesmo de `codex -m`)' };
    case 'kimi':
      return { provider, canSet: true, source: 'kimi -m', models: [], note: 'o kimi informa os modelos só dentro da sessão: digite o nome (ex.: o de `kimi -m`)' };
    case 'google':
    case 'cursor':
    case 'opencode': {
      const cmd = provider === 'google' ? 'agy' : provider === 'cursor' ? 'cursor-agent' : 'opencode';
      const r = await run(cmd, ['models']).catch(() => ({ exitCode: 1, stdout: '' }));
      const models = r.exitCode === 0
        ? r.stdout.split('\n').map((l) => l.trim()).filter((l) => l && !/^fetching/i.test(l)).map((l) => {
          const [id = '', name] = l.split('\t');
          return { id: id.trim(), name: (name ?? id).trim() };
        }).filter((m) => /^[A-Za-z0-9][A-Za-z0-9._/,:@+-]*$/.test(m.id))
        : [];
      const base = { provider, source: `${cmd} models`, models, ...(r.exitCode === 0 ? {} : { note: `não consegui listar (\`${cmd} models\` falhou): digite o nome` }) };
      // opencode 2.4.1: o ACP não expõe troca de modelo (session/new sem models); a escolha fica no opencode.json dele
      const why = 'o OpenCode não troca de modelo pelo AER: edite `model` no opencode.json dele (o AER não mexe nesse arquivo)';
      return provider === 'opencode' ? { ...base, canSet: false, note: base.note ? `${why}; ${base.note}` : why } : { ...base, canSet: true };
    }
    default:
      return { provider, canSet: false, source: '—', models: [], note: 'IA sem escolha de modelo' };
  }
}
