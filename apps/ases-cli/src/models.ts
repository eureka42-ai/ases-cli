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
      // `claude --help`: aliases (fable, opus, sonnet) ou o nome completo; IDs completos informados pelo responsável (25/11/2026)
      return { provider, canSet: true, source: 'claude --help + lista de 25/11/2026', models: [
        ...['fable', 'opus', 'sonnet'].map((id) => ({ id, name: `${id} (o mais novo dessa linha)` })),
        { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }, { id: 'claude-opus-5', name: 'Claude Opus 5' }, { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
        { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }, { id: 'claude-fable-5-2', name: 'Claude Fable 5.2 (tier Mythos)' },
      ] };
    case 'codex':
      // o codex não tem comando de lista: linha GPT-6 e 5.6 (a linha -codex foi desligada), lista de 25/11/2026
      return { provider, canSet: true, source: 'lista de 25/11/2026 (codex -m)', note: 'ou digite outro nome de `codex -m`', models: [
        ['gpt-6.2-astra', 'GPT-6.2 Astra · mais capaz'], ['gpt-6.2-sol', 'GPT-6.2 Sol · dia a dia, código e agentes'], ['gpt-6.1-sol', 'GPT-6.1 Sol · perto do Astra, custo menor'],
        ['gpt-6.1-terra', 'GPT-6.1 Terra · rápido'], ['gpt-6-astra', 'GPT-6 Astra · código complexo'], ['gpt-6-sol', 'GPT-6 Sol · código e fluxos agênticos'],
        ['gpt-6-luna', 'GPT-6 Luna · eficiente, alto volume'], ['gpt-6-cyber', 'GPT-6 Cyber · segurança autorizada'],
        ['gpt-5.6-sol', 'GPT-5.6 Sol'], ['gpt-5.6-terra', 'GPT-5.6 Terra'], ['gpt-5.6-luna', 'GPT-5.6 Luna'], ['gpt-5.6-cyber', 'GPT-5.6 Cyber'],
      ].map(([id, name]) => ({ id: id!, name: name! })) };
    case 'kimi':
      // IDs da CLI do Kimi (os da sessão real, kimi-code/…); os da API (kimi-k3.1-pro) não valem na CLI. ",thinking" = com raciocínio
      return { provider, canSet: true, source: 'kimi CLI (sessão real) + nomes de 25/11/2026', note: 'ou digite outro nome', models: [
        ['kimi-code/k3.1-pro', 'Kimi K3.1 Pro'], ['kimi-code/k3.1-pro,thinking', 'Kimi K3.1 Pro (com raciocínio)'],
        ['kimi-code/k3.1-pro-highspeed', 'Kimi K3.1 Pro Highspeed'], ['kimi-code/k3.1-pro-highspeed,thinking', 'Kimi K3.1 Pro Highspeed (com raciocínio)'],
        ['kimi-code/k3', 'Kimi K3'], ['kimi-code/k3,thinking', 'Kimi K3 (com raciocínio)'], ['kimi-code/k3-256k', 'Kimi K3 256k'],
        ['kimi-code/kimi-for-coding', 'kimi-for-coding'], ['kimi-code/kimi-for-coding-highspeed', 'kimi-for-coding highspeed'],
      ].map(([id, name]) => ({ id: id!, name: name! })) };
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
