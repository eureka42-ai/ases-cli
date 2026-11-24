import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Box, Text, render, useInput } from 'ink';
import { useEffect, useState, type ReactElement } from 'react';
import { saveChatConfig, type ChatMode } from '@aer/project-store';
import type { ProviderProbeResult } from '@aer/provider-sdk';
import { BrandHeader, UiContext, useTerminalSize, useUi, type Ui } from '@aer/tui-shared';
import { chatSession } from './chat-commands.ts';
import type { Engine } from './engine.ts';

// PHASE-18 §5.6: assistente de primeiro uso. Não usa IA nenhuma: detecta as IAs, pergunta e grava a config.

const ORDER = ['claude', 'codex', 'kimi', 'opencode', 'google'];
const HOW_TO_INSTALL: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code, depois rode `claude` e faça o login',
  codex: 'npm install -g @openai/codex, depois `codex login`',
  kimi: 'veja o site oficial do Kimi Code CLI e rode `kimi login`',
  opencode: 'veja o site oficial do OpenCode',
  google: 'veja o site oficial do Antigravity CLI (comando `agy`)',
};

/** Comando de teste detectado no projeto (sem shell): npm test, pytest… ou nenhum. */
export function suggestTestCommand(root: string): string[] | undefined {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) return ['npm', 'test'];
  } catch {
    // sem package.json legível
  }
  if (['pytest.ini', 'pyproject.toml', 'setup.cfg'].some((f) => existsSync(path.join(root, f)))) return ['pytest'];
  if (existsSync(path.join(root, 'Cargo.toml'))) return ['cargo', 'test'];
  if (existsSync(path.join(root, 'go.mod'))) return ['go', 'test', './...'];
  return undefined;
}

type Step = 'main' | 'mode' | 'limit' | 'test' | 'save';

function Choice({ title, options, sel }: { title: string; options: string[]; sel: number }): ReactElement {
  const ui = useUi();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{title}</Text>
      {options.map((o, i) => <Text key={o} inverse={i === sel}>{`  ${i === sel ? (ui.unicode ? '›' : '>') : ' '} ${o}`}</Text>)}
    </Box>
  );
}

export function Wizard({ engine, onDone }: { engine: Engine; onDone: () => void }): ReactElement {
  const { columns } = useTerminalSize();
  const ui = useUi();
  const chat = chatSession(engine);
  const [probes, setProbes] = useState<Record<string, ProviderProbeResult> | undefined>(undefined);
  const [step, setStep] = useState<Step>('main');
  const [sel, setSel] = useState(0);
  const [answers, setAnswers] = useState<{ main?: string; mode?: ChatMode; limit?: number; test?: string[] | null }>({});
  const suggested = suggestTestCommand(engine.projectRoot);

  useEffect(() => {
    void chat.probeAll(true).then(setProbes);
  }, [chat]);

  const ids = probes ? Object.keys(probes) : [];
  const readyIds = ids.filter((id) => probes![id]!.availability === 'READY').sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const options: Record<Step, string[]> = {
    main: readyIds,
    mode: ['perguntar antes de cada plano (manual)', 'automático'],
    limit: ['1 (padrão, conforme os termos de uso individual)', '2', '3'],
    test: suggested ? [`${suggested.join(' ')} (detectado)`, 'nenhum por enquanto'] : ['nenhum por enquanto'],
    save: ['este projeto', 'todos os projetos (config global)'],
  };

  useInput((_ch, key) => {
    if (!probes) return;
    const opts = options[step];
    if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSel((i) => Math.min(opts.length - 1, i + 1));
    if (!key.return || !opts.length) return;
    const next = (s: Step) => {
      setStep(s);
      setSel(0);
    };
    if (step === 'main') {
      setAnswers((a) => ({ ...a, main: readyIds[sel]! }));
      next('mode');
    } else if (step === 'mode') {
      setAnswers((a) => ({ ...a, mode: sel === 1 ? 'auto' : 'manual' }));
      next('limit');
    } else if (step === 'limit') {
      setAnswers((a) => ({ ...a, limit: sel + 1 }));
      next('test');
    } else if (step === 'test') {
      setAnswers((a) => ({ ...a, test: suggested && sel === 0 ? suggested : null }));
      next('save');
    } else {
      const target = sel === 1 ? 'global' : 'project';
      const limits = answers.limit && answers.limit > 1 ? Object.fromEntries(readyIds.map((id) => [id, answers.limit!])) : {};
      saveChatConfig(target, engine.projectRoot, { main: answers.main!, mode: answers.mode ?? 'manual', limits, ...(answers.test ? { testCommand: answers.test } : {}) });
      if (answers.test) engine.mutate((s) => s.appendEvent({ eventType: 'ApprovalGranted', payload: { scope: 'chat-test-command', argv: answers.test!, grantedBy: 'user (assistente)', note: 'roda automaticamente nas tarefas do chat, sem shell' } }));
      onDone();
    }
  });

  const titles: Record<Step, string> = {
    main: 'Qual será a principal? (↑↓ e Enter)',
    mode: 'Modo de execução dos planos?',
    limit: 'Tarefas em paralelo por IA?',
    test: 'Comando de teste do projeto (roda em cada tarefa antes de ela ficar pronta)?',
    save: 'Salvar para:',
  };
  return (
    <Box flexDirection="column" width={columns}>
      <BrandHeader app="ASES CLI" columns={columns} banner={{}} />
      <Text bold>Primeiro uso: vamos escolher a sua IA principal. Nada aqui usa IA nem gasta cota.</Text>
      {!probes ? <Text>{`Procurando as IAs instaladas${ui.unicode ? '…' : '...'}`}</Text> : (
        <>
          <Box flexDirection="column" marginTop={1}>
            <Text>Encontrei:</Text>
            {ids.map((id) => {
              const p = probes[id]!;
              const ok = p.availability === 'READY';
              return <Text key={id} wrap="truncate-end">{`  ${ok ? (ui.unicode ? '✓' : '+') : (ui.unicode ? '✗' : 'x')} ${id.padEnd(12)} ${ok ? `${p.version ?? ''} ${p.simulated ? '(SIMULADA)' : ''}` : `${p.availability}${HOW_TO_INSTALL[id] ? ` → ${HOW_TO_INSTALL[id]}` : ''}`}`}</Text>;
            })}
          </Box>
          {readyIds.length ? <Choice title={titles[step]} options={options[step]} sel={sel} /> : <Text>Nenhuma IA pronta. Instale e faça login numa delas e abra o ases de novo.</Text>}
        </>
      )}
    </Box>
  );
}

/** Mostra o assistente antes da TUI principal; volta quando a config estiver gravada. */
export async function runWizard(engine: Engine, ui: Ui): Promise<void> {
  const instance = render(<UiContext.Provider value={ui}><Wizard engine={engine} onDone={() => instance.unmount()} /></UiContext.Provider>, { exitOnCtrlC: true });
  await instance.waitUntilExit();
}
